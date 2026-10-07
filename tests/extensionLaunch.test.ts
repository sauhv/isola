import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
import { buildCrx3, makeZip, newKey, sampleExtension } from './helpers/crxBuilder'
import { fakeGeo, testSecretBox } from './helpers/fakeNet'

const KERNEL_CACHE = join(__dirname, '.cache', 'kernels')

let dataRoot: string
let db: Db
let profiles: ProfileService
let extensions: ExtensionService
let launcher: LaunchService

/** Đợi service worker của extension xuất hiện trong profile, trả targetId hoặc null. */
async function findWorker(profileId: string, extId: string, timeoutMs = 6000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { targetInfos } = await launcher.cdp(profileId).send('Target.getTargets')
    const t = targetInfos.find((x: any) => x.type === 'service_worker' && x.url.startsWith(`chrome-extension://${extId}/`))
    if (t) return t.targetId
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

async function evalInWorker(profileId: string, targetId: string, expression: string): Promise<any> {
  const cdp = launcher.cdp(profileId)
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId
  )
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails))
  await cdp.send('Target.detachFromTarget', { sessionId })
  return result.value
}

beforeAll(async () => {
  dataRoot = mkdtempSync(join(tmpdir(), 'isola-el-'))
  db = openDatabase(join(dataRoot, 'isola.db'))
  const kernels = new KernelService(KERNEL_CACHE)
  await kernels.install(DEFAULT_KERNEL_ID)
  profiles = new ProfileService(db, dataRoot)
  extensions = new ExtensionService(db, join(dataRoot, 'extensions'), { prodVersion: '155.0.8059.39' })
  const proxies = new ProxyService(db, testSecretBox(), fakeGeo)
  launcher = new LaunchService({ db, dataRoot, profiles, kernels, proxies, extensions }, { extraArgs: ['--headless=new'] })
}, 600_000)

afterAll(async () => {
  await launcher?.stopAll()
  db?.close()
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('extension trong Chrome', () => {
  it('chỉ profile được gán mới có extension; dữ liệu extension còn sau khi cập nhật phiên bản', async () => {
    const key = newKey()
    const crx1 = join(dataRoot, 'v1.crx')
    writeFileSync(crx1, buildCrx3(makeZip(sampleExtension('1.0')), key))
    const ext = extensions.addFromPath(crx1)
    expect(ext.id).toBe(key.id)

    const a = profiles.create({ name: 'A', lab: true })
    const b = profiles.create({ name: 'B', lab: true })
    extensions.update(ext.id, { scope: 'profiles', profileIds: [a.id] })

    await launcher.start(a.id)
    await launcher.start(b.id)
    const worker = await findWorker(a.id, ext.id)
    expect(worker, 'service worker của extension phải chạy trong A, đúng ID Web Store').not.toBeNull()
    expect(await findWorker(b.id, ext.id, 1500)).toBeNull()

    await evalInWorker(a.id, worker!, `chrome.storage.local.set({ wallet: 'giữ-nguyên' })`)
    await launcher.stopAll()

    // Cập nhật lên 2.0 bằng CRX cùng khóa.
    const crx2 = join(dataRoot, 'v2.crx')
    writeFileSync(crx2, buildCrx3(makeZip(sampleExtension('2.0')), key))
    expect(extensions.updateFromPath(ext.id, crx2).version).toBe('2.0')

    await launcher.start(a.id)
    const worker2 = await findWorker(a.id, ext.id)
    expect(worker2).not.toBeNull()
    expect(await evalInWorker(a.id, worker2!, 'chrome.runtime.getManifest().version')).toBe('2.0')
    expect(await evalInWorker(a.id, worker2!, `chrome.storage.local.get('wallet').then((r) => r.wallet)`)).toBe('giữ-nguyên')
    await launcher.stop(a.id)
  }, 120_000)
})
