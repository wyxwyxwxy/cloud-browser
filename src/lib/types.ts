export type Mode = 'tinyfish' | 'local'
export type SessionStatus = 'idle' | 'starting' | 'running' | 'error'

export interface TabInfo {
  id: string
  url: string
  title: string
  active: boolean
}

export interface FrameMeta {
  deviceWidth?: number
  deviceHeight?: number
  contentWidth?: number
  contentHeight?: number
  scale?: number
  scrollOffsetX?: number
  scrollOffsetY?: number
  timestamp?: number
}

export interface Settings {
  quality: number
  fps: number
  maxWidth: number
  maxHeight: number
  proxyCountry: string
  homepage: string
  doubleTapKeyboard: boolean
}

export interface HistoryItem {
  url: string
  title: string
  ts: number
  visits: number
}

export interface UsageData {
  sessions: number
  totalSeconds: number
  frames: number
  inputs: number
  bytes: number
  estimatedCost: number
  records: Array<{ seconds: number; frames: number; inputs: number; bytes: number; mode: string; ts: number }>
}

export interface UsageLive {
  seconds: number
  frames: number
  inputs: number
  bytes: number
  cost: number
}

export type ServerMsg =
  | { t: 'status'; status: SessionStatus; message: string }
  | { t: 'info'; sessionId: string; mode: Mode; startedAt: number; homepage: string; proxyCountry: string }
  | { t: 'tabs'; tabs: TabInfo[] }
  | { t: 'frame'; targetId: string; data: string; meta: FrameMeta }
  | { t: 'error'; message: string }
  | { t: 'stopped' }
  | { t: 'ip'; ip: string; sessionId: string; proxyCountry: string; mode: Mode }
  | { t: 'usageLive'; seconds: number; frames: number; inputs: number; bytes: number; cost: number }
  | { t: 'cookiesSaved'; count: number }
  | { t: 'settings'; settings: Settings }
  | { t: 'hitTest'; seq: number; isInput: boolean; tag: string; placeholder: string }
  | { t: 'pong' }
