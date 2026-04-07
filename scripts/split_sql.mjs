import fs from 'fs';
import path from 'path';

const inputFilePath = path.join(process.cwd(), 'scripts/catalogs_insert.sql');
const outputDir = path.join(process.cwd(), 'scripts/sql_chunks');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const lines = fs.readFileSync(inputFilePath, 'utf-8').split('\n');
const CHUNK_SIZE = 4000; // 4000行ずつに分割
let chunkCount = 1;
let currentChunkLines = [];

console.log(`🧹 総行数: ${lines.length} 行を分割します...`);

for (let i = 0; i < lines.length; i++) {
  currentChunkLines.push(lines[i]);
  if (currentChunkLines.length >= CHUNK_SIZE || i === lines.length - 1) {
    const chunkFileName = `catalogs_insert_part${String(chunkCount).padStart(2, '0')}.sql`;
    const chunkFilePath = path.join(outputDir, chunkFileName);
    fs.writeFileSync(chunkFilePath, currentChunkLines.join('\n'));
    console.log(`✅ 作成完了: ${chunkFileName} (${currentChunkLines.length} 行)`);
    chunkCount++;
    currentChunkLines = [];
  }
}

console.log('🎉 ファイルの分割が完了しました！');
console.log('👉 `scripts/sql_chunks/` フォルダの中のファイルを1つずつSupabaseにアップロードしてRunしてください！');
