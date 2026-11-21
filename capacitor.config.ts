import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.cloudbrowser.app',
  appName: 'CloudBrowser 云浏览器',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: true,
    captureInput: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0b0e14',
  },
  plugins: {
    ScreenCompat: {
      // 原生屏幕适配插件配置
    },
  },
}

export default config
