import { app, dialog, ipcMain, screen, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { Result } from '../../shared/types'
import { IsolaError } from '../errors'
import { CookieParseError, parseCookies, type CookieParam } from '../engine/cookies'
import { DEFAULT_KERNEL_ID, findSupportedKernel } from '../engine/kernels'
import { compatibleEntries } from '../engine/catalog'
import { generateSeed, SeedError } from '../engine/seed'
import type { CookieService } from '../services/cookieService'
import type { KernelService } from '../services/kernelService'
import type { ExtensionService } from '../services/extensionService'
import type { GeoService } from '../services/geoService'
import type { LaunchService } from '../services/launchService'
import type { ProfileService } from '../services/profileService'
import type { ProxyService } from '../services/proxyService'
import type { ProfileBundle, TransferService } from '../services/transferService'
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
  proxyId: id.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  startUrls: z.array(httpUrl).max(20).optional(),
  username: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  platform: z.string().trim().max(50).nullable().optional(),
  lab: z.boolean().optional(),
  // Cookie dán vào: JSON hoặc Netscape, tối đa ~2 MB.
  cookies: z.string().max(2_000_000).optional()
}
// Seed được kiểm kỹ ở ProfileService (catalog, kernel, máy chủ); ở đây chỉ kiểm hình dạng thô.
const fingerprintInput = z.object({ catalogId: z.string().min(1).max(100), seed: z.record(z.string(), z.unknown()) }).strict()
const profileInput = z
  .object({ ...profileFields, kernel: z.string().optional(), fingerprint: fingerprintInput.optional() })
  .strict()
const profilePatch = z.object(profileFields).partial().strict()
const previewOptions = z
  .object({
    catalogId: z.string().max(100).optional(),
    webrtc: z.enum(['replace', 'disable']).optional(),
    language: z.string().max(20).optional(),
    timezone: z.string().max(64).optional()
  })
  .strict()
  .optional()
const profileFilter = z
  .object({
    groupId: id.optional(),
    tagId: id.optional(),
    search: z.string().max(100).optional(),
    archived: z.boolean().optional()
  })
  .strict()
  .optional()

const proxyType = z.enum(['http', 'https', 'socks5'])
const proxyFields = {
  label: z.string().trim().max(100).optional(),
  type: proxyType,
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9.-]+$/i, 'Host chỉ gồm chữ, số, dấu chấm, gạch ngang'),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(200).nullable().optional(),
  password: z.string().max(500).nullable().optional(),
  refreshUrl: httpUrl.nullable().optional()
}
const proxyInput = z.object(proxyFields).strict()
const proxyPatch = z.object(proxyFields).partial().strict()

const extId = z.string().regex(/^[a-p]{32}$/, 'ID extension không hợp lệ')
const pickKind = z.enum(['file', 'folder'])
const extensionPatch = z
  .object({
    enabled: z.boolean().optional(),
    scope: z.enum(['all', 'groups', 'profiles']).optional(),
    groupIds: z.array(id).max(1000).optional(),
    profileIds: z.array(id).max(10_000).optional()
  })
  .strict()


const bulkCreateInput = z
  .object({
    count: z.number().int().min(1).max(500),
    namePattern: z.string().trim().min(1).max(100),
    startIndex: z.number().int().min(0).max(1_000_000).optional(),
    groupId: id.nullable().optional(),
    platform: z.string().trim().max(50).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    startUrls: z.array(httpUrl).max(20).optional(),
    lab: z.boolean().optional(),
    proxyIds: z.array(id).max(500).optional()
  })
  .strict()

export interface Services {
  profiles: ProfileService
  proxies: ProxyService
  geo: GeoService
  extensions: ExtensionService
  cookies: CookieService
  launcher: LaunchService
  kernels: KernelService
  transfer: TransferService
  /** Cửa sổ chính: nhận event main → renderer, làm cha cho hộp thoại. */
  window: () => BrowserWindow | null
}

// Bundle .isola khi nhập: kiểm hình dạng thô; seed/catalog được ProfileService kiểm kỹ lúc dựng lại.
const bundleCookie = z
  .object({
    name: z.string().max(256),
    value: z.string().max(8192),
    url: z.string().max(2048).optional(),
    domain: z.string().max(256).optional(),
    path: z.string().max(2048),
    secure: z.boolean(),
    httpOnly: z.boolean(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
    expires: z.number().optional()
  })
  .strict()
const bundleProxy = z
  .object({
    label: z.string().max(100),
    type: proxyType,
    host: z.string().max(253),
    port: z.number().int().min(1).max(65535),
    username: z.string().max(200).nullable(),
    password: z.string().max(500).nullable()
  })
  .strict()
const bundleProfile = z
  .object({
    name: z.string().max(100),
    groupName: z.string().max(100).nullable(),
    tags: z.array(z.string().max(50)).max(20),
    startUrls: z.array(z.string().max(2048)).max(20),
    username: z.string().max(200).nullable(),
    kernel: z.string().max(100),
    platform: z.string().max(50).nullable(),
    lab: z.boolean(),
    notes: z.string().max(5000).nullable(),
    fingerprint: z.object({ catalogId: z.string().max(100), seed: z.record(z.string(), z.unknown()) }).strict(),
    proxy: bundleProxy.nullable(),
    cookies: z.array(bundleCookie).max(5000).nullable()
  })
  .strict()
const profileBundle = z
  .object({
    isola: z.literal('profiles'),
    version: z.literal(1),
    exportedAt: z.string(),
    profiles: z.array(bundleProfile).min(1).max(5000)
  })
  .strict()

/** Hộp thoại chọn .crx/.zip hoặc thư mục extension. null nếu người dùng hủy. */
async function pickExtensionPath(win: BrowserWindow | null, kind: 'file' | 'folder'): Promise<string | null> {
  const options: OpenDialogOptions =
    kind === 'file'
      ? {
          title: 'Chọn file extension',
          properties: ['openFile'],
          filters: [{ name: 'Chrome extension (.crx, .zip)', extensions: ['crx', 'zip'] }]
        }
      : { title: 'Chọn thư mục extension (có manifest.json)', properties: ['openDirectory'] }
  const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
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
      // Dạng "CODE" hoặc "CODE: chi tiết". Chi tiết không bao giờ chứa password (xem proxyService.errMessage).
      if (err instanceof IsolaError)
        return { ok: false, error: err.message && err.message !== err.code ? `${err.code}: ${err.message}` : err.code }
      console.error(`[ipc] ${channel}`, err)
      return { ok: false, error: 'INTERNAL' }
    }
  })
}

export function registerIpc(s: Services): void {
  handle(Channels.appVersion, [], () => app.getVersion())
  handle(Channels.profilesList, [profileFilter], (f) => s.profiles.list(f ?? {}))
  // Cookie đọc trước khi tạo/sửa để lỗi định dạng không để lại profile dở.
  const readCookies = (text: string | undefined): CookieParam[] | null => {
    if (text === undefined || !text.trim()) return null
    try {
      return parseCookies(text)
    } catch (err) {
      if (err instanceof CookieParseError) throw new IsolaError('COOKIES_INVALID', err.message)
      throw err
    }
  }
  handle(Channels.profilesCreate, [profileInput], ({ cookies, fingerprint, ...input }) => {
    const parsed = readCookies(cookies)
    const created = s.profiles.create({ ...input, fingerprint: fingerprint as never })
    if (parsed) s.cookies.stage(created.id, parsed)
    return created
  })
  handle(Channels.profilesUpdate, [id, profilePatch], (pid, { cookies, ...patch }) => {
    const parsed = readCookies(cookies)
    const updated = s.profiles.update(pid, patch)
    if (parsed) s.cookies.stage(pid, parsed)
    return updated
  })
  handle(Channels.profilesSetFingerprint, [id, fingerprintInput], (pid, fp) => s.profiles.setFingerprint(pid, fp as never))
  handle(Channels.profilesClone, [id], (pid) => s.profiles.clone(pid))
  handle(Channels.profilesCreateMany, [bulkCreateInput], (input) => s.profiles.createMany(input))
  handle(Channels.profilesArrange, [z.array(id).max(1000)], async (ids) => {
    const area = screen.getPrimaryDisplay().workAreaSize
    return s.launcher.arrangeWindows(ids, area)
  })
  handle(Channels.profilesExportCookies, [id], async (pid) => {
    const cookies = await s.launcher.exportCookies(pid)
    const safe = s.profiles.get(pid).name.replace(/[^w.-]+/g, '_').slice(0, 40)
    const win = s.window()
    const opts = { defaultPath: `cookies-${safe}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { saved: false, count: cookies.length }
    writeFileSync(res.filePath, JSON.stringify(cookies, null, 2))
    return { saved: true, count: cookies.length }
  })
  handle(Channels.profilesExport, [z.array(id).min(1).max(5000)], async (ids) => {
    const bundle = await s.transfer.export(ids)
    const win = s.window()
    const stamp = new Date().toISOString().slice(0, 10)
    const defaultName = ids.length === 1 ? `${s.profiles.get(ids[0]).name.replace(/[^\w.-]+/g, '_').slice(0, 40)}.isola` : `profiles-${stamp}.isola`
    const opts = { defaultPath: defaultName, filters: [{ name: 'Isola bundle', extensions: ['isola'] }] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { saved: false, count: bundle.profiles.length }
    writeFileSync(res.filePath, JSON.stringify(bundle, null, 2))
    return { saved: true, count: bundle.profiles.length }
  })
  handle(Channels.profilesImport, [], async () => {
    const win = s.window()
    const opts: OpenDialogOptions = {
      title: 'Chọn file .isola',
      properties: ['openFile'],
      filters: [{ name: 'Isola bundle', extensions: ['isola', 'json'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || r.filePaths.length === 0) return null
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(r.filePaths[0], 'utf8'))
    } catch {
      throw new IsolaError('BUNDLE_INVALID', 'File không phải JSON hợp lệ')
    }
    const parsed = profileBundle.safeParse(raw)
    if (!parsed.success) throw new IsolaError('BUNDLE_INVALID', parsed.error.issues[0]?.message)
    return s.transfer.import(parsed.data as ProfileBundle)
  })
  handle(Channels.fingerprintsCatalog, [], () =>
    compatibleEntries(s.profiles.host).map((e) => ({ id: e.id, label: e.label, os: e.os, gpuVendor: e.gpuVendor }))
  )
  handle(Channels.fingerprintsPreview, [previewOptions], (opts) => {
    try {
      return generateSeed(s.profiles.host, findSupportedKernel(DEFAULT_KERNEL_ID)!, opts ?? {})
    } catch (err) {
      if (err instanceof SeedError) throw new IsolaError('SEED_INVALID', err.message)
      throw err
    }
  })
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
      s.window()?.webContents.send(Channels.evtKernelProgress, { id: kid, downloadedBytes, totalBytes })
    )
  )

  handle(Channels.proxiesList, [], () => s.proxies.list())
  handle(Channels.proxiesCreate, [proxyInput], (input) => s.proxies.create(input))
  handle(Channels.proxiesUpdate, [id, proxyPatch], (pid, patch) => s.proxies.update(pid, patch))
  handle(Channels.proxiesRemove, [id], (pid) => (s.proxies.remove(pid), null))
  handle(Channels.proxiesTest, [id], (pid) => s.proxies.test(pid))
  handle(Channels.proxiesTestDraft, [proxyInput], (input) => s.proxies.testDraft(input))
  handle(Channels.proxiesTestMany, [z.array(id).max(500)], (ids) => s.proxies.testMany(ids))
  handle(Channels.proxiesImport, [z.string().max(200_000), proxyType], (text, type) => s.proxies.import(text, type))
  handle(Channels.proxiesRefreshIp, [id], (pid) => s.proxies.refreshIp(pid))

  handle(Channels.geoStatus, [], () => s.geo.status())
  handle(Channels.geoInstall, [], () =>
    s.geo.install((downloadedBytes, totalBytes) =>
      s.window()?.webContents.send(Channels.evtGeoProgress, { downloadedBytes, totalBytes })
    )
  )

  handle(Channels.extensionsList, [], () => s.extensions.list())
  handle(Channels.extensionsAddFromStore, [z.string().trim().min(1).max(500)], (input) => s.extensions.addFromStore(input))
  handle(Channels.extensionsAddFromFile, [pickKind], async (kind) => {
    const path = await pickExtensionPath(s.window(), kind)
    return path ? s.extensions.addFromPath(path) : null
  })
  handle(Channels.extensionsUpdateFromFile, [extId, pickKind], async (eid, kind) => {
    const path = await pickExtensionPath(s.window(), kind)
    return path ? s.extensions.updateFromPath(eid, path) : null
  })
  handle(Channels.extensionsUpdate, [extId, extensionPatch], (eid, patch) => s.extensions.update(eid, patch))
  handle(Channels.extensionsRemove, [extId], (eid) => (s.extensions.remove(eid), null))
  handle(Channels.extensionsCheckUpdates, [], () => s.extensions.checkUpdates())
  handle(Channels.extensionsUpdateFromStore, [extId], (eid) => s.extensions.updateFromStore(eid))

  s.launcher.on('status', (e) => s.window()?.webContents.send(Channels.evtProfileStatus, e))
}
