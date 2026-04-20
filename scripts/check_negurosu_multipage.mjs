import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log('=== negurosu_denkou multi-page diagnosis ===\n');

  // 1. Get manufacturer ID
  const { data: mfg } = await supabase
    .from('manufacturers')
    .select('id, name')
    .ilike('name', '%negurosu%')
    .limit(5);
  
  // Also search by katakana
  const { data: mfg2 } = await supabase
    .from('manufacturers')
    .select('id, name')
    .ilike('name', '%denki%')
    .limit(5);

  console.log('manufacturers found (negurosu):', mfg);
  console.log('manufacturers found (denki):', mfg2);

  // Search by exact name
  const { data: mfgNeg } = await supabase
    .from('manufacturers')
    .select('id, name')
    .limit(20);
  
  const negurosuMfg = mfgNeg?.find(m => m.name.includes('negurosu') || m.name.includes('denki') || m.name === 'negurosu_denkou');
  
  console.log('\nAll manufacturers:');
  mfgNeg?.forEach(m => console.log(' -', m.name, ':', m.id));

  // 2. Count materials per page_number for each manufacturer
  console.log('\n=== Materials count per manufacturer ===');
  const { data: counts } = await supabase
    .from('materials')
    .select('manufacturer_id, page_number')
    .not('page_number', 'is', null)
    .limit(1000);
  
  if (counts) {
    const byMfg = {};
    for (const r of counts) {
      if (!byMfg[r.manufacturer_id]) byMfg[r.manufacturer_id] = new Set();
      byMfg[r.manufacturer_id].add(r.page_number);
    }
    for (const [mfgId, pages] of Object.entries(byMfg)) {
      const mfgName = mfgNeg?.find(m => m.id === mfgId)?.name || mfgId;
      console.log(`  ${mfgName}: ${pages.size} distinct pages, total rows in sample`);
    }
  }

  // 3. Check if same model_number appears on multiple pages
  console.log('\n=== Checking for multi-page model_numbers ===');
  const { data: allMaterials } = await supabase
    .from('materials')
    .select('id, model_number, page_number, catalog_url, manufacturer_id')
    .not('page_number', 'is', null)
    .not('model_number', 'is', null)
    .limit(2000);

  if (allMaterials) {
    const modelPageMap = {};
    for (const m of allMaterials) {
      const key = `${m.manufacturer_id}_${m.model_number}`;
      if (!modelPageMap[key]) modelPageMap[key] = [];
      modelPageMap[key].push({ page: m.page_number, url: m.catalog_url ? 'Y' : 'N', id: m.id });
    }

    const multiPage = Object.entries(modelPageMap).filter(([, pages]) => pages.length > 1);
    console.log(`Total model+mfg combinations: ${Object.keys(modelPageMap).length}`);
    console.log(`Models appearing on multiple pages: ${multiPage.length}`);
    
    if (multiPage.length > 0) {
      console.log('\nSample multi-page models:');
      multiPage.slice(0, 5).forEach(([key, pages]) => {
        const shortKey = key.split('_').slice(1).join('_');
        console.log(`  Model: ${shortKey} -> pages: ${pages.map(p => p.page).join(', ')}`);
      });
    } else {
      console.log('\nNo multi-page models found -> each model only stored ONCE in materials');
      console.log('This confirms the ingest is only storing 1 row per model (ignoring subsequent pages)');
    }
  }

  // 4. Check catalog_pages structure for negurosu
  console.log('\n=== catalog_pages for negurosu_denkou ===');
  const { data: catPages } = await supabase
    .from('catalog_pages')
    .select('id, manufacturer, page_number, page_image_url, pdf_drive_file_id, is_target')
    .ilike('manufacturer', '%negurosu%')
    .order('page_number', { ascending: true })
    .limit(10);
  
  if (!catPages || catPages.length === 0) {
    // Try different name
    const { data: catPages2 } = await supabase
      .from('catalog_pages')
      .select('id, manufacturer, page_number, page_image_url, pdf_drive_file_id, is_target')
      .limit(5);
    console.log('Sample catalog_pages (first 5):');
    catPages2?.forEach(p => console.log(`  manufacturer="${p.manufacturer}", page=${p.page_number}, is_target=${p.is_target}`));
  } else {
    console.log(`Found ${catPages.length} pages. First few:`);
    catPages.slice(0, 5).forEach(p => {
      console.log(`  page ${p.page_number}: is_target=${p.is_target}, image_url=${p.page_image_url ? 'Y' : 'N'}, pdf=${p.pdf_drive_file_id ? 'Y' : 'N'}`);
    });
  }

  // 5. Check if there's a unique constraint issue (by trying to find same model on different pages)
  console.log('\n=== Unique constraint check (sample negurosu materials) ===');
  const { data: negMats } = await supabase
    .from('materials')
    .select('id, model_number, page_number, catalog_url')
    .not('page_number', 'is', null)
    .order('page_number', { ascending: true })
    .limit(10);
  
  console.log('Sample materials:');
  negMats?.forEach(m => {
    console.log(`  model=${m.model_number}, page=${m.page_number}, catalog_url=${m.catalog_url ? m.catalog_url.substring(0, 60) : 'NULL'}`);
  });
}

run().catch(console.error);
