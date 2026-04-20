import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('=== 全メーカー カタログ抽出状況 ===\n');

    // 全メーカー取得
    const { data: manufacturers } = await supabase.from('manufacturers').select('id, name').order('name');

    for (const mfg of manufacturers) {
        // catalog_pages の状況
        const { count: totalPages } = await supabase
            .from('catalog_pages')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer', mfg.name);

        const { count: pagesWithImage } = await supabase
            .from('catalog_pages')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer', mfg.name)
            .not('page_image_url', 'is', null);

        // materials の状況
        const { count: totalMaterials } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', mfg.id);

        const { count: withPageNum } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', mfg.id)
            .not('page_number', 'is', null);

        const linked = totalMaterials > 0 ? Math.round((withPageNum / totalMaterials) * 100) : 0;
        const status = linked === 100 ? '✅' : linked > 0 ? '⚠️' : '❌';

        console.log(`${status} ${mfg.name}`);
        console.log(`   カタログページ画像: ${pagesWithImage}/${totalPages} ページ, 製品: ${totalMaterials}件 (page_number付き: ${withPageNum}件 = ${linked}%)\n`);
    }
}

run().catch(console.error);
