import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase, setSetting, type Db } from '../src/main/db'
import { DEFAULT_KERNEL_ID, findSupportedKernel } from '../src/main/engine/kernels'
import { ExtensionService } from '../src/main/services/extensionService'
import { KernelService } from '../src/main/services/kernelService'
import { LaunchService } from '../src/main/services/launchService'
import { ProfileService } from '../src/main/services/profileService'
import { ProxyService } from '../src/main/services/proxyService'
import { fakeGeo, testSecretBox } from './helpers/fakeNet'

const KERNEL_CACHE = join(__dirname, '.cache', 'kernels')

let dataRoot: string
let db: Db
let profiles: ProfileService
let launcher: LaunchService

beforeAll(async () => {
  dataRoot = mkdtempSync(join(tmpdir(), 'isola-wl-'))
  db = openDatabase(join(dataRoot, 'isola.db'))
  const kernels = new KernelService(KERNEL_CACHE)
  await kernels.install(DEFAULT_KERNEL_ID)
  profiles = new ProfileService(db, dataRoot)
  const proxies = new ProxyService(db, testSecretBox(), fakeGeo)
  const extensions = new ExtensionService(db, join(dataRoot, 'extensions'), { prodVersion: findSupportedKernel(DEFAULT_KERNEL_ID)!.buildId })
  launcher = new LaunchService({ db, dataRoot, profiles, kernels, proxies, extensions }, { extraArgs: ['--headless=new'] })
}, 600_000)

afterAll(async () => {
  await launcher?.stopAll()
  db?.close()
  rmSync(dataRoot, { recursive: true, force: true })
})

async function pageTitle(profileId: string): Promise<string> {
  const cdp = (launcher as any).cdp(profileId)
  const { targetInfos } = await cdp.send('Target.getTargets')
  const page = targetInfos.find((t: any) => t.type === 'page')
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
  // đợi tiêu đề ổn định (MutationObserver áp prefix async sau khi <title> parse)
  let last = ''
  for (let i = 0; i < 30; i++) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }, sessionId)
    last = (result.value as string) || last
    if (last.startsWith('[#')) break
    await new Promise((r) => setTimeout(r, 200))
  }
  await cdp.send('Target.detachFromTarget', { sessionId })
  return last
}

describe('gắn tên profile vào tiêu đề cửa sổ', () => {
  it('bật labelWindows → document.title có tiền tố [tên profile]', async () => {
    setSetting(db, 'labelWindows', '1')
    const p = profiles.create({ name: 'Acc WL', lab: true })
    await launcher.start(p.id)
    const title = await pageTitle(p.id)
    expect(title.startsWith(`[#${p.serial} Acc WL] `)).toBe(true)
    await launcher.stop(p.id)
  }, 120_000)

  it('tắt labelWindows → không có tiền tố', async () => {
    setSetting(db, 'labelWindows', '0')
    const p = profiles.create({ name: 'Acc Plain', lab: true })
    await launcher.start(p.id)
    const title = await pageTitle(p.id)
    expect(title.includes('[#')).toBe(false)
    await launcher.stop(p.id)
  }, 120_000)
})
