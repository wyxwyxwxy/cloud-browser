// HTTP + WebSocket 服务入口
import express from 'express'
import cors from 'cors'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { store } from './store.js'
import { BrowserSession } from './browser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT || 3001)
const MODE = process.env.BROWSER_MODE || 'tinyfish'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

// ---------- REST API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, mode: MODE, ts: Date.now() }))
app.get('/api/config', (_req, res) => res.json({ mode: MODE }))

app.get('/api/key/status', (req, res) => {
  const id = String(req.query.deviceId || 'default')
  const key = store.getKey(id)
  res.json({ configured: !!key, masked: key ? key.slice(0, 6) + '••••' + key.slice(-4) : '' })
})
app.put('/api/key', (req, res) => {
  const id = String(req.body.deviceId || 'default')
  const key = String(req.body.apiKey || '').trim()
  if (!key) return res.status(400).json({ error: 'API Key 不能为空' })
  store.setKey(id, key)
  res.json({ ok: true })
})
app.delete('/api/key', (req, res) => {
  const id = String(req.query.deviceId || 'default')
  store.setKey(id, '')
  res.json({ ok: true })
})

app.get('/api/settings', (req, res) => res.json(store.getSettings(String(req.query.deviceId || 'default'))))
app.put('/api/settings', (req, res) => {
  const id = String(req.body.deviceId || 'default')
  store.setSettings(id, req.body.settings || {})
  res.json({ ok: true, settings: store.getSettings(id) })
})

app.get('/api/history', (req, res) => res.json(store.getHistory(String(req.query.deviceId || 'default'))))
app.delete('/api/history', (req, res) => { store.clearHistory(String(req.query.deviceId || 'default')); res.json({ ok: true }) })

app.get('/api/usage', (req, res) => res.json(store.getUsage(String(req.query.deviceId || 'default'))))

// ---------- 静态资源 ----------
const dist = path.join(ROOT, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const server = http.createServer(app)

// ---------- WebSocket ----------
const wss = new WebSocketServer({ noServer: true })
/** @type {Map<string, BrowserSession>} */
const sessions = new Map()

server.on('upgrade', (req, socket, head) => {
  let pathname = ''
  try { pathname = new URL(req.url, 'http://x').pathname } catch {}
  if (pathname === '/ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  else socket.destroy()
})

wss.on('connection', (ws, req) => {
  let deviceId = 'default'
  try { deviceId = new URL(req.url, 'http://x').searchParams.get('deviceId') || 'default' } catch {}
  const session = new BrowserSession({ ws, deviceId, mode: MODE, sessions })
  ws.on('message', (data) => {
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }
    session.onMessage(msg).catch((e) => session.error(e.message || String(e)))
  })
  ws.on('close', () => session.destroy())
  ws.on('error', () => session.destroy())
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  CloudBrowser 服务已启动`)
  console.log(`  HTTP   http://localhost:${PORT}`)
  console.log(`  WS     ws://localhost:${PORT}/ws`)
  console.log(`  MODE   ${MODE}\n`)
})

function shutdown() {
  for (const s of sessions.values()) { try { s.destroy() } catch {} }
  store.saveNow()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
