/**
 * 未来工業 materials バッチ削除スクリプト
 * Supabaseのstatement timeoutを回避するため、500件ずつ削除する
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function deleteBatch(manufacturerId, mfgName) {
    console.log(`\n-- ${mfgName} (${manufacturerId}) 削除開始 --`);
    let totalDeleted = 0;

    while (true) {
        // 500件ずつ取得して削除
        const { data: rows, error: fetchErr } = await supabase
            .from('materials')
            .select('id')
            .eq('manufacturer_id', manufacturerId)
            .limit(500);

        if (fetchErr) {
            console.error(`  取得エラー: ${fetchErr.message}`);
            break;
        }

        if (!rows || rows.length === 0) {
            console.log(`  -> 全件削除完了: ${totalDeleted}件 ✅`);
            break;
        }

        const ids = rows.map(r => r.id);
        const { error: delErr } = await supabase
            .from('materials')
            .delete()
            .in('id', ids);

        if (delErr) {
            console.error(`  削除エラー: ${delErr.message}`);
            break;
        }

        totalDeleted += ids.length;
        process.stdout.write(`\r  削除中: ${totalDeleted}件...`);
    }
}

async function main() {
    console.log('=== 未来工業 materials バッチ削除 ===');

    // 未来工業の全メーカーエントリを取得
    const { data: mfgs } = await supabase
        .from('manufacturers')
        .select('id, name')
        .eq('name', '未来工業');

    if (!mfgs?.length) {
        console.log('未来工業のメーカーエントリなし');
        return;
    }

    for (const m of mfgs) {
        await deleteBatch(m.id, m.name);
    }

    // 重複エントリを削除（materialsが0になった後）
    console.log('\n-- 重複メーカーエントリ削除 --');
    const KEEP_ID = '6eabfd98-daca-48da-ae6a-40843f41f62e';
    const DELETE_ID = '64e34e97-eac2-4478-b96a-0ad57533a8af';

    const { error: delMfgErr } = await supabase
        .from('manufacturers')
        .delete()
        .eq('id', DELETE_ID);

    if (delMfgErr) {
        console.error(`  メーカー削除エラー: ${delMfgErr.message}`);
    } else {
        console.log(`  重複エントリ ${DELETE_ID} 削除完了 ✅`);
    }

    // パナソニック page_number リセット（バッチで）
    console.log('\n-- パナソニック page_number バッチリセット --');
    const { data: panMfg } = await supabase
        .from('manufacturers')
        .select('id')
        .eq('name', 'パナソニック')
        .limit(1);

    if (panMfg?.length) {
        const panId = panMfg[0].id;
        let panTotal = 0;

        while (true) {
            const { data: panRows } = await supabase
                .from('materials')
                .select('id')
                .eq('manufacturer_id', panId)
                .not('page_number', 'is', null)
                .limit(500);

            if (!panRows?.length) break;

            const pIds = panRows.map(r => r.id);
            await supabase.from('materials').update({ page_number: null }).in('id', pIds);
            panTotal += pIds.length;
            process.stdout.write(`\r  パナソニック初期化中: ${panTotal}件...`);
        }
        console.log(`\n  パナソニック page_number リセット完了 ✅`);
    }

    // 最終確認
    console.log('\n=== 最終状態確認 ===');
    const { data: allMfgs } = await supabase.from('manufacturers').select('id, name').order('name');
    for (const m of allMfgs) {
        const { count } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', m.id);
        console.log(`  ${m.name}: ${count}件`);
    }

    console.log('\n=== 完了！ ===');
    console.log('次のコマンドでAI抽出バッチを実行してください:');
    console.log('  /usr/local/bin/node scripts/run_catalog_batch.mjs');
}

main().catch(console.error);
