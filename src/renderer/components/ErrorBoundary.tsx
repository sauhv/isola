'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
  info: string
}

/**
 * Bắt lỗi render của React để app không trắng màn hình: thay vì màn trắng câm lặng, hiện thông báo
 * lỗi + nút Tải lại, và ghi lỗi ra console (main process gom vào logs/renderer.log để tìm nguyên nhân).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info: info.componentStack ?? '' })
    // In ra console để main process ghi vào logs/renderer.log.
    console.error('[isola] Lỗi render:', error?.stack || error?.message || String(error), info.componentStack)
  }

  render(): ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children
    return (
      <div style={wrap}>
        <div style={card}>
          <h2 style={{ margin: '0 0 8px' }}>Đã xảy ra lỗi hiển thị</h2>
          <p style={{ margin: '0 0 12px', color: '#9aa0a6' }}>
            Giao diện gặp sự cố nên không hiển thị được. Bấm Tải lại; nếu vẫn lỗi, gửi nội dung bên dưới cho nhà phát triển.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button style={primary} onClick={() => window.location.reload()}>
              Tải lại
            </button>
            <button
              style={ghost}
              onClick={() => navigator.clipboard?.writeText(`${error.stack || error.message}\n\n${info}`).catch(() => {})}
            >
              Sao chép lỗi
            </button>
          </div>
          <pre style={pre}>{String(error.stack || error.message)}</pre>
          {info && <pre style={pre}>{info}</pre>}
        </div>
      </div>
    )
  }
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#141518',
  color: '#e8eaed',
  padding: 24,
  overflow: 'auto'
}
const card: React.CSSProperties = { maxWidth: 720, width: '100%', fontFamily: 'system-ui, sans-serif' }
const primary: React.CSSProperties = {
  padding: '8px 16px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
}
const ghost: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  color: '#e8eaed',
  border: '1px solid #3c4043',
  borderRadius: 6,
  cursor: 'pointer'
}
const pre: React.CSSProperties = {
  background: '#1e1f22',
  border: '1px solid #2a2b2f',
  borderRadius: 6,
  padding: 12,
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 240,
  overflow: 'auto',
  margin: '0 0 8px'
}
