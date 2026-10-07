/**
 * Catalog thiết bị cứng (SPEC-003 §4). Mỗi mục là một tổ hợp có thật: OS ↔ platform ↔ UA-CH
 * platformVersion ↔ GPU ↔ màn hình ↔ CPU/RAM đi cùng nhau. Không có iOS/Android, không có
 * CPU quá 16 nhân. Seed chỉ được sinh từ các mục này; tổ hợp ngoài catalog bị từ chối.
 */
export type GpuVendor = 'intel' | 'nvidia' | 'amd' | 'apple'

export interface CatalogEntry {
  id: string
  label: string
  os: 'windows' | 'macos'
  /** UA-CH platformVersion: Windows 10 = 10.0.0, Windows 11 ≥ 13.0.0; macOS theo phiên bản thật. */
  platformVersion: string
  architecture: 'x86' | 'arm'
  gpuVendor: GpuVendor
  webgl: { vendor: string; renderer: string }
  screen: { width: number; height: number; dpr: number }
  /** Chiều cao trừ thanh tác vụ (Windows) hoặc thanh menu (macOS). */
  availHeight: number
  hardware: { cores: number; memoryGb: number }
  mediaDevices: { cameras: number; mics: number }
}

const angle = (vendor: string, gpu: string) => ({
  vendor: `Google Inc. (${vendor})`,
  renderer: `ANGLE (${vendor}, ${gpu} Direct3D11 vs_5_0 ps_5_0, D3D11)`
})

const appleGpu = (chip: string) => ({
  vendor: 'Google Inc. (Apple)',
  renderer: `ANGLE (Apple, ANGLE Metal Renderer: ${chip}, Unspecified Version)`
})

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'win10-intel-uhd620-1920',
    label: 'Windows 10 · Intel UHD 620 · 1920×1080',
    os: 'windows',
    platformVersion: '10.0.0',
    architecture: 'x86',
    gpuVendor: 'intel',
    webgl: angle('Intel', 'Intel(R) UHD Graphics 620 (0x00005917)'),
    screen: { width: 1920, height: 1080, dpr: 1 },
    availHeight: 1040,
    hardware: { cores: 8, memoryGb: 16 },
    mediaDevices: { cameras: 1, mics: 1 }
  },
  {
    id: 'win11-intel-irisxe-1536',
    label: 'Windows 11 · Intel Iris Xe · 1536×864 (laptop 125%)',
    os: 'windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    gpuVendor: 'intel',
    webgl: angle('Intel', 'Intel(R) Iris(R) Xe Graphics (0x00009A49)'),
    screen: { width: 1536, height: 864, dpr: 1.25 },
    availHeight: 816,
    hardware: { cores: 8, memoryGb: 16 },
    mediaDevices: { cameras: 1, mics: 1 }
  },
  {
    id: 'win11-intel-uhd770-2560',
    label: 'Windows 11 · Intel UHD 770 · 2560×1440',
    os: 'windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    gpuVendor: 'intel',
    webgl: angle('Intel', 'Intel(R) UHD Graphics 770 (0x00004680)'),
    screen: { width: 2560, height: 1440, dpr: 1 },
    availHeight: 1392,
    hardware: { cores: 12, memoryGb: 16 },
    mediaDevices: { cameras: 0, mics: 1 }
  },
  {
    id: 'win11-intel-uhd-1366',
    label: 'Windows 11 · Intel UHD · 1366×768',
    os: 'windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    gpuVendor: 'intel',
    webgl: angle('Intel', 'Intel(R) UHD Graphics (0x00009A68)'),
    screen: { width: 1366, height: 768, dpr: 1 },
    availHeight: 728,
    hardware: { cores: 4, memoryGb: 8 },
    mediaDevices: { cameras: 1, mics: 1 }
  },
  {
    id: 'win11-nvidia-gtx1650-1536',
    label: 'Windows 11 · NVIDIA GTX 1650 · 1536×864 (laptop 125%)',
    os: 'windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    gpuVendor: 'nvidia',
    webgl: angle('NVIDIA', 'NVIDIA GeForce GTX 1650 (0x00001F82)'),
    screen: { width: 1536, height: 864, dpr: 1.25 },
    availHeight: 816,
    hardware: { cores: 8, memoryGb: 16 },
    mediaDevices: { cameras: 1, mics: 1 }
  },
  {
    id: 'win10-nvidia-rtx3060-1920',
    label: 'Windows 10 · NVIDIA RTX 3060 · 1920×1080',
    os: 'windows',
    platformVersion: '10.0.0',
    architecture: 'x86',
    gpuVendor: 'nvidia',
    webgl: angle('NVIDIA', 'NVIDIA GeForce RTX 3060 (0x00002504)'),
    screen: { width: 1920, height: 1080, dpr: 1 },
    availHeight: 1040,
    hardware: { cores: 12, memoryGb: 16 },
    mediaDevices: { cameras: 0, mics: 1 }
  },
  {
    id: 'win11-amd-rx580-1920',
    label: 'Windows 11 · AMD Radeon RX 580 · 1920×1080',
    os: 'windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    gpuVendor: 'amd',
    webgl: angle('AMD', 'AMD Radeon RX 580 Series (0x000067DF)'),
    screen: { width: 1920, height: 1080, dpr: 1 },
    availHeight: 1040,
    hardware: { cores: 8, memoryGb: 16 },
    mediaDevices: { cameras: 0, mics: 1 }
  },
  {
    id: 'win10-amd-vega8-1366',
    label: 'Windows 10 · AMD Radeon Vega 8 · 1366×768',
    os: 'windows',
    platformVersion: '10.0.0',
    architecture: 'x86',
    gpuVendor: 'amd',
    webgl: angle('AMD', 'AMD Radeon(TM) Vega 8 Graphics (0x000015D8)'),
    screen: { width: 1366, height: 768, dpr: 1 },
    availHeight: 728,
    hardware: { cores: 8, memoryGb: 8 },
    mediaDevices: { cameras: 1, mics: 1 }
  },
  {
    id: 'mac-m1-1440',
    label: 'macOS · Apple M1 · 1440×900 Retina',
    os: 'macos',
    platformVersion: '14.6.1',
    architecture: 'arm',
    gpuVendor: 'apple',
    webgl: appleGpu('Apple M1'),
    screen: { width: 1440, height: 900, dpr: 2 },
    availHeight: 875,
    hardware: { cores: 8, memoryGb: 16 },
    mediaDevices: { cameras: 1, mics: 1 }
  },
  {
    id: 'mac-m2-1512',
    label: 'macOS · Apple M2 · 1512×982 Retina',
    os: 'macos',
    platformVersion: '15.3.2',
    architecture: 'arm',
    gpuVendor: 'apple',
    webgl: appleGpu('Apple M2'),
    screen: { width: 1512, height: 982, dpr: 2 },
    availHeight: 950,
    hardware: { cores: 8, memoryGb: 16 },
    mediaDevices: { cameras: 1, mics: 1 }
  },
  {
    id: 'mac-m1pro-1728',
    label: 'macOS · Apple M1 Pro · 1728×1117 Retina',
    os: 'macos',
    platformVersion: '15.5.0',
    architecture: 'arm',
    gpuVendor: 'apple',
    webgl: appleGpu('Apple M1 Pro'),
    screen: { width: 1728, height: 1117, dpr: 2 },
    availHeight: 1085,
    hardware: { cores: 10, memoryGb: 16 },
    mediaDevices: { cameras: 1, mics: 1 }
  }
]

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id)
}

export interface HostInfo {
  os: 'windows' | 'macos'
  /** null = không xác định được hãng GPU, không lọc theo GPU. */
  gpuVendor: GpuVendor | null
}

export function detectHostOs(): 'windows' | 'macos' {
  return process.platform === 'darwin' ? 'macos' : 'windows'
}

/** PCI vendor ID → hãng GPU. */
export function gpuVendorFromPciId(vendorId: number | undefined): GpuVendor | null {
  switch (vendorId) {
    case 0x8086:
      return 'intel'
    case 0x10de:
      return 'nvidia'
    case 0x1002:
    case 0x1022:
      return 'amd'
    case 0x106b:
      return 'apple'
    default:
      return null
  }
}

/**
 * Mục catalog dùng được trên máy này (đã chốt 2026-10-07): cùng OS với máy, và cùng hãng GPU
 * nếu xác định được. Không còn mục nào cùng hãng GPU thì bỏ lọc GPU.
 */
export function compatibleEntries(host: HostInfo): CatalogEntry[] {
  const sameOs = CATALOG.filter((e) => e.os === host.os)
  if (!host.gpuVendor) return sameOs
  const sameGpu = sameOs.filter((e) => e.gpuVendor === host.gpuVendor)
  return sameGpu.length ? sameGpu : sameOs
}
