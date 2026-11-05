import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

// Phiên bản đã tải xong, chờ người dùng khởi động lại để cài (null nếu chưa có).
let pendingVersion: string | null = null

/**
 * Cập nhật qua GitHub Releases nhưng CHỈ khi người dùng đồng ý — không tự tải, không tự cài.
 * Luồng: phát hiện bản mới → hỏi "Cập nhật ngay / Để sau". Đồng ý → tải → hỏi khởi động lại để cài.
 * Chỉ chạy ở bản đã đóng gói; lỗi (ngoại tuyến, chưa có release) được nuốt để không làm phiền.
 */
export function initAutoUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  // Không tự tải, không tự cài khi thoát — chờ người dùng bấm đồng ý.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  let asking = false // tránh hiện nhiều hộp thoại chồng nhau

  autoUpdater.on('error', (err) => console.error('[updater]', err?.message ?? err))

  // Có bản mới → HỎI người dùng; chỉ tải khi họ đồng ý.
  autoUpdater.on('update-available', async (info) => {
    if (asking) return
    asking = true
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Cập nhật ngay', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
      title: 'Isola',
      message: `Có bản cập nhật mới: ${info.version}.`,
      detail: `Bạn đang dùng ${app.getVersion()}. Tải về và cập nhật ngay? (Isola sẽ hỏi lại trước khi khởi động lại để cài.)`
    }
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    asking = false
    if (r.response === 0) autoUpdater.downloadUpdate().catch((err) => console.error('[updater] download', err?.message ?? err))
  })

  // Tải xong (sau khi người dùng đã đồng ý) → HỎI khởi động lại để cài.
  autoUpdater.on('update-downloaded', async (info) => {
    pendingVersion = info.version
    if (asking) return
    asking = true
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Khởi động lại & cài', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
      title: 'Isola',
      message: `Đã tải xong bản ${info.version}.`,
      detail: 'Khởi động lại để cài ngay? Nếu để sau, bạn cài bằng cách mở lại Cài đặt → Cập nhật, hoặc bấm khởi động lại khi tiện.'
    }
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    asking = false
    if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall())
  })

  // Kiểm ngay lúc mở, rồi mỗi 6 giờ nếu app chạy lâu. KHÔNG tải — chỉ phát hiện để hỏi.
  autoUpdater.checkForUpdates().catch((err) => console.error('[updater] check', err?.message ?? err))
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}

/** Kiểm cập nhật theo yêu cầu (nút trong Cài đặt). Trả trạng thái gọn cho UI. */
export async function checkForUpdatesNow(): Promise<'dev' | 'available' | 'latest' | 'error'> {
  if (!app.isPackaged) return 'dev'
  try {
    const r = await autoUpdater.checkForUpdates()
    const latest = r?.updateInfo?.version
    return latest && latest !== app.getVersion() ? 'available' : 'latest'
  } catch {
    return 'error'
  }
}

/** Phiên bản đã tải xong đang chờ cài (null nếu chưa có). Dùng cho nút "Khởi động lại để cài" ở Cài đặt. */
export function pendingUpdateVersion(): string | null {
  return pendingVersion
}

/** Khởi động lại & cài bản đã tải (người dùng bấm). */
export function installPendingUpdate(): void {
  if (pendingVersion) setImmediate(() => autoUpdater.quitAndInstall())
}
