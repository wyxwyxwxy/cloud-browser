import { useEffect, useState } from 'react'
import { Smartphone, RotateCw } from 'lucide-react'
import { getDisplayInfo } from '../lib/display'

// 手机竖屏时提示旋转到横屏；PC、Electron 桌面端与大屏不受影响
export default function LandscapeGate() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const check = () => {
      const platform = getDisplayInfo().platform
      if (platform === 'electron') { setShow(false); return }
      const portrait = window.matchMedia('(orientation: portrait)').matches
      const small = Math.min(window.innerWidth, window.innerHeight) <= 900
      const touch = matchMedia('(pointer: coarse)').matches || platform === 'android'
      setShow(portrait && small && touch)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check) }
  }, [])

  if (!show) return null
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-ink px-8 text-center">
      <div className="relative flex h-28 w-16 items-center justify-center rounded-2xl border-2 border-brand/60">
        <Smartphone className="h-10 w-10 text-brand-soft" />
        <RotateCw className="absolute -right-8 top-6 h-9 w-9 animate-spin text-accent" style={{ animationDuration: '3s' }} />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">请横屏使用</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
          云端浏览器为宽屏设计。请将手机旋转至横屏，获得完整的标签栏与浏览体验。
        </p>
      </div>
    </div>
  )
}
