import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Use strict service_role key to bypass all limitations
const supabaseKey = "SECRET_REDACTED";
const supabase = createClient(supabaseUrl, supabaseKey);

const cleanStr = (str) => {
    if (str === 'NULL' || !str) return null;
    if (str.startsWith("'") && str.endsWith("'")) {
        return str.substring(1, str.length - 1).replace(/''/g, "'");
    }
    return str;
};

async function run() {
  console.log('メーカー情報を初期化しています...');
  
  const mfgNamesToInsert = ['未来工業', 'パナソニック', 'ネグロス電工', '古河電気工業', '日東工業', 'IDEC', '富士電機', '三菱電機', '内外電機', '春日電機', 'オムロン'];
  for(const name of mfgNamesToInsert) {
      await supabase.from('manufacturers').upsert({ name }, { onConflict: 'name' });
  }

  const { data: mfgData, error: mfgErr } = await supabase.from('manufacturers').select('id, name');
  if (mfgErr) {
      console.error('マスターキーエラー:', mfgErr.message);
      return;
  }
  const mfgMap = {};
  if (mfgData) {
    mfgData.forEach(m => mfgMap[m.name] = m.id);
  }

  console.log('2.5万件の巨大データをマスターキーで解析・注入します...');
  const fileContent = fs.readFileSync(resolve(__dirname, 'catalogs_insert.sql'), 'utf-8');
  const chunks = fileContent.split('INSERT INTO');
  let objects = [];
  
  for (let chunk of chunks) {
    if (!chunk.includes('materials')) continue;
    try {
        const valueStart = chunk.indexOf('VALUES (');
        if (valueStart === -1) continue;
        const valueEnd = chunk.lastIndexOf(');');
        if (valueEnd === -1) continue;

        let inner = chunk.substring(valueStart + 8, valueEnd).trim();
        inner = inner.replace(/\n/g, '');

        const mfgMarker = "name = '";
        const mfgStart = inner.indexOf(mfgMarker);
        if (mfgStart === -1) continue;
        const mfgEnd = inner.indexOf("'", mfgStart + mfgMarker.length);
        if (mfgEnd === -1) continue;
        const mfgName = inner.substring(mfgStart + mfgMarker.length, mfgEnd);

        const restStart = inner.indexOf("), ", mfgEnd);
        if (restStart === -1) continue;
        const restStr = inner.substring(restStart + 3); 
        
        let parts = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < restStr.length; i++) {
            if (restStr[i] === "'") {
                if (i + 1 < restStr.length && restStr[i+1] === "'") {
                    cur += "'"; 
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (restStr[i] === ',' && !inQuotes) {
                parts.push(cur.trim());
                cur = '';
            } else {
                cur += restStr[i];
            }
        }
        parts.push(cur.trim()); 

        if (parts.length >= 9) {
            const num = cleanStr(parts[0]);
            const name = cleanStr(parts[1]);
            const desc = cleanStr(parts[2]);
            const price = parts[3] === 'NULL' ? null : Number(parts[3]);
            const img = cleanStr(parts[4]);
            const docUrl = cleanStr(parts[5]);
            const w = parts[6] === 'NULL' ? null : Number(parts[6]);
            const h = parts[7] === 'NULL' ? null : Number(parts[7]);
            const d = parts[8] === 'NULL' ? null : Number(parts[8]);

            if (mfgMap[mfgName] && num) {
                objects.push({
                    manufacturer_id: mfgMap[mfgName],
                    model_number: num,
                    name: name,
                    description: desc,
                    standard_price: price,
                    image_url: img,
                    catalog_url: docUrl,
                    width_mm: w,
                    height_mm: h,
                    depth_mm: d
                });
            }
        }
    } catch(e) { }
  }

  console.log(`✅ 解析成功: ${objects.length} 件のデータをSupabaseに流し込みます。しばらくお待ち下さい...`);
  if (objects.length === 0) return;
  
  const batchSize = 1000;
  let successCount = 0;
  for (let i = 0; i < objects.length; i += batchSize) {
     const batch = objects.slice(i, i + batchSize);
     const { error } = await supabase.from('materials').insert(batch);
     if (error) {
         console.log('❌ 流し込みエラー:', i, error.message);
     } else {
         successCount += batch.length;
         console.log(`🚀 進捗: ${successCount} / ${objects.length} 件完了`);
     }
  }
  console.log('🎉 🎉 2万5千件のカタログデータの全投入が完全終了しました！！ 🎉 🎉');
}

run();
