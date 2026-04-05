import puppeteer from 'puppeteer';
import * as fs from 'fs';

// すでにユーザーがDBに登録した5件のアイテム
const items = [
  { model_number: 'HB1-W3', manufacturer: 'ネグロス電工' },
  { model_number: 'PH1', manufacturer: 'ネグロス電工' },
  { model_number: 'DC31', manufacturer: 'ネグロス電工' },
  { model_number: 'VE16', manufacturer: '未来工業' },
  { model_number: 'DH1', manufacturer: 'ネグロス電工' }
];

async function scrapeRealImages() {
  console.log("🚀 本物のカタログ画像抽出スクリプトを開始します...");

  // ブラウザの起動
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  let sqlOutput = "-- カタログ画像の更新SQL\n\n";

  // 各製品について画像検索
  for (const item of items) {
    const query = `${item.manufacturer} ${item.model_number} -site:dummyimage.com`;
    console.log(`\n🔍 検索中: ${query}`);

    try {
      // Yahoo画像検索を使用
      const searchUrl = `https://search.yahoo.co.jp/image/search?p=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const imageUrl = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('.sw-Thumbnail img'));
        for (const img of imgs) {
          const src = img.getAttribute('src');
          if (src && src.startsWith('http') && !src.includes('clear.gif')) {
            return src;
          }
        }
        return null;
      });

      if (imageUrl) {
        console.log(`✅ 画像取得成功: ${imageUrl.substring(0, 50)}...`);
        // UPDATE文の生成
        sqlOutput += `UPDATE materials SET image_url = '${imageUrl}' WHERE model_number = '${item.model_number}';\n`;
      } else {
        console.log(`⚠️ 画像が見つかりませんでした: ${item.model_number}`);
      }
    } catch (e) {
      console.error(`❌ エラー (${item.model_number}):`, e.message);
    }
    
    // アクセス間隔をあける
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  
  fs.writeFileSync('update_images.sql', sqlOutput);
  console.log("\n🎉 画像抽出が完了しました！ 'update_images.sql' を確認してください！");
  console.log("以下のSQLが生成されました:\n");
  console.log(sqlOutput);
}

scrapeRealImages();
