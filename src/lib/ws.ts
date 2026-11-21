import { useEffect, useRef, useState } from 'react'
import type { ServerMsg } from './types'
import { wsUrl } from './runtime'

export function useBridge(deviceId: string, onMessage: (m: ServerMsg) => void) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  useEffect(() => {
    let closed = false
    let retry: any = null
    const connect = () => {
      if (closed) return
      const url = wsUrl(deviceId)
      const ws = new WebSocket(url)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 1500)
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onmessage = (e) => {
        try { cbRef.current(JSON.parse(e.data) as ServerMsg) } catch {}
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      try { wsRef.current?.close() } catch {}
    }
  }, [deviceId])

  const send = (obj: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }
  return { connected, send }
}
