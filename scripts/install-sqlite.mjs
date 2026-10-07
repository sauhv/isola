// Tải bản better-sqlite3 build sẵn cho đúng ABI của Electron đã cài,
// để máy dev không cần Python + Visual Studio Build Tools.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronVersion = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf8')).version
const sqliteDir = dirname(require.resolve('better-sqlite3/package.json'))
const prebuildInstall = join(dirname(require.resolve('prebuild-install/package.json')), 'bin.js')

console.log(`better-sqlite3: tải prebuilt cho Electron ${electronVersion} (${process.platform}-${process.arch})`)
execFileSync(
  process.execPath,
  [prebuildInstall, '--runtime=electron', `--target=${electronVersion}`, `--arch=${process.arch}`, '--verbose'],
  { cwd: sqliteDir, stdio: 'inherit' }
)
