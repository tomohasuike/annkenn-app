-- calc_panelsテーブルにツリーのノードとのリンク情報を持たせるためのカラムを追加
ALTER TABLE calc_panels ADD COLUMN IF NOT EXISTS tree_node_id TEXT;
