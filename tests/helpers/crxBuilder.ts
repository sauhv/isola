import AdmZip from 'adm-zip'
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { extensionIdFromKey } from '../../src/main/engine/crx'

export function makeZip(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip()
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content))
  }
  return zip.toBuffer()
}

export interface TestKey {
  privateKey: KeyObject
  publicDer: Buffer
  id: string
}

export function newKey(): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicDer = publicKey.export({ type: 'spki', format: 'der' })
  return { privateKey, publicDer, id: extensionIdFromKey(publicDer) }
}

function varint(n: number): Buffer {
  const out: number[] = []
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
  return Buffer.from(out)
}

function field(num: number, bytes: Buffer): Buffer {
  return Buffer.concat([varint(num * 8 + 2), varint(bytes.length), bytes])
}

/** Đóng gói CRX3 có chữ ký RSA hợp lệ, giống cách Chrome đóng gói. */
export function buildCrx3(zip: Buffer, key: TestKey): Buffer {
  const crxId = createHash('sha256').update(key.publicDer).digest().subarray(0, 16)
  const signedHeaderData = field(1, crxId)
  const len = Buffer.alloc(4)
  len.writeUInt32LE(signedHeaderData.length)
  const signature = sign(
    'sha256',
    Buffer.concat([Buffer.from('CRX3 SignedData\x00', 'latin1'), len, signedHeaderData, zip]),
    key.privateKey
  )
  const header = Buffer.concat([field(2, Buffer.concat([field(1, key.publicDer), field(2, signature)])), field(10000, signedHeaderData)])
  const prefix = Buffer.alloc(12)
  prefix.write('Cr24', 0, 'latin1')
  prefix.writeUInt32LE(3, 4)
  prefix.writeUInt32LE(header.length, 8)
  return Buffer.concat([prefix, header, zip])
}

/** Extension MV3 tối giản có service worker. */
export function sampleExtension(version: string, extra: Record<string, unknown> = {}): Record<string, string | Buffer> {
  return {
    'manifest.json': JSON.stringify({
      manifest_version: 3,
      name: '__MSG_extName__',
      default_locale: 'en',
      version,
      description: 'Isola test extension',
      permissions: ['storage'],
      host_permissions: ['https://*.example.com/*'],
      background: { service_worker: 'sw.js' },
      icons: { '16': 'icon16.png', '128': 'icon128.png' },
      ...extra
    }),
    '_locales/en/messages.json': JSON.stringify({ extName: { message: 'Isola Probe' } }),
    'sw.js': 'self.addEventListener("install", () => {});',
    // PNG 1x1
    'icon128.png': Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    ),
    'icon16.png': Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    )
  }
}
