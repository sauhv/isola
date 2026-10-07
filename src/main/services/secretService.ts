import { safeStorage } from 'electron'
import type { SecretBox } from './secretBox'

/**
 * SecretBox dựa trên safeStorage: DPAPI trên Windows, Keychain trên macOS.
 * Dữ liệu chỉ giải mã được bởi đúng user trên đúng máy đã mã hóa.
 */
export function createSafeStorageBox(): SecretBox {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage không khả dụng trên máy này, không thể lưu mật khẩu an toàn')
  }
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  }
}
