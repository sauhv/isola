-- Khóa (public key) riêng của từng profile cho từng extension, để mỗi profile có extension ID khác nhau
-- (chống website liên kết chéo profile qua cùng một extension ID). Khóa cố định nên ID ổn định,
-- dữ liệu extension của profile không mất giữa các lần mở.
CREATE TABLE profile_ext_keys (
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  extension_id TEXT NOT NULL,
  key_b64 TEXT NOT NULL,
  PRIMARY KEY (profile_id, extension_id)
);
