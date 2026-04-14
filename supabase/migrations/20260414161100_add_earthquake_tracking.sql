-- 添加地震追跡字段
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS last_earthquake_event_id TEXT;
