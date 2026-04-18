import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'stream';

// ================ 設定 ================
dotenv.config({ path: '.env.local' });
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const functionsEnvPath = path.resolve('./supabase/functions/.env');
if (fs.existsSync(functionsEnvPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(functionsEnvPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const PARENT_FOLDER_ID = '17DoPV9o8mLQirXFLKsJ3ojHm6W_lrQUf'; // 社長のAnnkenn作業用フォルダ(デフォルト)

// 対象設定
const SOURCE_PDF_PATH = '/Users/hasuiketomoo/Downloads/ZFCT1A316.pdf';
const MANUFACTURER = '三菱電機';
const CATALOG_NAME = '施設照明カタログ';
const START_PAGE = 1;
// NOTE: 1回で1954ページやるとGoogleのAPIリミットに引っかかる可能性があるので工夫して進める

let driveService = null;
let splitRootFolderId = null;
let densetsuFolderId = null;

async function initGoogleDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: GOOGLE_SA_EMAIL, private_key: GOOGLE_SA_PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  driveService = google.drive({ version: 'v3', auth });

  // 1. Kensack_Split_Catalogs 作成
  let res = await driveService.files.list({
    q: `'${PARENT_FOLDER_ID}' in parents and name='Kensack_Split_Catalogs' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true
  });
  if (res.data.files.length > 0) {
    splitRootFolderId = res.data.files[0].id;
  } else {
    const folderRes = await driveService.files.create({
      resource: { name: 'Kensack_Split_Catalogs', mimeType: 'application/vnd.google-apps.folder', parents: [PARENT_FOLDER_ID] },
      fields: 'id', supportsAllDrives: true
    });
    splitRootFolderId = folderRes.data.id;
  }

  // 2. Negurosu_Densetsu_Kai フォルダ
  res = await driveService.files.list({
    q: `'${splitRootFolderId}' in parents and name='Negurosu_Densetsu_Kai' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true
  });
  if (res.data.files.length > 0) {
    densetsuFolderId = res.data.files[0].id;
  } else {
    const folderRes = await driveService.files.create({
      resource: { name: 'Negurosu_Densetsu_Kai', mimeType: 'application/vnd.google-apps.folder', parents: [splitRootFolderId] },
      fields: 'id', supportsAllDrives: true
    });
    densetsuFolderId = folderRes.data.id;
    // Set public read permission on the folder so all children inherit it
    await driveService.permissions.create({
      fileId: densetsuFolderId,
      supportsAllDrives: true,
      requestBody: { role: 'reader', type: 'anyone' }
    });
  }
}

async function uploadToDrive(fileName, buffer) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await driveService.files.create({
        resource: { name: fileName, parents: [densetsuFolderId] },
        media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
        fields: 'id', supportsAllDrives: true
      });
      return res.data.id;
    } catch (err) {
      console.log(`  -> Drive Upload error. Attempt ${attempt}/3 : ${err.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error("Failed to upload after 3 attempts");
}

async function processCatalog() {
  console.log("🚀 完全分割・高速インジェスタ (Google Drive完全集約版) 開始...");
  
  if (!fs.existsSync(SOURCE_PDF_PATH)) {
      console.error(`❌ ファイルが見つかりません: ${SOURCE_PDF_PATH}`);
      return;
  }

  await initGoogleDrive();
  console.log(`✅ Google Drive API 準備完了 (保存先フォルダID: ${densetsuFolderId})`);

  console.log("📥 700MBの元PDFをメモリに読み込んでいます... (少々お待ち下さい)");
  let sourceBytes, sourceDoc;
  try {
      sourceBytes = fs.readFileSync(SOURCE_PDF_PATH);
      sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  } catch (e) {
      console.error("❌ メモリ不足またはPDFの読み込みに失敗しました:", e.message);
      console.error("コマンドを `node --max-old-space-size=8192 scripts/split_catalog.mjs` に変えて実行してください。");
      return;
  }
  
  const totalPages = sourceDoc.getPageCount();
  console.log(`✅ PDF読み込み完了: 全 ${totalPages} ページ`);

  // 進捗保存ファイル
  const PROGRESS_FILE = path.join(process.cwd(), 'ingestion_mitsubishi_progress.json');
  let currentProgress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
      currentProgress = JSON.parse(fs.readFileSync(PROGRESS_FILE));
  }

  // 1番から順番に処理
  for (let pageNum = START_PAGE; pageNum <= totalPages; pageNum++) {
      if (currentProgress[pageNum]) {
          console.log(`⏭️ Page ${pageNum} は処理済みのためスキップします`);
          continue;
      }

      console.log(`[${pageNum}/${totalPages}] 📄 ページ抽出＆アップロード開始...`);
      
      const newDoc = await PDFDocument.create();
      try {
          const [copiedPage] = await newDoc.copyPages(sourceDoc, [pageNum - 1]); // 0-indexed
          newDoc.addPage(copiedPage);
          const pdfBytes = await newDoc.save();
          const buffer = Buffer.from(pdfBytes);

          // Drive
          const driveFileId = await uploadToDrive(`page_${pageNum}.pdf`, buffer);
          
          // Supabase DB
          const { error: dbErr } = await supabase.from('catalog_pages').upsert({
              manufacturer: MANUFACTURER,
              catalog_name: CATALOG_NAME,
              page_number: pageNum,
              drive_file_id: driveFileId
          }, { onConflict: 'manufacturer,catalog_name,page_number' });

          if (dbErr) {
              console.error(`  -> ❌ DB更新エラー: ${dbErr.message}`);
          } else {
              console.log(`  -> ✅ 成功: DriveID=${driveFileId}`);
              currentProgress[pageNum] = driveFileId;
              fs.writeFileSync(PROGRESS_FILE, JSON.stringify(currentProgress));
          }

      } catch (err) {
          console.error(`  -> ❌ ページ抽出/アップロードでエラー: ${err.message}`);
      }

      // Google Drive API レートリミット回避 (1〜2秒あける)
      const sleepTime = Math.floor(Math.random() * 1000) + 1000;
      await new Promise(r => setTimeout(r, sleepTime));
  }

  console.log("🎉 すべての分割・アップロード処理が完了しました！");
}

processCatalog().catch(console.error);
