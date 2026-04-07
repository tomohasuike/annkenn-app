import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const migration_sql = `
-- 1. pgvector拡張を有効化（エラーが出ても無視できるようにする）
create extension if not exists vector;

-- 2. materialsテーブルにベクトル(768次元)を入れる列を追加
alter table materials add column if not exists embedding vector(768);

-- 3. メーカー情報も取れる類似度検索の関数を作成
create or replace function match_materials (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  model_number text,
  name text,
  description text,
  standard_price bigint,
  image_url text,
  catalog_url text,
  width_mm float,
  height_mm float,
  depth_mm float,
  page_number int,
  manufacturer_name text,
  similarity float
)
language sql stable
as $$
  select
    m.id,
    m.model_number,
    m.name,
    m.description,
    m.standard_price,
    m.image_url,
    m.catalog_url,
    m.width_mm,
    m.height_mm,
    m.depth_mm,
    m.page_number,
    man.name as manufacturer_name,
    1 - (m.embedding <=> query_embedding) as similarity
  from materials m
  left join manufacturers man on m.manufacturer_id = man.id
  where m.embedding is not null
  and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
`;

async function run() {
  console.log("🛠️  DBにpgvector拡張と検索用関数をインストールします...");
  const { error } = await supabase.rpc('exec_raw_sql', { query: migration_sql });
  
  if (error) {
    console.error("❌ エラー:", error);
  } else {
    console.log("✅ データベースのAI完全対応化が完了しました！");
  }
}

run();
