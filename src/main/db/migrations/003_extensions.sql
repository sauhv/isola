CREATE TABLE extensions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('store','file')),
  public_key TEXT NOT NULL,
  dir TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  icon TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','groups','profiles')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE extension_targets (
  extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('group','profile')),
  target_id TEXT NOT NULL,
  PRIMARY KEY (extension_id, kind, target_id)
);

CREATE INDEX idx_extension_targets_target ON extension_targets(kind, target_id);
