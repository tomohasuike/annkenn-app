import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGET_MFG = 'ネグロス電工';

async function check() {
  console.log(`🔍 【品質チェック】抽出データの検証を開始...`);
  
  // 1. メーカーIDの取得
  const { data: mData } = await supabase.from('manufacturers').select('id').eq('name', TARGET_MFG).limit(1);
  if (!mData || mData.length === 0) {
      console.error("メーカーが見つかりません");
      return;
  }
  const mId = mData[0].id;

  // 今回のバッチで抽出されたデータ一覧を取得 (適当に1000件サンプリング)
  const { data: items, error } = await supabase.from('materials')
      .select('*')
      .eq('manufacturer_id', mId)
      .not('page_number', 'is', 'null')
      .order('created_at', { ascending: false })
      .limit(1000);

  if (error) {
      console.error("データ取得エラー:", error);
      return;
  }
  
  console.log(`\n================================`);
  console.log(`✅ 1. データサンプル提示 (最新5件ランダム風)`);
  console.log(`================================`);
  for(let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * items.length);
      const sample = items[idx];
      console.log(`[Sample ${i+1}] Page: ${sample.page_number}`);
      console.log(` - 型番: ${sample.model_number}`);
      console.log(` - 品名: ${sample.name}`);
      console.log(` - 価格: ${sample.standard_price ?? 'なし'}`);
      console.log(` - 寸法: W:${sample.width_mm ?? '-'} H:${sample.height_mm ?? '-'} D:${sample.depth_mm ?? '-'}`);
      console.log(` - 説明: ${sample.description?.substring(0, 50)}...`);
      console.log(` - 画像URL: ${sample.catalog_url}`);
      console.log(``);
  }

  console.log(`================================`);
  console.log(`✅ 2. 価格フォーマットの異常チェック`);
  console.log(`================================`);
  // Supabaseのstandard_priceが数値型であれば文字は弾かれるが、一応nullと非数値をカウント
  let nullPriceCount = 0;
  let nonNumericPriceCount = 0;
  items.forEach(item => {
      if (item.standard_price === null) nullPriceCount++;
      else if (isNaN(item.standard_price)) nonNumericPriceCount++;
  });
  console.log(`サンプリング 1,000件中の内訳:`);
  console.log(` - 価格が正常な数値: ${items.length - nullPriceCount - nonNumericPriceCount}件`);
  console.log(` - 価格が NULL (オープン価格など): ${nullPriceCount}件`);
  console.log(` - 価格が数値以外の文字列(エラー要因): ${nonNumericPriceCount}件`);


  console.log(`\n================================`);
  console.log(`✅ 3. 型番・製品名の空白・改行・NULLチェック`);
  console.log(`================================`);
  let nullModelCount = 0;
  let newlineStringCount = 0;
  let emptyStringCount = 0;
  items.forEach(item => {
      if (!item.model_number || item.model_number === 'UNKNOWN' || item.model_number === 'null') nullModelCount++;
      if (item.name === '' || item.model_number === '') emptyStringCount++;
      if ((item.name && item.name.includes('\n')) || (item.model_number && item.model_number.includes('\n'))) newlineStringCount++;
  });
  console.log(`サンプリング 1,000件中の内訳:`);
  console.log(` - 型番が不明 (UNKNOWN/NULL): ${nullModelCount}件`);
  console.log(` - 型番や品名が完全な「空文字」: ${emptyStringCount}件`);
  console.log(` - 型番や品名に「改行コード」が含まれる: ${newlineStringCount}件`);


  console.log(`\n================================`);
  console.log(`✅ 4. 画像URL (Google Drive) の形式確認`);
  console.log(`================================`);
  let invalidUrlCount = 0;
  items.forEach(item => {
      if (!item.catalog_url || !item.catalog_url.startsWith('https://drive.google.com/')) {
          invalidUrlCount++;
      }
  });
  console.log(`サンプリング 1,000件中の内訳:`);
  console.log(` - Google Driveの正しいURL形式でないもの: ${invalidUrlCount}件`);

  console.log(`\n🔍 チェック完了！`);
}

check().catch(console.error);
