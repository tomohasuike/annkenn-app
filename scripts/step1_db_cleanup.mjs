/**
 * STEP 1: DB Cleanup Script (Fixed)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const CATALOG_SQL_PATH = path.resolve('./scripts/catalogs_insert.sql');

// ============================================================
// 1. 未来工業 materials を全削除（重複削除の前に行う）
// ============================================================
async function step1_deleteMiraiMaterials() {
    console.log('\n=== [1/5] 未来工業 materials 全削除 ===');

    const { data: mfgs } = await supabase
        .from('manufacturers')
        .select('id')
        .eq('name', '未来工業');

    if (!mfgs?.length) {
        console.log('  未来工業が見つかりません。スキップ。');
        return;
    }

    const ids = mfgs.map(m => m.id);
    console.log(`  対象メーカーID: ${ids.join(', ')}`);

    for (const id of ids) {
        const { count } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', id);

        console.log(`  ID ${id}: ${count}件を削除中...`);

        const { error } = await supabase
            .from('materials')
            .delete()
            .eq('manufacturer_id', id);

        if (error) {
            console.error(`  エラー: ${error.message}`);
        } else {
            console.log(`  -> ${count}件 削除完了 ✅`);
        }
    }

    // catalog_pages の is_target もリセット（再処理可能にする）
    await supabase
        .from('catalog_pages')
        .update({ is_target: null })
        .eq('manufacturer', '未来工業');
    console.log('  catalog_pages.is_target を NULL にリセット ✅');
}

// ============================================================
// 2. 重複メーカー削除
// ============================================================
async function step2_deleteDuplicates() {
    console.log('\n=== [2/5] 重複メーカー削除 ===');

    // 削除すべきID（materialが0のものを削除）
    const toDelete = [
        // ネグロス電工 空エントリ（すでに削除済みかもしれないが冪等に実行）
        '8ccc855e-cc29-4c69-bf12-02d1902db98d',
        // 未来工業 重複（材料はstep1で削除済み）
        '64e34e97-eac2-4478-b96a-0ad57533a8af',
        // 古河電気工業 重複
        '1ca33109-838a-4984-8073-31333085b88c',
        // テスト用メーカー
        'ab545653-8bd0-4a0f-bb0a-4d394eca509e',
        '50de1636-956a-42a3-ab32-45a34f642d33',
        '93429184-dd51-4b2f-b620-31efde10794c',
        '4b33ac1c-20a6-4b5b-b797-e686f8fc378b',
    ];

    for (const id of toDelete) {
        // まずmaterialsが残っていないか確認
        const { count } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', id);

        if (count > 0) {
            console.log(`  ID ${id}: ${count}件のmaterialsあり → 先に削除`);
            await supabase.from('materials').delete().eq('manufacturer_id', id);
        }

        const { error } = await supabase.from('manufacturers').delete().eq('id', id);
        if (error) {
            if (error.message.includes('does not exist') || error.message.includes('no rows')) {
                console.log(`  ID ${id}: 既に削除済み`);
            } else {
                console.error(`  ID ${id}: 削除エラー: ${error.message}`);
            }
        } else {
            console.log(`  ID ${id}: 削除完了 ✅`);
        }
    }
}

// ============================================================
// 3. 現状確認
// ============================================================
async function step3_verify() {
    console.log('\n=== [3/5] 整理後のメーカー確認 ===');
    const { data: mfgs } = await supabase.from('manufacturers').select('id, name').order('name');
    for (const m of mfgs) {
        const { count } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', m.id);
        console.log(`  ${m.name}: ${count}件 (ID: ${m.id.substring(0, 8)}...)`);
    }
}

// ============================================================
// 4. パナソニック page_number を NULL にリセット
// ============================================================
async function step4_clearPanasonic() {
    console.log('\n=== [4/5] パナソニック page_number 初期化 ===');
    const { data: mfgData } = await supabase
        .from('manufacturers')
        .select('id')
        .eq('name', 'パナソニック')
        .limit(1);

    if (!mfgData?.length) { console.log('  パナソニック未検出。スキップ。'); return; }

    const { error, count } = await supabase
        .from('materials')
        .update({ page_number: null })
        .eq('manufacturer_id', mfgData[0].id)
        .not('page_number', 'is', null)
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error(`  エラー: ${error.message}`);
    } else {
        console.log('  パナソニック page_number を全件 NULL に初期化完了 ✅');
    }
}

// ============================================================
// 5. 富士電機/IDEC page_number を catalogs_insert.sql から更新
// ============================================================
async function step5_updateFujiIdec() {
    console.log('\n=== [5/5] 富士電機/IDEC page_number 更新 ===');

    const { data: fujiMfg } = await supabase.from('manufacturers').select('id').eq('name', '富士電機').limit(1);
    const { data: idecMfg } = await supabase.from('manufacturers').select('id').eq('name', 'IDEC').limit(1);

    if (!fujiMfg?.length || !idecMfg?.length) {
        console.error('  富士電機またはIDECのメーカーIDが見つかりません');
        return;
    }
    const fujiId = fujiMfg[0].id;
    const idecId = idecMfg[0].id;
    console.log(`  富士電機 ID: ${fujiId.substring(0, 8)}...`);
    console.log(`  IDEC ID: ${idecId.substring(0, 8)}...`);

    console.log('  SQLファイル読み込み中...');
    const sqlContent = fs.readFileSync(CATALOG_SQL_PATH, 'utf8');
    const lines = sqlContent.split('\n');

    const updates = [];
    for (const line of lines) {
        if (!line.startsWith('INSERT INTO materials')) continue;
        if (!line.includes('page_number')) continue;

        let mfgId = null;
        // 富士電機の検索（UTF-8直接）
        if (line.includes('\u5bcc\u58eb\u96fb\u6a5f')) {
            mfgId = fujiId;
        } else if (line.includes("'IDEC'")) {
            mfgId = idecId;
        } else {
            continue;
        }

        // model_number抽出: LIMIT 1), 'MODEL_NUMBER' の形式
        const modelMatch = line.match(/LIMIT 1\), '([^']+)'/);
        // page_number抽出: 末尾の数値
        const pageMatch = line.match(/, (\d+)\);\s*$/);

        if (modelMatch && pageMatch) {
            updates.push({
                manufacturer_id: mfgId,
                model_number: modelMatch[1],
                page_number: parseInt(pageMatch[1])
            });
        }
    }

    console.log(`  解析完了: ${updates.length}件の更新データ`);

    if (updates.length === 0) {
        console.log('  更新データなし。（SQLファイルにpage_number付きの富士電機/IDECデータがない可能性）');
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < updates.length; i++) {
        const u = updates[i];
        const { error } = await supabase
            .from('materials')
            .update({ page_number: u.page_number })
            .eq('manufacturer_id', u.manufacturer_id)
            .eq('model_number', u.model_number);

        if (error) {
            errorCount++;
        } else {
            successCount++;
        }

        if ((i + 1) % 100 === 0 || i + 1 === updates.length) {
            process.stdout.write(`\r  進捗: ${i + 1}/${updates.length} (成功:${successCount} エラー:${errorCount})`);
        }
    }
    console.log(`\n  完了 ✅`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('\n=== STEP 1: DB整備スクリプト開始 ===\n');

    await step1_deleteMiraiMaterials();
    await step2_deleteDuplicates();
    await step3_verify();
    await step4_clearPanasonic();
    await step5_updateFujiIdec();

    console.log('\n=== STEP 1 完了 ===');
    console.log('\n次のコマンドでAI抽出バッチを実行してください:');
    console.log('  /usr/local/bin/node scripts/run_catalog_batch.mjs');
}

main().catch(console.error);
