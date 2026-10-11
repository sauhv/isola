// Tạo build/icon.ico (256px, PNG nén trong .ico) và build/icon.png (512px) từ logo SVG.
const sharp = require('sharp')
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const svg = readFileSync(join(root, 'src/renderer/app/icon.svg'))
const outDir = join(root, 'build')
mkdirSync(outDir, { recursive: true })

/** Gói một PNG 256x256 thành container .ico hợp lệ (Windows Vista+ nhận PNG trong ICO). */
function pngToIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(1, 4) // số ảnh
  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0) // width 0 => 256
  entry.writeUInt8(0, 1) // height 0 => 256
  entry.writeUInt8(0, 2) // số màu trong palette
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8) // kích thước dữ liệu
  entry.writeUInt32LE(header.length + entry.length, 12) // offset
  return Buffer.concat([header, entry, png])
}

async function main() {
  const png256 = await sharp(svg, { density: 384 }).resize(256, 256).png().toBuffer()
  const png512 = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer()
  writeFileSync(join(outDir, 'icon.ico'), pngToIco(png256))
  writeFileSync(join(outDir, 'icon.png'), png512)
  console.log('wrote build/icon.ico (256) + build/icon.png (512)')
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
