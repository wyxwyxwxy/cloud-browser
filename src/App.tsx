import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe2, ZoomIn, ZoomOut, LocateFixed, Settings2, Radio } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Stage from './components/Stage'
import SettingsPanel from './components/SettingsPanel'
import LandscapeGate from './components/LandscapeGate'
import ServerSetup from './components/ServerSetup'
import { API } from './lib/api'
import { useBridge } from './lib/ws'
import { needsServerSetup, getServerConfig } from './lib/runtime'
import type {
  FrameMeta, HistoryItem, ServerMsg, SessionStatus, Settings, TabInfo, UsageData,
} from './lib/types'

function getDeviceId() {
  try {
    let id = localStorage.getItem('cb-device-id')
    if (!id) { id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('cb-device-id', id) }
    return id
  } catch { return 'default' }
}

const DEFAULT_SETTINGS: Settings = {
  quality: 72, fps: 30, maxWidth: 1600, maxHeight: 1000,
  proxyCountry: 'US', homepage: 'https://www.google.com', doubleTapKeyboard: true,
}

export default function App() {
  const [deviceId] = useState(getDeviceId)
  const [mode, setMode] = useState<'tinyfish' | 'local'>('tinyfish')
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [message, setMessage] = useState('')
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [address, setAddress] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [usage, setUsage] = useState<UsageData>({ sessions: 0, totalSeconds: 0, frames: 0, inputs: 0, bytes: 0, estimatedCost: 0, records: [] })
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [keyStatus, setKeyStatus] = useState({ configured: false, masked: '' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hitTest, setHitTest] = useState<{ seq: number; isInput: boolean; tag: string; placeholder: string } | null>(null)
  const [ipInfo, setIpInfo] = useState<string>('')
  const [toast, setToast] = useState('')
  const [needSetup, setNeedSetup] = useState(() => needsServerSetup())
  const frameSink = useRef<((data: string, meta: FrameMeta) => void) | null>(null)
  const zoomRef = useRef(1)
  const histTimer = useRef<any>(null)
  const toastTimer = useRef<any>(null)

  const showToast = useCallback((m: string) => {
    setToast(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const refreshData = useCallback(async () => {
    try {
      const [cfg, ks, st, hi, us] = await Promise.all([
        API.config(), API.keyStatus(deviceId), API.settings(deviceId), API.history(deviceId), API.usage(deviceId),
      ])
      // 校验返回结构，避免静态托管 SPA fallback 把 HTML 当数据导致字段缺失
      const safeUsage = (us && typeof us === 'object' && typeof us.estimatedCost === 'number') ? us : null
      setMode(cfg?.mode || 'tinyfish')
      setKeyStatus(ks && typeof ks.configured === 'boolean' ? ks : { configured: false, masked: '' })
      setSettings({ ...DEFAULT_SETTINGS, ...(st && typeof st === 'object' ? st : {}) })
      setHistory(Array.isArray(hi) ? hi : [])
      if (safeUsage) setUsage((u) => ({ ...u, ...safeUsage }))
    } catch {}
  }, [deviceId])

  useEffect(() => { refreshData() }, [refreshData])

  const onMessage = useCallback((m: ServerMsg) => {
    switch (m.t) {
      case 'status':
        setStatus(m.status); setMessage(m.message)
        if (m.status === 'running') { setTimeout(() => API.history(deviceId).then(setHistory).catch(() => {}), 800) }
        break
      case 'tabs':
        setTabs(m.tabs)
        const active = m.tabs.find((t) => t.active)
        if (active) setAddress(active.url)
        clearTimeout(histTimer.current)
        histTimer.current = setTimeout(() => API.history(deviceId).then(setHistory).catch(() => {}), 2500)
        break
      case 'frame':
        frameSink.current?.(m.data, m.meta)
        break
      case 'error':
        showToast(m.message)
        break
      case 'ip':
        setIpInfo(m.ip)
        showToast(m.ip.startsWith('未能') ? m.ip : `出口 IP：${m.ip} · ${m.proxyCountry}`)
        break
      case 'usageLive':
        setUsage((u) => ({
          ...u,
          totalSeconds: Number(m.seconds) || 0,
          frames: Number(m.frames) || 0,
          inputs: Number(m.inputs) || 0,
          bytes: Number(m.bytes) || 0,
          estimatedCost: typeof m.cost === 'number' ? m.cost : 0,
        }))
        break
      case 'settings':
        setSettings((s) => ({ ...s, ...m.settings }))
        break
      case 'hitTest':
        setHitTest(m)
        break
      case 'cookiesSaved':
      case 'info':
      case 'pong':
      case 'stopped':
        break
    }
  }, [deviceId, showToast])

  const { connected, send } = useBridge(deviceId, onMessage)

  const doZoom = (factor: number) => {
    zoomRef.current = Math.min(5, Math.max(0.25, zoomRef.current * factor))
    send({ t: 'zoom', scale: zoomRef.current })
  }

  const handleNavigate = (url: string) => {
    if (!url.trim()) return
    if (status !== 'running') { showToast('请先启动云端浏览器'); return }
    setAddress(url)
    send({ t: 'nav', url: url.trim() })
  }

  const saveSettingsRemote = async (next: Partial<Settings>) => {
    const res = await API.saveSettings(deviceId, next)
    setSettings((s) => ({ ...s, ...next }))
    send({ t: 'settings', settings: next })
    return res
  }
  const saveKeyRemote = async (key: string) => {
    await API.saveKey(deviceId, key)
    setKeyStatus(await API.keyStatus(deviceId))
  }
  const deleteKeyRemote = async () => { await API.deleteKey(deviceId); setKeyStatus({ configured: false, masked: '' }) }
  const clearHistoryRemote = async () => { await API.clearHistory(deviceId); setHistory([]) }

  const activeTab = tabs.find((t) => t.active)

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink">
      {needSetup && <ServerSetup onDone={() => { setNeedSetup(false); refreshData() }} initialUrl={getServerConfig()?.url} />}
      <LandscapeGate />
      <Sidebar
        status={status}
        connected={connected}
        mode={mode}
        tabs={tabs}
        history={history}
        usage={usage}
        address={address}
        setAddress={setAddress}
        onStart={() => send({ t: 'start' })}
        onStop={() => { send({ t: 'stop' }); setTabs([]); setAddress('') }}
        onNavigate={handleNavigate}
        onNewTab={() => send({ t: 'newtab' })}
        onCloseTab={(id) => send({ t: 'closetab', targetId: id })}
        onActivateTab={(id) => send({ t: 'activetab', targetId: id })}
        onAction={(a) => send({ t: a })}
        onOpenSettings={() => { refreshData(); setSettingsOpen(true) }}
        onClearHistory={clearHistoryRemote}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* 顶部工具栏 */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
          <Globe2 className="h-4 w-4 shrink-0 text-brand-soft" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-200">{activeTab?.title || '云端浏览器'}</p>
            <p className="truncate text-[10px] text-slate-500">{activeTab?.url || '尚未打开网页'}</p>
          </div>
          <button className="icon-btn" title="缩小" onClick={() => doZoom(0.85)} disabled={status !== 'running'}><ZoomOut className="h-4 w-4" /></button>
          <button className="icon-btn" title="放大" onClick={() => doZoom(1.15)} disabled={status !== 'running'}><ZoomIn className="h-4 w-4" /></button>
          <button className="icon-btn" title="查询出口 IP" onClick={() => send({ t: 'ip' })}><LocateFixed className="h-4 w-4" /></button>
          <button className="icon-btn" title="设置" onClick={() => { refreshData(); setSettingsOpen(true) }}><Settings2 className="h-4 w-4" /></button>
          {status === 'running' && (
            <span className="hidden items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 md:flex">
              <Radio className="h-3 w-3 animate-pulse" /> 实时串流
            </span>
          )}
        </div>

        {/* 画面 */}
        <div className="min-h-0 flex-1">
          <Stage
            status={status}
            connected={connected}
            frameSink={frameSink}
            hitTest={hitTest}
            send={send}
            onToast={showToast}
          />
        </div>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={mode}
        settings={settings}
        keyStatus={keyStatus}
        usage={usage}
        onSaveSettings={saveSettingsRemote}
        onSaveKey={saveKeyRemote}
        onDeleteKey={deleteKeyRemote}
        onClearHistory={clearHistoryRemote}
      />

      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[80] -translate-x-1/2 rounded-lg border border-brand/40 bg-panel px-4 py-2.5 text-xs text-slate-100 shadow-glow">
          {toast}
        </div>
      )}
      {ipInfo && status === 'running' && (
        <div className="pointer-events-none fixed right-3 top-14 z-40 hidden rounded-md border border-line bg-panel/90 px-2.5 py-1.5 text-[11px] text-slate-300 backdrop-blur md:block">
          出口 IP：<span className="font-mono text-accent">{ipInfo.replace(/ ·.*/, '')}</span>
        </div>
      )}
    </div>
  )
}
