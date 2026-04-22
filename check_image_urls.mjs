import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // まず件数確認
  const { count } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true });
  console.log('materialsテーブル総件数:', count);

  // image_url のサンプルを取得
  const { data: sample, error } = await supabase
    .from('materials')
    .select('model_number, name, image_url')
    .limit(10);

  console.log('サンプルデータ取得エラー:', error?.message || 'なし');
  console.log('\n=== サンプル10件 ===');
  for (const m of sample || []) {
    console.log(`${m.model_number}: image_url=${m.image_url ? m.image_url.substring(0, 80) + '...' : 'NULL'}`);
  }

  // image_url が null のものとそうでないものの数
  const { count: withImage } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .not('image_url', 'is', null);
  
  const { count: noImage } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .is('image_url', null);
  
  console.log(`\n画像あり: ${withImage}件, 画像なし: ${noImage}件`);

  // lh3.googleusercontent.com URLの数
  const { count: lh3Count } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .like('image_url', '%lh3.googleusercontent.com%');
  
  // drive.google.com URLの数
  const { count: driveCount } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .like('image_url', '%drive.google.com%');
  
  console.log(`lh3形式: ${lh3Count}件, drive形式: ${driveCount}件`);
}

check().catch(console.error);
