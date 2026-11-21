// 云端数据存储：API Key（加密）、设置、历史、Cookie、用量
// 默认落在云服务器的 DATA_FILE 文件中；生产环境可替换为数据库实现（接口保持一致）。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_FILE = path.resolve(process.cwd(), process.env.DATA_FILE || './data/store.json')
const KEY = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'cloud-browser-dev-key').digest()

function defaultDevice() {
  return {
    apiKey: '',
    settings: {
      quality: 72,
      fps: 30,
      maxWidth: 1600,
      maxHeight: 1000,
      proxyCountry: 'US',
      homepage: 'https://www.google.com',
      doubleTapKeyboard: true,
    },
    history: [],
    cookies: [],
    usage: {
      sessions: 0,
      totalSeconds: 0,
      frames: 0,
      inputs: 0,
      bytes: 0,
      estimatedCost: 0,
      records: [],
    },
  }
}

class Store {
  constructor() {
    this.data = { devices: {} }
    this._timer = null
    this._load()
  }

  _load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
        if (parsed && typeof parsed === 'object' && parsed.devices) this.data = parsed
      }
    } catch (e) {
      console.warn('[store] 读取失败，使用空数据:', e.message)
    }
    this._ensureDir()
  }

  _ensureDir() {
    try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }) } catch {}
  }

  save() {
    // 防抖写盘
    clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      try {
        this._ensureDir()
        fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2))
      } catch (e) {
        console.error('[store] 写入失败:', e.message)
      }
    }, 120)
  }

  saveNow() {
    clearTimeout(this._timer)
    try {
      this._ensureDir()
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2))
    } catch (e) {
      console.error('[store] 写入失败:', e.message)
    }
  }

  device(id) {
    if (!this.data.devices[id]) this.data.devices[id] = defaultDevice()
    const d = this.data.devices[id]
    // 补齐字段（兼容旧数据）
    const def = defaultDevice()
    d.settings = { ...def.settings, ...(d.settings || {}) }
    d.usage = { ...def.usage, ...(d.usage || {}) }
    d.history = d.history || []
    d.cookies = d.cookies || []
    return d
  }

  // ---- 加密 API Key ----
  encryptKey(plain) {
    if (!plain) return ''
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
  }

  decryptKey(blob) {
    if (!blob) return ''
    try {
      const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'))
      const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    } catch {
      return ''
    }
  }

  getKey(id) { return this.decryptKey(this.device(id).apiKey) }
  setKey(id, plain) { this.device(id).apiKey = this.encryptKey(plain); this.save() }
  hasKey(id) { return !!this.device(id).apiKey }

  getSettings(id) { return this.device(id).settings }
  setSettings(id, s) { this.device(id).settings = { ...this.device(id).settings, ...s }; this.save() }

  getHistory(id) { return this.device(id).history }
  addHistory(id, entry) {
    const list = this.device(id).history
    const idx = list.findIndex((h) => h.url === entry.url)
    const rec = { url: entry.url, title: entry.title || entry.url, ts: Date.now(), visits: (idx >= 0 ? list[idx].visits || 0 : 0) + 1 }
    if (idx >= 0) list.splice(idx, 1)
    list.unshift(rec)
    if (list.length > 300) list.length = 300
    this.save()
  }
  clearHistory(id) { this.device(id).history = []; this.save() }

  getCookies(id) { return this.device(id).cookies }
  setCookies(id, cookies) { this.device(id).cookies = cookies || []; this.save() }

  getUsage(id) { return this.device(id).usage }
  recordSession(id, rec) {
    const u = this.device(id).usage
    u.sessions += 1
    u.totalSeconds += rec.seconds || 0
    u.frames += rec.frames || 0
    u.inputs += rec.inputs || 0
    u.bytes += rec.bytes || 0
    u.estimatedCost += (rec.seconds || 0) / 60 * 0.002
    u.records.unshift({ ...rec, ts: Date.now() })
    if (u.records.length > 100) u.records.length = 100
    this.save()
    return u
  }
  bumpCounters(id, { frames = 0, inputs = 0, bytes = 0 } = {}) {
    const u = this.device(id).usage
    u.frames += frames
    u.inputs += inputs
    u.bytes += bytes
    this.save()
  }
}

export const store = new Store()
