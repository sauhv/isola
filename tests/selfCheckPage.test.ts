import { describe, expect, it } from 'vitest'
import { renderSelfCheckPage, type SelfCheckData } from '../src/main/engine/selfCheckPage'

const base: SelfCheckData = {
  name: 'Acc 1',
  group: 'Shop',
  serial: 7,
  id: 'abc123',
  platform: 'facebook',
  username: 'user@x.com',
  lab: false,
  notes: 'cookie: abc; ghi chú nhiều dòng\ndòng 2',
  proxy: { type: 'socks5', host: 'h.example', ip: '1.2.3.4', country: 'Vietnam' },
  kernelMajor: 155,
  kernelVersion: '155.0.8037.58',
  os: 'Windows',
  userAgent: 'Mozilla/5.0 Chrome/155.0.0.0',
  timezone: 'Asia/Ho_Chi_Minh',
  language: 'en-US',
  screen: { width: 1920, height: 1080 },
  extensions: [{ name: 'uBlock Origin Lite', version: '2026.1006.1931' }],
  startedAt: '2026-10-10 23:04:55'
}

describe('renderSelfCheckPage', () => {
  it('nhúng dữ liệu profile và fingerprint hiệu lực', () => {
    const html = renderSelfCheckPage(base)
    expect(html).toContain('Acc 1')
    expect(html).toContain('7/abc123')
    expect(html).toContain('SOCKS5 · h.example')
    expect(html).toContain('155 · 155.0.8037.58')
    expect(html).toContain('Asia/Ho_Chi_Minh')
    // IP proxy đi vào DATA để trang đối chiếu IP egress
    expect(html).toContain('1.2.3.4')
    // Notes hiển thị trên trang
    expect(html).toContain('ghi chú nhiều dòng')
    expect(html).toContain('data-i="notes"')
    // Extension áp cho profile hiển thị
    expect(html).toContain('uBlock Origin Lite')
    expect(html).toContain('data-i="secExt"')
  })

  it('escape dữ liệu người dùng để không chèn được mã', () => {
    const html = renderSelfCheckPage({ ...base, name: '<img src=x onerror=alert(1)>', username: '</script><b>x' })
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    // không được thoát khỏi thẻ script
    expect(html).not.toContain('</script><b>x')
  })

  it('không proxy: đánh dấu để trang hiển thị nhãn phù hợp', () => {
    const lab = renderSelfCheckPage({ ...base, lab: true, proxy: null })
    expect(lab).toContain('data-i="noProxyLab"')
    const noProxy = renderSelfCheckPage({ ...base, lab: false, proxy: null })
    expect(noProxy).toContain('data-i="noProxy"')
  })
})
