-- Cho phép đặt trùng tên profile: bỏ ràng buộc UNIQUE trên profiles.name.
-- SQLite không xóa trực tiếp được UNIQUE của cột → dựng lại bảng. FK được tắt trong lúc migrate
-- (xem openDatabase) nên DROP/RENAME không vướng ràng buộc con; id giữ nguyên nên quan hệ vẫn đúng.
CREATE TABLE profiles_new (
  id TEXT PRIMARY KEY,
  serial INTEGER NOT NULL,
  name TEXT NOT NULL,
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

INSERT INTO profiles_new (id, serial, name, group_id, platform_label, start_urls, username, password_enc,
  status, kernel, fingerprint_id, proxy_id, lab, notes, deleted_at, created_at, updated_at)
  SELECT id, serial, name, group_id, platform_label, start_urls, username, password_enc,
    status, kernel, fingerprint_id, proxy_id, lab, notes, deleted_at, created_at, updated_at
  FROM profiles;

DROP TABLE profiles;
ALTER TABLE profiles_new RENAME TO profiles;

CREATE INDEX idx_profiles_proxy ON profiles(proxy_id);
CREATE INDEX idx_profiles_group ON profiles(group_id);
