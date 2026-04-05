import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// 環境変数の読み込み
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const apiKey = process.env.VITE_GOOGLE_API_KEY;
if (!apiKey) {
  console.error("VITE_GOOGLE_API_KEY が見つかりません。");
  process.exit(1);
}

const inputPdfPath = '/Users/hasuiketomoo/Downloads/ZFCT1A316.pdf';
const startPage = 100; // テスト用に100ページ目から
const endPage = 102;   // 102ページ目まで（合計3ページ）

async function runChunkExtraction() {
  console.log(`🚀 巨大PDF (${inputPdfPath}) から ${startPage}〜${endPage}ページを切り出します...`);

  // 1. PDFの読み込みと分割
  const pdfBytes = fs.readFileSync(inputPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();

  for (let i = startPage - 1; i < endPage; i++) {
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
  }

  const chunkBytes = await newPdf.save();
  const chunkBase64 = Buffer.from(chunkBytes).toString('base64');
  console.log(`✅ ${endPage - startPage + 1}ページ分の切り出し成功！(サイズ: ${(chunkBase64.length / 1024 / 1024).toFixed(2)} MB)`);

  // 2. Gemini APIへのリクエスト (システムプロンプト)
  const prompt = `
あなたはプロの電気工事士・電材卸業者のアシスタントです。
添付されたパナソニックの製品カタログPDF（数ページ分）から、掲載されているすべての製品情報を読み取り、必ず以下の形式のJSONの配列（Array）のみを出力してください。
余計な解説文やバッククオートは一切不要です（即座にJSONとしてパース可能な文字列を返してください）。

【抽出ルール】
- ページ内に製品がない場合や、ただの説明文・目次ページの場合は空の配列 [] を返してください。
- 複数の製品がある場合は、すべて配列の要素として含めてください。
- 「希望小売価格」や「定価」の記載があれば、カンマ等を抜いた数値として \`standard_price\` にいれてください（「円<税抜>」などは除外）。価格がない場合は null にしてください。
- 小さな部品（カバーやジョイント）も型番があれば製品とみなします。

【JSONフォーマット例】
[
  {
    "model_number": "WND1234",
    "name": "埋込ほたるスイッチB",
    "description": "片切, 15A 100V AC",
    "standard_price": 550,
    "manufacturer": "パナソニック"
  }
]
`;

  console.log("🤖 Gemini AI に解析を依頼中... (数秒〜数十秒かかります)");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: chunkBase64
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    })
  });

  const responseJson = await response.json();
  if (responseJson.error) {
    console.error("❌ APIエラー:", JSON.stringify(responseJson.error, null, 2));
    return;
  }

  const outputText = responseJson.candidates[0].content.parts[0].text;
  console.log("\n🎉 AIからの抽出結果 (JSON):");
  console.log(outputText);
  
  // 今後ここから直接SupabaseへINSERTする処理に繋げます
}

runChunkExtraction().catch(err => {
  console.error("❌ システムエラー:", err);
});
