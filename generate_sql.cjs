const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(process.env.HOME, 'Downloads', '案件マスタDB - 工事案件マスター.csv');
const content = fs.readFileSync(CSV_PATH, 'utf8');
const lines = content.split(/\r?\n/);

function splitCSVLine(line) {
  const result = [];
  let startValueIndex = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ',' && !inQuotes) {
      result.push(line.substring(startValueIndex, i).trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
      startValueIndex = i + 1;
    }
  }
  result.push(line.substring(startValueIndex).trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
  return result;
}

const headers = splitCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
const pNoIdx = headers.indexOf('工事番号');
const contactIdx = headers.indexOf('発注先担当者');

let sql = `-- 自動生成: 発注先担当者のデータ移行スクリプト\n\n`;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const cols = splitCSVLine(line);
  if (cols.length < headers.length) continue;
  
  const pNo = cols[pNoIdx];
  const contact = cols[contactIdx];
  
  if (pNo && contact && contact.trim() !== '') {
    // Escape single quotes just in case
    const safeContact = contact.trim().replace(/'/g, "''");
    sql += `UPDATE public.projects SET client_company_name = '${safeContact}' WHERE project_number = '${pNo}';\n`;
  }
}

const outPath = path.join(process.env.HOME, '.gemini/antigravity/brain/b023db34-d4c0-4c3e-b885-3262517ce6c2/update_contacts.sql');
fs.writeFileSync(outPath, sql);
console.log('SQL generated:', outPath);
