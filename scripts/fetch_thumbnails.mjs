import { google } from 'googleapis';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

dotenv.config({ path: '.env.local' });

// ================ 設定 ================
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gsczefdkcrvudddeotlx.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'SECRET_REDACTED';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Load Google SA config from supabase functions env
const functionsEnvPath = path.resolve('./supabase/functions/.env');
if (fs.existsSync(functionsEnvPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(functionsEnvPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const PARENT_FOLDER_ID = '17DoPV9o8mLQirXFLKsJ3ojHm6W_lrQUf';
let driveService = null;
let thumbnailsFolderId = '14X2t261Yy7YV6Gbbw1M5-T0T0-VxtS0k'; // Fallback if lookup fails

// =====================================

async function initGoogleDrive() {
  if (!GOOGLE_SA_EMAIL || !GOOGLE_SA_PRIVATE_KEY) {
    console.error(`❌ Drive Upload Error: GOOGLE_SA_EMAIL or PRIVATE_KEY is missing in supabase/functions/.env`);
    return false;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SA_EMAIL,
      private_key: GOOGLE_SA_PRIVATE_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  driveService = google.drive({ version: 'v3', auth });

  // 1. Kensack_Thumbnails フォルダが存在するか確認
  try {
    const res = await driveService.files.list({
      q: `'${PARENT_FOLDER_ID}' in parents and name='Kensack_Thumbnails' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (res.data.files.length > 0) {
      thumbnailsFolderId = res.data.files[0].id;
      console.log(`✅ Kensack_Thumbnails フォルダを発見: ${thumbnailsFolderId}`);
    } else {
      // 2. なければ作成
      const folderMetadata = {
        name: 'Kensack_Thumbnails',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [PARENT_FOLDER_ID]
      };
      const folderRes = await driveService.files.create({
        resource: folderMetadata,
        fields: 'id',
        supportsAllDrives: true,
      });
      thumbnailsFolderId = folderRes.data.id;
      console.log(`✅ Kensack_Thumbnails フォルダを新規作成しました: ${thumbnailsFolderId}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Google Drive API初期化エラー:", error.message);
    return false;
  }
}

async function uploadToGoogleDrive(filename, buffer, mimeType) {
  if (!driveService || !thumbnailsFolderId) return null;

  try {
    const fileMetadata = {
      name: filename,
      parents: [thumbnailsFolderId],
    };
    const media = {
      mimeType: mimeType,
      body: Readable.from(buffer),
    };

    const res = await driveService.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    // anyone with link can view (権限付与)
    await driveService.permissions.create({
      fileId: res.data.id,
      supportsAllDrives: true,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return res.data.webViewLink; // 表示用共有リンク
  } catch (error) {
    console.error("❌ Google Drive Upload Error:", error.message);
    return null;
  }
}

async function scrapeImageFromDuckDuckGo(query) {
  // Puppeteerを使ってYahoo画像検索から1番目の画像を取得
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    // User-Agentをスマホ等に偽装
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    
    // Yahoo画像検索URL
    await page.goto(`https://search.yahoo.co.jp/image/search?p=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });
    
    // 画像がロードされるのを待機
    await page.waitForSelector('img[src^="http"]', { timeout: 10000 });
    
    // 最初の画像の src を取得
    const imageUrl = await page.evaluate(() => {
      // 検索窓などのアイコンを避けるため、ある程度大きな画像を探すか、Yahoo特有のクラスを狙う
      const imgs = Array.from(document.querySelectorAll('img'));
      const thumbnails = imgs.filter(img => img.width > 50 && img.src && img.src.startsWith('http'));
      return thumbnails.length > 0 ? thumbnails[0].src : null;
    });

    return imageUrl;
  } catch (err) {
    console.error("Puppeteer Scrape Error:", err.message);
    return null;
  } finally {
    await browser.close();
  }
}

async function runFetchBatch() {
  console.log("🚀 画像サムネイル自動取得バッチ (激安エコ運転モード) を開始します...");
  
  // Google Drive初期化 (失敗した場合は終了)
  const isDriveReady = await initGoogleDrive();
  if (!isDriveReady) return;
  console.log("⚠️ 注意: Google Drive経由のアップロードは credentials が必要です。必要に応じてSupabaseを併用してください。");

  // 対象データの取得（画像が未設定、または dummyimage を使っているもの）
  const { data: materials, error: fetchErr } = await supabase
    .from('materials')
    .select('id, model_number, manufacturers(name), image_url')
    .or('image_url.is.null,image_url.ilike.%dummyimage%')
    .limit(100); // 一度に回す件数

  if (fetchErr || !materials || materials.length === 0) {
    console.log("✅ 取得すべき対象データは見つかりませんでした！");
    return;
  }

  console.log(`⏳ ${materials.length} 件の画像のスクレイピングを開始します。`);

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const mfgName = m.manufacturers?.name || '';
    const query = `${mfgName} ${m.model_number}`;

    console.log(`[${i+1}/${materials.length}] 🌐 画像検索中: ${query}`);

    const scrapedImageUrl = await scrapeImageFromDuckDuckGo(query);
    
    if (scrapedImageUrl) {
        try {
           const imgRes = await fetch(scrapedImageUrl);
           const buffer = Buffer.from(await imgRes.arrayBuffer());
           const mime = imgRes.headers.get('content-type') || 'image/jpeg';
           
           // Extract extension from mime
           const ext = mime.split('/')[1] || 'jpg';
           const cleanModel = m.model_number.replace(/[^a-zA-Z0-9.-]/g, '_');
           
           const driveUrl = await uploadToGoogleDrive(`${cleanModel}.${ext}`, buffer, mime);

           if (driveUrl) {
               // Update image_url to Google Drive URL
               await supabase.from('materials').update({ image_url: driveUrl }).eq('id', m.id);
               console.log(`  -> ✅ Drive保存完了: ${driveUrl}`);
           } else {
               console.log(`  -> ❌ Driveアップロード失敗`);
           }
        } catch(e) {
           console.log(`  -> ❌ 画像ダウンロードエラー: ${scrapedImageUrl}`);
        }
    } else {
        console.log(`  -> ❌ 画像が見つかりませんでした`);
    }

    // スパム判定回避のため必ず 3〜5秒スリープ
    const sleepTime = Math.floor(Math.random() * 2000) + 3000;
    console.log(`  ... ${sleepTime}ms 待機します ...`);
    await new Promise(r => setTimeout(r, sleepTime));
  }

  console.log("✅ このバッチの処理が完了しました！");
}

runFetchBatch();
