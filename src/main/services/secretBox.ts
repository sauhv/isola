/**
 * Mã hóa secret (password proxy, password tài khoản) trước khi ghi SQLite.
 * Bản chạy thật dùng Electron safeStorage (secretService.ts); test dùng bản AES giả.
 */
export interface SecretBox {
  /** Trả chuỗi base64 để lưu vào cột `*_enc`. */
  encrypt(plain: string): string
  decrypt(encoded: string): string
}
