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
