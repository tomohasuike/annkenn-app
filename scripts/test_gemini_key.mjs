import fs from 'fs';
import path from 'path';

// 既存の supabase/functions/.env からキーを読み込む
const envPath = path.resolve(process.cwd(), 'supabase/functions/.env');
let apiKey = null;

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const apiKeyMatch = envContent.match(/VITE_GOOGLE_API_KEY=([^\n]+)/);
  if (apiKeyMatch) {
    apiKey = apiKeyMatch[1].trim();
  }
} catch (e) {
  console.error(".envファイルの読み込みに失敗しました:", e.message);
  process.exit(1);
}

if (!apiKey) {
  console.error("VITE_GOOGLE_API_KEY が見つかりませんでした。");
  process.exit(1);
}

console.log("APIキーの読み込みに成功しました。AIにテストメッセージを送信しています...");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function listModels() {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(await res.text());
    } else {
      const data = await res.json();
      console.log("利用可能なモデル抜粋:");
      data.models.filter(m => m.name.includes('gemini')).forEach(m => console.log(m.name));
    }
  } catch (e) {
    console.error(e);
  }
}
listModels();
