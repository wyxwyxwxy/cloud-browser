import { useState } from 'react'
import { Server, ArrowRight, Info, Wifi } from 'lucide-react'
import { saveServerConfig, clearServerConfig } from '../lib/runtime'

interface Props {
  onDone: () => void
  initialUrl?: string
}

// Android APK 首次启动引导：用户输入后端服务地址
export default function ServerSetup({ onDone, initialUrl = '' }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [err, setErr] = useState('')

  const submit = async () => {
    let u = url.trim().replace(/\/+$/, '')
    if (!u) { setErr('请输入服务器地址'); return }
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u
    try {
      const test = await fetch(`${u}/api/health`, { signal: AbortSignal.timeout(6000) })
      if (!test.ok) throw new Error('无响应')
    } catch {
      setErr('无法连接到该服务器，请检查地址与网络后重试')
      return
    }
    saveServerConfig(u)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink px-5">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-glow">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand shadow-glow">
            <Server className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">连接云端服务</h1>
            <p className="text-xs text-slate-500">首次使用需配置后端服务器地址</p>
          </div>
        </div>

        <label className="label">服务器地址</label>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-ink px-3 focus-within:border-brand">
          <Wifi className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setErr('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="https://你的服务器地址"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
            autoCapitalize="off" autoCorrect="off" spellCheck={false}
          />
        </div>
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}

        <button onClick={submit} className="btn btn-primary mt-4 w-full">
          连接并继续 <ArrowRight className="h-4 w-4" />
        </button>

        {initialUrl && (
          <button onClick={() => { clearServerConfig(); location.reload() }} className="btn mt-2 w-full text-slate-400">
            更改服务器
          </button>
        )}

        <div className="mt-5 rounded-lg border border-line bg-ink p-3 text-[11px] leading-relaxed text-slate-500">
          <p className="mb-1 flex items-center gap-1.5 text-slate-400"><Info className="h-3.5 w-3.5" /> 说明</p>
          App 本身只负责显示，浏览器运行在云端。请填写你部署的 CloudBrowser 后端地址（同一局域网或公网均可），
          填写后即可用手机号的 TinyFish 密钥启动云浏览器。
        </div>
      </div>
    </div>
  )
}
