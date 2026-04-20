/**
 * 画像ダウンロード診断スクリプト
 * 古河電気工業のPage 1で画像取得方法を全部テストする
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'supabase/functions/.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);
const genAI = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY || process.env.VITE_GOOGLE_API_KEY
);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');

async function main() {
    console.log('=== 画像ダウンロード診断 ===\n');

    // 古河電気工業のPage 1を取得
    const { data: pages } = await supabase
        .from('catalog_pages')
        .select('*')
        .eq('manufacturer', '古河電気工業')
        .eq('page_number', 1)
        .limit(1);

    if (!pages?.length) {
        console.error('古河電気工業のページが見つかりません');
        return;
    }

    const page = pages[0];
    console.log('ページ情報:');
    console.log('  drive_file_id:', page.drive_file_id);
    console.log('  pdf_drive_file_id:', page.pdf_drive_file_id);
    console.log('  page_image_url:', page.page_image_url);
    console.log('');

    // Drive API初期化
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: GOOGLE_SA_EMAIL, private_key: GOOGLE_SA_PRIVATE_KEY },
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    const driveService = google.drive({ version: 'v3', auth });

    // === テスト1: Drive API で JPEG 画像ダウンロード ===
    console.log('--- テスト1: Drive API (JPEG, drive_file_id) ---');
    if (page.drive_file_id) {
        try {
            const res = await driveService.files.get(
                { fileId: page.drive_file_id, alt: 'media', supportsAllDrives: true },
                { responseType: 'arraybuffer' }
            );

            const buf = Buffer.isBuffer(res.data)
                ? res.data
                : Buffer.from(new Uint8Array(res.data));

            console.log(`  ダウンロードサイズ: ${buf.length} bytes`);
            console.log(`  先頭4バイト(hex): ${buf.slice(0, 4).toString('hex')}`);
            const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
            const isPng = buf[0] === 0x89 && buf[1] === 0x50;
            console.log(`  フォーマット: ${isJpeg ? 'JPEG ✅' : isPng ? 'PNG' : '不明 ⚠️'}`);

            // Geminiテスト
            const base64 = buf.toString('base64');
            console.log(`  Base64サイズ: ${base64.length} chars`);

            // ファイル保存（確認用）
            fs.writeFileSync('/tmp/test_image_jpeg.jpg', buf);
            console.log('  /tmp/test_image_jpeg.jpg に保存 ✅');

            if (buf.length > 1000) {
                console.log('  Geminiに送信テスト中...');
                const result = await model.generateContent([
                    { text: 'この画像の1行目に書かれているテキストは何ですか？' },
                    { inlineData: { data: base64, mimeType: 'image/jpeg' } }
                ]);
                console.log(`  Geminiレスポンス: ${result.response.text().substring(0, 100)}`);
                console.log('  ✅ JPEG画像 Gemini送信成功！');
            }

        } catch (err) {
            console.log(`  ❌ 失敗: ${err.message}`);
        }
    } else {
        console.log('  drive_file_idなし');
    }

    // === テスト2: Drive API で PDF ダウンロード ===
    console.log('\n--- テスト2: Drive API (PDF, pdf_drive_file_id) ---');
    if (page.pdf_drive_file_id) {
        try {
            const res = await driveService.files.get(
                { fileId: page.pdf_drive_file_id, alt: 'media', supportsAllDrives: true },
                { responseType: 'arraybuffer' }
            );

            const buf = Buffer.isBuffer(res.data)
                ? res.data
                : Buffer.from(new Uint8Array(res.data));

            console.log(`  ダウンロードサイズ: ${buf.length} bytes`);
            const headerStr = buf.slice(0, 5).toString('ascii');
            console.log(`  先頭5文字: "${headerStr}" ${headerStr === '%PDF-' ? '(PDF ✅)' : '(不明 ⚠️)'}`);

            if (buf.length > 1000) {
                const base64 = buf.toString('base64');
                console.log('  Geminiに送信テスト中（PDF）...');
                const result = await model.generateContent([
                    { text: 'このPDFの1行目に書かれているテキストは何ですか？' },
                    { inlineData: { data: base64, mimeType: 'application/pdf' } }
                ]);
                console.log(`  Geminiレスポンス: ${result.response.text().substring(0, 100)}`);
                console.log('  ✅ PDF Gemini送信成功！');
            }

        } catch (err) {
            console.log(`  ❌ 失敗: ${err.message}`);
        }
    } else {
        console.log('  pdf_drive_file_idなし');
    }

    // === テスト3: HTTP直接フェッチ ===
    console.log('\n--- テスト3: HTTP直接ダウンロード (page_image_url) ---');
    if (page.page_image_url) {
        try {
            const res = await fetch(page.page_image_url, { redirect: 'follow' });
            const ct = res.headers.get('content-type');
            console.log(`  HTTP Status: ${res.status}`);
            console.log(`  Content-Type: ${ct}`);

            const buf = Buffer.from(await res.arrayBuffer());
            console.log(`  ダウンロードサイズ: ${buf.length} bytes`);

            if (ct?.includes('image') && buf.length > 1000) {
                const base64 = buf.toString('base64');
                console.log('  Geminiに送信テスト中...');
                const result = await model.generateContent([
                    { text: 'この画像に書かれているテキストを一行だけ教えてください' },
                    { inlineData: { data: base64, mimeType: ct.split(';')[0] } }
                ]);
                console.log(`  Geminiレスポンス: ${result.response.text().substring(0, 100)}`);
                console.log('  ✅ HTTP画像 Gemini送信成功！');
            } else {
                console.log(`  ⚠️ 画像ではない応答 (${ct}, ${buf.length}bytes)`);
                const preview = buf.slice(0, 200).toString('utf8');
                console.log(`  応答プレビュー: ${preview}`);
            }
        } catch (err) {
            console.log(`  ❌ 失敗: ${err.message}`);
        }
    }

    console.log('\n=== 診断完了 ===');
}

main().catch(console.error);
