-- Tùy chọn khởi động theo profile (giống AdsPower): cờ Chrome tự nhập + tăng tốc phần cứng.
ALTER TABLE profiles ADD COLUMN launch_args TEXT;
ALTER TABLE profiles ADD COLUMN hw_accel TEXT; -- NULL/'default' = để nguyên, 'off' = tắt GPU
