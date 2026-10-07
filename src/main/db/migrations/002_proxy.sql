ALTER TABLE proxies ADD COLUMN last_check_country TEXT;
ALTER TABLE proxies ADD COLUMN last_check_city TEXT;
ALTER TABLE proxies ADD COLUMN last_check_latency_ms INTEGER;
ALTER TABLE proxies ADD COLUMN last_check_error TEXT;
ALTER TABLE proxies ADD COLUMN refresh_url TEXT;

CREATE INDEX idx_profiles_proxy ON profiles(proxy_id);
CREATE INDEX idx_profiles_group ON profiles(group_id);
