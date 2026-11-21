import { useEffect, useRef } from 'react'
import { MonitorPlay, Wifi, WifiOff, Keyboard, Hand } from 'lucide-react'
import type { FrameMeta, SessionStatus } from '../lib/types'

type Send = (obj: Record<string, unknown>) => void

interface Props {
  status: SessionStatus
  connected: boolean
  frameSink: React.MutableRefObject<((data: string, meta: FrameMeta) => void) | null>
  hitTest: { seq: number; isInput: boolean; tag: string; placeholder: string } | null
  send: Send
  onToast: (msg: string) => void
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

export default function Stage({ status, connected, frameSink, hitTest, send, onToast }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const metaRef = useRef<FrameMeta>({})
  const proxyRef = useRef<HTMLInputElement | null>(null)
  const lastValue = useRef('')
  const hitPending = useRef(0)
  const scaleRef = useRef(1)
  const downRef = useRef(false)
  const dragRef = useRef(false)
  const touchRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null)
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null)
  const zoomToast = useRef(0)

  // 由 App 直接写入图片，避免 30fps 触发 React 重渲染
  useEffect(() => {
    frameSink.current = (data, meta) => {
      metaRef.current = meta || {}
      if (imgRef.current) imgRef.current.src = 'data:image/jpeg;base64,' + data
    }
    return () => { frameSink.current = null }
  }, [frameSink])

  // 命中输入框 → 拉起系统键盘
  useEffect(() => {
    if (!hitTest) return
    if (hitTest.seq === hitPending.current && hitTest.isInput) {
      const el = proxyRef.current
      if (el) {
        lastValue.current = el.value
        el.focus({ preventScroll: true })
        try { (el as any).click?.() } catch {}
      }
    }
  }, [hitTest])

  const toDevice = (cx: number, cy: number) => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    const r = img.getBoundingClientRect()
    const nx = clamp((cx - r.left) / (r.width || 1), 0, 1)
    const ny = clamp((cy - r.top) / (r.height || 1), 0, 1)
    const dw = metaRef.current.deviceWidth || r.width
    const dh = metaRef.current.deviceHeight || r.height
    return { x: Math.round(nx * dw), y: Math.round(ny * dh) }
  }

  const click = (cx: number, cy: number, clickCount = 1, raiseKeyboard = false) => {
    const { x, y } = toDevice(cx, cy)
    send({ t: 'mouse', type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount })
    send({ t: 'mouse', type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount })
    if (raiseKeyboard) {
      const seq = ++hitPending.current
      send({ t: 'hitTest', x, y, seq })
    }
  }

  // ---------- 鼠标 ----------
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    downRef.current = true
    const { x, y } = toDevice(e.clientX, e.clientY)
    send({ t: 'mouse', type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: e.detail || 1 })
  }
  const onMouseUp = (e: React.MouseEvent) => {
    if (!downRef.current) return
    downRef.current = false
    const { x, y } = toDevice(e.clientX, e.clientY)
    send({ t: 'mouse', type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: e.detail || 1 })
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = toDevice(e.clientX, e.clientY)
    send({ t: 'mouse', type: 'mouseMoved', x, y, button: downRef.current ? 'left' : 'none', buttons: downRef.current ? 1 : 0 })
  }
  const onDoubleClick = (e: React.MouseEvent) => {
    const { x, y } = toDevice(e.clientX, e.clientY)
    const seq = ++hitPending.current
    send({ t: 'hitTest', x, y, seq })
  }
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey) {
      const next = clamp(scaleRef.current * (e.deltaY > 0 ? 0.9 : 1.1), 0.25, 5)
      scaleRef.current = next
      send({ t: 'zoom', scale: next })
      return
    }
    const { x, y } = toDevice(e.clientX, e.clientY)
    send({ t: 'wheel', x, y, deltaX: e.deltaX, deltaY: e.deltaY })
  }
  const onContextMenu = (e: React.MouseEvent) => e.preventDefault()

  // ---------- 触摸 ----------
  const dist2 = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  const center = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })

  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 2) {
      pinchRef.current = { dist: dist2(e.touches[0], e.touches[1]), scale: scaleRef.current }
      touchRef.current = null
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false }
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 2 && pinchRef.current) {
      const d = dist2(e.touches[0], e.touches[1])
      const ratio = d / (pinchRef.current.dist || 1)
      const next = clamp(pinchRef.current.scale * ratio, 0.25, 5)
      scaleRef.current = next
      send({ t: 'zoom', scale: next })
      const now = Date.now()
      if (now - zoomToast.current > 900) { zoomToast.current = now; onToast(`缩放 ${Math.round(next * 100)}%`) }
      return
    }
    if (e.touches.length === 1 && touchRef.current) {
      const t = e.touches[0]
      const dx = t.clientX - touchRef.current.x
      const dy = t.clientY - touchRef.current.y
      if (Math.hypot(dx, dy) > 8) touchRef.current.moved = true
      if (touchRef.current.moved) {
        const p = toDevice(t.clientX, t.clientY)
        if (!dragRef.current) {
          send({ t: 'mouse', type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 })
          dragRef.current = true
        }
        send({ t: 'mouse', type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 })
      }
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    if (pinchRef.current && e.touches.length < 2) pinchRef.current = null
    if (dragRef.current) {
      const t = e.changedTouches[0]
      if (t) { const p = toDevice(t.clientX, t.clientY); send({ t: 'mouse', type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }) }
      dragRef.current = false
      touchRef.current = null
      return
    }
    const tr = touchRef.current
    touchRef.current = null
    if (!tr || tr.moved || Date.now() - tr.t > 600) return
    const t = e.changedTouches[0]
    if (!t) return
    const now = Date.now()
    const prev = lastTap.current
    const isDouble = prev && now - prev.t < 320 && Math.hypot(t.clientX - prev.x, t.clientY - prev.y) < 40
    if (isDouble) {
      click(t.clientX, t.clientY, 2, true)
      lastTap.current = null
    } else {
      click(t.clientX, t.clientY, 1, false)
      lastTap.current = { x: t.clientX, y: t.clientY, t: now }
    }
  }

  // ---------- 键盘代理 ----------
  const sendBackspace = () => {
    send({ t: 'key', down: true, key: 'Backspace' })
    send({ t: 'key', down: false, key: 'Backspace' })
  }
  const onProxyInput = (e: React.FormEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value
    const prev = lastValue.current
    if (v.length > prev.length && v.startsWith(prev)) {
      send({ t: 'insert', text: v.slice(prev.length) })
    } else if (v.length < prev.length) {
      for (let i = 0; i < prev.length - v.length; i++) sendBackspace()
    } else if (v !== prev) {
      for (let i = 0; i < prev.length; i++) sendBackspace()
      if (v) send({ t: 'insert', text: v })
    }
    lastValue.current = v
  }
  const onProxyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !(e.nativeEvent as any).isComposing) {
      e.preventDefault()
      send({ t: 'key', down: true, key: 'Enter' })
      send({ t: 'key', down: false, key: 'Enter' })
    }
  }
  const releaseKeyboard = () => {
    proxyRef.current?.blur()
    onToast('已收起键盘')
  }

  const idle = status !== 'running'

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-ink">
      {/* 远端画面 */}
      <img
        ref={imgRef}
        alt="云端浏览器画面"
        draggable={false}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`block max-h-full max-w-full select-none object-contain ${idle ? 'opacity-0' : ''}`}
        style={{ touchAction: 'none' }}
      />

      {/* 占位 / 状态遮罩 */}
      {idle && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-2xl border border-line bg-panel/80 p-7 shadow-glow backdrop-blur">
            <MonitorPlay className="mx-auto mb-3 h-12 w-12 text-brand-soft" strokeWidth={1.4} />
            <p className="text-lg font-semibold text-white">
              {status === 'starting' ? '正在创建云端浏览器…' : status === 'error' ? '启动失败' : '云端浏览器未启动'}
            </p>
            <p className="mt-2 max-w-xs text-sm text-slate-400">
              {status === 'starting'
                ? '首次创建约需 10–30 秒，请稍候。'
                : '点击左侧「启动云端浏览器」开始，页面将实时串流到此处。'}
            </p>
          </div>
        </div>
      )}

      {/* 顶部连接状态条 */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <span className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] backdrop-blur ${connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? '已连接' : '连接中'}
        </span>
        {status === 'running' && <span className="rounded-md border border-brand/30 bg-brand/10 px-2 py-1 text-[11px] text-brand-soft">LIVE</span>}
      </div>

      {/* 手势提示 */}
      {status === 'running' && (
        <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-2 rounded-md border border-line bg-panel/80 px-2.5 py-1.5 text-[11px] text-slate-400 backdrop-blur sm:flex">
          <Hand className="h-3.5 w-3.5" /> 双击输入框唤起键盘 · 双指捏合缩放 · 单指拖动选择
        </div>
      )}

      {/* 键盘收起按钮（键盘弹出时显示） */}
      <button
        onClick={releaseKeyboard}
        className="absolute bottom-3 right-3 hidden items-center gap-1.5 rounded-md border border-line bg-panel/90 px-3 py-2 text-xs text-slate-300 backdrop-blur active:scale-95 focus-within:flex"
        aria-label="收起键盘"
      >
        <Keyboard className="h-4 w-4" /> 收起键盘
      </button>

      {/* 隐藏键盘代理：只有我们主动 focus 它才会拉起手机键盘，远程网站无法触发 */}
      <input
        id="keyboard-proxy"
        ref={proxyRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onInput={onProxyInput}
        onKeyDown={onProxyKeyDown}
      />
    </div>
  )
}
