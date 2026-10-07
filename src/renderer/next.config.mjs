/** @type {import('next').NextConfig} */
const nextConfig = {
  // Xuất HTML/JS tĩnh vào src/renderer/out. Electron phục vụ qua app://, không chạy server Next.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true
}

export default nextConfig
