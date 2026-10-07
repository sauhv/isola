import { createHash, verify } from 'node:crypto'

export class CrxError extends Error {}

export interface ParsedCrx {
  /** ID extension 32 ký tự a–p, tính từ public key. */
  id: string
  /** Public key dạng DER (SubjectPublicKeyInfo). */
  publicKey: Buffer
  /** Phần zip chứa mã nguồn extension. */
  zip: Buffer
}

/** ID Chrome = 16 byte đầu SHA-256(public key), mỗi nibble hex 0–f đổi thành a–p. */
export function extensionIdFromKey(publicKeyDer: Buffer): string {
  return idFromHashPrefix(createHash('sha256').update(publicKeyDer).digest().subarray(0, 16))
}

function idFromHashPrefix(bytes: Buffer): string {
  return [...bytes.toString('hex')].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')
}

/**
 * Đọc file .crx (CRX3, và CRX2 cũ) và kiểm chữ ký.
 * Chrome không kiểm chữ ký khi nạp unpacked, nên Isola tự kiểm ở bước này.
 */
export function parseCrx(buf: Buffer): ParsedCrx {
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24') throw new CrxError('Không phải file CRX')
  const version = buf.readUInt32LE(4)
  if (version === 3) return parseCrx3(buf)
  if (version === 2) return parseCrx2(buf)
  throw new CrxError(`CRX phiên bản ${version} không được hỗ trợ`)
}

function parseCrx3(buf: Buffer): ParsedCrx {
  const headerSize = buf.readUInt32LE(8)
  if (12 + headerSize > buf.length) throw new CrxError('Header CRX hỏng')
  const header = buf.subarray(12, 12 + headerSize)
  const zip = buf.subarray(12 + headerSize)

  // CrxFileHeader: 2 = sha256_with_rsa (AsymmetricKeyProof), 10000 = signed_header_data
  const rsaProofs: { publicKey: Buffer; signature: Buffer }[] = []
  let signedHeaderData: Buffer | null = null
  for (const f of readProto(header)) {
    if (f.field === 2 && f.bytes) {
      const proof: { publicKey: Buffer; signature: Buffer } = { publicKey: Buffer.alloc(0), signature: Buffer.alloc(0) }
      for (const p of readProto(f.bytes)) {
        if (p.field === 1 && p.bytes) proof.publicKey = p.bytes
        if (p.field === 2 && p.bytes) proof.signature = p.bytes
      }
      rsaProofs.push(proof)
    } else if (f.field === 10000 && f.bytes) {
      signedHeaderData = f.bytes
    }
  }
  if (!signedHeaderData) throw new CrxError('CRX thiếu signed_header_data')
  let crxId: Buffer | null = null
  for (const f of readProto(signedHeaderData)) if (f.field === 1 && f.bytes) crxId = f.bytes
  if (!crxId || crxId.length !== 16) throw new CrxError('CRX thiếu crx_id')

  // Khóa của nhà phát triển là khóa có hash khớp crx_id. Phải có và chữ ký phải đúng.
  const own = rsaProofs.find((p) => createHash('sha256').update(p.publicKey).digest().subarray(0, 16).equals(crxId))
  if (!own) throw new CrxError('CRX không có khóa khớp ID')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(signedHeaderData.length)
  const signed = Buffer.concat([Buffer.from('CRX3 SignedData\x00', 'latin1'), len, signedHeaderData, zip])
  if (!verifyRsa('sha256', signed, own.publicKey, own.signature)) throw new CrxError('Chữ ký CRX không hợp lệ')

  return { id: idFromHashPrefix(crxId), publicKey: own.publicKey, zip }
}

function parseCrx2(buf: Buffer): ParsedCrx {
  const keyLen = buf.readUInt32LE(8)
  const sigLen = buf.readUInt32LE(12)
  const start = 16 + keyLen + sigLen
  if (start > buf.length) throw new CrxError('Header CRX2 hỏng')
  const publicKey = buf.subarray(16, 16 + keyLen)
  const signature = buf.subarray(16 + keyLen, start)
  const zip = buf.subarray(start)
  if (!verifyRsa('sha1', zip, publicKey, signature)) throw new CrxError('Chữ ký CRX2 không hợp lệ')
  return { id: extensionIdFromKey(publicKey), publicKey, zip }
}

function verifyRsa(alg: string, data: Buffer, publicKeyDer: Buffer, signature: Buffer): boolean {
  try {
    return verify(alg, data, { key: publicKeyDer, format: 'der', type: 'spki' }, signature)
  } catch {
    return false
  }
}

type ProtoField = { field: number; bytes?: Buffer; varint?: number }

/** Đọc protobuf tối giản: chỉ cần varint và length-delimited cho header CRX. */
function readProto(buf: Buffer): ProtoField[] {
  const out: ProtoField[] = []
  let pos = 0
  const varint = (): number => {
    let result = 0
    let shift = 0
    for (;;) {
      if (pos >= buf.length) throw new CrxError('Protobuf hỏng')
      const b = buf[pos++]
      result += (b & 0x7f) * 2 ** shift
      if (!(b & 0x80)) return result
      shift += 7
      if (shift > 49) throw new CrxError('Protobuf hỏng')
    }
  }
  while (pos < buf.length) {
    const key = varint()
    const field = Math.floor(key / 8)
    const wire = key & 7
    if (wire === 0) out.push({ field, varint: varint() })
    else if (wire === 2) {
      const len = varint()
      if (pos + len > buf.length) throw new CrxError('Protobuf hỏng')
      out.push({ field, bytes: buf.subarray(pos, pos + len) })
      pos += len
    } else if (wire === 1) pos += 8
    else if (wire === 5) pos += 4
    else throw new CrxError('Protobuf hỏng')
  }
  return out
}
