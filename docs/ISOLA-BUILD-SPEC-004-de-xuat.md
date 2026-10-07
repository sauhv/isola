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
| Electron | 32 | **[Cần chốt]** lên bản Electron đang được hỗ trợ | 32 đã hết hạn vá bảo mật. Nâng sau Phase 1, trước khi phát hành. |

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
- **[Cần chốt] Lọc catalog theo OS máy chủ:** máy Windows chỉ cho chọn tổ hợp Windows; máy Mac chỉ tổ hợp macOS. Lý do: JS không che được khác biệt render font/emoji/TextMetrics giữa hai OS. Giả OS chéo dễ bị phát hiện hơn là không giả. Cho phép chéo OS chỉ khi `lab=1`.
- **[Cần chốt] Lọc catalog theo hãng GPU máy chủ** (Intel/NVIDIA/AMD/Apple): chỉ đọc tên hãng để *lọc* catalog, không trộn giá trị thật vào seed. Lý do: tham số WebGL (max texture, extension list) và hiệu năng lộ GPU thật. SPEC-003 cấm "đọc GPU thật", nên đây là ngoại lệ cần chủ dự án duyệt.

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

## 8. Tính năng từ AdsPower nên đưa vào

v1 (trong các phase hiện có):
- Nhóm, tag, ghi chú, serial. Lọc theo nhóm/tag/trạng thái/proxy. Chọn nhiều → mở/đóng/đổi nhóm/đổi proxy hàng loạt.
- Import proxy hàng loạt, test hàng loạt (song song tối đa 10).

v1.1 (Phase 7+, **không** làm chung lượt với Phase 1):
- Tạo profile hàng loạt: N profile, ghép proxy 1:1 từ danh sách, nhập từ CSV/XLSX.
- Xuất/nhập profile `.isola` (zip user-data trừ cache + seed + cấu hình, mã hóa bằng passphrase). Dùng để chuyển máy hoặc sao lưu.
- Nhập cookie JSON (định dạng EditThisCookie) lúc tạo profile.
- Sắp xếp cửa sổ (lưới) cho các profile đang chạy.
- Thùng rác: archive → khôi phục trong 7 ngày → purge.

v2 (đã cắt ở v1, giữ nguyên): RPA, synchronizer, team/phân quyền, cloud sync, extension center, Firefox, mobile.

Không sao chép: quảng cáo "không thể bị phát hiện". Nhãn `compat` giữ nguyên ý nghĩa: fingerprint áp qua CDP trên kernel CfT, chưa phải kernel vá.

## 9. Kế hoạch phase cập nhật

| Phase | Nội dung | Test tự động |
|---|---|---|
| 0 ✅ | Electron + Next shell, dataRoot, migration WAL | DB, kill giữa chừng |
| 1 | CRUD profile/group/tag, kernel manager (tải CfT), spawn qua CDP pipe, UI Profiles cơ bản | `isolation.test.ts`: 2 profile, set cookie A qua CDP, B không có |
| 2 | Proxy CRUD/import, relay, GeoIP, kill-switch, chặn start | relay với proxy giả local (có auth, http + socks5); upstream chết → 502, không đi thẳng |
| 3 | Seed + catalog, CDP override, trang tự kiểm | `seedStability.test.ts`; test so UA/UA-CH/timezone báo bởi trang với `effective` |
| 4 | Catalog validator, rotateSeed, nâng kernel | tổ hợp ngoài catalog bị từ chối; audit `seed_rotate` |
| 5 | safeStorage cho mọi password | dump DB + log, grep không thấy plaintext |
| 6 | Local API | 401, chống rebinding, rate limit cookie 2 req/s |
| 7 | Các mục v1.1 ở §8 | theo từng mục |

Phụ thuộc thêm: `@puppeteer/browsers`, `proxy-chain`, `maxmind` (đọc .mmdb), `zod`, `@tanstack/react-table`, `@tanstack/react-virtual`, `@tanstack/react-query`, Tailwind CSS + shadcn/ui.
