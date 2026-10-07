import { contextBridge } from 'electron'

// Renderer chỉ chạm main qua object này. Phase 1 thêm profiles/groups.
contextBridge.exposeInMainWorld('isola', {})
