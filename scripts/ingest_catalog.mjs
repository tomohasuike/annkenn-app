import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// --- 設定の読み込み ---
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envFuncPath = path.resolve(process.cwd(), 'supabase/functions/.env');

let supabaseUrl = "";
let supabaseKey = "";
let geminiKey = "";

try {
  const envLocal = fs.readFileSync(envLocalPath, 'utf8');
  supabaseUrl = envLocal.match(/VITE_SUPABASE_URL=([^\n]+)/)?.[1]?.trim();
  supabaseKey = envLocal.match(/VITE_SUPABASE_ANON_KEY=([^\n]+)/)?.[1]?.trim();

  const envFunc = fs.readFileSync(envFuncPath, 'utf8');
  geminiKey = envFunc.match(/VITE_GOOGLE_API_KEY=([^\n]+)/)?.[1]?.trim();
} catch (e) {
  console.error("環境変数の読み込みエラー:", e.message);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 今回自動取得（AIに抽出・補完させる）する主要な金具のリスト
const targetItems = [
  "ネグロス電工 一般形鋼用支持金具 HB1-W3",
  "ネグロス電工 パイラック PH1",
  "ネグロス電工 ダクタークリップ DC31",
  "未来工業 ビニル電線管 VE16",
  "ネグロス電工 デッキハンガー DH1"
];

async function ingestCatalog() {
  console.log("🚀 最新AIを用いたカタログ自動生成・抽出スクリプトを開始します...");

  // ==== Gemini 3.1 を使った自動データ抽出・成形 ====
  // ※スクレイピングの代わりに、世界中のカタログデータを学習しているGeminiに
  // 「実在する寸法・用途」を詳細に補完させて構造化データのみを出力させます。
  const prompt = `
以下の建築電材製品について、実際の仕様や定価（推測値）、説明を抽出・補完し、JSON配列のみを出力してください。
Markdownコードブロックは不要です。配列から始めてください。
製品リスト: ${targetItems.join(', ')}

期待するJSONフォーマット（例）:
[
  {
    "model_number": "HB1-W3",
    "name": "一般形鋼用支持金具",
    "manufacturer": "ネグロス電工",
    "description": "形鋼から吊りボルト(W3/8)を下げるための金具。溶接や穴あけ不要。",
    "image_url": "https://dummyimage.com/200x200/cccccc/000.png&text=HB1-W3",
    "catalog_url": "https://products.negurosu.co.jp/",
    "standard_price": 250,
    "specifications": { "flange_thickness": "3-24mm", "material": "電気亜鉛めっき", "bolt": "W3/8" }
  }
]`;

  console.log("🤖 Gemini API へカタログデータの補完・構造化をリクエスト中...");
  
  // v1beta の gemini-2.5-flash を使用 (ListModelsで確認済みの安定版)
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  
  let jsonItems = [];
  try {
    const aiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.2
        }
      })
    });
    
    if (!aiRes.ok) {
        console.error("Gemini API Error:", await aiRes.text());
        return;
    }

    const aiData = await aiRes.json();
    let textResponse = aiData.candidates[0].content.parts[0].text;
    
    // Markdownコードブロック除去
    textResponse = textResponse.replace(/^```json/gm, '').replace(/^```/gm, '').trim();
    
    jsonItems = JSON.parse(textResponse);
    console.log(`✅ 解析完了！ ${jsonItems.length} 件のカタログデータを生成しました。`);

  } catch (err) {
    console.error("AIからのデータ生成に失敗しました（JSONフォーマットパースエラー等）。", err);
    return;
  }

  // 3. SQL出力 (UIから貼り付けてもらうため)
  console.log("🗄️ 以下のSQLをコピーして、SupabaseのSQL Editorに貼り付けてRunしてください！\n");
  console.log("-- ここから --\n");
  console.log(`
-- 1. メーカーの登録
INSERT INTO manufacturers (name, website_url)
SELECT 'ネグロス電工', 'https://products.negurosu.co.jp/'
WHERE NOT EXISTS (SELECT 1 FROM manufacturers WHERE name = 'ネグロス電工');

INSERT INTO manufacturers (name, website_url)
SELECT '未来工業', 'https://www.mirai.co.jp/'
WHERE NOT EXISTS (SELECT 1 FROM manufacturers WHERE name = '未来工業');

-- 2. カテゴリの登録
INSERT INTO material_categories (name)
SELECT '一般支持金具'
WHERE NOT EXISTS (SELECT 1 FROM material_categories WHERE name = '一般支持金具');
  `);

  console.log("-- 3. カタログデータの登録");
  for (const item of jsonItems) {
    const isNegurosu = item.manufacturer.includes('ネグロス');
    const manufacturerName = isNegurosu ? 'ネグロス電工' : '未来工業';
    const specStr = JSON.stringify(item.specifications).replace(/'/g, "''");
    
    console.log(`
INSERT INTO materials (manufacturer_id, category_id, model_number, name, description, specifications, image_url, catalog_url, standard_price)
SELECT 
    m.id, c.id, '${item.model_number}', '${item.name}', '${item.description}', '${specStr}'::jsonb, '${item.image_url}', '${item.catalog_url}', ${item.standard_price || 'NULL'}
FROM manufacturers m, material_categories c
WHERE m.name = '${manufacturerName}' AND c.name = '一般支持金具'
  AND NOT EXISTS (SELECT 1 FROM materials WHERE model_number = '${item.model_number}');
`);
  }
  
  console.log("-- ここまで --");
}

ingestCatalog();
