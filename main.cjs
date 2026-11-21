// Electron 主进程 —— Windows 云电脑 / 云浏览器 桌面应用
const { app, BrowserWindow, Menu, Tray, shell, globalShortcut, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { pathToFileURL } = require('url')

const PORT = process.env.CB_PORT || 3001
let mainWindow = null
let tray = null
let isQuitting = false

// 判断是否在打包环境
const isPackaged = app.isPackaged
// 打包后主代码在 resources/app.asar 内；开发时为项目上级目录
const appRoot = isPackaged ? path.join(process.resourcesPath, 'app.asar') : path.join(__dirname, '..')

function waitForServer(url, timeout = 20000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(true) })
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('后端服务启动超时'))
        setTimeout(tick, 300)
      })
      req.setTimeout(1000, () => req.destroy())
    }
    tick()
  })
}

// 在 Electron 主进程内以动态 import 启动后端（Electron 原生支持 asar 内的 ESM）。
// 这样后端及其依赖直接从 app.asar 加载，无需额外部署 node_modules。
async function startBackend() {
  // 数据文件放到用户数据目录（asar 只读，不能写入）
  process.env.DATA_FILE = path.join(app.getPath('userData'), 'store.json')
  process.env.PORT = String(PORT)
  process.env.BROWSER_MODE = process.env.BROWSER_MODE || 'tinyfish'
  process.env.NODE_ENV = 'production'
  const entry = path.join(appRoot, 'server', 'index.js')
  try {
    await import(pathToFileURL(entry).href)
    await waitForServer(`http://127.0.0.1:${PORT}/api/health`)
  } catch (e) {
    throw new Error('后端服务启动失败：' + (e.message || e))
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'CloudBrowser 云电脑 · 云浏览器',
    backgroundColor: '#0b0e14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      spellcheck: false,
    },
    icon: path.join(__dirname, 'icon.ico'),
  })

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`)

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide() // 关闭时最小化到托盘
    }
  })
}

function buildMenu() {
  const template = [
    {
      label: '应用',
      submenu: [
        { label: '云浏览器 / 云电脑', click: () => { mainWindow?.show(); mainWindow?.loadURL(`http://127.0.0.1:${PORT}`) } },
        { type: 'separator' },
        { label: '重新加载', accelerator: 'Ctrl+R', click: () => mainWindow?.reload() },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: '退出', accelerator: 'Ctrl+Q', click: () => { isQuitting = true; app.quit() } },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'resetZoom', label: '实际大小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏', accelerator: 'F11' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: 'TinyFish 官网', click: () => shell.openExternal('https://www.tinyfish.ai') },
        { label: '获取 API Key', click: () => shell.openExternal('https://agent.tinyfish.ai/api-keys') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.ico')
    if (fs.existsSync(iconPath)) tray = new Tray(iconPath)
    else return
    tray.setToolTip('CloudBrowser 云电脑 / 云浏览器')
    const contextMenu = Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => mainWindow?.show() },
      { label: '退出', click: () => { isQuitting = true; app.quit() } },
    ])
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => mainWindow?.show())
  } catch {}
}

app.whenReady().then(async () => {
  try {
    await startBackend()
    createWindow()
    buildMenu()
    createTray()
    // 全局快捷键：Ctrl+Alt+B 显示/隐藏主窗口
    globalShortcut.register('Ctrl+Alt+B', () => {
      if (mainWindow?.isVisible()) mainWindow.hide()
      else mainWindow?.show()
    })
  } catch (e) {
    dialog.showErrorBox('启动失败', '后端服务启动失败：\n' + e.message)
    app.quit()
  }
})

app.on('before-quit', async () => {
  isQuitting = true
  // 后端 HTTP 服务随主进程退出而关闭；保存一次数据
  try {
    const storeUrl = pathToFileURL(path.join(appRoot, 'server', 'store.js')).href
    const { store } = await import(storeUrl)
    store.saveNow?.()
  } catch {}
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
