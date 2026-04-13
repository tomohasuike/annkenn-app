-- catalog_pages に判定結果用の列を追加
ALTER TABLE catalog_pages ADD COLUMN IF NOT EXISTS is_target BOOLEAN DEFAULT NULL;

-- 判定状態に関するインデックス（NULLのものだけ引っ張るため）
CREATE INDEX IF NOT EXISTS idx_catalog_pages_is_target ON catalog_pages(is_target);
