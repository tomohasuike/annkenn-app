import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('\n========== ネグロス電工 診断レポート ==========\n');

  // 1. manufacturers テーブル確認
  const { data: mfgs } = await supabase.from('manufacturers').select('*').ilike('name', '%ネグロス%');
  console.log('[1] manufacturers テーブル:');
  console.log(JSON.stringify(mfgs, null, 2));

  if (!mfgs || mfgs.length === 0) {
    console.log('→ ネグロス電工がmanufacturersテーブルに存在しません！');
    return;
  }
  const mfgId = mfgs[0].id;
  const mfgName = mfgs[0].name;

  // 2. materials テーブル確認
  const { data: mats, count: matCount } = await supabase
    .from('materials')
    .select('id, name, model_number, page_number, image_url, embedding', { count: 'exact' })
    .eq('manufacturer_id', mfgId);

  console.log(`\n[2] materials テーブル (${mfgName}): ${matCount || 0} 件`);
  const withPageNum = mats?.filter(m => m.page_number !== null && m.page_number !== undefined).length || 0;
  const withImage = mats?.filter(m => m.image_url && m.image_url !== '' && !m.image_url.includes('dummyimage')).length || 0;
  const withEmbedding = mats?.filter(m => m.embedding !== null && m.embedding !== undefined).length || 0;
  console.log(`  - page_number あり: ${withPageNum} / ${matCount || 0}`);
  console.log(`  - image_url あり: ${withImage} / ${matCount || 0}`);
  console.log(`  - embedding あり (AI検索用): ${withEmbedding} / ${matCount || 0}`);
  
  if (mats && mats.length > 0) {
    console.log('\n  サンプル (最初の5件):');
    mats.slice(0, 5).forEach(m => {
      console.log(`    - [p.${m.page_number ?? 'NULL'}] ${m.model_number} / ${m.name} / img:${m.image_url ? '有' : '無'} / emb:${m.embedding ? '有' : '無'}`);
    });
  }

  // 3. catalog_pages テーブル確認
  const { data: pages, count: pageCount } = await supabase
    .from('catalog_pages')
    .select('id, page_number, manufacturer, page_image_url, drive_file_id', { count: 'exact' })
    .ilike('manufacturer', '%ネグロス%');

  console.log(`\n[3] catalog_pages テーブル (${mfgName}): ${pageCount || 0} 件`);
  
  if (pages && pages.length > 0) {
    const withImgUrl = pages.filter(p => p.page_image_url && p.page_image_url !== '').length;
    const withDriveId = pages.filter(p => p.drive_file_id && p.drive_file_id !== '').length;
    console.log(`  - page_image_url あり: ${withImgUrl} / ${pageCount || 0}`);
    console.log(`  - drive_file_id あり: ${withDriveId} / ${pageCount || 0}`);
    console.log(`  - manufacturer 値 (ユニーク): ${[...new Set(pages.map(p => p.manufacturer))].join(', ')}`);

    // サンプルURL確認
    const sampleWithUrl = pages.find(p => p.page_image_url);
    if (sampleWithUrl) {
      console.log(`\n  サンプルURL (page ${sampleWithUrl.page_number}):`);
      console.log(`    page_image_url: ${sampleWithUrl.page_image_url}`);
      console.log(`    drive_file_id: ${sampleWithUrl.drive_file_id}`);
    } else {
      console.log('\n  → page_image_url が全件 NULL または空です！画像表示不可の原因です。');
    }
  } else {
    console.log('  → catalog_pages にネグロス電工のデータがありません！');
  }

  // 4. クロスチェック: materialsのpage_numberがcatalog_pagesに存在するか
  if (mats && pages && mats.length > 0 && pages.length > 0) {
    const catalogPageNumbers = new Set(pages.map(p => p.page_number));
    const matsWithValidPage = mats.filter(m => m.page_number && catalogPageNumbers.has(m.page_number)).length;
    console.log(`\n[4] クロスチェック: materials の page_number が catalog_pages に存在する件数:`);
    console.log(`  ${matsWithValidPage} / ${matCount || 0} 件 (${Math.round(matsWithValidPage / (matCount || 1) * 100)}%)`);
    if (matsWithValidPage === 0) {
      console.log('  → materialsのpage_numberとcatalog_pagesのpage_numberが一致していません！');
    }
  }

  console.log('\n========== 診断完了 ==========\n');
}

diagnose().catch(console.error);
