const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

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

console.log("Headers:", headers);
console.log("Indices:", {pNoIdx, contactIdx});

let sample = [];
for (let i = 1; i < 5; i++) {
  const cols = splitCSVLine(lines[i]);
  sample.push({pNo: cols[pNoIdx], contact: cols[contactIdx]});
}
console.log("Sample Data:", sample);
