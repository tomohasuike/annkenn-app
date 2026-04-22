import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function fixCatalogPageUrls() {
  console.log('🔧 catalog_pages の Drive ViewリンクURLをthumbnail URL形式に変換します...\n');

  let offset = 0;
  const batchSize = 500;
  let totalFixed = 0;
  let totalFailed = 0;

  while (true) {
    const { data: pages, error } = await supabase
      .from('catalog_pages')
      .select('id, page_image_url')
      .like('page_image_url', '%drive.google.com/file/d/%')
      .range(offset, offset + batchSize - 1);

    if (error) { console.error('取得エラー:', error.message); break; }
    if (!pages || pages.length === 0) break;

    console.log(`バッチ取得: ${pages.length}件 (offset: ${offset})`);

    for (const p of pages) {
      const match = p.page_image_url.match(/\/file\/d\/([^\/]+)/);
      if (!match || !match[1]) {
        totalFailed++;
        continue;
      }

      const fileId = match[1];
      const newUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;

      const { error: updateErr } = await supabase
        .from('catalog_pages')
        .update({ page_image_url: newUrl })
        .eq('id', p.id);

      if (updateErr) {
        totalFailed++;
      } else {
        totalFixed++;
      }
    }

    process.stdout.write(`  合計 ${totalFixed}件変換済み...\r`);
    
    if (pages.length < batchSize) break;
    offset += batchSize;
  }

  console.log(`\n────────────────────────────────`);
  console.log(`✅ catalog_pages 変換完了！`);
  console.log(`  成功: ${totalFixed}件`);
  console.log(`  失敗: ${totalFailed}件`);
}

fixCatalogPageUrls().catch(console.error);
