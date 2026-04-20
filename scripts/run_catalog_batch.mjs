/**
 * run_catalog_batch.mjs
 * =========================================================
 * 全メーカーのカタログ製品データを一括AI抽出してDBに保存する。
 * 進捗ファイル(catalog_batch_progress.json)によって中断→再開が可能。
 * 2度目の実行は不要な設計。
 * =========================================================
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'supabase/functions/.env' });

// === 設定 ===
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY || process.env.VITE_GOOGLE_API_KEY
);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const PROGRESS_FILE = path.resolve('./scripts/catalog_batch_progress.json');

// 処理順：小さいカタログから（失敗しても損失が少ない順）
const MFG_LIST = [
    { name: '古河電気工業', catalogName: '管路カタログ' },
    { name: '内外電機',     catalogName: '総合カタログ2024' },
    { name: '日東工業',     catalogName: 'SK-25A' },
    { name: '三菱電機',     catalogName: '総合カタログ' },
    { name: '未来工業',     catalogName: '総合カタログ2025' },
];

// === プロンプト ===
const PREFILTER_PROMPT = `
あなたはカタログの製品ページ判定AIです。
この画像が製品カタログ情報のページであるか、単なる目次や表紙であるかを見分けます。

以下の【いずれか1つでも】満たす場合は、絶対に "YES" と出力してください。
1. 表（テーブル形式）が存在し、製品の「型番」「寸法」「重量」「価格」のどれか一つでもリスト化されている。
2. 製品の図面や写真と一緒に、複数の仕様が並べて書かれている。
3. カタログの製品ラインナップを示す情報が少しでも含まれている。

以下の【すべて】を満たす場合のみ "NO" と出力してください。
1. 製品リストや型番の記載が【一切】ない。
2. 単なる目次、見出し、表紙、注意書き、技術解説の文章のみである。

回答は "YES" または "NO" の単語のみ出力してください。それ以外の文字は含めないでください。
`;

const EXTRACTION_PROMPT = `
あなたは電気設備の専門カタログデータ抽出システムです。
ページ画像を解析し、記載されているすべての製品アイテムを以下のJSON配列形式で抽出してください。

[
  {
    "model_number": "製品型番・品番",
    "name": "製品名またはシリーズ名",
    "description": "製品の簡単な説明（概要、寸法、材質など）",
    "standard_price": 1000,
    "width_mm": 100,
    "height_mm": 50,
    "depth_mm": 20
  }
]

価格はカンマ抜きの数値型（標準価格がない場合はnull）。
寸法（幅・高さ・奥行き）はmm単位で数値型。分からなければnull。
出力は有効なJSONのみ。マークダウン(\`\`\`json等)なしでお願いします。
`;

// === Google Drive API ===
let driveService = null;

async function initDrive() {
    if (driveService) return;
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: GOOGLE_SA_EMAIL, private_key: GOOGLE_SA_PRIVATE_KEY },
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    driveService = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive API 初期化完了');
}

/**
 * ページ画像をBase64でダウンロード
 * 
 * 注意: drive_file_idはJPEGではなくPDFが格納されている場合があるため、
 * page_image_url（公開JPEGリンク）をプライマリとして使用する。
 * 
 * @returns { base64: string, mimeType: string }
 */
async function getImageData(page) {
    // プライマリ: page_image_url (公開JPEGリンク、認証不要)
    if (page.page_image_url) {
        try {
            const res = await fetch(page.page_image_url, { redirect: 'follow' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentType = res.headers.get('content-type') || 'image/jpeg';
            if (!contentType.includes('image') && !contentType.includes('pdf')) {
                throw new Error(`非画像コンテンツ: ${contentType}`);
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 1000) throw new Error(`ファイルサイズが小さすぎます: ${buf.length}bytes`);
            const mimeType = contentType.split(';')[0].trim();
            return { base64: buf.toString('base64'), mimeType };
        } catch (urlErr) {
            console.log(`  -> page_image_url失敗: ${urlErr.message}`);
        }
    }

    // セカンダリ: Drive API（drive_file_idがPDFの場合はPDFとして送信）
    if (page.drive_file_id) {
        try {
            await initDrive();
            const meta = await driveService.files.get(
                { fileId: page.drive_file_id, fields: 'mimeType', supportsAllDrives: true }
            );
            const fileMimeType = meta.data.mimeType || 'application/pdf';

            const res = await driveService.files.get(
                { fileId: page.drive_file_id, alt: 'media', supportsAllDrives: true },
                { responseType: 'arraybuffer' }
            );
            const buf = Buffer.isBuffer(res.data)
                ? res.data
                : Buffer.from(new Uint8Array(res.data));
            return { base64: buf.toString('base64'), mimeType: fileMimeType };
        } catch (driveErr) {
            console.log(`  -> Drive API失敗: ${driveErr.message}`);
        }
    }

    throw new Error('page_image_urlもdrive_file_idも取得できませんでした');
}

// === ユーティリティ ===
async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
    return { completedManufacturers: [], processedPageIds: {} };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * レートリミット対応付きAI呼び出し
 */
async function callAI(parts, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await model.generateContent(parts);
        } catch (err) {
            const isRateLimit = err.status === 429 || (err.message || '').includes('429') || (err.message || '').includes('RESOURCE_EXHAUSTED');
            const waitMs = isRateLimit ? 20000 * attempt : 5000 * attempt;
            console.log(`  ⏳ AI呼び出し失敗(${attempt}/${maxRetries}): ${err.message}. ${waitMs / 1000}秒待機...`);
            await sleep(waitMs);
            if (attempt === maxRetries) throw err;
        }
    }
}

// ============================================================
// メーカー毎の処理
// ============================================================
async function processManufacturer(mfgInfo, progress) {
    const { name: mfgName } = mfgInfo;

    // 完了済みならスキップ
    if (progress.completedManufacturers.includes(mfgName)) {
        console.log(`\n⏩ ${mfgName}: 完了済みのためスキップ`);
        return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏭 ${mfgName} 処理開始`);
    console.log('='.repeat(60));

    // manufacturer_id取得
    const { data: mData } = await supabase
        .from('manufacturers')
        .select('id')
        .eq('name', mfgName)
        .limit(1);

    if (!mData?.length) {
        console.error(`❌ ${mfgName} のメーカーIDが見つかりません`);
        return;
    }
    const manufacturer_id = mData[0].id;

    // 未処理ページ取得（is_target IS NULL = まだ処理していないページ）
    const { data: pages, error: pageErr } = await supabase
        .from('catalog_pages')
        .select('id, page_number, drive_file_id, page_image_url, pdf_drive_file_id')
        .eq('manufacturer', mfgName)
        .is('is_target', null)
        .order('page_number', { ascending: true });

    if (pageErr) {
        console.error(`❌ ページ取得エラー: ${pageErr.message}`);
        return;
    }

    if (!pages || pages.length === 0) {
        console.log(`✅ ${mfgName}: 処理済みページなし（全ページ完了）`);
        progress.completedManufacturers.push(mfgName);
        saveProgress(progress);
        return;
    }

    // ローカルの進捗で絞り込み（DB更新が間に合わなかった場合のセーフガード）
    const localProcessed = new Set(progress.processedPageIds[mfgName] || []);
    const pendingPages = pages.filter(p => !localProcessed.has(p.id));

    console.log(`📄 処理対象: ${pendingPages.length}ページ（全${pages.length}ページ中）`);

    let extractedTotal = 0;

    for (let i = 0; i < pendingPages.length; i++) {
        const page = pendingPages[i];
        const progress_label = `[${i + 1}/${pendingPages.length}] Page ${page.page_number}`;

        console.log(`\n${'-'.repeat(40)}`);
        console.log(`🔄 ${progress_label} (${mfgName})`);

        try {
            // 画像取得
            let imageData;
            try {
                imageData = await getImageData(page);
            } catch (imgErr) {
                console.log(`  ⚠️ 画像取得失敗: ${imgErr.message}。スキップします。`);
                localProcessed.add(page.id);
                continue;
            }

            const imagePart = {
                inlineData: { data: imageData.base64, mimeType: imageData.mimeType }
            };

            // === フェーズA: 製品ページ判定 ===
            const filterResult = await callAI([{ text: PREFILTER_PROMPT }, imagePart]);
            const filterText = filterResult.response.text().trim().toUpperCase();
            const isTarget = filterText.includes('YES');

            console.log(`  🔎 判定: ${isTarget ? 'YES（製品ページ）' : 'NO（スキップ）'}`);

            // catalog_pagesのis_targetを更新
            await supabase
                .from('catalog_pages')
                .update({ is_target: isTarget })
                .eq('id', page.id);

            if (isTarget) {
                await sleep(2000); // APIレート制限対応

                // === フェーズB: 製品データ抽出 ===
                const extractResult = await callAI([{ text: EXTRACTION_PROMPT }, imagePart]);
                let rawText = extractResult.response.text()
                    .trim()
                    .replace(/```json/g, '')
                    .replace(/```/g, '')
                    .trim();

                // JSONの先頭「[」を確保
                if (!rawText.startsWith('[')) {
                    const startIdx = rawText.indexOf('[');
                    if (startIdx >= 0) rawText = rawText.slice(startIdx);
                }

                try {
                    const items = JSON.parse(rawText);
                    if (Array.isArray(items) && items.length > 0) {
                        // カタログURLの構築（単ページPDFがあればそれを使用）
                        const catalogUrl = page.pdf_drive_file_id
                            ? `https://drive.google.com/file/d/${page.pdf_drive_file_id}/view`
                            : (page.page_image_url || '');

                        const insertData = items.map(item => ({
                            manufacturer_id,
                            model_number: (item.model_number || 'UNKNOWN').substring(0, 200),
                            name: (item.name || '').substring(0, 500),
                            description: (item.description || '').substring(0, 2000),
                            standard_price: typeof item.standard_price === 'number' ? item.standard_price : null,
                            width_mm: typeof item.width_mm === 'number' ? item.width_mm : null,
                            height_mm: typeof item.height_mm === 'number' ? item.height_mm : null,
                            depth_mm: typeof item.depth_mm === 'number' ? item.depth_mm : null,
                            page_number: page.page_number,
                            catalog_url: catalogUrl,
                        }));

                        const { error: insertErr } = await supabase
                            .from('materials')
                            .insert(insertData);

                        if (insertErr) {
                            // ON CONFLICT等のエラーは警告のみ（重複防止）
                            console.log(`  ⚠️ INSERT: ${insertErr.message}`);
                        } else {
                            console.log(`  ✅ ${items.length}件 登録完了`);
                            extractedTotal += items.length;
                        }
                    } else {
                        console.log(`  - 製品データなし（0件）`);
                    }
                } catch (jsonErr) {
                    console.log(`  ⚠️ JSONパースエラー: ${jsonErr.message}`);
                    console.log(`     AIレスポンス(先頭100文字): ${rawText.substring(0, 100)}`);
                }
            }

            // 進捗保存
            localProcessed.add(page.id);
            if (!progress.processedPageIds[mfgName]) {
                progress.processedPageIds[mfgName] = [];
            }
            progress.processedPageIds[mfgName] = [...localProcessed];
            saveProgress(progress);

            // レートリミット対策（3秒インターバル）
            await sleep(3000);

        } catch (err) {
            console.error(`  ❌ エラー (Page ${page.page_number}): ${err.message}`);
            // エラーが起きてもスキップして続行（再実行時に再挑戦可能）
            await sleep(5000);
        }
    }

    console.log(`\n🎉 ${mfgName} 完了！ 合計抽出: ${extractedTotal}件`);
    progress.completedManufacturers.push(mfgName);
    saveProgress(progress);
}

// ============================================================
// メイン処理
// ============================================================
async function main() {
    console.log('');
    console.log('🚀 カタログ一括AI抽出バッチ 開始');
    console.log('   中断してもこのコマンドを再実行すれば続きから再開できます');
    console.log('');

    const progress = loadProgress();

    for (const mfgInfo of MFG_LIST) {
        await processManufacturer(mfgInfo, progress);
    }

    console.log('');
    console.log('🎉🎉🎉 全メーカーのAI抽出が完了しました！');
    console.log('');

    // 最終サマリー
    console.log('=== 最終結果サマリー ===');
    for (const { name } of MFG_LIST) {
        const { count } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('manufacturer_id', (await supabase.from('manufacturers').select('id').eq('name', name).single()).data?.id);
        console.log(`  ${name}: ${count ?? '?'}件`);
    }
}

main().catch(err => {
    console.error('\n❌ 致命的エラー:', err.message);
    process.exit(1);
});
