import { defineConfig } from 'vitest/config'

// Test chạy bằng Electron ở chế độ Node (ELECTRON_RUN_AS_NODE=1) để better-sqlite3
// dùng đúng bản native đã build cho Electron.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000
  }
})
