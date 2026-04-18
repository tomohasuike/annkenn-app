import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'supabase/functions/.env' });

// ==========================================
// 1. 設定事項
// ==========================================
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// プレフィルタ(YES/NO判定)とデータ抽出どちらも Gemini 2.5 Flashで十分可能なら統一、精度を求めるならPro
// 今回は高速・安価なFlashを使用
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Google Drive 設定
const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const PARENT_FOLDER_ID = '17DoPV9o8mLQirXFLKsJ3ojHm6W_lrQUf'; 
let driveService = null;
let uploadFolderId = null;

// テスト用の制御
const TARGET_MFG = 'ネグロス電工';
const CATALOG_NAME_LIKE = '%電設一般%'; 
const SOURCE_PDF_PATH = '/Users/hasuiketomoo/Downloads/カタログ/catalog_densetsu-kai.pdf';
// 以下は本番用設定 

// ==========================================
// プロンプト
// ==========================================
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
寸法（幅・高さ・奥行き）はmm単位で数値型で推測して入れるか、分からなければnull。
出力は有効なJSONのみ出力してください。マークダウン( \`\`\`json など )なしでお願いします。
`;


// ==========================================
// ユーティリティ
// ==========================================
async function initGoogleDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: GOOGLE_SA_EMAIL, private_key: GOOGLE_SA_PRIVATE_KEY },
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    driveService = google.drive({ version: 'v3', auth });

    // 1. Kensack_Local_Pipeline_Catalogs 作成
    let res = await driveService.files.list({
        q: `'${PARENT_FOLDER_ID}' in parents and name='Kensack_Local_Pipeline_Catalogs' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true
    });
    let rootFolderId;
    if (res.data.files.length > 0) {
        rootFolderId = res.data.files[0].id;
    } else {
        const folderRes = await driveService.files.create({
            resource: { name: 'Kensack_Local_Pipeline_Catalogs', mimeType: 'application/vnd.google-apps.folder', parents: [PARENT_FOLDER_ID] },
            fields: 'id', supportsAllDrives: true
        });
        rootFolderId = folderRes.data.id;
    }

    // 2. ターゲットメーカー用 サブフォルダ
    res = await driveService.files.list({
        q: `'${rootFolderId}' in parents and name='Pipeline_${TARGET_MFG}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true
    });
    if (res.data.files.length > 0) {
        uploadFolderId = res.data.files[0].id;
    } else {
        const folderRes = await driveService.files.create({
            resource: { name: `Pipeline_${TARGET_MFG}`, mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] },
            fields: 'id', supportsAllDrives: true
        });
        uploadFolderId = folderRes.data.id;
        // 誰でも閲覧可能にする
        await driveService.permissions.create({
            fileId: uploadFolderId,
            supportsAllDrives: true,
            requestBody: { role: 'reader', type: 'anyone' }
        });
    }
}

async function uploadFileToDrive(fileName, filePath, mimeType) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await driveService.files.create({
                resource: { name: fileName, parents: [uploadFolderId] },
                media: { mimeType, body: fs.createReadStream(filePath) },
                fields: 'id, webViewLink, webContentLink',
                supportsAllDrives: true
            });
            return res.data; // { id, webViewLink, webContentLink }
        } catch (err) {
            console.log(`  -> Drive Upload error. Attempt ${attempt}/3 : ${err.message}`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    throw new Error("Failed to upload after 3 attempts");
}


// ==========================================
// メイン処理
// ==========================================
async function main() {
    console.log(`🚀 ローカル完結型 AI抽出パイプライン開始 (Target: ${TARGET_MFG})`);
    
    // 1. Google Driveの準備
    await initGoogleDrive();
    console.log(`✅ Google Drive API 準備完了 (保存先: ${uploadFolderId})`);

    // 2. DBから処理すべきページ（ターゲットメーカーで未判定）を取得
    const { data: pages, error } = await supabase
        .from('catalog_pages')
        .select('*')
        .eq('manufacturer', TARGET_MFG)
        .like('catalog_name', CATALOG_NAME_LIKE)
        .is('is_target', null) // 未判定のページのみ取得
        .order('page_number', { ascending: true }); // FULL THROTTLE: LIMIT解除

    if (error || !pages || pages.length === 0) {
        console.error("❌ 対象ページが存在しない、またはエラー:", error);
        return;
    }
    console.log(`📄 対象ページ数: ${pages.length} ページ`);

    // 3. ローカルの元PDFをメモリに読み込む
    console.log(`📥 読み込み中: ${SOURCE_PDF_PATH} ...`);
    if (!fs.existsSync(SOURCE_PDF_PATH)) {
        console.error(`❌ ローカルPDFが見つかりません!! ${SOURCE_PDF_PATH}`);
        return;
    }
    const sourceBytes = fs.readFileSync(SOURCE_PDF_PATH);
    const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    
    // メーカーIDの取得
    const { data: mData } = await supabase.from('manufacturers').select('id').eq('name', TARGET_MFG).limit(1);
    const manufacturer_id = mData?.[0]?.id;
    if (!manufacturer_id) {
        console.error("❌ メーカーIDが見つかりません");
        return;
    }

    // 4. メインループ
    for (const page of pages) {
        // PDFのインデックスは 0-based
        const pageIndex = page.page_number - 1; 
        console.log(`\n---------------------------------`);
        console.log(`🔄 Processing Page ${page.page_number} (Index: ${pageIndex})`);

        if (pageIndex < 0 || pageIndex >= sourceDoc.getPageCount()) {
            console.error(`⚠️ ページインデックス範囲外です。スキップします`);
            continue;
        }

        const tempJpgPath = `tmp_${page.page_number}.jpg`;
        const tempPdfPath = `tmp_${page.page_number}.pdf`;

        try {
            // ======
            //  MAC NATIVE HIGHER-RES RENDER (SWIFT)
            // ======
            // This replaces pdf-lib generating corrupted single-page PDFs and sips blurry rendering
            console.log(`🖼️ [macOS Native] PDFKitで ${page.page_number} ページ目 (Index: ${pageIndex}) を高画質JPEGに変換中...`);
            execSync(`swift scripts/mac_pdf_to_jpg.swift "${SOURCE_PDF_PATH}" ${pageIndex} "${tempJpgPath}"`);

            // To mimic the local pipeline Drive upload, we still need the single page PDF
            // The swift script ONLY output JPG right now. So we must extract the single PDF using pdf-lib just for the raw Drive backup (not for AI reading)
            const singlePdfDoc = await PDFDocument.create();
            const [copiedPage] = await singlePdfDoc.copyPages(sourceDoc, [pageIndex]);
            singlePdfDoc.addPage(copiedPage);
            const pdfBytes = await singlePdfDoc.save();
            fs.writeFileSync(tempPdfPath, pdfBytes);
            
            // File -> Base64
            const imageBase64 = fs.readFileSync(tempJpgPath).toString('base64');
            const imagePart = { inlineData: { data: imageBase64, mimeType: "image/jpeg" } };

            async function generateWithRetry(promptArray, maxRetries = 5) {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        return await aiModel.generateContent(promptArray);
                    } catch (err) {
                        const status = err.status || err.response?.status;
                        if (status === 429 || err.message.includes('429') || err.message.includes('quota')) {
                            console.log(`  👉 Gemini API レート制限(429)。${10 * attempt}秒待機してリトライします... (${attempt}/${maxRetries})`);
                            await new Promise(r => setTimeout(r, 10000 * attempt));
                        } else {
                            console.log(`  👉 Gemini API 通常エラー。${5 * attempt}秒待機してリトライします... (${attempt}/${maxRetries}) - ${err.message}`);
                            await new Promise(r => setTimeout(r, 5000 * attempt));
                        }
                        if (attempt === maxRetries) throw err;
                    }
                }
            }

            // [B] AIプレフィルタリング (YES/NO)
            console.log("🔎 AI判定中 (プレフィルタ)...");
            const filterResult = await generateWithRetry([PREFILTER_PROMPT, imagePart]);
            const filterResponse = filterResult.response.text().trim().toUpperCase();

            const isTarget = filterResponse.includes('YES');
            if (isTarget) {
                console.log(`🎯 判定: YES (抽出対象です)`);
            } else {
                console.log(`🗑️ 判定: NO (スキップします) -> AI出力: ${filterResponse}`);
            }

            let extractedItems = [];
            // [C] AIデータ抽出 (YES の場合のみ)
            if (isTarget) {
                console.log("⚙️ 製品データ抽出処理を実行中...");
                const extractResult = await generateWithRetry([EXTRACTION_PROMPT, imagePart]);
                let rawText = extractResult.response.text().trim();
                rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

                try {
                    extractedItems = JSON.parse(rawText);
                    console.log(`📦 抽出された製品数: ${extractedItems.length}件`);
                } catch (e) {
                    console.error("⚠️ AIの出力が正しいJSONではありませんでした:", rawText);
                }
            }

            // [D] Google Drive アップロード
            console.log("☁️ Google Driveへ実体ファイル(PDF/JPEG)をアップロード中...");
            const pdfDriveRes = await uploadFileToDrive(`page_${page.page_number}.pdf`, tempPdfPath, 'application/pdf');
            const jpgDriveRes = await uploadFileToDrive(`page_${page.page_number}.jpg`, tempJpgPath, 'image/jpeg');
            console.log(`✅ アップロード完了 -> JPEG URL: ${jpgDriveRes.webViewLink}`);

            // [E] DB保存
            // ① catalog_pages の更新
            const { error: updateErr } = await supabase.from('catalog_pages')
                .update({ 
                    is_target: isTarget,
                    drive_file_id: pdfDriveRes.id,
                    page_image_url: jpgDriveRes.webViewLink     // 永続的なJPEGリンク
                })
                .eq('id', page.id);
            if (updateErr) console.error("❌ catalog_pages UPDATE ERROR:", updateErr.message);
            
            // ② materials の登録 (抽出できた場合のみ)
            if (extractedItems.length > 0) {
                const insertData = extractedItems.map(item => ({
                    manufacturer_id: manufacturer_id,
                    model_number: item.model_number || 'UNKNOWN',
                    name: item.name || '',
                    description: item.description || '',
                    standard_price: item.standard_price || null,
                    width_mm: item.width_mm || null,
                    height_mm: item.height_mm || null,
                    depth_mm: item.depth_mm || null,
                    catalog_url: pdfDriveRes.webViewLink, // 抽出の根拠として実体PDFのリンクを保持
                    page_number: page.page_number
                }));

                const { error: insertError } = await supabase.from('materials').insert(insertData);
                if (insertError) {
                    console.error("❌ DBインサートエラー:", insertError);
                } else {
                    console.log("✨ データベースに製品データを登録完了");
                }
            }

        } catch (err) {
            console.error(`❌ Page ${page.page_number} で致命的なエラーにより停止しました:`, err.message);
            console.log("=== 異常終了 ===");
            process.exit(1);
        } finally {
            // クリーンアップ
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
            if (fs.existsSync(tempJpgPath)) fs.unlinkSync(tempJpgPath);
        }
    }

    console.log(`\n🎉 ローカル抽出テスト完了！`);
}

main().catch(console.error);
