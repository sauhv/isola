'use client'

import { Ban, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { subscribeToasts, type ToastItem } from '../lib/toast'

const ICON = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  error: <Ban size={16} />
}

/** Hiển thị toast ở góc dưới phải, tự biến mất sau vài giây. Gắn một lần trong App. */
export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(
    () =>
      subscribeToasts((t) => {
        setItems((list) => [...list, t])
        setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 3600)
      }),
    []
  )

  const dismiss = (id: number) => setItems((list) => list.filter((x) => x.id !== id))

  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status">
          {ICON[t.kind]}
          <span>{t.text}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Đóng">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
