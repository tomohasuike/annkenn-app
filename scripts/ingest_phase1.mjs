import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// --- 初期設定 ---
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const apiKey = process.env.VITE_GOOGLE_API_KEY;
if (!apiKey) {
  console.error("❌ Google API Key is missing.");
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gsczefdkcrvudddeotlx.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'SECRET_REDACTED';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- 処理対象のPDFファイルリスト (フェーズ1) ---
const targetPdfs = [
  { 
    path: '/Users/hasuiketomoo/Downloads/2025_1mirai.pdf', 
    manufacturer: '未来工業'
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/ZFCT1A316.pdf', 
    manufacturer: 'パナソニック'
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/catalog_densetsu-kai.pdf', 
    manufacturer: 'ネグロス電工'
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/catalog_taflock-kai.pdf', 
    manufacturer: 'ネグロス電工'
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/kanro_zenbun-rurukawa.pdf', 
    manufacturer: '古河電工'
  }
];

const progressFile = resolve(__dirname, 'phase1_update_progress.json');

async function loadProgress() {
  if (fs.existsSync(progressFile)) {
    return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  }
  return {};
}

async function saveProgress(progress) {
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

// Geminiへ問い合わせてページ番号だけ抽出する
async function extractPageNumbers(pdfBuffer, manufacturerName) {
  const prompt = `
あなたは電気設備資材のカタログ解析アシスタントです。
提供されたPDFページから、掲載されている全製品の型番（品番）と「掲載ページ番号」のみを抽出し、JSONの配列として出力してください。

メーカー: ${manufacturerName}

【出力JSONフォーマット厳守】
[
  {
    "model_number": "型番文字列",
    "page_number": 数値
  }
]

・寸法や値段などの余計なデータは不要です。
・JSON以外のテキストは絶対に含めないこと。
`;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: Buffer.from(pdfBuffer).toString("base64"),
          mimeType: "application/pdf"
        }
      }
    ]);
    
    let text = result.response.text();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    if (!text.startsWith('[')) {
        text = `[${text}]`;
    }

    return JSON.parse(text);
  } catch (err) {
    console.error("Gemini解析エラー:", err.message);
    return null;
  }
}

async function processPdf(pdfInfo, progress) {
  if (progress[pdfInfo.path]?._completed) {
    console.log(`⏩ ${pdfInfo.manufacturer} のPDFは完了済みのためスキップ: ${pdfInfo.path}`);
    return;
  }

  console.log(`\n📄 処理開始: ${pdfInfo.manufacturer} - ${pdfInfo.path}`);
  if (!progress[pdfInfo.path]) {
    progress[pdfInfo.path] = { lastPage: 0 };
  }

  // メーカーIDの取得 (LIKE検索で柔軟に)
  const { data: mData } = await supabase.from('manufacturers').select('id').ilike('name', `%${pdfInfo.manufacturer}%`).limit(1);
  const mfgId = mData && mData.length > 0 ? mData[0].id : null;
  
  if (!mfgId) {
      console.error(`❌ メーカーIDが見つかりません: ${pdfInfo.manufacturer}`);
      return;
  }

  const pdfBytes = fs.readFileSync(pdfInfo.path);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  console.log(`総ページ数: ${totalPages}`);

  const startPage = progress[pdfInfo.path].lastPage || 0;

  for (let i = startPage; i < totalPages; i++) {
    console.log(`  -> ページ ${i + 1}/${totalPages} 抽出中... (chunkSize=1)`);
    
    const subDoc = await PDFDocument.create();
    const [copiedPage] = await subDoc.copyPages(pdfDoc, [i]);
    subDoc.addPage(copiedPage);
    const subPdfBytes = await subDoc.save();

    const extractedData = await extractPageNumbers(subPdfBytes, pdfInfo.manufacturer);

    if (extractedData && Array.isArray(extractedData)) {
      for (const item of extractedData) {
        if (item.model_number && item.page_number) {
           // DBへUPDATEをかける
           const { error } = await supabase
             .from('materials')
             .update({ page_number: item.page_number })
             .eq('manufacturer_id', mfgId)
             .eq('model_number', item.model_number);
             // Note: 既存DBにpage_numberがnullのものを重点的にUPDATEだが、一律UPDATEで良い
           
           if (!error) {
               console.log(`      ✅ 更新完了: ${item.model_number} -> P${item.page_number}`);
           }
        }
      }
    } else {
      console.log(`      ⚠️ データ抽出なし、またはJSONフォーマット不良`);
    }

    progress[pdfInfo.path].lastPage = i + 1;
    await saveProgress(progress);
    
    // Safety delay
    await new Promise(r => setTimeout(r, 2000));
  }

  progress[pdfInfo.path]._completed = true;
  await saveProgress(progress);
  console.log(`🎉 完了: ${pdfInfo.manufacturer} - ${pdfInfo.path}`);
}

async function main() {
  console.log("🚀 フェーズ1データの page_number 補完バッチを開始します (激安エコ運転モード)");
  const progress = await loadProgress();

  for (const pdf of targetPdfs) {
    if (fs.existsSync(pdf.path)) {
      await processPdf(pdf, progress);
    } else {
      console.log(`⚠️ ファイルが見つかりません: ${pdf.path}`);
    }
  }

  console.log("\n✅ 全フェーズ1PDFの補完処理が完了しました。");
}

main().catch(console.error);
