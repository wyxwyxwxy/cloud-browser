import type { HistoryItem, Settings, UsageData } from './types'
import { apiBase } from './runtime'

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiBase() + url, init)
  const text = await res.text()
  let body: any = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!res.ok) throw new Error(body.error || body.message || `请求失败 ${res.status}`)
  return body as T
}

export const API = {
  config: () => j<{ mode: 'tinyfish' | 'local' }>('/api/config'),
  keyStatus: (deviceId: string) => j<{ configured: boolean; masked: string }>(`/api/key/status?deviceId=${deviceId}`),
  saveKey: (deviceId: string, apiKey: string) =>
    j('/api/key', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, apiKey }) }),
  deleteKey: (deviceId: string) => j(`/api/key?deviceId=${deviceId}`, { method: 'DELETE' }),
  settings: (deviceId: string) => j<Settings>(`/api/settings?deviceId=${deviceId}`),
  saveSettings: (deviceId: string, settings: Partial<Settings>) =>
    j<{ settings: Settings }>('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, settings }) }),
  history: (deviceId: string) => j<HistoryItem[]>(`/api/history?deviceId=${deviceId}`),
  clearHistory: (deviceId: string) => j(`/api/history?deviceId=${deviceId}`, { method: 'DELETE' }),
  usage: (deviceId: string) => j<UsageData>(`/api/usage?deviceId=${deviceId}`),
}
