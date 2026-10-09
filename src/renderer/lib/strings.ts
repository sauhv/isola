import { addDict } from './i18n'

// Thuật ngữ giữ nguyên ở cả hai ngôn ngữ (không đưa vào đây): Proxy, Extension,
// Fingerprint, Kernel, Profile, Cookie, WebRTC, WebGL, WebGPU, Canvas, AudioContext,
// User-Agent, IP, GeoIP, Chrome, Windows, macOS, HTTP/HTTPS/SOCKS5, Web Store, compat, lab…

addDict({
  // ---- chung ----
  'common.close': ['Đóng', 'Close'],
  'common.cancel': ['Hủy', 'Cancel'],
  'common.save': ['Lưu', 'Save'],
  'common.add': ['Thêm', 'Add'],
  'common.delete': ['Xóa', 'Delete'],
  'common.edit': ['Sửa', 'Edit'],
  'common.rename': ['Đổi tên', 'Rename'],
  'common.check': ['Kiểm tra', 'Check'],
  'common.reload': ['Tải lại', 'Reload'],
  'common.loading': ['Đang tải…', 'Loading…'],
  'common.search': ['Tìm kiếm', 'Search'],
  'common.none': ['Không', 'None'],
  'common.back': ['Quay lại', 'Back'],
  'common.yes': ['Có', 'Yes'],
  'common.deselect': ['Bỏ chọn', 'Deselect'],
  'common.selected': ['Đã chọn {n}', '{n} selected'],

  // ---- sidebar / app ----
  'app.create': ['Tạo profile', 'Create profile'],
  'app.system': ['Hệ thống', 'System'],
  'app.stat.profiles': ['Profile', 'Profiles'],
  'app.stat.running': ['Đang chạy', 'Running'],
  'app.stat.fpmode': ['Chế độ fingerprint', 'Fingerprint mode'],
  'app.expand': ['Mở rộng', 'Expand'],
  'app.collapse': ['Thu gọn', 'Collapse'],
  'app.lang': ['Ngôn ngữ', 'Language'],

  // ---- thời gian ----
  'time.now': ['vừa xong', 'just now'],
  'time.min': ['{n} phút trước', '{n} min ago'],
  'time.hour': ['{n} giờ trước', '{n}h ago'],
  'time.day': ['{n} ngày trước', '{n}d ago'],

  // ---- toast ----
  'toast.notYet': ['"{f}" — tính năng chưa phát triển.', '"{f}" — feature not available yet.'],
  'toast.notYetGeneric': ['Tính năng này chưa phát triển.', 'This feature is not available yet.'],

  // ---- coming soon ----
  'soon.suffix': ['Tính năng chưa phát triển.', 'Feature not available yet.']
})

addDict({
  // ---- cột/nhãn chung ----
  'common.actions': ['Thao tác', 'Actions'],
  'common.status': ['Trạng thái', 'Status'],
  'common.name': ['Tên', 'Name'],
  'common.no': ['Số', 'No.'],
  'common.group': ['Nhóm', 'Group'],
  'common.noGroup': ['Không nhóm', 'No group'],
  'common.restore': ['Khôi phục', 'Restore'],
  'common.purge': ['Xóa vĩnh viễn', 'Delete permanently'],
  'common.version': ['Phiên bản', 'Version'],

  // ---- Kernel ----
  'kernel.note': [
    'Kernel là Chrome for Testing ghim phiên bản, tải từ máy chủ chính thức của Google. Không tự cập nhật, không có Widevine (trang dùng DRM như Netflix sẽ không phát), không đăng nhập Google Sync.',
    'Kernel is a pinned Chrome for Testing build downloaded from Google’s official server. It does not auto-update, has no Widevine (DRM sites like Netflix won’t play), and cannot sign in to Google Sync.'
  ],
  'kernel.installed': ['Đã tải', 'Installed'],
  'kernel.downloading': ['Đang tải…', 'Downloading…'],
  'kernel.notInstalled': ['Chưa tải', 'Not installed'],
  'kernel.download': ['Tải', 'Download'],

  // ---- Import proxy ----
  'proxyimport.title': ['Import proxy', 'Import proxies'],
  'proxyimport.lines': ['Mỗi dòng một proxy (tối đa 500)', 'One proxy per line (max 500)'],
  'proxyimport.defaultType': ['Loại mặc định (khi dòng không ghi giao thức)', 'Default type (when a line has no scheme)'],
  'proxyimport.added': ['Đã thêm {n} proxy.', 'Added {n} proxies.'],
  'proxyimport.skipped': ['{n} dòng bị bỏ qua:', '{n} lines skipped:'],
  'proxyimport.line': ['Dòng {n}: {r}', 'Line {n}: {r}'],
  'proxyimport.importing': ['Đang import…', 'Importing…'],
  'proxyimport.importN': ['Import {n} dòng', 'Import {n} lines'],

  // ---- Extension scope ----
  'extscope.title': ['Áp dụng "{name}" cho', 'Apply "{name}" to'],
  'extscope.all': ['Tất cả profile', 'All profiles'],
  'extscope.byGroup': ['Theo nhóm', 'By group'],
  'extscope.noGroup': ['Chưa có nhóm nào.', 'No groups yet.'],
  'extscope.byProfile': ['Chọn từng profile', 'Select profiles'],
  'extscope.findProfile': ['Tìm profile', 'Find profile'],
  'extscope.noProfile': ['Không có profile.', 'No profiles.'],
  'extscope.selectedN': ['Đã chọn {n} profile.', '{n} profiles selected.'],

  // ---- Move group ----
  'move.titleOne': ['Chuyển "{name}" sang nhóm', 'Move "{name}" to group'],
  'move.titleN': ['Chuyển {n} profile sang nhóm', 'Move {n} profiles to group'],
  'move.target': ['Nhóm đích', 'Target group'],
  'move.action': ['Chuyển', 'Move'],

  // ---- Groups tab ----
  'groups.newName': ['Tên nhóm mới', 'New group name'],
  'groups.add': ['Thêm nhóm', 'Add group'],
  'groups.colName': ['Tên nhóm', 'Group name'],
  'groups.colCount': ['Số profile', 'Profiles'],
  'groups.colCreated': ['Ngày tạo', 'Created'],
  'groups.empty': ['Chưa có nhóm.', 'No groups.'],
  'groups.confirmDelete': [
    'Xóa nhóm "{name}"? {n} profile trong nhóm chuyển về "Không nhóm".',
    'Delete group "{name}"? Its {n} profiles move to "No group".'
  ],

  // ---- Trash tab ----
  'trash.note': [
    'Profile trong thùng rác giữ nguyên dữ liệu trình duyệt cho tới khi xóa vĩnh viễn.',
    'Profiles in trash keep their browser data until permanently deleted.'
  ],
  'trash.colTrashed': ['Đưa vào thùng rác', 'Moved to trash'],
  'trash.colAutoPurge': ['Tự xóa được từ', 'Auto-delete after'],
  'trash.empty': ['Thùng rác trống.', 'Trash is empty.'],
  'trash.confirmPurge': [
    'Xóa vĩnh viễn {n} profile cùng toàn bộ dữ liệu trình duyệt (cookie, đăng nhập, dữ liệu extension)? Không hoàn tác được.',
    'Permanently delete {n} profiles and all their browser data (cookies, logins, extension data)? This cannot be undone.'
  ]
})

addDict({
  // ---- thông báo lỗi (base; phần chi tiết sau dấu ":" do backend sinh) ----
  'err.NOT_FOUND': ['Không tìm thấy.', 'Not found.'],
  'err.NAME_TAKEN': ['Tên này đã được dùng.', 'This name is already in use.'],
  'err.ALREADY_RUNNING': ['Profile đang chạy.', 'Profile is already running.'],
  'err.PROFILE_RUNNING': ['Hãy đóng profile trước.', 'Please close the profile first.'],
  'err.ARCHIVED': ['Profile đã lưu trữ.', 'Profile is archived.'],
  'err.NOT_ARCHIVED': ['Profile chưa được lưu trữ.', 'Profile is not archived.'],
  'err.PURGE_TOO_EARLY': ['Chỉ xóa vĩnh viễn sau 7 ngày lưu trữ, hoặc khi bạn xác nhận.', 'Permanent delete is only allowed after 7 days in trash, or when you confirm.'],
  'err.KERNEL_MISSING': ['Chưa tải kernel cho profile này. Vào mục Kernel để tải.', 'Kernel not downloaded for this profile. Go to Kernel to download it.'],
  'err.KERNEL_UNKNOWN': ['Kernel không được hỗ trợ.', 'Kernel is not supported.'],
  'err.LAUNCH_FAILED': ['Không mở được trình duyệt.', 'Could not open the browser.'],
  'err.INVALID_INPUT': ['Dữ liệu không hợp lệ.', 'Invalid data.'],
  'err.PROXY_REQUIRED': ['Profile production phải có proxy. Gán proxy, hoặc đánh dấu là profile lab.', 'A production profile needs a proxy. Assign one, or mark it as a lab profile.'],
  'err.PROXY_DOWN': ['Proxy không hoạt động nên profile không được mở.', 'The proxy is not working, so the profile was not opened.'],
  'err.PROXY_NO_TZ': ['Chưa xác định được timezone của proxy nên profile production không được mở. Tải dữ liệu GeoIP ở mục Proxy rồi kiểm tra lại proxy.', 'The proxy timezone is unknown, so the production profile was not opened. Download GeoIP data in Proxy, then re-check the proxy.'],
  'err.PROXY_IN_USE': ['Proxy đang được gán cho profile. Gỡ khỏi profile trước khi xóa.', 'The proxy is assigned to profiles. Remove it from them before deleting.'],
  'err.NO_REFRESH_URL': ['Proxy này chưa có URL đổi IP.', 'This proxy has no change-IP URL.'],
  'err.REFRESH_FAILED': ['Gọi URL đổi IP thất bại.', 'Calling the change-IP URL failed.'],
  'err.SEED_INVALID': ['Fingerprint không hợp lệ.', 'Invalid fingerprint.'],
  'err.KERNEL_MISMATCH': ['Phiên bản Chrome của fingerprint không khớp kernel (kernel lệch catalog). Tạo fingerprint mới cho profile.', 'The fingerprint’s Chrome version does not match the kernel. Generate a new fingerprint for the profile.'],
  'err.COOKIES_INVALID': ['Cookie không đúng định dạng.', 'Cookies are not in a valid format.'],
  'err.EXT_INVALID': ['Extension không hợp lệ.', 'Invalid extension.'],
  'err.EXT_NOT_FOUND_IN_STORE': ['Không tìm thấy extension trên Chrome Web Store (sai ID, đã gỡ, hoặc không hỗ trợ Chrome này).', 'Extension not found on the Chrome Web Store (wrong ID, removed, or unsupported on this Chrome).'],
  'err.EXT_DOWNLOAD_FAILED': ['Không tải được extension từ Chrome Web Store.', 'Could not download the extension from the Chrome Web Store.'],
  'err.EXT_ID_MISMATCH': ['File mới là một extension khác (ID không khớp).', 'The new file is a different extension (ID mismatch).'],
  'err.EXT_NOT_STORE': ['Extension này không đến từ Web Store. Dùng Cập nhật từ file.', 'This extension did not come from the Web Store. Use Update from file.'],
  'err.EXT_PATH_INVALID': ['Đường dẫn extension không dùng được.', 'The extension path is not usable.'],
  'err.INTERNAL': ['Lỗi nội bộ. Xem log để biết thêm.', 'Internal error. See the log for details.']
})

addDict({
  // ---- Proxy page ----
  'subtab.list': ['Danh sách', 'List'],
  'subtab.rotating': ['Proxy xoay', 'Rotating proxy'],
  'subtab.provider': ['Nhà cung cấp', 'Provider'],
  'subtab.resources': ['Tài nguyên', 'Resources'],
  'proxies.rotating.title': ['Proxy xoay', 'Rotating proxy'],
  'proxies.rotating.desc': ['Quản lý proxy xoay theo phiên. Tính năng chưa phát triển.', 'Manage session-based rotating proxies. Not available yet.'],
  'proxies.provider.title': ['Nhà cung cấp proxy', 'Proxy provider'],
  'proxies.provider.desc': ['Kết nối nhà cung cấp để mua và đồng bộ proxy. Tính năng chưa phát triển.', 'Connect a provider to buy and sync proxies. Not available yet.'],
  'proxies.resources.title': ['Tài nguyên', 'Resources'],
  'proxies.resources.desc': ['Hướng dẫn và tài nguyên về proxy. Tính năng chưa phát triển.', 'Proxy guides and resources. Not available yet.'],
  'proxies.geoNote': [
    'Chưa có dữ liệu GeoIP. Cần nó để biết quốc gia và timezone của proxy (tra offline, khoảng 60 MB). Profile production chỉ mở được khi proxy có timezone.',
    'No GeoIP data yet. It is needed to know a proxy’s country and timezone (offline lookup, ~60 MB). A production profile can only open when its proxy has a timezone.'
  ],
  'proxies.downloadGeo': ['Tải GeoIP', 'Download GeoIP'],
  'proxies.searchPh': ['Tìm theo nhãn, host, IP, quốc gia', 'Search by label, host, IP, country'],
  'proxies.add': ['Thêm proxy', 'Add proxy'],
  'proxies.checkAll': ['Kiểm tra tất cả', 'Check all'],
  'proxies.tag': ['Gắn thẻ', 'Tag'],
  'proxies.tagProxy': ['Gắn thẻ proxy', 'Tag proxy'],
  'proxies.settings': ['Cài đặt proxy', 'Proxy settings'],
  'proxies.exportProxy': ['Xuất proxy', 'Export proxy'],
  'proxies.checkSelected': ['Kiểm tra đã chọn ({n})', 'Check selected ({n})'],
  'proxies.catAll': ['Tất cả ({n})', 'All ({n})'],
  'proxies.catStatic': ['Static ISP ({n})', 'Static ISP ({n})'],
  'proxies.catDatacenter': ['Datacenter ({n})', 'Datacenter ({n})'],
  'proxies.catImported': ['Đã nhập ({n})', 'Imported ({n})'],
  'proxies.colType': ['Loại', 'Type'],
  'proxies.colIpLoc': ['IP ra / vị trí', 'Exit IP / location'],
  'proxies.colLatency': ['Độ trễ', 'Latency'],
  'proxies.checking': ['Đang kiểm…', 'Checking…'],
  'proxies.notChecked': ['Chưa kiểm', 'Not checked'],
  'proxies.errLabel': ['Lỗi', 'Error'],
  'proxies.noTz': ['chưa rõ timezone', 'timezone unknown'],
  'proxies.sharedIp': ['Nhiều profile dùng chung một IP', 'Multiple profiles share one IP'],
  'proxies.changeIp': ['Đổi IP', 'Change IP'],
  'proxies.inUse': ['Đang gán cho profile', 'Assigned to a profile'],
  'proxies.confirmDelete': ['Xóa {n} proxy?', 'Delete {n} proxies?'],
  'proxies.blockedDelete': ['{n} proxy đang gán cho profile, không xóa được. Gỡ khỏi profile trước.', '{n} proxies are assigned to profiles and cannot be deleted. Remove them first.'],
  'proxies.emptyUncat': ['Chưa phân loại proxy theo nhóm này.', 'No proxies classified in this category.'],
  'proxies.emptyNone': ['Chưa có proxy. Bấm "Thêm proxy" hoặc "Import".', 'No proxies yet. Click "Add proxy" or "Import".'],
  'proxies.emptyFilter': ['Không có proxy khớp bộ lọc.', 'No proxies match the filter.'],
  'proxies.geoCredit': ['Dữ liệu GeoIP {v} · IP geolocation by DB-IP (CC BY 4.0)', 'GeoIP data {v} · IP geolocation by DB-IP (CC BY 4.0)']
})

addDict({
  // ---- ProxyEditor ----
  'common.label': ['Nhãn', 'Label'],
  'px.errPrefix': ['Lỗi: {e}', 'Error: {e}'],
  'px.titleEdit': ['Sửa proxy', 'Edit proxy'],
  'px.titleAdd': ['Thêm proxy', 'Add proxy'],
  'px.labelPh': ['Để trống = host:port', 'Leave empty = host:port'],
  'px.type': ['Loại proxy', 'Proxy type'],
  'px.ipCheckerTitle': ['Isola dùng dữ liệu GeoIP offline (DB-IP)', 'Isola uses offline GeoIP data (DB-IP)'],
  'px.keepPw': ['•••••• (giữ nguyên)', '•••••• (unchanged)'],
  'px.clearPw': ['Xóa password đã lưu', 'Clear saved password'],
  'px.changeIpUrl': ['URL đổi IP (proxy xoay)', 'Change-IP URL (rotating proxy)'],
  'px.changeIpHint': ['Tùy chọn. Isola gọi URL này khi bấm "Đổi IP", rồi kiểm tra lại proxy.', 'Optional. Isola calls this URL when you click "Change IP", then re-checks the proxy.'],
  'px.pwEncrypted': ['Password được mã hóa bằng khóa của Windows/macOS (safeStorage) trước khi lưu.', 'The password is encrypted with the Windows/macOS key (safeStorage) before saving.']
})
