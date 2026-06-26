-- Postgres extensions cần cho QLCV (TDD §3.2).
-- Tự chạy 1 lần khi container Postgres lên LẦN ĐẦU (volume rỗng).
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy match danh bạ / OCR
CREATE EXTENSION IF NOT EXISTS unaccent;    -- bỏ dấu trong full-text search tiếng Việt
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid() cho bảng jobs
