import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

// catalog_pages の全メーカー名（ページネーションで確実に全件取得）
console.log('=== catalog_pages の全ユニークメーカー ===');
let allPages = [];
let from = 0;
const step = 1000;
while (true) {
    const { data } = await s.from('catalog_pages').select('manufacturer').range(from, from + step - 1);
    if (!data || data.length === 0) break;
    allPages.push(...data);
    if (data.length < step) break;
    from += step;
}
const mfgCounts = {};
for (const r of allPages) {
    mfgCounts[r.manufacturer] = (mfgCounts[r.manufacturer] || 0) + 1;
}
Object.entries(mfgCounts).sort().forEach(([name, count]) => {
    console.log(`  "${name}": ${count}ページ`);
});

// パナソニックのpage_number付きmaterialsのサンプル確認
console.log('\n=== パナソニック page_number付き materials サンプル ===');
const { data: mfg } = await s.from('manufacturers').select('id').eq('name', 'パナソニック').limit(1);
const mfgId = mfg?.[0]?.id;
const { data: panaSample } = await s.from('materials')
    .select('model_number, page_number, catalog_url')
    .eq('manufacturer_id', mfgId)
    .not('page_number', 'is', null)
    .limit(5);
console.log(JSON.stringify(panaSample, null, 2));
