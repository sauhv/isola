import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

/**
 * Tự cập nhật qua GitHub Releases (electron-updater đọc latest.yml do electron-builder đẩy lên).
 * Chỉ chạy ở bản đã đóng gói; lỗi (ngoại tuyến, chưa có release) được nuốt để không làm phiền.
 */
export function initAutoUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => console.error('[updater]', err?.message ?? err))

  autoUpdater.on('update-downloaded', async (info) => {
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Khởi động lại & cập nhật', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
      title: 'Isola',
      message: `Đã tải bản cập nhật ${info.version}.`,
      detail: 'Khởi động lại để cài ngay, hoặc để sau — bản mới sẽ tự cài khi bạn thoát Isola.'
    }
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall())
  })

  // Kiểm ngay lúc mở, rồi mỗi 6 giờ nếu app chạy lâu.
  autoUpdater.checkForUpdates().catch((err) => console.error('[updater] check', err?.message ?? err))
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}
