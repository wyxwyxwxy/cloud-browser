import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initDisplayAdapter } from './lib/display'
import './index.css'

// 全局错误兜底：真机 WebView 若脚本异常，显示可读错误而不是黑屏
function showFatal(err: any) {
  try {
    const root = document.getElementById('root')
    if (!root) return
    const msg = (err && (err.stack || err.message)) || String(err)
    root.innerHTML = `<div style="position:fixed;inset:0;background:#0b0e14;color:#e6e9f0;font-family:system-ui,sans-serif;padding:24px;overflow:auto;z-index:99999">
      <div style="max-width:680px;margin:40px auto">
        <div style="color:#a78bfa;font-size:20px;font-weight:700;margin-bottom:12px">应用加载出错</div>
        <pre style="white-space:pre-wrap;word-break:break-word;color:#f87171;font-size:13px;line-height:1.6;background:#171c28;padding:16px;border-radius:10px;border:1px solid #2a3040">${msg.replace(/</g, '&lt;')}</pre>
        <button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#7c5cff;color:#fff;border:0;border-radius:8px;font-size:14px;cursor:pointer">重新加载</button>
      </div></div>`
  } catch {}
}
window.addEventListener('error', (e) => showFatal(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason))

try {
  initDisplayAdapter()
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (e) {
  showFatal(e)
}
