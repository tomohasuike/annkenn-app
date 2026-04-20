import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('=== catalog_pages 未来工業 診断 ===\n');

    // 総件数
    const { count: total } = await supabase
        .from('catalog_pages')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer', '未来工業');
    console.log(`総ページ数: ${total}`);

    // page_image_url が入っている件数
    const { count: withImage } = await supabase
        .from('catalog_pages')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer', '未来工業')
        .not('page_image_url', 'is', null);
    console.log(`page_image_url あり: ${withImage}`);
    console.log(`page_image_url なし: ${total - withImage}`);

    // is_target の内訳
    const { count: isTargetTrue } = await supabase
        .from('catalog_pages')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer', '未来工業')
        .eq('is_target', true);
    console.log(`is_target = true (製品ページ): ${isTargetTrue}`);

    const { count: isTargetNull } = await supabase
        .from('catalog_pages')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer', '未来工業')
        .is('is_target', null);
    console.log(`is_target = null (未判定): ${isTargetNull}`);

    // サンプル（image_urlありのもの）
    console.log('\n--- page_image_url ありのサンプル3件 ---');
    const { data: sample } = await supabase
        .from('catalog_pages')
        .select('page_number, drive_file_id, page_image_url, is_target')
        .eq('manufacturer', '未来工業')
        .not('page_image_url', 'is', null)
        .limit(3);
    console.log(JSON.stringify(sample, null, 2));

    // materials の未来工業の状況
    console.log('\n=== materials 未来工業 診断 ===');
    const { count: matTotal } = await supabase
        .from('materials')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer_id', (await supabase.from('manufacturers').select('id').eq('name', '未来工業').limit(1)).data?.[0]?.id);
    console.log(`未来工業の製品数: ${matTotal}`);

    const { count: matWithPage } = await supabase
        .from('materials')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer_id', (await supabase.from('manufacturers').select('id').eq('name', '未来工業').limit(1)).data?.[0]?.id)
        .not('page_number', 'is', null);
    console.log(`page_number セット済み: ${matWithPage}`);
    console.log(`page_number なし (NULL): ${matTotal - matWithPage}`);
}

run().catch(console.error);
