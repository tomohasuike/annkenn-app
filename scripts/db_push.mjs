import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌環境変数が不足しています。");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log("🚀 SQLの自動インポートを開始します...");
  const sqlFile = path.join(__dirname, 'catalogs_insert.sql');
  const lines = fs.readFileSync(sqlFile, 'utf-8').split('\n');
  
  // 500行ずつに分割してRPC経由で送信
  const CHUNK_SIZE = 500;
  let currentChunk = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('--')) {
      currentChunk.push(line);
    }
    
    if (currentChunk.length >= CHUNK_SIZE || i === lines.length - 1) {
      if (currentChunk.length === 0) continue;
      
      const queryStr = currentChunk.join('\n');
      console.log(`📤 ${currentChunk.length} 行のSQLを送信中... (進捗: ${i + 1}/${lines.length})`);
      
      const { data, error } = await supabase.rpc('exec_raw_sql', { query: queryStr });
      if (error) {
        console.error("❌ エラー発生:", error);
        return;
      }
      
      currentChunk = [];
      // 負荷対策の待機時間
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log("🎉 すべてのデータのフルインポートが完了しました！");
}

run();
