import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function fixDriveUrls() {
  console.log('🔧 Drive ViewリンクURLをthumbnail URL形式に変換します...\n');

  // drive.google.com/file/d/.../view 形式のURLを持つ materials を取得
  const { data: materials, error } = await supabase
    .from('materials')
    .select('id, model_number, image_url')
    .like('image_url', '%drive.google.com/file/d/%');

  if (error) { console.error('取得エラー:', error.message); return; }
  
  console.log(`対象レコード数: ${materials?.length || 0}件\n`);
  if (!materials || materials.length === 0) {
    console.log('修正対象がありません。');
    return;
  }

  let fixed = 0, failed = 0;

  for (const m of materials) {
    // https://drive.google.com/file/d/FILE_ID/view?usp=... からFILE_IDを抽出
    const match = m.image_url.match(/\/file\/d\/([^\/]+)/);
    if (!match || !match[1]) {
      console.log(`  ⚠️ IDが取れない: ${m.model_number} → ${m.image_url.substring(0, 60)}`);
      failed++;
      continue;
    }

    const fileId = match[1];
    const newUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;

    const { error: updateErr } = await supabase
      .from('materials')
      .update({ image_url: newUrl })
      .eq('id', m.id);

    if (updateErr) {
      console.error(`  ❌ 更新失敗: ${m.model_number}`, updateErr.message);
      failed++;
    } else {
      fixed++;
      if (fixed % 50 === 0) process.stdout.write(`  ${fixed}件変換済み...\r`);
    }
  }

  console.log(`\n────────────────────────────────`);
  console.log(`✅ 変換完了！`);
  console.log(`  成功: ${fixed}件`);
  console.log(`  失敗: ${failed}件`);
  console.log(`\n変換後URL例: https://drive.google.com/thumbnail?id=FILE_ID&sz=w400`);
  console.log('これで <img src="..."> で正しく表示されるようになります！');

  // 変換後に1件サンプルを表示
  const { data: sample } = await supabase
    .from('materials')
    .select('model_number, image_url')
    .like('image_url', '%drive.google.com/thumbnail%')
    .limit(3);

  console.log('\n=== 変換後サンプル ===');
  for (const s of sample || []) {
    console.log(`${s.model_number}: ${s.image_url}`);
  }
}

fixDriveUrls().catch(console.error);
