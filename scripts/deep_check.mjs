import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('=== catalog_pages に存在するメーカー名（実際の値）===');
    const { data: mfgNames } = await supabase
        .from('catalog_pages')
        .select('manufacturer, catalog_name')
        .order('manufacturer');
    const unique = [...new Map(mfgNames.map(r => [r.manufacturer + '|||' + r.catalog_name, r])).values()];
    unique.forEach(r => console.log(`  manufacturer="${r.manufacturer}"  catalog_name="${r.catalog_name}"`));

    console.log('\n=== manufacturers テーブルの全メーカー名（実際の値）===');
    const { data: mfgs } = await supabase.from('manufacturers').select('id, name').order('name');
    mfgs.forEach(m => console.log(`  id=${m.id}  name="${m.name}"`));

    console.log('\n=== materials に page_number がある件数（全メーカー）===');
    for (const m of mfgs) {
        const { count: total } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', m.id);
        if (total === 0) continue;
        const { count: withPage } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', m.id)
            .not('page_number', 'is', null);
        // catalog_urlのサンプルも確認
        const { data: sample } = await supabase
            .from('materials')
            .select('page_number, catalog_url')
            .eq('manufacturer_id', m.id)
            .not('page_number', 'is', null)
            .limit(1);
        const sampleUrl = sample?.[0]?.catalog_url || 'N/A';
        const samplePage = sample?.[0]?.page_number || 'N/A';
        console.log(`  "${m.name}": ${withPage}/${total} page_number付き (例: page=${samplePage}, url=${sampleUrl.substring(0,60)})`);
    }
}

run().catch(console.error);
