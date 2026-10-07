import { app, BrowserWindow, dialog, net, protocol } from 'electron'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase, type Db } from './db'
import { registerIpc } from './ipc/register'
import { paths } from './paths'
import { GeoService } from './services/geoService'
import { KernelService } from './services/kernelService'
import { LaunchService } from './services/launchService'
import { ProfileService } from './services/profileService'
import { ProxyService } from './services/proxyService'
import { createSafeStorageBox } from './services/secretService'

const APP_SCHEME = 'app'
const APP_ORIGIN = `${APP_SCHEME}://isola`

// CSP cho bản build. Next static export cần inline script để hydrate, nhưng không cho tải gì từ mạng.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ')

let db: Db | null = null
let launcher: LaunchService | null = null
let mainWindow: BrowserWindow | null = null
let quitting = false

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function prepareDataRoot(): string {
  const dataRoot = app.getPath('userData')
  for (const dir of ['profiles', 'logs', 'kernels', 'geoip']) {
    mkdirSync(join(dataRoot, dir), { recursive: true })
  }
  return dataRoot
}

/** Phục vụ src/renderer/out (Next static export) qua app://isola/... */
function registerRendererProtocol(): void {
  const root = join(app.getAppPath(), 'src', 'renderer', 'out')
  protocol.handle(APP_SCHEME, async (request) => {
    const { host, pathname } = new URL(request.url)
    if (host !== 'isola') return new Response('Not found', { status: 404 })

    let file = normalize(join(root, decodeURIComponent(pathname)))
    if (file !== root && !file.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) return new Response('Not found', { status: 404 })

    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(res.body, { status: res.status, headers })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    title: 'Isola',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Không cho renderer điều hướng ra ngoài hay mở cửa sổ mới.
  const allowedOrigin = process.env.ISOLA_DEV_URL ? new URL(process.env.ISOLA_DEV_URL).origin : APP_ORIGIN
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== allowedOrigin) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ISOLA_DEV_URL) {
    mainWindow.loadURL(process.env.ISOLA_DEV_URL)
  } else {
    mainWindow.loadURL(`${APP_ORIGIN}/`)
  }
}

if (!app.requestSingleInstanceLock()) {
  // Hai instance cùng ghi một DB và cùng quản lý PID là nguồn lỗi, chỉ cho chạy một.
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    try {
      const dataRoot = prepareDataRoot()
      db = openDatabase(paths.db(dataRoot))
      const profiles = new ProfileService(db, dataRoot)
      profiles.resetStaleRunning()
      const kernels = new KernelService(paths.kernels(dataRoot))
      const geo = new GeoService(paths.geoip(dataRoot))
      const proxies = new ProxyService(db, createSafeStorageBox(), geo)
      launcher = new LaunchService(db, dataRoot, profiles, kernels, proxies)
      registerIpc({ profiles, proxies, geo, launcher, kernels, target: () => mainWindow?.webContents ?? null })
    } catch (err) {
      dialog.showErrorBox('Isola không khởi động được', String(err))
      app.exit(1)
      return
    }
    registerRendererProtocol()
    createWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  // Đóng êm mọi profile trước khi thoát để Chrome kịp ghi cookie xuống đĩa.
  app.on('before-quit', (event) => {
    if (quitting || !launcher) return
    event.preventDefault()
    quitting = true
    launcher.stopAll().finally(() => app.quit())
  })

  app.on('will-quit', () => {
    db?.close()
    db = null
  })
}
