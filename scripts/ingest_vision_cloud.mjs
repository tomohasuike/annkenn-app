import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

// ==========================================
// 1. 設定事項
// ==========================================
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
// プレフィルタは超高速・格安な Flash を使用
const filterModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
// 抽出処理（OCR＆構造化）は精度の高い Flash (または Pro)
const extractModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

// テスト用の制御
const DRY_RUN = true; // DBに挿入せずコンソールに結果を出すだけの場合は true に
const TEST_LIMIT = 10; // まずは10ページだけテスト実行
const TARGET_MFG = 'ネグロス電工'; // 処理対象のメーカー

// プロンプト（事前振り分け）
// 誤検知を防ぐため、条件を少し広めに設定する。
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

// プロンプト（データ抽出）
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
    "depth_mm": 20,
    "bounding_box": {"ymin": 0, "xmin": 0, "ymax": 100, "xmax": 100}
  }
]

価格はカンマ抜きの数値型（標準価格がない場合はnull）。
寸法（幅・高さ・奥行き）はmm単位で数値型で推測して入れるか、分からなければnull。
bounding_box は画像内の対象製品の座標（0〜1000の範囲）です。
出力は有効なJSONのみ出力してください。マークダウンなしでお願いします。
`;

// ==========================================
// ユーティリティ
// ==========================================
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 画像のMIMEタイプ推測
function getMimeType(url) {
    if (url.includes('.png')) return 'image/png';
    if (url.includes('.webp')) return 'image/webp';
    return 'image/jpeg';
}

// Driveから画像をダウンロードしてbase64にする
async function fetchImageAsBase64(url) {
    // KensackのGoogle Drive画像URLは直接ダウンロードできるようにしてある想定
    // または public な supabase storage か
    // 実際に実装されている catalog_pages.page_image_url の形式による
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
}

// ==========================================
// メイン処理
// ==========================================
async function main() {
    console.log(`🚀 クラウドAI抽出システム開始 (Target: ${TARGET_MFG})`);
    
    // 1. 未判定のページを取得
    const { data: pages, error } = await supabase
        .from('catalog_pages')
        .select('*')
        .eq('manufacturer', TARGET_MFG)
        .is('is_target', null)
        .order('page_number', { ascending: true })
        .range(300, 300 + TEST_LIMIT - 1);

    if (error) {
        console.error("❌ ページ取得エラー:", error);
        return;
    }

    if (!pages || pages.length === 0) {
        console.log("✅ 処理待ちの未判定ページはありません。");
        return;
    }

    console.log(`📄 今回の処理対象: ${pages.length} ページ`);

    // メーカーIDの取得
    const { data: mData } = await supabase.from('manufacturers').select('id').eq('name', TARGET_MFG).limit(1);
    if (!mData || mData.length === 0) {
        console.error("❌ メーカーIDが見つかりません:", TARGET_MFG);
        return;
    }
    const manufacturer_id = mData[0].id;

    for (const page of pages) {
        console.log(`\n---------------------------------`);
        console.log(`Processing Page ${page.page_number} (URL: ${page.page_image_url})`);

        try {
            // 画像の取得
            const base64Image = await fetchImageAsBase64(page.page_image_url);
            const imagePart = {
                inlineData: {
                    data: base64Image,
                    mimeType: getMimeType(page.page_image_url)
                }
            };

            // ==================================
            // フェーズ 2A: プレフィルタリング
            // ==================================
            console.log("🔎 AI判定中 (事前振り分け)...");
            const filterResult = await filterModel.generateContent([PREFILTER_PROMPT, imagePart]);
            const filterResponse = filterResult.response.text().trim().toUpperCase();

            let isTarget = false;
            if (filterResponse.includes('YES')) {
                isTarget = true;
                console.log(`🎯 判定: YES (抽出対象です)`);
            } else {
                console.log(`🗑️ 判定: NO (スキップします) -> 理由AI出力: ${filterResponse}`);
            }

            // DBを更新 (DRY_RUNがfalseの場合のみ)
            if (!DRY_RUN) {
                await supabase.from('catalog_pages')
                    .update({ is_target: isTarget })
                    .eq('id', page.id);
            }

            // ==================================
            // フェーズ 2B: データ抽出 (YESの場合)
            // ==================================
            if (isTarget) {
                if (DRY_RUN) {
                   console.log("⚙️ (DRY RUN) 製品データ抽出処理をスキップします...");
                } else {
                    console.log("⚙️ 製品データ抽出処理を実行中...");
                    const extractResult = await extractModel.generateContent([EXTRACTION_PROMPT, imagePart]);
                    let rawText = extractResult.response.text().trim();
                    
                    // JSONのクリーンアップ
                    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                    
                    let extractedItems = [];
                    try {
                        extractedItems = JSON.parse(rawText);
                    } catch (e) {
                        console.error("⚠️ AIの出力が正しいJSONではありませんでした:", rawText);
                        continue; // パースエラーの場合はスキップ
                    }
    
                    console.log(`📦 抽出された製品数: ${extractedItems.length}件`);
    
                    // ==================================
                    // フェーズ 2C: DB保存
                    // ==================================
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
                            catalog_url: page.page_image_url, // Drive URL
                            page_number: page.page_number
                        }));
    
                        const { error: insertError } = await supabase.from('materials').insert(insertData);
                        if (insertError) {
                            console.error("❌ DBインサートエラー:", insertError);
                        } else {
                            console.log("✅ データベースに登録完了");
                        }
                    }
                }
            }

            // Google APIレートリミット対策
            await delay(3000);

        } catch (err) {
            console.error(`❌ Page ${page.page_number} でエラー発生:`, err.message);
        }
    }

    console.log(`\n🎉 テストバッチ完了`);
}

main().catch(console.error);
