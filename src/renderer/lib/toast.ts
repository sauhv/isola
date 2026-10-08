// Toast đơn giản dùng chung cho cả app, phát qua một event bus trong bộ nhớ.
export type ToastKind = 'info' | 'success' | 'error'
export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

type Listener = (t: ToastItem) => void
const listeners = new Set<Listener>()
let counter = 0

export function toast(text: string, kind: ToastKind = 'info'): void {
  const item: ToastItem = { id: ++counter, kind, text }
  for (const l of listeners) l(item)
}

/** Dùng cho các nút giao diện đã dựng nhưng chức năng chưa làm. */
export function notYet(feature?: string): void {
  toast(feature ? `"${feature}" — tính năng chưa phát triển.` : 'Tính năng này chưa phát triển.', 'info')
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
