// 屏幕适配工具：统一处理曲面屏 / 折叠屏 / 刘海屏 / 方形屏 / 多窗口
// 会尝试读取 Capacitor 原生插件 ScreenCompat 的数据，失败则回退到 Web 标准 API。

export type Platform = 'web' | 'android' | 'electron'

export interface DisplayInfo {
  platform: Platform
  safeTop: number
  safeBottom: number
  safeLeft: number
  safeRight: number
  width: number
  height: number
  dpr: number
  orientation: 'portrait' | 'landscape'
  isFoldable: boolean
  isCurved: boolean
  isSquareish: boolean
}

const defaultInfo: DisplayInfo = {
  platform: 'web', safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0,
  width: 0, height: 0, dpr: 1, orientation: 'landscape',
  isFoldable: false, isCurved: false, isSquareish: false,
}

function detectPlatform(): Platform {
  const w = window as any
  try {
    if (w.Capacitor?.getPlatform?.() === 'android' || w.capacitor?.platform === 'android' || w.androidScreenCompat || navigator.userAgent.includes('Android')) return 'android'
    if (w.process?.versions?.electron || navigator.userAgent.includes('Electron')) return 'electron'
  } catch {}
  return 'web'
}

function readCssSafeArea(): Pick<DisplayInfo, 'safeTop' | 'safeBottom' | 'safeLeft' | 'safeRight'> {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;'
  ;['top', 'right', 'bottom', 'left'].forEach((s) => {
    probe.style.setProperty(`padding-${s}`, `env(safe-area-inset-${s}, 0px)`)
  })
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const px = (v: string) => Math.round(parseFloat(v) || 0)
  const res = {
    safeTop: px(cs.paddingTop), safeRight: px(cs.paddingRight),
    safeBottom: px(cs.paddingBottom), safeLeft: px(cs.paddingLeft),
  }
  probe.remove()
  return res
}

let cached: DisplayInfo = { ...defaultInfo }
const listeners = new Set<(i: DisplayInfo) => void>()

export async function refreshDisplayInfo(): Promise<DisplayInfo> {
  const platform = detectPlatform()
  const w = window.innerWidth
  const h = window.innerHeight
  const cssSafe = readCssSafeArea()

  let native: Partial<DisplayInfo> = {}
  const plugin = (window as any).ScreenCompat
  if (platform === 'android' && plugin?.getInfo) {
    try { native = await plugin.getInfo() } catch {}
  }

  const ratio = w / h
  const info: DisplayInfo = {
    ...defaultInfo,
    ...cssSafe,
    ...native,
    platform,
    width: w,
    height: h,
    dpr: window.devicePixelRatio || 1,
    orientation: w >= h ? 'landscape' : 'portrait',
    // 接近正方形（折叠屏展开、方形屏）宽高比 0.85~1.18
    isSquareish: ratio > 0.85 && ratio < 1.18,
  }
  cached = info
  applyCssVars(info)
  listeners.forEach((fn) => fn(info))
  return info
}

function applyCssVars(info: DisplayInfo) {
  const r = document.documentElement
  r.style.setProperty('--safe-top', info.safeTop + 'px')
  r.style.setProperty('--safe-bottom', info.safeBottom + 'px')
  r.style.setProperty('--safe-left', info.safeLeft + 'px')
  r.style.setProperty('--safe-right', info.safeRight + 'px')
  r.style.setProperty('--vh', info.height * 0.01 + 'px')
  r.style.setProperty('--vw', info.width * 0.01 + 'px')
  document.body.classList.toggle('squareish', info.isSquareish)
  document.body.classList.toggle('foldable', info.isFoldable)
  document.body.classList.toggle('curved', info.isCurved)
  document.body.classList.toggle('native-app', info.platform !== 'web')
}

export function getDisplayInfo() { return cached }
export function onDisplayChange(fn: (i: DisplayInfo) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function initDisplayAdapter() {
  refreshDisplayInfo()
  let t: any
  const onResize = () => { clearTimeout(t); t = setTimeout(() => refreshDisplayInfo(), 120) }
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  ;(window as any).visualViewport?.addEventListener?.('resize', onResize)
}

// 曲面屏：把内容从左右边缘往里收，避免误触与画面被曲面折射裁切
export function contentInset(): { left: number; right: number } {
  const pad = cached.isCurved ? 16 : 0
  return { left: cached.safeLeft + pad, right: cached.safeRight + pad }
}
