import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { DEFAULT_KERNEL_ID } from '../src/main/engine/kernels'
import { ExtensionService } from '../src/main/services/extensionService'
import { KernelService } from '../src/main/services/kernelService'
import { LaunchService } from '../src/main/services/launchService'
import { ProfileService } from '../src/main/services/profileService'
import { ProxyService } from '../src/main/services/proxyService'
import { fakeGeo, testSecretBox } from './helpers/fakeNet'

// Kernel tải một lần vào tests/.cache (gitignore), các lần chạy sau dùng lại.
const KERNEL_CACHE = join(__dirname, '.cache', 'kernels')

let dataRoot: string
let db: Db
let profiles: ProfileService
let launcher: LaunchService

const COOKIE = {
  name: 'isola_probe',
  value: 'only-in-A',
  domain: 'isola.test',
  path: '/',
  expires: Math.floor(Date.now() / 1000) + 3600
}

async function cookieNames(id: string): Promise<string[]> {
  const { cookies } = await launcher.cdp(id).send<{ cookies: { name: string; domain: string }[] }>('Storage.getCookies')
  return cookies.filter((c) => c.domain === COOKIE.domain).map((c) => c.name)
}

beforeAll(async () => {
  dataRoot = mkdtempSync(join(tmpdir(), 'isola-iso-'))
  db = openDatabase(join(dataRoot, 'isola.db'))
  const kernels = new KernelService(KERNEL_CACHE)
  await kernels.install(DEFAULT_KERNEL_ID)
  profiles = new ProfileService(db, dataRoot)
  const proxies = new ProxyService(db, testSecretBox(), fakeGeo)
  const extensions = new ExtensionService(db, join(dataRoot, 'extensions'), { prodVersion: '155.0.8059.39' })
  launcher = new LaunchService({ db, dataRoot, profiles, kernels, proxies, extensions }, { extraArgs: ['--headless=new'] })
}, 600_000)

afterAll(async () => {
  await launcher?.stopAll()
  db?.close()
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('isolation', () => {
  it('cookie set ở profile A không có ở profile B, và A giữ cookie sau khi mở lại', async () => {
    const a = profiles.create({ name: 'A', lab: true })
    const b = profiles.create({ name: 'B', lab: true })

    await launcher.start(a.id)
    await launcher.start(b.id)
    expect(profiles.get(a.id).status).toBe('running')

    // Hai profile là hai process khác nhau.
    const pidA = (await launcher.cdp(a.id).send('SystemInfo.getProcessInfo')).processInfo
    const pidB = (await launcher.cdp(b.id).send('SystemInfo.getProcessInfo')).processInfo
    const browserPid = (list: { type: string; id: number }[]) => list.find((p) => p.type === 'browser')!.id
    expect(browserPid(pidA)).not.toBe(browserPid(pidB))

    await launcher.cdp(a.id).send('Storage.setCookies', { cookies: [COOKIE] })
    expect(await cookieNames(a.id)).toEqual([COOKIE.name])
    expect(await cookieNames(b.id)).toEqual([])

    // Mở lại A: cookie vẫn còn vì nằm trong user-data-dir riêng của A.
    await launcher.stop(a.id)
    expect(profiles.get(a.id).status).toBe('idle')
    await launcher.start(a.id)
    expect(await cookieNames(a.id)).toEqual([COOKIE.name])
    expect(await cookieNames(b.id)).toEqual([])

    await launcher.stopAll()
    const actions = db
      .prepare("SELECT action FROM audit_log WHERE profile_id = ? AND action IN ('open','close') ORDER BY at, rowid")
      .all(a.id)
      .map((r: any) => r.action)
    expect(actions).toEqual(['open', 'close', 'open', 'close'])
  }, 120_000)

  it('mở profile đang chạy trả ALREADY_RUNNING', async () => {
    const c = profiles.create({ name: 'C', lab: true })
    await launcher.start(c.id)
    await expect(launcher.start(c.id)).rejects.toMatchObject({ code: 'ALREADY_RUNNING' })
    await launcher.stop(c.id)
  }, 60_000)
})
