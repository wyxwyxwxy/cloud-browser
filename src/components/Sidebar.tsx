import { useState } from 'react'
import {
  Play, Square, Plus, X, Globe2, History, Settings2, RotateCcw, ArrowLeft,
  ArrowRight, Home, Loader2, Clock3, Coins, ChevronRight,
} from 'lucide-react'
import type { HistoryItem, SessionStatus, TabInfo, UsageData } from '../lib/types'

interface Props {
  status: SessionStatus
  connected: boolean
  mode: 'tinyfish' | 'local'
  tabs: TabInfo[]
  history: HistoryItem[]
  usage: UsageData
  address: string
  setAddress: (v: string) => void
  onStart: () => void
  onStop: () => void
  onNavigate: (url: string) => void
  onNewTab: () => void
  onCloseTab: (id: string) => void
  onActivateTab: (id: string) => void
  onAction: (a: 'back' | 'forward' | 'reload' | 'home') => void
  onOpenSettings: () => void
  onClearHistory: () => void
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const same = d.toDateString() === now.toDateString()
  return same ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
function fmtDur(s: number) {
  if (s < 60) return `${s}秒`
  if (s < 3600) return `${Math.floor(s / 60)}分${s % 60}秒`
  return `${(s / 3600).toFixed(1)}小时`
}
function host(url: string) { try { return new URL(url).host } catch { return url } }

export default function Sidebar(p: Props) {
  const [view, setView] = useState<'tabs' | 'history'>('tabs')
  const running = p.status === 'running'
  const starting = p.status === 'starting'

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-line bg-panel sm:w-[264px]">
      {/* 品牌 + 启动 */}
      <div className="border-b border-line p-3">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand shadow-glow">
            <Globe2 className="h-4.5 w-4.5 text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">CloudBrowser</p>
            <p className="text-[10px] text-slate-500">{p.mode === 'tinyfish' ? 'TinyFish 云内核' : '本地演示内核'}</p>
          </div>
        </div>
        {running ? (
          <button onClick={p.onStop} className="btn w-full border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-400 hover:bg-red-500/20 hover:text-red-200">
            <Square className="h-3.5 w-3.5" /> 停止会话
          </button>
        ) : (
          <button onClick={p.onStart} disabled={starting || !p.connected} className="btn btn-primary w-full">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {starting ? '启动中…' : '启动云端浏览器'}
          </button>
        )}
      </div>

      {/* 地址栏 */}
      <div className="border-b border-line p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); p.onNavigate(p.address) }}
          className="flex items-center gap-2 rounded-lg border border-line bg-ink px-2.5 focus-within:border-brand"
        >
          <Globe2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <input
            value={p.address}
            onChange={(e) => p.setAddress(e.target.value)}
            placeholder="输入网址回车访问"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-600"
          />
        </form>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          <button className="icon-btn h-8 w-full" title="后退" onClick={() => p.onAction('back')} disabled={!running}><ArrowLeft className="h-3.5 w-3.5" /></button>
          <button className="icon-btn h-8 w-full" title="前进" onClick={() => p.onAction('forward')} disabled={!running}><ArrowRight className="h-3.5 w-3.5" /></button>
          <button className="icon-btn h-8 w-full" title="刷新" onClick={() => p.onAction('reload')} disabled={!running}><RotateCcw className="h-3.5 w-3.5" /></button>
          <button className="icon-btn h-8 w-full" title="主页" onClick={() => p.onAction('home')} disabled={!running}><Home className="h-3.5 w-3.5" /></button>
          <button className="icon-btn h-8 w-full" title="新建标签" onClick={p.onNewTab} disabled={!running}><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* 视图切换 */}
      <div className="flex border-b border-line">
        <button onClick={() => setView('tabs')} className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${view === 'tabs' ? 'border-b-2 border-brand text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          <Globe2 className="h-3.5 w-3.5" /> 标签 {p.tabs.length}
        </button>
        <button onClick={() => setView('history')} className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${view === 'history' ? 'border-b-2 border-brand text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          <History className="h-3.5 w-3.5" /> 历史
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {view === 'tabs' ? (
          p.tabs.length ? (
            <div className="space-y-1.5">
              {p.tabs.map((t) => (
                <div
                  key={t.id}
                  onClick={() => p.onActivateTab(t.id)}
                  className={`group flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition ${t.active ? 'border-brand/60 bg-brand/10' : 'border-transparent hover:bg-white/5'}`}
                >
                  <Globe2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${t.active ? 'text-brand-soft' : 'text-slate-600'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs ${t.active ? 'text-white' : 'text-slate-300'}`}>{t.title || '新标签页'}</p>
                    <p className="truncate text-[10px] text-slate-500">{host(t.url)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); p.onCloseTab(t.id) }}
                    className="mt-0.5 rounded p-0.5 text-slate-600 opacity-0 hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <Globe2 className="mb-2 h-7 w-7 text-slate-700" />
              <p className="text-xs text-slate-600">启动后标签页会显示在这里</p>
            </div>
          )
        ) : (
          p.history.length ? (
            <div className="space-y-1">
              <button onClick={p.onClearHistory} className="mb-2 w-full rounded-md border border-line py-1.5 text-[11px] text-slate-500 hover:border-red-500/40 hover:text-red-300">清空历史</button>
              {p.history.map((h, i) => (
                <button
                  key={h.url + i}
                  onClick={() => p.onNavigate(h.url)}
                  className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5"
                >
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-300">{h.title || host(h.url)}</p>
                    <p className="truncate text-[10px] text-slate-600">{host(h.url)} · {fmtTime(h.ts)}</p>
                  </div>
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700 group-hover:text-brand-soft" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <History className="mb-2 h-7 w-7 text-slate-700" />
              <p className="text-xs text-slate-600">浏览历史会自动保存在云端</p>
            </div>
          )
        )}
      </div>

      {/* 底部：用量 + 设置 */}
      <div className="border-t border-line p-2.5">
        <div className="mb-2 flex items-center justify-between rounded-lg bg-ink px-2.5 py-2 text-[11px]">
          <span className="flex items-center gap-1 text-slate-500"><Clock3 className="h-3 w-3" />{fmtDur(Number(p.usage?.totalSeconds) || 0)}</span>
          <span className="flex items-center gap-1 text-emerald-400"><Coins className="h-3 w-3" />${Number(p.usage?.estimatedCost || 0).toFixed(3)}</span>
          <span className="text-slate-500">{p.usage.sessions} 次</span>
        </div>
        <button onClick={p.onOpenSettings} className="btn w-full justify-start">
          <Settings2 className="h-4 w-4" /> 设置与用量
        </button>
      </div>
    </aside>
  )
}
