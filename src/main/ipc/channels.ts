// Tên kênh IPC dùng chung giữa main và preload. Phase 1 trở đi thêm kênh profiles/proxies/groups.
export const Channels = {} as const

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
