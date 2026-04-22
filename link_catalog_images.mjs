import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function linkCatalogImagesToMaterials() {
  console.log('Step 1: メーカーマスターを読み込み中...');
  const { data: manufacturers } = await supabase
    .from('manufacturers')
    .select('id, name');
  
  const mfgMap = {}; // id -> name
  for (const m of manufacturers || []) {
    mfgMap[m.id] = m.name;
  }
  console.log(`  ${Object.keys(mfgMap).length}件のメーカーマスター読み込み完了`);

  console.log('\nStep 2: catalog_pagesのページ画像マップを構築中...');
  let cpOffset = 0;
  const catalogImageMap = {}; // "manufacturer|page_number" -> page_image_url
  
  while (true) {
    const { data: pages } = await supabase
      .from('catalog_pages')
      .select('manufacturer, page_number, page_image_url')
      .not('page_image_url', 'is', null)
      .range(cpOffset, cpOffset + 999);
    
    if (!pages || pages.length === 0) break;
    
    for (const cp of pages) {
      if (cp.manufacturer && cp.page_number) {
        const key = `${cp.manufacturer}|${cp.page_number}`;
        if (!catalogImageMap[key]) {
          catalogImageMap[key] = cp.page_image_url;
        }
      }
    }
    
    cpOffset += 1000;
    if (pages.length < 1000) break;
  }
  
  const totalKeys = Object.keys(catalogImageMap).length;
  console.log(`  ${totalKeys}件のページ画像マップ構築完了`);

  console.log('\nStep 3: image_urlがNULLの材料にカタログ画像を紐づけ中...');
  let totalFixed = 0;
  let totalSkipped = 0;
  
  // offsetドリフト回避: 常にoffset=0で取得（更新済みは自動的に除外される）
  while (true) {
    const { data: materials } = await supabase
      .from('materials')
      .select('id, manufacturer_id, page_number')
      .is('image_url', null)
      .not('page_number', 'is', null)
      .limit(500);
    
    if (!materials || materials.length === 0) break;
    
    // バッチ更新を収集
    const updates = [];
    for (const m of materials) {
      const mfgName = mfgMap[m.manufacturer_id];
      if (!mfgName) { totalSkipped++; continue; }
      
      const key = `${mfgName}|${m.page_number}`;
      const pageImageUrl = catalogImageMap[key];
      
      if (pageImageUrl) {
        updates.push({ id: m.id, image_url: pageImageUrl });
      } else {
        // カタログページがないのでダミーに変更してNULLではなくする
        updates.push({ id: m.id, image_url: 'no_catalog_page' });
        totalSkipped++;
      }
    }
    
    // バッチで更新
    for (const update of updates) {
      await supabase
        .from('materials')
        .update({ image_url: update.image_url })
        .eq('id', update.id);
      if (update.image_url !== 'no_catalog_page') totalFixed++;
    }
    
    process.stdout.write(`  ${totalFixed}件紐づけ済み (スキップ: ${totalSkipped}件)...\r`);
  }
  
  console.log(`\n\nStep 4: 結果サマリー`);
  console.log(`  成功: ${totalFixed}件`);
  console.log(`  スキップ: ${totalSkipped}件（カタログページなし）`);
  
  // 確認
  const { data: check } = await supabase
    .from('materials')
    .select('model_number, image_url')
    .in('model_number', ['SK2CS-Y'])
    .limit(2);
  
  console.log('\n=== SK2CS-Y の確認 ===');
  for (const m of check || []) {
    console.log(`${m.model_number}: ${m.image_url || 'まだNULL'}`);
  }
  
  console.log('\n完了！ブラウザをリロードして確認してください。');
}

linkCatalogImagesToMaterials().catch(console.error);
