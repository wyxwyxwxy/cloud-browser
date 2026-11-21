// 运行时连接配置：
// - Web / Electron：使用相对路径（后端与前端同源）
// - Android APK：WebView 无内嵌后端，从本地存储读取用户配置的服务器地址

export interface ServerConfig {
  url: string // 例如 http://192.168.1.10:3001 或 https://cloud.example.com
}

const KEY = 'cb-server-config'

function isAndroid(): boolean {
  const w = window as any
  return w.Capacitor?.getPlatform?.() === 'android' || !!w.androidScreenCompat || location.protocol === 'capacitor:'
}

export function getServerConfig(): ServerConfig | null {
  if (!isAndroid()) return { url: '' }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw)
    return cfg?.url ? cfg : null
  } catch { return null }
}

export function saveServerConfig(url: string) {
  const clean = url.trim().replace(/\/+$/, '')
  localStorage.setItem(KEY, JSON.stringify({ url: clean }))
}

export function clearServerConfig() { localStorage.removeItem(KEY) }

export function needsServerSetup(): boolean {
  return isAndroid() && !getServerConfig()
}

// API 基础地址（不含尾部斜杠）
export function apiBase(): string {
  return getServerConfig()?.url || ''
}

// WebSocket 地址
export function wsUrl(deviceId: string): string {
  const cfg = getServerConfig()
  if (cfg?.url) {
    const u = cfg.url.replace(/^http/, 'ws')
    return `${u}/ws?deviceId=${encodeURIComponent(deviceId)}`
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws?deviceId=${encodeURIComponent(deviceId)}`
}
