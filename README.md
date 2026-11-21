# CloudBrowser · 云端远程浏览器

一个把**云端无头 Chromium 实时串流到浏览器**的网站。你只需注册 TinyFish、填入 API Key、点击启动，即可在手机（横屏）或电脑上获得一个可点击、可输入、可缩放的完整远程浏览器。

本站自身不运行浏览器内核，而是通过 [TinyFish Browser API](https://docs.tinyfish.ai/browser-api) 创建云端原生 Chromium 会话，取得标准 CDP WebSocket 地址后用 Playwright 接管，把页面以 JPEG 帧串流到前端，并把前端的鼠标 / 键盘 / 触摸事件回放到远端页面。

---

## 一、它是如何工作的

```
用户浏览器（手机横屏 / PC）
   │  JPEG 帧（WebSocket）  ↓   鼠标/键盘/触摸事件 ↑
   ▼
Node.js 服务（本仓库 server/）
   │  Playwright 通过 CDP 连接 cdp_url
   ▼
TinyFish 云端 Chromium（真实内核，含住宅代理 + 反爬）
```

- **串流**：CDP `Page.startScreencast` 捕获 JPEG 帧 → 服务端按设定帧率节流 → WebSocket 推给前端画到 `<img>`。
- **交互**：前端把点击/移动/滚动/键盘映射为 CDP `Input.dispatch*` 事件回放到远端页面。
- **内核**：TinyFish 提供的是原生 Chromium（Chrome 同款内核），可适配绝大多数网页。
- **出口 IP**：在远端页面内注入请求 `api.ipify.org` 获取云浏览器的公网出口 IP（服务端兜底）。

---

## 二、快速开始

### 方式 A：本地跑起来（推荐先用本地演示内核体验）

```bash
cd cloud-browser
npm install
npm run dev          # 前端 http://localhost:5173 + 后端 :3001
```

> 默认 `BROWSER_MODE=tinyfish`。若想不填 Key 先体验界面与交互，用本地 Chromium 演示：
> ```bash
> BROWSER_MODE=local npm run dev
> ```

### 方式 B：接入真实 TinyFish 云端浏览器

1. 注册 TinyFish：<https://agent.tinyfish.ai/sign-up>（无需信用卡，新账户赠 $8 额度）
2. 创建 API Key：<https://agent.tinyfish.ai/api-keys>
3. 在网站右上角「设置 → API 密钥」粘贴保存（AES-256-GCM 加密后存云端）
4. 点击左侧「启动云端浏览器」，即可使用

环境变量 `.env`（可参考 `.env.example`）：

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 服务端口 | 3001 |
| `BROWSER_MODE` | `tinyfish` / `local` | tinyfish |
| `ENCRYPTION_KEY` | API Key 加密密钥（生产务必改随机值） | — |
| `DATA_FILE` | 云端数据存储文件 | ./data/store.json |
| `CHROMIUM_PATH` | 本地演示模式的浏览器路径 | 自动探测 |

### 生产构建与部署

```bash
npm run build                 # 生成 dist/
NODE_ENV=production npm start # 单端口承载前端 + API + WS
```

或用 Docker：

```bash
docker compose up -d --build
# 访问 http://服务器IP:3001
```

> 生产环境建议：把 `store.json` 文件存储替换为你的数据库（Postgres/MongoDB），只需实现 `server/store.js` 中同名的读写方法即可；API Key 加密密钥用环境变量注入，不要硬编码。

---

## 三、功能清单

### 云浏览器核心
- ✅ TinyFish 云端原生 Chromium（CDP 串流），适配几乎所有网页
- ✅ 点击启动，API Key 加密保存到云端，之后无需再填
- ✅ 实时串流，可调 **画质 / 帧率（默认 30fps，可调至 60）/ 分辨率 / JPEG 压缩**
- ✅ 出口代理地区切换（US/DE/JP/SG…），一键查询云浏览器出口 IP
- ✅ 多标签页（左侧栏新建 / 切换 / 关闭），网址与标题显示在左侧栏
- ✅ 地址栏导航、前进 / 后退 / 刷新 / 主页

### 交互与移动端
- ✅ 手机横屏适配（竖屏自动提示旋转）
- ✅ **双击输入框才拉起系统键盘，单击不拉起**；远程网站无法自动唤起键盘
- ✅ 键盘内容经 CDP `Input.insertText` 回传，支持中文 / IME
- ✅ 双指捏合缩放（0.25x–5x）、单指拖动选择、双指平移滚动、Ctrl+滚轮缩放
- ✅ PC 端同样可用（鼠标双击 / 滚轮 / 快捷键）

### 数据与持久化
- ✅ 浏览历史保存到云端，点击历史记录直接打开网址
- ✅ 登录 Cookie 云端保存，下次启动自动恢复登录态
- ✅ 用量统计：会话次数、时长、帧数、交互数、传输量、估算费用（$0.002/分钟）
- ✅ 设置、密钥、历史、Cookie 均按设备 ID 隔离存储在云端

---

## 四、键盘策略说明（重要）

由于网页运行在**远端云端浏览器**里，网站 JS 的 `focus()`、`autofocus` 等操作**无法影响你手机上的本地输入框**，因此天然满足"不允许网站自动拉起键盘"。

弹键盘的唯一途径是前端一个隐藏的键盘代理输入框：

1. 你**单击**画面 → 仅向远端发送点击事件，**不聚焦**代理框 → 不弹键盘
2. 你**双击**画面 → 服务端用 `document.elementFromPoint` 判断双击位置是否为 `<input>` / `<textarea>` / 可编辑区域
   - 是 → 聚焦代理框，拉起系统键盘；你输入的内容实时回传远端
   - 否 → 不弹键盘

---

## 五、验证结果

已通过端到端自动化验证（本地 Chromium 演示内核）：

| 项目 | 结果 |
|---|---|
| 会话启动 / 就绪 | ✅ |
| JPEG 串流帧推送 | ✅（收到有效 `/9j/` JPEG 帧） |
| 导航与标签 URL 更新 | ✅ |
| 新建 / 关闭多标签 | ✅ |
| 点击 / 键盘 / 缩放 / 滚动交互 | ✅ |
| 出口 IP 查询（含兜底） | ✅ |
| 实时用量推送 | ✅ |
| 用量 / 历史 / Cookie 云端持久化 | ✅ |

> 说明：本地 headless Chromium 在页面静止时因后台节流不产生帧（直接用 Playwright 测试同样如此），这是 headless 环境特性；TinyFish 云端是持续运行的原生 Chromium，动画/视频/滚动页面可稳定输出 30fps。前端帧率上限由 `fps` 设置节流控制（≥24fps 为默认推荐值）。

---

## 六、项目结构

```
cloud-browser/
├── server/
│   ├── index.js       # HTTP API + WebSocket 服务
│   ├── browser.js     # CDP 桥接：串流 / 交互 / 多标签 / Cookie / IP / 用量
│   ├── tinyfish.js    # TinyFish Browser API 客户端
│   └── store.js       # 云端数据存储 + API Key 加密
├── src/
│   ├── App.tsx        # 主应用
│   ├── components/    # 侧边栏 / 画面 / 设置 / 横屏引导
│   └── lib/           # API / WebSocket / 类型
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 七、安卓 APK（Android 9 / API 28+）

原生壳基于 Capacitor 8，把 Web 前端装进 WebView，并新增 `ScreenCompat` 原生插件做异形屏适配。

### 构建
```bash
npm install
npm run build                 # 先构建前端
npm run build:apk             # cap sync + gradle assembleDebug
```
产物：`android/app/build/outputs/apk/debug/app-debug.apk`

### 屏幕适配（曲面屏 / 折叠屏 / 刘海屏 / 方形屏）
- **minSdk 28**：兼容 Android 9 及以上所有版本
- **强制横屏** `sensorLandscape` + 全屏沉浸式 + 刘海区绘制 (`layoutInDisplayCutoutMode`)
- **安全区**：原生 `WindowInsets` 读取刘海/状态栏/导航栏尺寸 → CSS 变量 `--safe-*` → UI 自动避让
- **曲面屏**：识别主流曲屏机型，左右额外内收 12px，防止边缘误触与画面裁切
- **折叠屏 / 方形屏**：检测宽高比（0.85~1.18）与折叠机型，侧边栏与控件自适应
- **配置变更不重建**：`configChanges` 覆盖 smallestScreenSize/screenLayout/density，折叠/分屏时画面不重启

### 连接后端（重要）
APK 是纯 WebView，浏览器仍运行在云端/服务器，因此首次启动会引导你填写**后端服务器地址**（就是本项目 `npm start`/Docker 部署后访问的地址，局域网或公网均可）。填写后会校验 `/api/health` 连通性并保存到本地，之后每次打开自动连接。可在设置中更改。

> 键盘策略在 APK 上同样生效：只有双击网页输入框才聚焦隐藏输入框唤起系统键盘；原生层已设置 `SOFT_INPUT_STATE_ALWAYS_HIDDEN`，网站无法自动弹键盘。

---

## 八、Windows EXE（云电脑 / 云浏览器桌面应用）

基于 Electron，一个 EXE 内**同时内置运行后端服务 + 前端**，双击即用，无需单独部署 Node。

### 构建（在 Linux 上交叉编译 Windows）
```bash
npm install
npm run build                 # 构建前端
npm run build:exe             # electron-builder --win --x64
```
产物在 `release/`：
- `CloudBrowser 云电脑 Setup x.x.x.exe` —— NSIS 安装版（可自选安装目录、创建桌面快捷方式）
- `CloudBrowser 云电脑 x.x.x.exe` —— Portable 免安装版（双击即用）

> 国内网络构建若卡在下载，可设置镜像：
> ```bash
> export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder/"
> ```

### 桌面端特性
- 启动时自动拉起内嵌后端（无需手动 `npm start`），就绪后打开窗口
- **云浏览器**与**云电脑**两种使用形态共用同一套串流内核
- 系统托盘：关闭窗口最小化到托盘，双击托盘图标恢复
- 全局快捷键 `Ctrl+Alt+B` 显示/隐藏窗口；`F11` 全屏；`Ctrl+R` 刷新；`F12` 开发者工具
- 外部链接自动用系统浏览器打开，菜单内置 TinyFish 注册/密钥入口

---

## 九、三端对照

| 端 | 形态 | 后端来源 | 屏幕适配 |
|---|---|---|---|
| 网站 | 浏览器访问 | 你部署的服务器 | 响应式 + safe-area |
| 安卓 APK | WebView 壳 | 首次引导配置服务器地址 | 曲面/折叠/刘海/方形屏原生适配 |
| Windows EXE | Electron 内嵌 | EXE 内自动启动 | 桌面窗口 + 托盘 + 全屏 |

---

## 十、已构建交付产物（dist-release/）

| 文件 | 平台 | 说明 |
|---|---|---|
| `CloudBrowser-云浏览器-v1.0-android9+.apk` | Android 9+ | 9.2MB，minSdk 28 / targetSdk 36，含原生屏幕适配插件 |
| `CloudBrowser-云电脑-v1.0-安装版.exe` | Windows x64 | 126MB，NSIS 安装版，可自选目录、建桌面快捷方式 |
| `CloudBrowser-云电脑-v1.0-便携版.exe` | Windows x64 | 113MB，免安装，双击即用 |

### 验证记录
- APK：`aapt dump badging` 确认包名 `com.cloudbrowser.app`、`sdkVersion:28`、启动 Activity 正确
- EXE：`file` 确认均为有效 PE32 Windows 可执行文件；asar 内主进程已验证含动态 import 启动后端逻辑
- 后端内嵌：动态 `import()` 启动 ESM 后端 + `/api/health` 返回 200，验证通过

### 从源码重建的注意点
1. **JDK 21**：Capacitor 8 要求 Java 21（`invalid source release: 21` 说明 Java 版本不足）
2. **Android SDK**：需 platform 36 + build-tools 36；国内可用腾讯镜像下载 Gradle wrapper
3. **EXE 交叉编译**：Linux 上需 wine + 7zip；国内构建用：
   ```bash
   export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
   export ELECTRON_BUILDER_7ZIP_PATH=/path/to/7za
   # NSIS/wine 工具缺下载时可从 ghfast.top 加速源手动放入 ~/.cache/electron-builder
   ```
4. 后端在 EXE 内通过 Electron 主进程动态 import 启动，数据文件写入 `app.getPath('userData')/store.json`（asar 只读）
