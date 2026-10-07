// Type dùng chung giữa main, preload và renderer. Chỉ chứa type, không chứa code chạy.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type ProfileStatus = 'idle' | 'running' | 'archived'

export interface Group {
  id: string
  name: string
  profileCount: number
  createdAt: string
}

export interface Tag {
  id: string
  name: string
}

export interface Profile {
  id: string
  serial: number
  name: string
  groupId: string | null
  groupName: string | null
  tags: Tag[]
  startUrls: string[]
  username: string | null
  status: ProfileStatus
  kernel: string
  proxyId: string | null
  proxyHost: string | null
  /** Tóm tắt proxy để hiện trong bảng (kết quả kiểm gần nhất). */
  proxy: {
    label: string
    type: string
    host: string
    ip: string | null
    country: string | null
    error: string | null
  } | null
  /** Nền tảng tài khoản trong profile (facebook, tiktok…), người dùng tự ghi. */
  platform: string | null
  lastOpenedAt: string | null
  lab: boolean
  notes: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProfileFilter {
  groupId?: string
  tagId?: string
  search?: string
  archived?: boolean
}

export interface ProfileInput {
  name: string
  groupId?: string | null
  proxyId?: string | null
  tags?: string[]
  startUrls?: string[]
  username?: string | null
  notes?: string | null
  platform?: string | null
  lab?: boolean
  kernel?: string
}

export type ProfilePatch = Partial<Omit<ProfileInput, 'kernel'>>

export interface KernelInfo {
  id: string
  major: number
  buildId: string
  installed: boolean
}

export interface KernelProgress {
  id: string
  downloadedBytes: number
  totalBytes: number
}

export type ProxyType = 'http' | 'https' | 'socks5'

export interface ProxyCheck {
  ip: string | null
  country: string | null
  city: string | null
  timezone: string | null
  latencyMs: number | null
  error: string | null
  at: string
}

/** Proxy như renderer thấy. Không bao giờ chứa password, chỉ cờ `hasPassword`. */
export interface Proxy {
  id: string
  label: string
  type: ProxyType
  host: string
  port: number
  username: string | null
  hasPassword: boolean
  refreshUrl: string | null
  lastCheck: ProxyCheck | null
  profileCount: number
  createdAt: string
}

export interface ProxyInput {
  label?: string
  type: ProxyType
  host: string
  port: number
  username?: string | null
  /** Chỉ gửi khi lưu. undefined = giữ nguyên, null = xóa. */
  password?: string | null
  refreshUrl?: string | null
}

export type ProxyPatch = Partial<ProxyInput>

export interface ProxyImportResult {
  created: number
  errors: { line: number; reason: string }[]
}

export interface GeoInfo {
  country: string | null
  city: string | null
  timezone: string | null
}

export interface GeoStatus {
  installed: boolean
  version: string | null
}

export interface DownloadProgress {
  downloadedBytes: number
  totalBytes: number
}

export type ExtensionScope = 'all' | 'groups' | 'profiles'

export interface Extension {
  id: string
  name: string
  version: string
  description: string | null
  source: 'store' | 'file'
  permissions: string[]
  icon: string | null
  enabled: boolean
  scope: ExtensionScope
  groupIds: string[]
  profileIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ExtensionPatch {
  enabled?: boolean
  scope?: ExtensionScope
  groupIds?: string[]
  profileIds?: string[]
}

export interface ExtensionUpdateInfo {
  id: string
  current: string
  latest: string | null
}

export interface ProfileStatusEvent {
  id: string
  status: ProfileStatus
}

export interface IsolaApi {
  profiles: {
    list(filter?: ProfileFilter): Promise<Result<Profile[]>>
    create(input: ProfileInput): Promise<Result<Profile>>
    update(id: string, patch: ProfilePatch): Promise<Result<Profile>>
    archive(id: string): Promise<Result<null>>
    restore(id: string): Promise<Result<null>>
    purge(id: string, confirmed: boolean): Promise<Result<null>>
    start(id: string): Promise<Result<null>>
    stop(id: string): Promise<Result<null>>
  }
  groups: {
    list(): Promise<Result<Group[]>>
    create(name: string): Promise<Result<Group>>
    rename(id: string, name: string): Promise<Result<null>>
    remove(id: string): Promise<Result<null>>
  }
  tags: {
    list(): Promise<Result<Tag[]>>
  }
  proxies: {
    list(): Promise<Result<Proxy[]>>
    create(input: ProxyInput): Promise<Result<Proxy>>
    update(id: string, patch: ProxyPatch): Promise<Result<Proxy>>
    remove(id: string): Promise<Result<null>>
    test(id: string): Promise<Result<Proxy>>
    testMany(ids: string[]): Promise<Result<Proxy[]>>
    import(text: string, defaultType: ProxyType): Promise<Result<ProxyImportResult>>
    refreshIp(id: string): Promise<Result<Proxy>>
  }
  geo: {
    status(): Promise<Result<GeoStatus>>
    install(): Promise<Result<GeoStatus>>
  }
  extensions: {
    list(): Promise<Result<Extension[]>>
    addFromStore(urlOrId: string): Promise<Result<Extension>>
    /** Mở hộp thoại chọn file .crx/.zip hoặc thư mục. null nếu người dùng hủy. */
    addFromFile(kind: 'file' | 'folder'): Promise<Result<Extension | null>>
    /** Cập nhật extension tự làm từ file mới, giữ nguyên ID. */
    updateFromFile(id: string, kind: 'file' | 'folder'): Promise<Result<Extension | null>>
    update(id: string, patch: ExtensionPatch): Promise<Result<Extension>>
    remove(id: string): Promise<Result<null>>
    checkUpdates(): Promise<Result<ExtensionUpdateInfo[]>>
    updateFromStore(id: string): Promise<Result<Extension>>
  }
  kernels: {
    list(): Promise<Result<KernelInfo[]>>
    install(id: string): Promise<Result<KernelInfo>>
  }
  onProfileStatus(cb: (e: ProfileStatusEvent) => void): () => void
  onKernelProgress(cb: (e: KernelProgress) => void): () => void
  onGeoProgress(cb: (e: DownloadProgress) => void): () => void
}
