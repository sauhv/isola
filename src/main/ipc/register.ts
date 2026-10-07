import { ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import type { Result } from '../../shared/types'
import { IsolaError } from '../errors'
import type { KernelService } from '../services/kernelService'
import type { LaunchService } from '../services/launchService'
import type { ProfileService } from '../services/profileService'
import { Channels } from './channels'

const id = z.string().uuid()
const name = z.string().trim().min(1).max(100)
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Chỉ nhận URL http/https')

const profileFields = {
  name,
  groupId: id.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  startUrls: z.array(httpUrl).max(20).optional(),
  username: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  lab: z.boolean().optional()
}
const profileInput = z.object({ ...profileFields, kernel: z.string().optional() }).strict()
const profilePatch = z.object(profileFields).partial().strict()
const profileFilter = z
  .object({
    groupId: id.optional(),
    tagId: id.optional(),
    search: z.string().max(100).optional(),
    archived: z.boolean().optional()
  })
  .strict()
  .optional()

export interface Services {
  profiles: ProfileService
  launcher: LaunchService
  kernels: KernelService
  /** Cửa sổ nhận event main → renderer. */
  target: () => WebContents | null
}

/** Bọc handler: validate input bằng zod, đổi mọi lỗi thành `{ ok: false, error }`. */
function handle<A extends z.ZodTypeAny[], T>(
  channel: string,
  schemas: [...A],
  fn: (...args: { [K in keyof A]: z.infer<A[K]> }) => T | Promise<T>
): void {
  ipcMain.handle(channel, async (_event, ...raw: unknown[]): Promise<Result<T>> => {
    try {
      const args = schemas.map((s, i) => {
        const parsed = s.safeParse(raw[i])
        if (!parsed.success) throw new IsolaError('INVALID_INPUT', parsed.error.issues[0]?.message)
        return parsed.data
      }) as { [K in keyof A]: z.infer<A[K]> }
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      if (err instanceof IsolaError) return { ok: false, error: err.code === 'INVALID_INPUT' ? `INVALID_INPUT: ${err.message}` : err.code }
      console.error(`[ipc] ${channel}`, err)
      return { ok: false, error: 'INTERNAL' }
    }
  })
}

export function registerIpc(s: Services): void {
  handle(Channels.profilesList, [profileFilter], (f) => s.profiles.list(f ?? {}))
  handle(Channels.profilesCreate, [profileInput], (input) => s.profiles.create(input))
  handle(Channels.profilesUpdate, [id, profilePatch], (pid, patch) => s.profiles.update(pid, patch))
  handle(Channels.profilesArchive, [id], (pid) => (s.profiles.archive(pid), null))
  handle(Channels.profilesRestore, [id], (pid) => (s.profiles.restore(pid), null))
  handle(Channels.profilesPurge, [id, z.boolean()], (pid, confirmed) => (s.profiles.purge(pid, confirmed), null))
  handle(Channels.profilesStart, [id], async (pid) => (await s.launcher.start(pid), null))
  handle(Channels.profilesStop, [id], async (pid) => (await s.launcher.stop(pid), null))

  handle(Channels.groupsList, [], () => s.profiles.listGroups())
  handle(Channels.groupsCreate, [name], (n) => s.profiles.createGroup(n))
  handle(Channels.groupsRename, [id, name], (gid, n) => (s.profiles.renameGroup(gid, n), null))
  handle(Channels.groupsRemove, [id], (gid) => (s.profiles.removeGroup(gid), null))

  handle(Channels.tagsList, [], () => s.profiles.listTags())

  handle(Channels.kernelsList, [], () => s.kernels.list())
  handle(Channels.kernelsInstall, [z.string()], (kid) =>
    s.kernels.install(kid, (downloadedBytes, totalBytes) =>
      s.target()?.send(Channels.evtKernelProgress, { id: kid, downloadedBytes, totalBytes })
    )
  )

  s.launcher.on('status', (e) => s.target()?.send(Channels.evtProfileStatus, e))
}
