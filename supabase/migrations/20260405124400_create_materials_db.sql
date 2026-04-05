-- 拡張機能：ベクトルデータ検索 (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- メーカー情報
CREATE TABLE manufacturers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    website_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 部材カテゴリ（支持金具、配管、など）
CREATE TABLE material_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- カタログの主要テーブル
CREATE TABLE materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES material_categories(id) ON DELETE RESTRICT,
    model_number TEXT NOT NULL, -- 型番（S-H1など）
    name TEXT NOT NULL,         -- 製品名
    description TEXT,           -- 用途や説明文
    specifications JSONB DEFAULT '{}'::jsonb, -- スパン長、耐荷重、材質などの詳細JSON
    image_url TEXT,             -- サムネイル/製品画像URL
    catalog_url TEXT,           -- PDFや公式サイトのURL
    standard_price NUMERIC,     -- 参考定価（AIが価格帯を判断する指標として保持）
    embedding vector(768),      -- Google Embeddings用ベクトル予約枠 (768次元)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 同等品・代替品テーブル（関連性）
CREATE TABLE material_equivalents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_a_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    material_b_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    notes TEXT,                 -- 「○○と同寸法」「耐荷重は少し劣る」などの補足
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(material_a_id, material_b_id)
);

-- キッティング・関連部材テーブル（アセンブリ）
CREATE TABLE material_related (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    child_material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    required_quantity INTEGER DEFAULT 1,
    notes TEXT,                 -- 「取り付けに必要なボルト」など
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(parent_material_id, child_material_id)
);

-- RLS設定 (現場ツールなので認証ユーザーは基本的にすべて閲覧可能想定)
ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_equivalents ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_related ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to manufacturers" ON manufacturers FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to material_categories" ON material_categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to materials" ON materials FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to material_equivalents" ON material_equivalents FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to material_related" ON material_related FOR ALL TO authenticated USING (true);
