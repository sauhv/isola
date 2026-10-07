import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Renderer là Next.js (src/renderer), build riêng bằng `next build`.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  }
})
