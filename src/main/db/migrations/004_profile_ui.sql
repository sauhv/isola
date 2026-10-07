-- Cột "Lần mở cuối" trong bảng profile đọc MAX(at) của audit 'open'.
CREATE INDEX idx_audit_profile_action ON audit_log(profile_id, action, at);
