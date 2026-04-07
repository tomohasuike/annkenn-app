import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Google API client for generative AI
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- 初期設定 ---
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const apiKey = process.env.VITE_GOOGLE_API_KEY;
if (!apiKey) {
  console.error("❌ 必要な環境変数が見つかりません。");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- 処理対象のPDFファイルリスト ---
const targetPdfs = [
  { 
    path: '/Users/hasuiketomoo/Downloads/catalog_densetsu-kai.pdf', 
    manufacturer: 'ネグロス電工',
    catalogUrl: 'https://drive.google.com/file/d/1beHW2kqNS-zzFjJOU1MWKsSvJWfSiYHB/view?usp=drive_link'
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/catalog_taflock-kai.pdf', 
    manufacturer: 'ネグロス電工',
    catalogUrl: 'https://drive.google.com/file/d/1nTR7o4ksXloTWf9nwGWoQUErB6X7LDjS/view?usp=drive_link'
  }
];

const chunkSize = 1; // 激安エコ運転モード厳守
const progressFile = resolve(__dirname, 'ingestion_negurosu_progress.json');
const sqlOutputFile = resolve(__dirname, 'catalogs_insert_negurosu.sql');

// --- メイン処理 ---
async function runIngestion() {
  console.log("🚀 ネグロス電工専用 PDFインジェスター（激安エコ運転モード）開始...");

  // 初期SQLファイル作成（無ければ）
  if (!fs.existsSync(sqlOutputFile)) {
    fs.writeFileSync(sqlOutputFile, "-- ネグロス電工 カタログ自動抽出SQLデータ\n\n");
  }

  let progress = {};
  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    console.log("🔄 前回の進捗から再開します:", progress);
  }

  for (const pdfItem of targetPdfs) {
    const pdfPath = pdfItem.path;
    const mfgName = pdfItem.manufacturer;
    const catalogUrl = pdfItem.catalogUrl;

    if (progress[pdfPath] && progress[pdfPath].completed) {
      console.log(`⏭️ スキップ: ${pdfPath} (完了済み)`);
      continue;
    }

    if (!fs.existsSync(pdfPath)) {
      console.error(`❌ ファイルが見つかりません: ${pdfPath}`);
      continue;
    }

    fs.appendFileSync(sqlOutputFile, `\n-- ${mfgName} : ${pdfPath} のデータ\n`);

    console.log(`\n📄 読み込み中: ${pdfPath}`);
    const pdfBytes = fs.readFileSync(pdfPath);
    let pdfDoc, totalPages;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();
      console.log(`総ページ数: ${totalPages}`);
    } catch (parseError) {
      console.error(`❌ PDFの解析に失敗しました。ファイルが破損しているか、非標準のフォーマットです: ${pdfPath}`);
      continue;
    }

    const startPage = progress[pdfPath]?.last_processed_page || 0;

    for (let currentStart = startPage + 1; currentStart <= totalPages; currentStart += chunkSize) {
      const currentEnd = Math.min(currentStart + chunkSize - 1, totalPages);
      console.log(`\n⏳ [${mfgName}] ページ ${currentStart} を処理中... (chunkSize=1)`);

      try {
        const newPdf = await PDFDocument.create();
        for (let i = currentStart - 1; i < currentEnd; i++) {
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
          newPdf.addPage(copiedPage);
        }
        const chunkBytes = await newPdf.save();
        const chunkBase64 = Buffer.from(chunkBytes).toString('base64');

        const extractedData = await extractDataFromGemini(chunkBase64, mfgName, currentStart);

        if (extractedData && extractedData.length > 0) {
          let sqlChunk = "";
          for (const item of extractedData) {
            const num = String(item.model_number).trim().replace(/'/g, "''");
            const name = String(item.name).trim().replace(/'/g, "''") || '製品名なし';
            const desc = item.description ? `'${String(item.description).replace(/'/g, "''")}'` : 'NULL';
            const price = item.standard_price || 'NULL';
            const img = 'NULL'; 
            const docUrl = `'${catalogUrl}#page=${currentStart}'`; // ★ #page=XXX を追加
            const w = item.width_mm || 'NULL';
            const h = item.height_mm || 'NULL';
            const d = item.depth_mm || 'NULL';
            const p = item.page_number || currentStart; 
            
            sqlChunk += `INSERT INTO materials (manufacturer_id, model_number, name, description, standard_price, image_url, catalog_url, width_mm, height_mm, depth_mm, page_number) ` +
                        `VALUES ((SELECT id FROM manufacturers WHERE name = '${mfgName}' LIMIT 1), '${num}', '${name}', ${desc}, ${price}, ${img}, ${docUrl}, ${w}, ${h}, ${d}, ${p});\n`;
          }

          fs.appendFileSync(sqlOutputFile, sqlChunk);
          console.log(`      ✅ ${extractedData.length} 件のデータを出力`);
        } else {
          console.log(`      ℹ️ 有効な製品データなし`);
        }

        progress[pdfPath] = { last_processed_page: currentEnd, completed: currentEnd === totalPages };
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

      } catch (err) {
        console.error(`💥 エラー発生: ページ ${currentStart}`);
        console.error(err.message);
        
        if (err.message.includes('Quota exceeded') || err.message.includes('429')) {
          console.log("⚠️ APIの無料枠制限（レートリミット）に到達。65秒間スリープして再試行します...");
          await new Promise(res => setTimeout(res, 65000));
          currentStart -= chunkSize; 
          continue;
        } else {
          console.log("5秒待機して次のチャンクへ進みます...");
          await new Promise(res => setTimeout(res, 5000));
        }
      }

      await new Promise(res => setTimeout(res, 500)); 
    }
  }

  console.log("\n🎉 🎉 ネグロス電工PDFの処理が完了しました！ 🎉 🎉");
  console.log("👉 生成された `scripts/catalogs_insert_negurosu.sql` をSupabaseで実行してください！");
}

async function extractDataFromGemini(base64Data, mfgName, pageNumber) {
  const prompt = `
あなたはこの電気工事会社の右腕AIです。
添付された【カタログの ${pageNumber} ページ目】の ${mfgName} の製品カタログPDFから、掲載されているすべての電気製品情報を読み取り、必ず以下の形式のJSONの配列（Array）のみを出力してください。
余計な解説文やマークダウンのバッククオート（\`\`\`json など）は一切出力しないでください。最初の文字は [ で始まり、最後の文字は ] となるようにパース可能な生文字列を返してください。

【抽出ルール】
- ページ内に製品がない場合や、ただの説明文・目次ページ・施工方法ページの場合は空の配列 [] を返してください。
- 出力するJSONの \`page_number\` には、必ず \`${pageNumber}\` （数値）をセットしてください。
- 複数の製品がある場合は、すべて配列の要素として含めてください。
- 現場用語での「ケーブルラック」は正式名称の「直線ラック」「SRラック」等として名前に入れますが、検索でのヒット率を上げるため、もしそれがケーブルラック関連であれば \`description\` に「ケーブルラック関連部材」というキーワードを忍ばせてください。
- 「希望小売価格」や「定価」の記載があれば、カンマ等を抜いた数値として \`standard_price\` にいれてください。
- カタログに外寸（タテ、ヨコ、フカサ等の寸法）が記載されていれば、数値を抽出して \`width_mm\`, \`height_mm\`, \`depth_mm\` に入れてください（単位はすべてmmで統一すること）。

【JSONフォーマット例】
[
  {
    "model_number": "SR35",
    "name": "SRタイプ 直線ラック",
    "description": "ケーブルラック関連部材。仕様や色、特徴の説明",
    "standard_price": 500,
    "width_mm": 500,
    "height_mm": 300,
    "depth_mm": null,
    "page_number": ${pageNumber}
  }
]
`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Data,
        mimeType: "application/pdf"
      }
    }
  ]);

  let textResponse = result.response.text();
  textResponse = textResponse.replace(/^```json/g, "").replace(/```$/g, "").trim();

  try {
    return JSON.parse(textResponse);
  } catch (parseError) {
    console.error("❌ JSONのパースに失敗しました。AI의生の出力:", textResponse);
    return [];
  }
}

runIngestion().catch(console.error);
