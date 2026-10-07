# ISOLA — Đặc tả build cho AI

Mã: ISOLA-BUILD-SPEC-003  
Ngày: 2026-10-06  
Đọc giả: AI codegen và kỹ sư triển khai  
Mục tiêu: app desktop quản lý nhiều profile trình duyệt cô lập, local-first.

AI chỉ được implement phase đang mở. Không thêm tính năng ngoài file này.

## 0. Quyết định đã chốt

Không hỏi lại các lựa chọn sau.

- UI: Electron 32 + React 18 + TypeScript + Vite.
- Core: process main của Electron. Không tách microservice ở v1.
- DB: SQLite qua `better-sqlite3`, WAL, migration đánh số trong `src/main/db/migrations`.
- Secret: Electron `safeStorage`. Không lưu password plaintext trong SQLite.
- Engine v1: Chromium/Chrome cài trên máy, spawn bằng `child_process`. Mỗi profile một `user-data-dir`.
- Fingerprint v1: compat mode. Ghi `seed.json`, áp bằng file extension nội bộ đóng gói sẵn trong app. UI bắt buộc hiện nhãn `compat`. Không ghi "không thể bị phát hiện".
- API nội bộ: `http://127.0.0.1` cổng ngẫu nhiên, token Bearer. Không bind `0.0.0.0`.
- Ngôn ngữ UI: tiếng Việt.
- OS mục tiêu: Windows 10/11 và macOS 12+. Linux không chặn nhưng không phải tiêu chí nhận.

Cắt khỏi v1: RPA, synchronizer, AI agent, Firefox, giả iOS, billing, marketplace, cloud sync user-data, random fingerprint mỗi lần mở.

## 1. Tiêu chí sản phẩm

Một profile là một process trình duyệt. Hai profile không dùng chung process, thư mục, cookie, localStorage, IndexedDB, Cache Storage, DNS hay GPU thật của host.

Đạt khi:

1. Cookie set ở profile A không đọc được từ profile B.
2. Profile production không mở nếu proxy fail.
3. IP trang, DNS và WebRTC cùng egress proxy, không ra IP host.
4. Mở cùng profile 3 lần: userAgent, WebGL renderer, canvas hash, timezone không đổi.
5. Đổi độ phân giải host không đổi fingerprint đã lưu.
6. File SQLite và log không chứa password proxy hay password tài khoản.

## 2. Cây thư mục

```
isola/
  package.json
  electron.vite.config.ts
  src/main/
    index.ts
    db/migrations/001_init.sql
    db/index.ts
    ipc/channels.ts
    services/profileService.ts
    services/proxyService.ts
    services/launchService.ts
    services/secretService.ts
    services/fingerprintService.ts
    services/localApi.ts
    engine/seedSchema.ts
    engine/compat-extension/
  src/preload/index.ts
  src/renderer/
    App.tsx
    pages/ProfilesPage.tsx
    pages/ProxiesPage.tsx
    pages/ProfileEditor.tsx
  tests/
    isolation.test.ts
    seedStability.test.ts
```

IPC chỉ đi preload. Renderer không được `require('fs')` hay spawn browser.

## 3. Schema SQLite

Migration `001_init.sql`. Bật `PRAGMA journal_mode=WAL` và `foreign_keys=ON` khi mở DB.

```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE proxies (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http','https','socks5')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password_enc TEXT,
  last_check_ip TEXT,
  last_check_tz TEXT,
  last_check_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE fingerprints (
  id TEXT PRIMARY KEY,
  seed_json TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  serial INTEGER NOT NULL,
  name TEXT NOT NULL UNIQUE,
  group_id TEXT REFERENCES groups(id),
  platform_label TEXT,
  start_urls TEXT NOT NULL DEFAULT '[]',
  username TEXT,
  password_enc TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','archived')),
  kernel TEXT NOT NULL,
  fingerprint_id TEXT NOT NULL REFERENCES fingerprints(id),
  proxy_id TEXT REFERENCES proxies(id),
  lab INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE profile_tags (
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (profile_id, tag_id)
);

CREATE TABLE cookies_import (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  payload_enc TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  profile_id TEXT,
  detail TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

`serial` tăng trong transaction `SELECT COALESCE(MAX(serial),0)+1`. `password_enc` là chuỗi base64 do safeStorage mã hóa. Log không được ghi field này.

## 4. Seed fingerprint

File `src/main/engine/seedSchema.ts` export type dưới đây. Sinh một lần khi tạo profile. Cấm random lại khi mở.

```ts
type Seed = {
  version: 1;
  os: "windows" | "macos";
  chromeMajor: number;
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  timezone: string;
  screen: { width: number; height: number; dpr: number; colorDepth: 24 };
  hardware: { cores: number; memoryGb: number };
  webgl: { vendor: string; renderer: string };
  canvasNoise: number;
  audioNoise: number;
  fonts: string[];
  webrtc: "replace" | "disable";
  mediaDevices: { cameras: number; mics: number };
};
```

Catalog cứng trong `src/main/engine/catalog.ts`. Mỗi phần tử là một tổ hợp hợp lệ. Generator chọn ngẫu nhiên một phần tử lúc tạo, rồi giữ `catalog_id`.

Tối thiểu 8 tổ hợp:

- Windows 10, Chrome major pin, GPU ANGLE Intel UHD, 8 core, 16 GB, 1920x1080.
- Windows 11, Chrome major pin, GPU ANGLE NVIDIA GTX 1650, 8 core, 16 GB, 1536x864.
- macOS, Chrome major pin, GPU Apple M1, 8 core, 16 GB, 1440x900.
- Không có mục iOS, Android, hay core lớn hơn 16 trong v1.

`chromeMajor` phải bằng bản Chrome app sẽ spawn. Nếu không khớp, từ chối launch và báo lỗi "kernel lệch catalog".

`canvasNoise` và `audioNoise` là số nguyên 1..9999, lưu trong seed. Extension compat dùng số này làm seed nhiễu, không dùng `Math.random()` trần.

Timezone và language không lấy từ catalog lúc mở. Lúc launch, nếu profile không phải lab, ghi đè `timezone` và `language` từ `proxies.last_check_tz` và quốc gia của IP. Không có `last_check_tz` thì không mở.

## 5. Compat extension

Thư mục `src/main/engine/compat-extension` là Chrome extension Manifest V3, load bằng `--load-extension` chỉ cho profile Isola.

Việc được phép:

- Đọc `seed.json` qua `chrome.runtime` native message hoặc file mà app copy vào thư mục extension của profile trước khi spawn. Cách bắt buộc: app copy `seed.json` vào `{userData}/isola-seed.json` và extension đọc bằng `chrome.runtime.getURL` không dùng được cho file ngoài. Vì vậy app nhúng seed vào `isola-config.js` trong bản copy extension riêng của profile, rồi load bản copy đó. Không sửa bản extension gốc trong app.
- Ghi `navigator.userAgent`, `language`, `hardwareConcurrency`, `deviceMemory`, WebGL vendor/renderer, canvas noise ổn định, timezone qua override có kiểm soát.

Việc cấm:

- Tải script từ mạng.
- Đọc font, GPU, mic thật rồi trộn vào seed.
- Đổi noise mỗi lần tải trang.

UI editor hiện dòng cố định: "Chế độ compat. Fingerprint áp bằng extension nội bộ, chưa phải kernel vá."

## 6. Launch

`launchService.start(profileId)`:

1. Đọc profile. Nếu `status=running` và PID còn sống, trả lỗi `ALREADY_RUNNING`.
2. Nếu `lab=0` và không có proxy, trả `PROXY_REQUIRED`.
3. Nếu proxy check cũ hơn 6 giờ, test lại. Fail thì `PROXY_DOWN`, không spawn.
4. Tạo `{dataRoot}/profiles/{id}/user-data` nếu chưa có.
5. Ghi bản copy extension kèm seed đã khóa timezone.
6. Spawn Chrome:

```
chrome
  --user-data-dir={dataRoot}/profiles/{id}/user-data
  --proxy-server={scheme}://{host}:{port}
  --lang={seed.language}
  --window-size={seed.screen.width},{seed.screen.height}
  --disable-features=WebRtcHideLocalIpsWithMdns
  --load-extension={profileExtensionDir}
  --no-first-run
  --no-default-browser-check
  {startUrls}
```

Proxy có auth: dùng extension proxy auth nội bộ, không đưa password lên command line. Host proxy đi qua `--proxy-server`. Username/password cấp khi Chrome bắn sự kiện auth, từ secret store trong bộ nhớ.

7. Ghi PID vào bộ nhớ, set `status=running`, audit `open`.
8. Khi process exit: set `idle`, audit `close`.

`stop` gửi đóng process. Windows dùng `taskkill` cây process. macOS dùng `process.kill`. Sau 5 giây chưa chết thì kill cưỡng bức.

Cấm dùng chung `user-data-dir` của Chrome người dùng.

## 7. Proxy

`proxyService.test(id)` mở kết nối qua proxy tới `https://api.ipify.org` và một endpoint timezone công khai. Lưu `last_check_ip`, `last_check_tz`, `last_check_at`. Timeout 15 giây.

Import text: mỗi dòng một proxy, dạng `host:port:user:pass` hoặc `scheme://user:pass@host:port`. Tối đa 500 dòng. Dòng lỗi bỏ qua và trả danh sách lỗi, không fail cả lô.

WebRTC: seed mặc định `replace`. Extension chặn candidate local và chỉ để egress. Mode `disable` chặn API WebRTC. Không có mode `real` nếu `lab=0`.

## 8. IPC

Preload expose `window.isola`. Mọi hàm trả `{ ok: true, data } | { ok: false, error: string }`.

- `profiles.list(filter)`
- `profiles.create(input)` sinh seed từ catalog
- `profiles.update(id, patch)` không cho sửa seed ngầm
- `profiles.rotateSeed(id)` tạo seed mới, audit `seed_rotate`
- `profiles.archive(id)` set `deleted_at`, không xóa thư mục
- `profiles.purge(id)` chỉ khi archived quá 7 ngày hoặc user xác nhận, xóa user-data
- `profiles.start(id)` / `profiles.stop(id)`
- `proxies.list|create|update|remove|test|import`
- `groups.list|create|rename|remove`
- `secrets` không có hàm đọc password ra renderer. Renderer chỉ gửi password lúc lưu.

## 9. Local API

Bật trong Settings. Sinh token 32 byte, hiện một lần. Lưu hash SHA-256.

Chỉ `127.0.0.1`.

- `GET /profiles`
- `POST /profiles/:id/start`
- `POST /profiles/:id/stop`
- `GET /profiles/:id/cookies` đọc từ user-data của đúng profile
- `PUT /profiles/:id/cookies` ghi cookie import

Cookie endpoint tối đa 2 request/giây. Sai token trả 401. Không có route nào khác.

## 10. UI

Ba màn.

Profiles: bảng serial, tên, group, proxy host, kernel, trạng thái, nút Mở/Đóng. Lọc theo group và tag. Nút Tạo.

Editor profile: tên, group, tag, start URL, username, password, proxy, ghi chú, checkbox lab. Khối seed chỉ đọc: OS, Chrome, màn hình, GPU. Nút "Tạo seed mới" có confirm. Dòng nhãn compat.

Proxies: bảng, nút test, ô import nhiều dòng.

Không có menu RPA, giá, cửa hàng extension, synchronizer.

## 11. Log và audit

Log file tại `{dataRoot}/logs/app.log`. Redact mọi trường tên chứa password, cookie, token, proxy auth.

Audit action cho phép: `create`, `open`, `close`, `proxy_change`, `seed_rotate`, `cookie_export`, `archive`, `purge`.

## 12. Phase và định nghĩa xong

AI làm đúng thứ tự. Mỗi phase một thay đổi có test.

Phase 0 — Nền  
App Electron mở cửa sổ, tạo dataRoot, chạy migration, màn hình trống. Kill process giữa chừng không hỏng DB.

Phase 1 — Profile  
CRUD profile và group. Spawn hai Chrome với hai user-data-dir. Test: cookie A không có ở B. Chưa cần proxy.

Phase 2 — Proxy  
CRUD, test, chặn start nếu proxy fail và `lab=0`. Chưa cần đẹp.

Phase 3 — Seed  
Sinh seed, copy extension, áp UA và timezone. Test: 3 lần start, UA và timezone trong seed không đổi.

Phase 4 — Catalog  
Chặn tổ hợp ngoài catalog. `rotateSeed` ghi audit.

Phase 5 — Secret  
Password proxy và account qua safeStorage. Dump DB không thấy plaintext.

Phase 6 — Local API  
Start/stop và cookie trên localhost với token.

## 13. Test bắt buộc

`tests/isolation.test.ts` tạo hai profile, mở, set cookie qua CDP hoặc file Cookies của Chromium, assert profile kia không có cookie đó.

`tests/seedStability.test.ts` tạo profile, đọc seed, start/stop 3 lần, assert file seed không đổi.

Test proxy dùng proxy giả local. Không phụ thuộc mạng ngoài trong unit test. Test egress thật là checklist tay.

## 14. Checklist tay trước khi nhận

- Mở A và B cùng lúc. Đăng nhập site test ở A. B không đăng nhập.
- Proxy bật: trang kiểm tra IP không ra IP máy. WebRTC không ra IP máy.
- Rút proxy: profile production không mở.
- Đổi độ phân giải màn hình máy: seed profile không đổi.
- Mở file sqlite: không thấy password.

## 15. Cấm

- Không dùng một Chrome profile chung rồi chỉ đổi cookie.
- Không random canvas mỗi request.
- Không sửa UA mà giữ nguyên Client Hints lệch major.
- Không đưa password lên argv hoặc log.
- Không bind API ra LAN.
- Không thêm phase 7 trong cùng lượt build với phase 1.
