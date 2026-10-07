'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

interface Props {
  trigger: (toggle: () => void, open: boolean) => ReactNode
  items: (MenuItem | 'divider')[]
}

const GAP = 4

/**
 * Menu thả xuống. Vẽ qua portal vào body với vị trí cố định, để không bị bảng cuộn
 * hay cột ghim che. Tự lật lên khi không đủ chỗ bên dưới. Đóng khi bấm ra ngoài, Esc, cuộn.
 */
export default function Menu({ trigger, items }: Props) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const anchorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return
    const a = anchorRef.current.getBoundingClientRect()
    const h = menuRef.current.offsetHeight
    const below = a.bottom + GAP + h <= window.innerHeight
    setStyle({
      position: 'fixed',
      right: Math.max(8, window.innerWidth - a.right),
      ...(below ? { top: a.bottom + GAP } : { bottom: window.innerHeight - a.top + GAP })
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchorRef.current?.contains(t) && !menuRef.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    // capture: bắt cả cuộn bên trong bảng
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <div className="menu-anchor" ref={anchorRef}>
      {trigger(() => {
        setStyle({ visibility: 'hidden', position: 'fixed' })
        setOpen((o) => !o)
      }, open)}
      {open &&
        createPortal(
          <div className="menu" role="menu" ref={menuRef} style={style}>
            {items.map((item, i) =>
              item === 'divider' ? (
                <hr key={i} />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  className={item.danger ? 'danger' : undefined}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
