-- Sao lưu cookie hiện tại của profile (giống AdsPower: sau khi dùng, cookie tự lưu lại để xem/khôi phục).
-- Đọc từ trình duyệt qua CDP lúc đóng profile (và định kỳ khi đang chạy), lưu mã hóa như cookies_import.
CREATE TABLE cookies_backup (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id),
  payload_enc TEXT NOT NULL,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
