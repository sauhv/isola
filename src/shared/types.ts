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
  proxyHost: string | null
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
  tags?: string[]
  startUrls?: string[]
  username?: string | null
  notes?: string | null
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
  kernels: {
    list(): Promise<Result<KernelInfo[]>>
    install(id: string): Promise<Result<KernelInfo>>
  }
  onProfileStatus(cb: (e: ProfileStatusEvent) => void): () => void
  onKernelProgress(cb: (e: KernelProgress) => void): () => void
}
