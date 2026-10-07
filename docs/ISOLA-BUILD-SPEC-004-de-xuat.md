# ISOLA — Đề xuất kiến trúc v1 (bổ sung SPEC-003)

Mã: ISOLA-BUILD-SPEC-004
Ngày: 2026-10-07
Trạng thái: đã chốt engine = Chrome for Testing + CDP + proxy relay cục bộ. Các mục đánh dấu **[Cần chốt]** chờ chủ dự án quyết.

Văn bản này ghi đè SPEC-003 ở những chỗ mâu thuẫn. Chỗ nào không nhắc thì giữ nguyên SPEC-003.

Tham chiếu sản phẩm: AdsPower (quản lý profile, nhóm/tag, proxy, fingerprint theo kernel, Local API, nhập/xuất hàng loạt). Isola học phần lõi, **không** sao chép RPA, synchronizer, team cloud, marketplace ở v1.

---

## 1. Quyết định đã đổi so với SPEC-003

| Mục | SPEC-003 | SPEC-004 | Lý do |
|---|---|---|---|
| UI | React 18 + Vite | **Next.js 16 (static export) + React 19** | Yêu cầu chủ dự án. Electron phục vụ qua `app://isola/`, không chạy server Next. |
| Engine | Chrome cài trên máy | **Chrome for Testing (CfT) ghim phiên bản**, tải về `{dataRoot}/kernels/` | Chrome chính thức (≥137) bỏ `--load-extension`; Chrome máy tự cập nhật làm lệch `chromeMajor`. |
| Áp fingerprint | Extension MV3 + `isola-config.js` | **CDP qua `--remote-debugging-pipe`**. Không extension ở v1. | CDP áp được timezone, locale, UA + Client Hints đồng bộ, trước khi script trang chạy, cho cả iframe/worker. |
| Proxy auth | Extension `onAuthRequired` | **Relay cục bộ** 127.0.0.1 mỗi profile | Chrome không hỗ trợ SOCKS5 có auth; password không bao giờ ra đĩa hay argv. |
| WebRTC | `--disable-features=WebRtcHideLocalIpsWithMdns` | **`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`** | Cờ cũ làm *lộ* IP LAN. |
| Timezone theo IP | "endpoint timezone công khai" | **GeoIP offline (DB-IP Lite .mmdb, CC BY 4.0)** đóng gói kèm app | Không phụ thuộc bên thứ ba, test được offline. Chỉ bước lấy IP ra là cần mạng. |
| Cookie Local API / test | Đọc file `Cookies` | **CDP `Storage.getCookies` / `Storage.setCookies`** | File Cookies mã hóa (DPAPI/Keychain). |
| Tiến trình | Tất cả trong main | Main + **`utilityProcess` "engine"** (relay + CDP controller) | Relay chuyển dữ liệu nhiều; tách khỏi main để UI không giật. Vẫn là 1 app, không microservice. |
| Electron | 32 | **[Đã chốt]** bản Electron ổn định mới nhất, nâng ở Phase 1 | 32 đã hết hạn vá bảo mật. |

---

## 2. Engine: Chrome for Testing

- Tải bằng `@puppeteer/browsers` từ endpoint chính thức của CfT, kiểm tra hash, giải nén vào `{dataRoot}/kernels/cft-{fullVersion}/`.
- `profiles.kernel` = `cft-{major}`. Lúc launch chọn bản CfT có major = `seed.chromeMajor`. Không có → lỗi `KERNEL_MISSING` kèm nút "Tải kernel".
- Màn "Kernel" (nhỏ, giống mục kernel của AdsPower): danh sách bản đã tải, dung lượng, tải/xóa. Giữ tối đa 2 major gần nhất. Không xóa kernel đang có profile dùng.
- Catalog chỉ chứa major mà Isola hỗ trợ. Khi nâng kernel: profile cũ giữ major cũ cho đến khi người dùng bấm "Nâng kernel" (đổi `chromeMajor` + UA trong seed, audit `seed_rotate`).
- Giới hạn đã biết của CfT, phải ghi trong UI: không tự cập nhật, không Widevine (site DRM như Netflix không phát), không đăng nhập Google Sync.
- **Phải kiểm ở Phase 3:** brand trong `navigator.userAgentData.brands` của CfT. Nếu khác Chrome thường thì override qua `Emulation.setUserAgentOverride.userAgentMetadata` cho khớp catalog.

## 3. Launch controller (CDP)

Spawn:

```
{cft}/chrome.exe
  --user-data-dir={dataRoot}/profiles/{id}/user-data
  --remote-debugging-pipe                      # không mở cổng TCP: trang web không dò được
  --proxy-server=http://127.0.0.1:{relayPort}
  --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"   # cấm DNS trực tiếp
  --force-webrtc-ip-handling-policy=disable_non_proxied_udp
  --disable-quic
  --lang={effective.language}
  --window-size={seed.screen.width},{seed.screen.height}
  --no-first-run --no-default-browser-check
  --disable-background-networking --disable-component-update
  --disk-cache-size=268435456
  about:blank
```

Trình tự sau spawn (qua pipe fd 3/4):

1. `Target.setAutoAttach { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }` ở cấp browser, để mọi tab, popup, iframe OOPIF, worker đều dừng chờ.
2. Với mỗi target mới, trước khi `Runtime.runIfWaitingForDebugger`:
   - `Emulation.setUserAgentOverride` (UA + `userAgentMetadata` đủ `brands`, `fullVersionList`, `platform`, `platformVersion`, `architecture`, `bitness`). UA và Client Hints luôn cùng một nguồn.
   - `Emulation.setTimezoneOverride`, `Emulation.setLocaleOverride`.
   - `Emulation.setHardwareConcurrencyOverride`.
   - `Page.addScriptToEvaluateOnNewDocument` cho phần CDP không có: `deviceMemory`, `screen.*`, WebGL vendor/renderer, canvas/audio noise, `mediaDevices`, WebRTC replace.
3. Sau khi gắn xong mới mở `startUrls`.

Quy tắc:
- **Không gọi `Runtime.enable`** trên target trang. Đây là dấu hiệu tự động hóa phổ biến.
- Script tiêm phải tự che dấu: hàm override giữ `toString()` như hàm gốc, không để lộ biến global.
- Pipe đứt (Isola tắt) → Chrome của profile đóng theo. Đây là hành vi mong muốn: không có profile "mồ côi" chạy mà không có kill-switch proxy.
- `stop`: `Browser.close` qua CDP → 5 giây → `taskkill /T /F` (Windows) / `SIGKILL` (macOS).
- Khởi động app: mọi profile `status=running` reset về `idle` (process cũ đã chết cùng pipe).

## 4. Proxy relay

- Dùng thư viện `proxy-chain`: mỗi profile đang chạy có một listener `127.0.0.1:{port ngẫu nhiên}`, Chrome nói HTTP CONNECT với relay, relay nối upstream `http`/`https`/`socks5` có auth.
- Password chỉ giải mã (safeStorage) trong bộ nhớ engine process lúc mở relay. Không argv, không file, không log.
- **Kill-switch:** upstream lỗi thì relay trả 502, không bao giờ đi thẳng. Thêm `--host-resolver-rules` để Chrome không tự phân giải DNS.
- SOCKS5: phân giải tên ở phía proxy (kiểu `socks5h`), không phân giải cục bộ.
- `proxyService.test(id)` đi **qua chính relay** (cùng đường với trình duyệt):
  1. Lấy IP ra: `api.ipify.org`, dự phòng `icanhazip.com`. Timeout 15 giây.
  2. Tra GeoIP offline → country, timezone.
  3. Lưu `last_check_ip`, `last_check_tz`, `last_check_at`, thêm cột `last_check_country` (migration 002).
- Mở profile: so IP ra với lần trước. Đổi quốc gia → cảnh báo "IP đổi quốc gia, timezone sẽ đổi theo".
- Bảng quốc gia → ngôn ngữ (`VN→vi-VN`, `US→en-US`, …) cứng trong `src/main/engine/geoLocale.ts`. `languages` = `[lang, base, "en-US", "en"]` loại trùng.
- Import: giữ định dạng SPEC-003, thêm `socks5://user:pass@host:port` và `host:port` (không auth). Kiểm trùng `host:port:user`.

## 5. Seed và cấu hình hiệu lực

- `seed_json` trong DB là **bất biến** sau khi tạo. Chỉ `rotateSeed` hay "Nâng kernel" mới thay.
- Mỗi lần launch tính `effective = f(seed, proxyGeo, lab)`:
  - lab=0: `timezone`, `language`, `languages` lấy từ proxy.
  - lab=1: giữ của seed.
- `effective` ghi vào `{dataRoot}/profiles/{id}/last-launch.json` để chẩn đoán. Test `seedStability` so `seed_json`, không so file này.

### Tính nhất quán (điểm mạnh cốt lõi của AdsPower)

- Catalog là tổ hợp thiết bị **có thật**: OS ↔ platform ↔ UA-CH `platformVersion` ↔ GPU ↔ màn hình ↔ font, đi cùng nhau.
- `screen.availHeight` = height − thanh tác vụ (Windows 40/48px, macOS 25px menu bar). Không để `availHeight == height`.
- Noise canvas/audio: PRNG xác định (mulberry32), khóa = `canvasNoise` ⊕ hash nội dung vẽ. Cùng nội dung → cùng hash qua mọi lần tải. Hai profile → khác nhau.
- **[Đã chốt 2026-10-07] Lọc catalog theo OS máy chủ:** máy Windows chỉ cho chọn tổ hợp Windows; máy Mac chỉ tổ hợp macOS. Lý do: JS không che được khác biệt render font/emoji/TextMetrics giữa hai OS. Giả OS chéo dễ bị phát hiện hơn là không giả. Cho phép chéo OS chỉ khi `lab=1`.
- **[Đã chốt 2026-10-07] Lọc catalog theo hãng GPU máy chủ** (Intel/NVIDIA/AMD/Apple): chỉ đọc tên hãng để *lọc* catalog, không trộn giá trị thật vào seed. Lý do: tham số WebGL (max texture, extension list) và hiệu năng lộ GPU thật. SPEC-003 cấm "đọc GPU thật", nên đây là ngoại lệ cần chủ dự án duyệt.

### Trang tự kiểm (thay "check fingerprint" của AdsPower)

- Trang nội bộ `isola-check` (HTML tĩnh phục vụ qua relay ở host đặc biệt `check.isola.local`, relay trả nội dung, không ra mạng).
- Hiện những gì trình duyệt báo: UA, UA-CH, timezone, ngôn ngữ, WebGL, canvas hash, ICE candidate WebRTC, IP ra. So với `effective`, đánh dấu đỏ chỗ lệch.
- Chạy tự động lần đầu mở mỗi profile. Nút "Mở trang kiểm tra ngoài" (browserleaks, pixelscan…) mở tay, không tự động.

## 6. Hiệu năng và quy mô (hàng nghìn profile)

- Bảng profile dùng TanStack Table + ảo hóa hàng. Lọc/sắp xếp ở SQLite (index `group_id`, `status`, `deleted_at`, `serial`).
- Thư mục `user-data` chỉ tạo ở lần mở đầu tiên.
- Giới hạn số profile chạy đồng thời (Settings, mặc định 10). Vượt thì xếp hàng.
- Hiện dung lượng mỗi profile. Tùy chọn "Xóa cache khi đóng" (xóa `Cache`, `Code Cache`, `GPUCache`, giữ cookie và storage).
- Trạng thái chạy/dừng đẩy từ main xuống renderer bằng event IPC, không poll.

## 7. Bảo mật

- Local API:
  - Kiểm `Host` header ∈ {`127.0.0.1:{port}`, `localhost:{port}`} để chống DNS rebinding.
  - Từ chối request có header `Origin`, để trang web trong profile không gọi API được.
  - Token so bằng `timingSafeEqual` trên hash.
- IPC: mọi input validate bằng `zod` ở main.
- Renderer: sandbox, contextIsolation, CSP, chặn `will-navigate` và `window.open` (đã làm ở Phase 0).
- safeStorage trên Windows là DPAPI theo user, nên chép DB sang máy khác thì không giải mã được. Xuất profile sang máy khác phải dùng passphrase (xem §8).
- Log: redact theo tên trường (`password`, `pass`, `cookie`, `token`, `authorization`, `proxy-authorization`) và theo mẫu URL `scheme://user:pass@`.
- Phát hành: ký mã Windows (Authenticode) và notarize macOS, nếu không SmartScreen/Gatekeeper sẽ chặn.

## 8. Ưu tiên v1 (chốt 2026-10-07): Profile, Proxy, Extension

Chủ dự án chốt: v1 tập trung làm thật mạnh ba mảng **Profile**, **Proxy**, **Extension**. Các mục sau **hoãn**, không làm ở v1:

- AI Agent, Synchronizer, RPA, RPA Plus.
- API & MCP (Local API của SPEC-003 §9 chuyển sang sau v1). Thiết kế bảo mật ở §7 giữ lại cho lúc làm.
- Billing, Team/phân quyền, cloud sync, Firefox, mobile.

### 8.1 Profile

- Đã có (Phase 1): CRUD, nhóm, tag, ghi chú, serial, lưu trữ/khôi phục/xóa vĩnh viễn, mở/đóng, trạng thái realtime.
- Thêm:
  - Chọn nhiều → mở, đóng, đổi nhóm, đổi proxy, gán/bỏ extension, lưu trữ hàng loạt.
  - Tạo hàng loạt: N profile, đặt tên theo mẫu (`Shop {n}`), ghép proxy 1:1 hoặc xoay vòng từ danh sách.
  - Nhập từ CSV/XLSX (tên, nhóm, tag, proxy, URL, ghi chú, cookie).
  - Nhân bản profile (seed mới, không chép cookie).
  - Nhập cookie JSON (định dạng EditThisCookie / Netscape) qua CDP `Storage.setCookies`; xuất cookie (audit `cookie_export`).
  - Xuất/nhập `.isola` (user-data trừ cache + cấu hình, mã hóa passphrase) để chuyển máy.
  - Sắp xếp cửa sổ dạng lưới cho các profile đang chạy.
  - Giới hạn số profile chạy đồng thời, xóa cache khi đóng, hiện dung lượng.
  - Fingerprint theo catalog, nhất quán (§5).

### 8.2 Proxy

- Loại: `http`, `https`, `socks5`, có/không auth. Relay cục bộ + kill-switch (§4).
- Kiểm tra: IP ra, quốc gia, thành phố, timezone (GeoIP offline), độ trễ. Kiểm hàng loạt song song tối đa 10.
- Import hàng loạt nhiều định dạng (`host:port`, `host:port:user:pass`, `user:pass@host:port`, `scheme://user:pass@host:port`), tối đa 500 dòng, dòng lỗi trả về danh sách lỗi.
- **Proxy xoay (rotating/mobile):** trường `refresh_url` tùy chọn. Nút "Đổi IP" gọi URL này rồi kiểm tra lại. Cảnh báo nếu IP đổi quốc gia.
- Gán: một proxy cho nhiều profile được phép nhưng UI cảnh báo "dùng chung IP".
- Bảng proxy: nhãn, loại, host:port, IP ra, quốc gia, độ trễ, lần kiểm cuối, số profile đang dùng.
- Password proxy mã hóa bằng safeStorage **ngay từ Phase 2** (không chờ Phase "Secret").

### 8.3 Extension

Mục tiêu tương đương "Extension center" của AdsPower, chạy local.

- **Thêm extension:**
  - Từ Chrome Web Store: dán URL hoặc ID → tải CRX từ endpoint cập nhật chính thức của Google, giải nén.
  - Từ file `.crx`, `.zip`, hoặc thư mục đã giải nén.
- **Lưu trữ:** `{dataRoot}/extensions/{extId}/{version}/`. Bản gốc chỉ đọc, dùng chung cho mọi profile.
- **Giữ nguyên ID:** khi giải nén CRX, chép public key từ header CRX vào `manifest.json` → `key`, để extension có đúng ID như trên Web Store. Nhờ vậy dữ liệu extension (ví, đăng nhập) trong user-data của profile không mất khi cập nhật phiên bản.
- **Phạm vi áp dụng:** mỗi extension gán cho *tất cả profile*, *một số nhóm*, hoặc *một số profile*. Bật/tắt toàn cục.
- **Nạp:** lúc launch tính danh sách extension hiệu lực của profile → `--load-extension=dir1,dir2,...` (CfT còn hỗ trợ cờ này; Chrome chính thức thì không). Extension không được gán thì không nạp, dữ liệu của nó vẫn nằm trong user-data.
- **Cập nhật:** nút "Kiểm tra cập nhật" so phiên bản Web Store; cập nhật = tải bản mới vào thư mục version mới, đổi con trỏ. Profile đang chạy dùng bản mới từ lần mở sau.
- **Kiểm tra lúc thêm:** chỉ nhận Manifest V3 (Chrome ≥138 bỏ MV2). Hiện tên, icon, phiên bản, quyền (`permissions`, `host_permissions`) để người dùng thấy trước khi gán.
- **Lưu ý cho người dùng:** extension có thể bị trang web phát hiện (qua `web_accessible_resources`) và làm khác dấu vết giữa các profile. UI ghi rõ điều này.

## 9. Kế hoạch phase cập nhật

| Phase | Nội dung | Test tự động |
|---|---|---|
| 0 ✅ | Electron + Next shell, dataRoot, migration WAL | DB, kill giữa chừng |
| 1 ✅ | CRUD profile/nhóm/tag, kernel CfT, launch qua CDP pipe, UI Profile + Kernel | cookie A không có ở B; CRUD |
| 2 ✅ | Proxy: CRUD, import, relay, kill-switch, GeoIP, safeStorage cho password, chặn mở khi proxy lỗi, gán proxy cho profile, refresh_url | proxy giả local (http + socks5, có auth); upstream chết → không đi thẳng; DB không có plaintext |
| 3 ✅ | Extension center: thêm từ Web Store/file, giữ ID, phạm vi gán, nạp lúc launch, cập nhật | CRX → đúng ID; profile A có extension, B không; dữ liệu extension giữ sau cập nhật |
| 4 | Fingerprint: seed + catalog + CDP override + trang tự kiểm, rotateSeed, nâng kernel | `seedStability`; UA/UA-CH/timezone khớp `effective` |
| 5 | Profile nâng cao: thao tác hàng loạt, tạo hàng loạt, CSV/XLSX, nhân bản, cookie import/export, `.isola`, sắp cửa sổ | theo từng mục |
| sau v1 | Local API & MCP, RPA, Synchronizer, AI Agent, Team, Billing | — |

Phụ thuộc thêm: `proxy-chain`, `maxmind` + DB-IP Lite (.mmdb), `adm-zip` hoặc `yauzl` (giải nén CRX/zip), `@tanstack/react-table`, `@tanstack/react-virtual`.
