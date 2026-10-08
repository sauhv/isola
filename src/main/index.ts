import { app, BrowserWindow, dialog, net, protocol } from 'electron'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase, type Db } from './db'
import { registerIpc } from './ipc/register'
import { paths } from './paths'
import { detectHostOs, gpuVendorFromPciId, type GpuVendor } from './engine/catalog'
import { DEFAULT_KERNEL_ID, findSupportedKernel } from './engine/kernels'
import { CookieService } from './services/cookieService'
import { ExtensionService } from './services/extensionService'
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

/**
 * Hãng GPU đang dùng, chỉ để lọc catalog (không trộn giá trị thật vào seed).
 * Không xác định được thì trả null và catalog không lọc theo GPU.
 */
async function detectGpuVendor(): Promise<GpuVendor | null> {
  try {
    const info = (await app.getGPUInfo('basic')) as { gpuDevice?: { active?: boolean; vendorId?: number }[] }
    const devices = info.gpuDevice ?? []
    const active = devices.find((d) => d.active) ?? devices[0]
    return gpuVendorFromPciId(active?.vendorId)
  } catch {
    return null
  }
}

function prepareDataRoot(): string {
  const dataRoot = app.getPath('userData')
  for (const dir of ['profiles', 'logs', 'kernels', 'geoip', 'extensions']) {
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
    // Phục vụ tài nguyên app:// luôn tươi, tránh Chromium cache JS/HTML cũ giữa các bản build.
    headers.set('Cache-Control', 'no-store')
    return new Response(res.body, { status: res.status, headers })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 800,
    minWidth: 1100,
    minHeight: 640,
    title: 'Isola',
    // Trùng màu nền giao diện để không chớp trắng lúc mở.
    backgroundColor: '#141518',
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

  app.whenReady().then(async () => {
    try {
      const dataRoot = prepareDataRoot()
      db = openDatabase(paths.db(dataRoot))
      const host = { os: detectHostOs(), gpuVendor: await detectGpuVendor() }
      const profiles = new ProfileService(db, dataRoot, { host })
      profiles.resetStaleRunning()
      const secrets = createSafeStorageBox()
      const kernels = new KernelService(paths.kernels(dataRoot))
      const geo = new GeoService(paths.geoip(dataRoot))
      const proxies = new ProxyService(db, secrets, geo)
      const cookies = new CookieService(db, secrets)
      const extensions = new ExtensionService(db, paths.extensions(dataRoot), {
        prodVersion: findSupportedKernel(DEFAULT_KERNEL_ID)!.buildId
      })
      extensions.cleanup()
      launcher = new LaunchService({ db, dataRoot, profiles, kernels, proxies, extensions, cookies })
      registerIpc({ profiles, proxies, geo, extensions, cookies, launcher, kernels, window: () => mainWindow })
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
