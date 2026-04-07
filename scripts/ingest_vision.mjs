import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import sharp from 'sharp';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const execPromise = util.promisify(exec);

// ================ 設定 ================
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
// サービスキーでRLSバイパス
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'SECRET_REDACTED';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GOOGLE_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// 処理対象のPDFディレクトリ群 (Phase 1, Phase 2)
const SOURCE_DIRS = [
  './data/catalogs/test' // まずは小さいテストディレクトリから実行検証
];

const TARGET_DB_TABLE = 'materials';
const BUCKET_NAME = 'material_images';
// =====================================

// sips を使って PDF (1ページ) を PNG (1024x1024付近) に変換
async function convertPdfToPngNative(pdfPath, outPath) {
  try {
    // -s format png : PNGフォーマット
    // -z 1200 1200 : 最大1200辺でアスペクト比維持でフィット（実際にはPDFの縦横比になる）
    await execPromise(`sips -s format png -Z 1200 "${pdfPath}" --out "${outPath}"`);
    return true;
  } catch (error) {
    console.error(`Sips Error on ${pdfPath}:`, error.message);
    return false;
  }
}

// 画像のメタデータを取得（Geminiの返した相対座標から絶対ピクセルを計算するため）
async function getImageDimensions(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  return { width: metadata.width, height: metadata.height };
}

// Supabase Storage にアップロード
async function uploadToStorage(filePath, filename) {
  const fileBuffer = await fs.readFile(filePath);
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(`auto_cropped/${Date.now()}_${filename}`, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) {
    console.error('Storage Upload Error:', error);
    return null;
  }

  // 公開URLを取得
  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);
    
  return publicUrlData.publicUrl;
}

const EXTRACT_PROMPT = `
あなたは電気工事・電気通信工事業界の熟練した積算エンジニアです。
提供されたカタログ画像のページを分析し、記載されているすべての製品の情報を漏れなく抽出してください。
さらに、**画像上のその製品の写真がどこにあるかのバウンディングボックス（矩形座標）**も同時に提供してください。

必ず以下のJSON形式の配列で出力してください。Markdown装飾（\`\`\`json 等）は一切含めず、純粋なJSON配列テキストのみを返してください。

[
  {
    "manufacturer": "メーカー名（ロゴ等から推測）",
    "name": "製品名またはシリーズ名",
    "model_number": "型番・品番（サイズや仕様違いで複数ある場合はそれぞれ独立したオブジェクトとして分けて出力）",
    "description": "製品の用途や特徴、材質などの短い説明 (未記載は null)",
    "category": "カテゴリ (例: 電線管付属品/配線器具/分電盤/計測器)",
    "width_mm": 数値 (幅寸法mm, 記載なしは null),
    "height_mm": 数値 (高さ寸法mm, 記載なしは null),
    "depth_mm": 数値 (奥行・厚み寸法mm, 記載なしは null),
    "standard_price": 数値 (標準単価・円, 記載なしは null),
    "box_2d": [ymin, xmin, ymax, xmax] (※重要: 製品写真のバウンディングボックス。画像全体の縦横を 1000 とした相対座標 [0-1000] の配列。必ず製品の本体写真だけを囲み、文字を含めないこと)
  }
]

【抽出時の絶対ルール】
1. 一つの製品群で表になっている場合（例: 型番S-14は単価100円、S-16は単価150円）、必ず「S-14とS-16の2つの独立したJSONオブジェクト」として分離して出力すること。
2. 寸法は W, H, D などの表記や寸法図から推測し、数値のみを抽出すること。
3. バウンディングボックス (box_2d) は、その型番の製品の「代表的な製品写真」を囲むこと。[上端, 左端, 下端, 右端] の順の配列（0から1000の整数）。写真が存在しない場合は null。
`;

async function processPage(pdfPath) {
  console.log(`\n📄 Processing: ${pdfPath}`);
  const tempPngId = Date.now() + "_" + Math.floor(Math.random() * 1000);
  const tempPngPath = `./tmp_vision_${tempPngId}.png`;

  try {
    // 1. PDFをPNGにローカル変換
    const converted = await convertPdfToPngNative(pdfPath, tempPngPath);
    if (!converted) return;

    // 2. 元画像のピクセル寸法を取得
    const { width: imgW, height: imgH } = await getImageDimensions(tempPngPath);
    console.log(`🖼️ Converted to PNG: ${imgW}x${imgH}`);

    // 3. Geminiへアップロード＆解析依頼
    const imageBase64 = await fs.readFile(tempPngPath, { encoding: 'base64' });
    
    console.log(`🧠 AI Vision Extraction Processing...`);
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: EXTRACT_PROMPT },
            { inlineData: { mimeType: 'image/png', data: imageBase64 } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
      }
    });

    let jsonStr = result.response.text();
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    let parts = JSON.parse(jsonStr);
    
    if (!Array.isArray(parts)) parts = [parts];
    console.log(`✅ AI Extracted ${parts.length} items from page.`);

    // 4. クロップとDB挿入
    const dbPayloads = [];

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let imageUrl = null;

      // 5. バウンディングボックスがあったら画像をクロップ
      if (p.box_2d && Array.isArray(p.box_2d) && p.box_2d.length === 4) {
        const [ymin, xmin, ymax, xmax] = p.box_2d;
        
        // 0-1000の相対座標を実際のピクセル座標に変換
        const cropTop = Math.floor((ymin / 1000) * imgH);
        const cropLeft = Math.floor((xmin / 1000) * imgW);
        const cropBottom = Math.floor((ymax / 1000) * imgH);
        const cropRight = Math.floor((xmax / 1000) * imgW);
        
        let cropW = cropRight - cropLeft;
        let cropH = cropBottom - cropTop;

        // 安全なマージン処理
        if (cropW > 10 && cropH > 10 && cropLeft >= 0 && cropTop >= 0 && cropLeft + cropW <= imgW && cropTop + cropH <= imgH) {
           const croppedFile = `./tmp_crop_${tempPngId}_${i}.jpg`;
           await sharp(tempPngPath)
             .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
             .jpeg({ quality: 90 })
             .toFile(croppedFile);
             
           // Supabase にアップロード
           const safeFilename = `${p.model_number || 'unknown'}.jpg`.replace(/[^a-zA-Z0-9.-]/g, '_');
           imageUrl = await uploadToStorage(croppedFile, safeFilename);
           
           // 後始末
           await fs.unlink(croppedFile).catch(()=>{});
        }
      }

      dbPayloads.push({
        name: p.name || '名称不明',
        model_number: p.model_number || 'UNKNOWN',
        description: p.description,
        category: p.category,
        width_mm: p.width_mm,
        height_mm: p.height_mm,
        depth_mm: p.depth_mm,
        standard_price: p.standard_price,
        image_url: imageUrl,
        catalog_url: 'AUTO_VISION_GENERATED'
      });
    }

    if (dbPayloads.length > 0) {
      // API直接挿入
      const { error } = await supabase.from(TARGET_DB_TABLE).insert(dbPayloads);
      if (error) {
         console.error('❌ Supabase Insert Error:', error.message);
      } else {
         console.log(`🎉 DB Insert Success (${dbPayloads.length} items with ${dbPayloads.filter(d=>d.image_url).length} extracted images)`);
      }
    }

  } catch (error) {
    console.error(`Error processing ${pdfPath}:`, error.message);
  } finally {
    // 元のPNGファイルを掃除
    await fs.unlink(tempPngPath).catch(()=>{});
  }
}

import { PDFDocument } from 'pdf-lib';

async function processFullPdf(pdfFilePath) {
    console.log(`\n\n■ Starting Full PDF Vision Extraction: ${pdfFilePath}`);
    const pdfBytes = await fs.readFile(pdfFilePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const numPages = pdfDoc.getPageCount();
    console.log(`Total Pages: ${numPages}`);
    
    // Create a temporary directory for split pages
    const tempDir = `./tmp_vision_doc_` + Date.now();
    await fs.mkdir(tempDir, { recursive: true });

    // TEST ONLY: Process first 2 pages (don't run on the full 400 page pdf during testing)
    const testLimit = Math.min(numPages, 2);
    for (let i = 0; i < testLimit; i++) {
        try {
            console.log(`--- Extracting Page ${i + 1}/${numPages} ---`);
            const subDocument = await PDFDocument.create();
            const [copiedPage] = await subDocument.copyPages(pdfDoc, [i]);
            subDocument.addPage(copiedPage);
            const subPdfBytes = await subDocument.save();
            
            const tempPdfFile = path.join(tempDir, `page_${i + 1}.pdf`);
            await fs.writeFile(tempPdfFile, subPdfBytes);
            
            // Process the single page with Vision Engine
            await processPage(tempPdfFile);
            
            // Cleanup single page PDF
            await fs.unlink(tempPdfFile).catch(()=>{});
            
            // API Rate Limiting protection
            await new Promise(r => setTimeout(r, 3000));
        } catch (err) {
            console.error(`Error on page ${i + 1}:`, err.message);
        }
    }
    
    // Cleanup dir
    await fs.rm(tempDir, { recursive: true, force: true }).catch(()=>{});
}

async function runVisionExtraction() {
  console.log("🚀 Starting AI Visual Crop Engineering System...");
  
  // 対象のPDFリスト
  const targetPdfs = [
    '/Users/hasuiketomoo/Downloads/idec-SJPJA01B.pdf',
    '/Users/hasuiketomoo/Downloads/nitto-SK-25A.pdf',
  ];

  for (const pdf of targetPdfs) {
    if (existsSync(pdf)) {
        await processFullPdf(pdf);
    } else {
        console.log(`Not found: ${pdf}`);
    }
  }
  
  console.log("\n✅ ALL VISION EXTRACTION COMPLETE!");
}

runVisionExtraction();
