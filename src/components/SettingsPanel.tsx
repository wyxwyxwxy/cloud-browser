import { useState } from 'react'
import { X, KeyRound, SlidersHorizontal, BarChart3, ExternalLink, Trash2, Save, Check } from 'lucide-react'
import type { Settings, UsageData } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'tinyfish' | 'local'
  settings: Settings
  keyStatus: { configured: boolean; masked: string }
  usage: UsageData
  onSaveSettings: (next: Partial<Settings>) => Promise<void>
  onSaveKey: (key: string) => Promise<void>
  onDeleteKey: () => Promise<void>
  onClearHistory: () => Promise<void>
}

const COUNTRIES: Array<[string, string]> = [
  ['US', '🇺🇸 美国'], ['DE', '🇩🇪 德国'], ['JP', '🇯🇵 日本'], ['SG', '🇸🇬 新加坡'],
  ['GB', '🇬🇧 英国'], ['FR', '🇫🇷 法国'], ['CA', '🇨🇦 加拿大'], ['AU', '🇦🇺 澳大利亚'],
  ['KR', '🇰🇷 韩国'], ['IN', '🇮🇳 印度'], ['BR', '🇧🇷 巴西'], ['NL', '🇳🇱 荷兰'],
]
const SIZES: Array<[number, number, string]> = [
  [1280, 800, '1280 × 800（省流量）'],
  [1600, 1000, '1600 × 1000（推荐）'],
  [1920, 1200, '1920 × 1200（高清）'],
  [2560, 1440, '2560 × 1440（超清）'],
]
function fmtDur(s: number) { return s < 60 ? `${s}秒` : s < 3600 ? `${Math.floor(s / 60)}分${s % 60}秒` : `${(s / 3600).toFixed(1)}小时` }

export default function SettingsPanel(p: Props) {
  const [draft, setDraft] = useState<Settings>(p.settings)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState<'key' | 'stream' | 'usage'>('key')

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200) }
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const saveAll = async () => {
    setSaving(true)
    try { await p.onSaveSettings(draft); flash('设置已保存到云端') } catch (e: any) { flash(e.message || '保存失败') }
    setSaving(false)
  }
  const saveKey = async () => {
    if (!key.trim()) return flash('请输入 API Key')
    setSaving(true)
    try { await p.onSaveKey(key.trim()); setKey(''); flash('API Key 已加密保存到云端') } catch (e: any) { flash(e.message || '保存失败') }
    setSaving(false)
  }

  if (!p.open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={p.onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-white">设置与用量</h2>
            <p className="text-xs text-slate-500">所有配置加密保存在云端</p>
          </div>
          <button onClick={p.onClose} className="icon-btn"><X className="h-4 w-4" /></button>
        </div>

        {/* 分段 */}
        <div className="flex border-b border-line px-3">
          {([
            ['key', 'API 密钥', KeyRound],
            ['stream', '串流参数', SlidersHorizontal],
            ['usage', '用量统计', BarChart3],
          ] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium transition ${tab === k ? 'border-b-2 border-brand text-white' : 'text-slate-500 hover:text-slate-300'}`}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* API Key */}
          {tab === 'key' && (
            <div className="space-y-5">
              {p.mode === 'local' && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                  当前为本地演示内核，无需 TinyFish Key。部署时设置 BROWSER_MODE=tinyfish 即切换为云端浏览器。
                </div>
              )}
              <div className="card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">TinyFish API Key</h3>
                  <span className={`chip ${p.keyStatus.configured ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                    {p.keyStatus.configured ? <><Check className="h-3 w-3" /> 已配置 {p.keyStatus.masked}</> : '未配置'}
                  </span>
                </div>
                <label className="label">API 密钥</label>
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="粘贴你的 TinyFish API Key" className="field font-mono text-xs" />
                <div className="mt-3 flex gap-2">
                  <button onClick={saveKey} disabled={saving} className="btn btn-primary flex-1"><Save className="h-3.5 w-3.5" /> 保存密钥</button>
                  <button onClick={async () => { await p.onDeleteKey(); flash('已删除密钥'); setTimeout(() => location.reload(), 400) }} className="btn border-red-500/40 text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-xs text-slate-400">
                  <p>1. 前往 <a href="https://agent.tinyfish.ai/sign-up" target="_blank" rel="noreferrer" className="text-brand-soft hover:underline">注册 TinyFish <ExternalLink className="inline h-3 w-3" /></a>（无需信用卡，新账户送 $8 额度）</p>
                  <p>2. 在 <a href="https://agent.tinyfish.ai/api-keys" target="_blank" rel="noreferrer" className="text-brand-soft hover:underline">API Keys 页面 <ExternalLink className="inline h-3 w-3" /></a> 创建密钥并复制</p>
                  <p>3. 粘贴到上方保存，之后每次点「启动」即可，无需再填</p>
                  <p className="pt-1 text-slate-500">计费：约 $0.002 / 浏览器分钟，含住宅代理与反爬。</p>
                </div>
              </div>
            </div>
          )}

          {/* 串流参数 */}
          {tab === 'stream' && (
            <div className="space-y-5">
              <div className="card space-y-5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="label mb-0">串流画质（JPEG 压缩质量）</label>
                    <span className="font-mono text-xs text-brand-soft">{draft.quality}</span>
                  </div>
                  <input type="range" min={20} max={100} value={draft.quality} onChange={(e) => set('quality', +e.target.value)} className="w-full accent-brand" />
                  <p className="mt-1 text-[11px] text-slate-500">画质越高越清晰但流量越大，默认 72 平衡流畅度。</p>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="label mb-0">目标帧率（FPS）</label>
                    <span className="font-mono text-xs text-brand-soft">{draft.fps} fps</span>
                  </div>
                  <input type="range" min={5} max={60} value={draft.fps} onChange={(e) => set('fps', +e.target.value)} className="w-full accent-brand" />
                  <p className={`mt-1 text-[11px] ${draft.fps >= 24 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {draft.fps >= 24 ? '✓ 已满足 24 帧以上流畅标准' : '⚠ 建议调至 24 fps 以上以获得流畅体验'}
                  </p>
                </div>
                <div>
                  <label className="label">最大分辨率</label>
                  <select value={`${draft.maxWidth}x${draft.maxHeight}`} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); setDraft((d) => ({ ...d, maxWidth: w, maxHeight: h })) }} className="field">
                    {SIZES.map(([w, h, label]) => <option key={`${w}x${h}`} value={`${w}x${h}`}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">出口代理地区</label>
                  <select value={draft.proxyCountry} onChange={(e) => set('proxyCountry', e.target.value)} className="field">
                    {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">云端浏览器的出口 IP 所在地，更改后需重启会话。</p>
                </div>
                <div>
                  <label className="label">主页网址</label>
                  <input value={draft.homepage} onChange={(e) => set('homepage', e.target.value)} className="field" placeholder="https://www.google.com" />
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-ink px-3 py-3">
                  <span>
                    <span className="block text-sm text-slate-200">双击输入框唤起键盘</span>
                    <span className="block text-[11px] text-slate-500">关闭后仅单击交互，完全不会弹出手机键盘</span>
                  </span>
                  <input type="checkbox" checked={draft.doubleTapKeyboard} onChange={(e) => set('doubleTapKeyboard', e.target.checked)} className="h-5 w-5 accent-brand" />
                </label>
              </div>
              <button onClick={saveAll} disabled={saving} className="btn btn-primary w-full"><Save className="h-4 w-4" /> 保存串流设置</button>
              <div className="rounded-lg border border-line bg-ink p-3 text-[11px] leading-relaxed text-slate-500">
                <b className="text-slate-300">快捷动作</b>：手机横屏使用 · 双击网页输入框才拉起系统键盘（单击不会）· 网站无法自动唤起键盘 · 双指捏合缩放 · 单指拖动选择文本 · 双指平移滚动 · Ctrl+滚轮缩放（PC）。
              </div>
            </div>
          )}

          {/* 用量 */}
          {tab === 'usage' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['会话次数', String(p.usage.sessions)],
                  ['累计时长', fmtDur(p.usage.totalSeconds)],
                  ['串流帧数', p.usage.frames.toLocaleString()],
                  ['估计费用', '$' + Number(p.usage?.estimatedCost || 0).toFixed(3)],
                  ['交互事件', p.usage.inputs.toLocaleString()],
                  ['传输估算', (Number(p.usage?.bytes || 0) / 1024 / 1024).toFixed(1) + ' MB'],
                ].map(([k, v]) => (
                  <div key={k} className="card">
                    <p className="text-[11px] text-slate-500">{k}</p>
                    <p className="mt-1 text-lg font-bold text-white">{v}</p>
                  </div>
                ))}
              </div>
              <div className="card">
                <h3 className="mb-3 text-sm font-semibold text-white">最近会话</h3>
                {p.usage.records.length ? (
                  <div className="space-y-2">
                    {p.usage.records.slice(0, 8).map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-xs">
                        <span className="text-slate-400">{new Date(r.ts).toLocaleString('zh-CN')}</span>
                        <span className="text-slate-300">{fmtDur(r.seconds)} · ${(r.seconds / 60 * 0.002).toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-600">暂无会话记录</p>}
              </div>
              <button onClick={async () => { await p.onClearHistory(); flash('历史已清空') }} className="btn w-full border-red-500/40 text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> 清空浏览历史与 Cookie</button>
            </div>
          )}
        </div>

        {toast && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-lg border border-brand/40 bg-panel px-4 py-2 text-xs text-brand-soft shadow-glow">{toast}</div>}
      </div>
    </div>
  )
}
