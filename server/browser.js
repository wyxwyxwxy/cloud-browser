// 浏览器会话桥：连接云端 Chromium（TinyFish CDP / 本地 Chromium），
// 将页面以 JPEG 帧串流到前端，并把前端的鼠标/键盘/触摸事件回放到远端页面。
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { store } from './store.js'
import { createTinyFishSession, deleteTinyFishSession, normalizeUrl } from './tinyfish.js'

let SEQ = 0

const KEY_MAP = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18,
  Escape: 27, ' ': 32, Space: 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46,
  '0': 48, '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57,
  a: 65, b: 66, c: 67, d: 68, e: 69, f: 70, g: 71, h: 72, i: 73, j: 74, k: 75, l: 76, m: 77,
  n: 78, o: 79, p: 80, q: 81, r: 82, s: 83, t: 84, u: 85, v: 86, w: 87, x: 88, y: 89, z: 90,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F12: 123,
}

export class BrowserSession {
  constructor({ ws, deviceId, mode, sessions }) {
    this.ws = ws
    this.deviceId = deviceId
    this.mode = mode
    this.sessions = sessions
    this.settings = store.getSettings(deviceId)
    this.pages = new Map() // id -> { page, cdp, meta, lastSent, title }
    this.activeId = null
    this.browser = null
    this.context = null
    this.tfSession = null
    this.startedAt = 0
    this.stats = { frames: 0, inputs: 0, bytes: 0 }
    this.usageTimer = null
    this.destroyed = false
    this.starting = false
  }

  send(obj) {
    if (this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)) } catch {}
    }
  }
  error(message) { this.send({ t: 'error', message }) }
  status(status, message) { this.send({ t: 'status', status, message }) }

  async onMessage(msg) {
    if (this.destroyed) return
    switch (msg.t) {
      case 'ping': this.send({ t: 'pong' }); break
      case 'start': await this.start(msg); break
      case 'stop': await this.stop(true); break
      case 'nav': await this._nav(msg.url, msg.targetId); break
      case 'reload': await this._historyAction('reload'); break
      case 'back': await this._historyAction('back'); break
      case 'forward': await this._historyAction('forward'); break
      case 'home': await this._nav(this.settings.homepage); break
      case 'newtab': await this._newTab(msg.url); break
      case 'closetab': await this._closeTab(msg.targetId); break
      case 'activetab': await this._activateTab(msg.targetId); break
      case 'mouse': await this._mouse(msg); break
      case 'wheel': await this._wheel(msg); break
      case 'key': await this._key(msg); break
      case 'insert': await this._insert(msg.text); break
      case 'zoom': await this._zoom(msg.scale); break
      case 'hitTest': await this._hitTest(msg.x, msg.y, msg.seq); break
      case 'ip': await this._ip(); break
      case 'settings': await this._updateSettings(msg.settings); break
      case 'cookieSnapshot': await this._saveCookies(); break
      default: break
    }
  }

  // ---------------- 生命周期 ----------------
  async start(msg = {}) {
    if (this.browser || this.starting) return
    this.starting = true
    try {
      this.status('starting', '正在创建云端浏览器会话…')

      if (msg.settings) {
        this.settings = { ...this.settings, ...msg.settings }
        store.setSettings(this.deviceId, this.settings)
      }

      let cdpUrl = null
      if (this.mode === 'tinyfish') {
        let key = String(msg.apiKey || '').trim() || store.getKey(this.deviceId)
        if (!key) throw new Error('尚未配置 TinyFish API Key，请先在设置中填写并保存')
        store.setKey(this.deviceId, key)
        this.tfSession = await createTinyFishSession(key, {
          url: this.settings.homepage || 'about:blank',
          proxy_config: this.settings.proxyCountry
            ? { enabled: true, type: 'tinyfish', country_code: this.settings.proxyCountry }
            : undefined,
        })
        cdpUrl = this.tfSession.cdp_url
      }

      if (cdpUrl) {
        this.browser = await chromium.connectOverCDP(cdpUrl, { timeout: 60000 })
      } else {
        const executablePath = process.env.CHROMIUM_PATH || this._findChromium()
        this.browser = await chromium.launch({
          executablePath,
          headless: true,
          args: [
            '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000',
            // 关闭后台节流，保证本地演示也有稳定帧率
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=CalculateNativeWinOcclusion,BackForwardCache',
          ],
        })
      }

      this.context = this.browser.contexts()[0] || (await this.browser.newContext())

      // 恢复 Cookie（登录态）
      const savedCookies = store.getCookies(this.deviceId)
      if (Array.isArray(savedCookies) && savedCookies.length) {
        try { await this.context.addCookies(savedCookies) } catch (e) { console.warn('[cookies] 恢复失败:', e.message) }
      }

      // 附加已存在的页面
      const existing = this.context.pages()
      for (const page of existing) await this._attachPage(page)
      if (this.pages.size === 0) await this._newTab(this.settings.homepage, true)

      const first = [...this.pages.keys()][0]
      this.activeId = first
      if (first) {
        const p = this.pages.get(first)
        try { await p.page.bringToFront() } catch {}
      }
      this._broadcastTabs()

      this.startedAt = Date.now()
      this._resetStats()
      this._startUsageTimer()

      this.send({
        t: 'info',
        sessionId: this.tfSession?.session_id || 'local',
        mode: this.mode,
        startedAt: this.startedAt,
        homepage: this.settings.homepage,
        proxyCountry: this.settings.proxyCountry,
      })
      this.status('running', '云端浏览器已就绪')
    } catch (e) {
      console.error('[start] 失败:', e)
      this.error(e.message || String(e))
      this.status('error', e.message || '启动失败')
      try { await this.browser?.close() } catch {}
      this.browser = null
    } finally {
      this.starting = false
    }
  }

  _findChromium() {
    const candidates = [
      process.env.CHROMIUM_PATH,
      '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium',
    ].filter(Boolean)
    for (const c of candidates) { try { if (fs.existsSync(c)) return c } catch {} }
    return undefined
  }

  async stop(fromClient = false) {
    if (!this.browser && !this.starting) { this.status('idle', '未运行'); return }
    try { await this._saveCookies() } catch {}
    try { this._flushUsage() } catch {}

    const tf = this.tfSession
    try { await this.browser?.close() } catch {}
    this.browser = null
    this.context = null
    this.pages.clear()
    this.activeId = null
    this.tfSession = null
    this._stopUsageTimer()

    if (tf && this.mode === 'tinyfish') {
      const key = store.getKey(this.deviceId)
      await deleteTinyFishSession(key, tf.session_id)
    }
    this.status('idle', '会话已停止')
    this.send({ t: 'stopped' })
  }

  async destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.sessions.delete(this.deviceId)
    try { await this.stop() } catch {}
  }

  // ---------------- 页面 / 标签 ----------------
  async _attachPage(page) {
    const cdp = await this.context.newCDPSession(page)
    await cdp.send('Page.enable').catch(() => {})
    let id = 'p' + (++SEQ)
    try {
      const info = await cdp.send('Target.getTargetInfo')
      if (info?.targetInfo?.targetId) id = info.targetInfo.targetId
    } catch {}
    const rec = { page, cdp, meta: null, lastSent: 0, title: '' }
    this.pages.set(id, rec)

    try { rec.title = await page.title() } catch {}

    cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
      this._onFrame(id, data, metadata)
    })
    cdp.on('Page.frameNavigated', (e) => {
      // 跨文档导航后重启 screencast，避免会话中断
      if (e.frame?.parentId) return
      this._startScreencast(rec).catch(() => {})
    })
    page.on('close', () => this._detachPage(id))
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const url = frame.url()
        store.addHistory(this.deviceId, { url, title: rec.title || url })
        page.title().then((t) => { rec.title = t || url; this._broadcastTabs() }).catch(() => {})
      }
    })

    await this._startScreencast(rec)
    return id
  }

  async _startScreencast(rec) {
    const s = this.settings
    await rec.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: clamp(s.quality ?? 72, 20, 100),
      maxWidth: clamp(s.maxWidth ?? 1600, 480, 2560),
      maxHeight: clamp(s.maxHeight ?? 1000, 320, 1600),
      everyNthFrame: 1,
    }).catch((e) => console.warn('[screencast] 启动失败:', e.message))
  }

  _detachPage(id) {
    this.pages.delete(id)
    if (this.activeId === id) this.activeId = [...this.pages.keys()][0] || null
    if (this.activeId) { const p = this.pages.get(this.activeId); if (p) p.lastSent = 0 }
    this._broadcastTabs()
  }

  async _newTab(url, initial = false) {
    if (!this.context) return
    const page = await this.context.newPage()
    const id = await this._attachPage(page)
    this.activeId = id
    try { await page.bringToFront() } catch {}
    if (url && url !== 'about:blank') {
      // 非阻塞导航：避免慢站点卡住整个消息处理队列，页面加载完成后由 framenavigated 事件更新标签
      page.goto(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
    }
    this._broadcastTabs()
  }

  async _closeTab(id) {
    const p = this.pages.get(id)
    if (!p) return
    if (this.pages.size === 1) {
      try { await p.page.goto('about:blank') } catch {}
      return
    }
    try { await p.page.close() } catch {}
  }

  async _activateTab(id) {
    const p = this.pages.get(id)
    if (!p) return
    this.activeId = id
    p.lastSent = 0
    try { await p.page.bringToFront() } catch {}
    this._broadcastTabs()
  }

  _broadcastTabs() {
    const tabs = [...this.pages.entries()].map(([id, p]) => ({
      id, url: p.page.url(), title: p.title || p.page.url(), active: id === this.activeId,
    }))
    this.send({ t: 'tabs', tabs })
  }

  active() { return this.pages.get(this.activeId) || [...this.pages.values()][0] }

  // ---------------- 串流帧 ----------------
  _onFrame(id, data, metadata) {
    const p = this.pages.get(id)
    if (!p) return
    p.meta = metadata
    this.stats.frames++
    if (id !== this.activeId) return
    const now = Date.now()
    const interval = 1000 / clamp(this.settings.fps || 30, 5, 60)
    if (now - p.lastSent < interval) return
    p.lastSent = now
    this.stats.bytes += Math.ceil((data?.length || 0) * 0.75)
    this.send({ t: 'frame', targetId: id, data, meta: metadata })
  }

  // ---------------- 交互回放 ----------------
  async _nav(url, targetId) {
    const p = (targetId && this.pages.get(targetId)) || this.active()
    if (!p || !url) return
    const target = normalizeUrl(url)
    p.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
    this._broadcastTabs()
  }

  async _historyAction(action) {
    const p = this.active(); if (!p) return
    try {
      if (action === 'reload') await p.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
      if (action === 'back') await p.page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 })
      if (action === 'forward') await p.page.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch {}
    this._broadcastTabs()
  }

  async _mouse(msg) {
    const p = this.active(); if (!p) return
    const b = this._inputBlock(p)
    const base = {
      x: num(msg.x), y: num(msg.y),
      button: msg.button || 'none',
      buttons: num(msg.buttons),
      clickCount: num(msg.clickCount, 1),
      pointerType: msg.pointerType || 'mouse',
    }
    await b.send('Input.dispatchMouseEvent', { ...base, type: msg.type || 'mouseMoved' }).catch(() => {})
    this.stats.inputs++
  }

  async _wheel(msg) {
    const p = this.active(); if (!p) return
    const b = this._inputBlock(p)
    await b.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: num(msg.x), y: num(msg.y),
      deltaX: num(msg.deltaX), deltaY: num(msg.deltaY),
      button: 'none', buttons: 0, pointerType: 'mouse',
    }).catch(() => {})
    this.stats.inputs++
  }

  async _key(msg) {
    const p = this.active(); if (!p) return
    const b = this._inputBlock(p)
    const key = msg.key || ''
    const code = KEY_MAP[key] ?? KEY_MAP[key.toLowerCase?.()] ?? 0
    const type = msg.keyType || (msg.down ? 'keyDown' : 'keyUp')
    const params = {
      type,
      key,
      code: msg.code || key,
      windowsVirtualKeyCode: code,
      nativeVirtualKeyCode: code,
      modifiers: num(msg.modifiers),
    }
    if (msg.down && msg.text) { params.text = msg.text; params.unmodifiedText = msg.text }
    await b.send('Input.dispatchKeyEvent', params).catch(() => {})
    this.stats.inputs++
  }

  async _insert(text) {
    const p = this.active(); if (!p) return
    if (typeof text !== 'string') return
    const b = this._inputBlock(p)
    // 用 insertText 处理中文/IME，逐段避免过长
    for (let i = 0; i < text.length; i += 200) {
      await b.send('Input.insertText', { text: text.slice(i, i + 200) }).catch(() => {})
    }
    this.stats.inputs++
  }

  _inputBlock(p) { return p.cdp }

  async _zoom(scale) {
    const p = this.active(); if (!p) return
    const s = clamp(num(scale, 1), 0.25, 5)
    await p.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: s }).catch(() => {})
    this.stats.inputs++
  }

  async _hitTest(x, y, seq) {
    const p = this.active()
    let result = { isInput: false, tag: '', placeholder: '' }
    if (p) {
      const expr = `(() => { const el = document.elementFromPoint(${num(x)}, ${num(y)}); if (!el) return {isInput:false}; const tag = (el.tagName||'').toUpperCase(); const ce = !!el.isContentEditable || !!el.closest('[contenteditable="true"]'); return {isInput: tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||ce, tag, placeholder: (el.getAttribute&&el.getAttribute('placeholder'))||''}; })()`
      try {
        const r = await withTimeout(p.cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }), 3000)
        if (r?.result?.value) result = r.result.value
      } catch {}
    }
    this.send({ t: 'hitTest', seq, ...result })
  }

  async _ip() {
    const p = this.active()
    let ip = ''
    if (p) {
      const cb = '__tfip' + Date.now()
      const expr = `new Promise((resolve)=>{ try { window.${cb}=(d)=>{ resolve((d&&d.ip)||''); }; const s=document.createElement('script'); s.src='https://api.ipify.org?format=jsonp&callback=${cb}'; s.onerror=()=>resolve(''); document.head.appendChild(s); setTimeout(()=>resolve(''),7000); } catch(e){ resolve(''); } })`
      try {
        const r = await withTimeout(p.cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), 8000)
        ip = r?.result?.value || ''
      } catch {}
    }
    // 兜底：页面内取 IP 失败时，用服务端公网出口查询（本地演示模式有用）
    if (!ip) {
      try {
        const r = await withTimeout(fetch('https://api.ipify.org?format=json').then((x) => x.json()), 6000)
        ip = r?.ip || ''
      } catch {}
    }
    this.send({
      t: 'ip',
      ip: ip || '未能获取（可检查网络或稍后重试）',
      sessionId: this.tfSession?.session_id || 'local',
      proxyCountry: this.settings.proxyCountry || 'US',
      mode: this.mode,
    })
  }

  async _saveCookies() {
    if (!this.context) return
    try {
      const cookies = await this.context.cookies()
      store.setCookies(this.deviceId, cookies)
      this.send({ t: 'cookiesSaved', count: cookies.length })
    } catch {}
  }

  async _updateSettings(next = {}) {
    this.settings = { ...this.settings, ...next }
    store.setSettings(this.deviceId, this.settings)
    // 应用到所有 screencast
    for (const p of this.pages.values()) {
      try { await p.cdp.send('Page.stopScreencast') } catch {}
      await this._startScreencast(p)
      p.lastSent = 0
    }
    this.send({ t: 'settings', settings: this.settings })
  }

  // ---------------- 用量 ----------------
  _resetStats() { this.stats = { frames: 0, inputs: 0, bytes: 0 } }
  _startUsageTimer() {
    this._stopUsageTimer()
    this.usageTimer = setInterval(() => this._sendLiveUsage(), 5000)
  }
  _stopUsageTimer() { if (this.usageTimer) { clearInterval(this.usageTimer); this.usageTimer = null } }
  _sendLiveUsage() {
    const seconds = this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0
    this.send({ t: 'usageLive', seconds, ...this.stats, cost: seconds / 60 * 0.002 })
  }
  _flushUsage() {
    const seconds = this.startedAt ? Math.max(1, Math.floor((Date.now() - this.startedAt) / 1000)) : 0
    const rec = { seconds, ...this.stats, mode: this.mode, sessionId: this.tfSession?.session_id || 'local' }
    store.recordSession(this.deviceId, rec)
    this.startedAt = 0
    this._resetStats()
    return rec
  }
}

function clamp(n, min, max) { n = Number(n); return isFinite(n) ? Math.min(max, Math.max(min, n)) : min }
function num(n, def = 0) { const v = Number(n); return isFinite(v) ? v : def }
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}
