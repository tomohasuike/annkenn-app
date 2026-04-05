import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// --- 初期設定 ---
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const apiKey = process.env.VITE_GOOGLE_API_KEY;
if (!apiKey) {
  console.error("❌ 必要な環境変数が見つかりません。");
  process.exit(1);
}

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
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/kanro_zenbun-rurukawa.pdf', 
    manufacturer: '古河電気工業',
    catalogUrl: 'https://drive.google.com/file/d/1EqkIP7b6198yXJ4SNwZptwN3ooNMoebZ/view?usp=drive_link'
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/2025_1mirai.pdf', 
    manufacturer: '未来工業',
    catalogUrl: 'https://drive.google.com/file/d/1_I6GkKufTjty5moo9Ba7kWrUsCgFy7i5/view?usp=drive_link'
  },
  { 
    path: '/Users/hasuiketomoo/Downloads/ZFCT1A316.pdf', 
    manufacturer: 'パナソニック',
    catalogUrl: 'https://drive.google.com/file/d/1ScOmTKi-iTYsCucGvjF_i0nLws9cqVhz/view?usp=drive_link'
  }
];

const chunkSize = 5; 
const progressFile = resolve(__dirname, 'ingestion_progress.json');
const sqlOutputFile = resolve(__dirname, 'catalogs_insert.sql');

// --- メイン処理 ---
async function runIngestion() {
  console.log("🚀 全自動 PDFインジェスター（SQL生成＆Driveリンク連携版）起動...");

  // 初期SQLファイル作成（無ければ）
  if (!fs.existsSync(sqlOutputFile)) {
    fs.writeFileSync(sqlOutputFile, "-- カタログ自動抽出SQLデータ\n\n");
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

    // 1. メーカー事前登録用SQL（念のため）
    fs.appendFileSync(sqlOutputFile, `\n-- ${mfgName} のデータ\n`);

    // 2. PDFの読み込み
    console.log(`\n📄 読み込み中: ${pdfPath}`);
    const pdfBytes = fs.readFileSync(pdfPath);
    let pdfDoc, totalPages;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();
      console.log(`総ページ数: ${totalPages}`);
    } catch (parseError) {
      console.error(`❌ PDFの解析に失敗しました。ファイルが破損しているか、非標準のフォーマットです: ${pdfPath}`);
      console.error(`💡 Macのプレビューアプリで開いて「PDFとして書き出す」で別名保存すると直る場合があります。`);
      continue;
    }

    const startPage = progress[pdfPath]?.last_processed_page || 0;

    for (let currentStart = startPage + 1; currentStart <= totalPages; currentStart += chunkSize) {
      const currentEnd = Math.min(currentStart + chunkSize - 1, totalPages);
      console.log(`\n⏳ [${mfgName}] ページ ${currentStart} 〜 ${currentEnd} を処理中...`);

      try {
        const newPdf = await PDFDocument.create();
        for (let i = currentStart - 1; i < currentEnd; i++) {
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
          newPdf.addPage(copiedPage);
        }
        const chunkBytes = await newPdf.save();
        const chunkBase64 = Buffer.from(chunkBytes).toString('base64');

        const extractedData = await extractDataFromGemini(chunkBase64, mfgName);

        if (extractedData && extractedData.length > 0) {
          let sqlChunk = "";
          for (const item of extractedData) {
            const num = String(item.model_number).trim().replace(/'/g, "''");
            const name = String(item.name).trim().replace(/'/g, "''") || '製品名なし';
            const desc = item.description ? `'${String(item.description).replace(/'/g, "''")}'` : 'NULL';
            const price = item.standard_price || 'NULL';
            const img = `'https://dummyimage.com/200x200/cccccc/000.png&text=${encodeURIComponent(num)}'`;
            const docUrl = `'${catalogUrl}'`;
            
            sqlChunk += `INSERT INTO materials (manufacturer_id, model_number, name, description, standard_price, image_url, catalog_url) ` +
                        `VALUES ((SELECT id FROM manufacturers WHERE name = '${mfgName}' LIMIT 1), '${num}', '${name}', ${desc}, ${price}, ${img}, ${docUrl});\n`;
          }

          fs.appendFileSync(sqlOutputFile, sqlChunk);
          console.log(`✅ ${extractedData.length} 件のSQLデータを生成しました！`);
        } else {
          console.log(`ℹ️ このページには有効な製品データがありませんでした。`);
        }

        progress[pdfPath] = { last_processed_page: currentEnd, completed: currentEnd === totalPages };
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

      } catch (err) {
        console.error(`💥 エラー発生: ページ ${currentStart} 〜 ${currentEnd}`);
        console.error(err.message);
        
        // レートリミットエラーの場合は長く待機する
        if (err.message.includes('Quota exceeded') || err.message.includes('429')) {
          console.log("⚠️ APIの無料枠制限（レートリミット）に到達しました。65秒間スリープして再試行します...");
          await new Promise(res => setTimeout(res, 65000));
          // currentStart を戻して再試行させる
          currentStart -= chunkSize; 
          continue;
        } else {
          console.log("5秒待機して次のチャンクへ進みます...");
          await new Promise(res => setTimeout(res, 5000));
        }
      }

      await new Promise(res => setTimeout(res, 10000)); 
    }
  }

  console.log("\n🎉 🎉 全てのPDFの処理が完了しました！ 🎉 🎉");
  console.log("👉 生成された `scripts/catalogs_insert.sql` をSupabaseで実行してください！");
}

async function extractDataFromGemini(base64Data, mfgName) {
  const prompt = `
あなたはプロの電気工事士・電材卸業者のアシスタントです。
添付された ${mfgName} の製品カタログPDF（数ページ分）から、掲載されているすべての電気製品情報を読み取り、必ず以下の形式のJSONの配列（Array）のみを出力してください。
余計な解説文やマークダウンのバッククオート（\`\`\`json など）は一切出力しないでください。最初の文字は [ で始まり、最後の文字は ] となるようにパース可能な生文字列を返してください。

【抽出ルール】
- ページ内に製品がない場合や、ただの説明文・目次ページ・施工方法ページの場合は空の配列 [] を返してください。
- 複数の製品がある場合は、すべて配列の要素として含めてください。
- 「希望小売価格」や「定価」の記載があれば、カンマ等を抜いた数値として \`standard_price\` にいれてください（「円<税抜>」などは除外）。価格がない場合は null にしてください。
- 小さな部品（カバーやジョイント）も型番があれば製品とみなします。

【JSONフォーマット例】
[
  {
    "model_number": "型番テキスト",
    "name": "製品名テキスト",
    "description": "仕様や色、特徴の説明",
    "standard_price": 500
  }
]
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "application/pdf", data: base64Data } }
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
    throw new Error(`Gemini API Error: ${responseJson.error.message}`);
  }

  if (!responseJson.candidates || responseJson.candidates.length === 0) {
    return [];
  }

  const outputText = responseJson.candidates[0].content.parts[0].text;
  try {
    return JSON.parse(outputText);
  } catch (e) {
    console.error("JSON Parse Error on chunk:", outputText.substring(0, 50));
    return [];
  }
}

runIngestion().catch(console.error);
