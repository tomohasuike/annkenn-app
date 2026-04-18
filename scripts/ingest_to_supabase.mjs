import fs from 'fs';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key is missing.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getManufacturerIds() {
  const { data, error } = await supabase.from('manufacturers').select('id, name');
  if (error) throw error;
  const map = {};
  data.forEach(d => { map[d.name] = d.id; });
  return map;
}

// Regex to capture values from the INSERT statement.
// Example: INSERT INTO materials (...) VALUES ((SELECT id FROM manufacturers WHERE name = '日東工業' LIMIT 1), 'B10-255', '(B)盤用キャビネット露出形', '日東工業製 (B)盤用キャビネット露出形 (ページ 159)', NULL, 'https...', 'https...', NULL, NULL, NULL);
// Using cautious regex
const regex = /VALUES \(\(SELECT id FROM manufacturers WHERE name = '([^']+)' LIMIT 1\),\s*'([^']+)'(?:,\s*'([^']+)'|,\s*NULL)(?:,\s*'([^']+)'|,\s*NULL)(?:,\s*([0-9.]+)|,\s*NULL)(?:,\s*'([^']+)'|,\s*NULL)(?:,\s*'([^']+)'|,\s*NULL)(?:,\s*([0-9.]+)|,\s*NULL)(?:,\s*([0-9.]+)|,\s*NULL)(?:,\s*([0-9.]+)|,\s*NULL)\);/;

async function run() {
  console.log("Loading manufacturers...");
  const mfgMap = await getManufacturerIds();
  console.log(`Found ${Object.keys(mfgMap).length} manufacturers.`);

  const fileStream = fs.createReadStream('scripts/catalogs_insert.sql');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let batch = [];
  let processed = 0;
  let inserted = 0;
  let parseErrors = 0;

  console.log("Starting ingestion...");

  for await (const line of rl) {
    if (!line.startsWith('INSERT INTO')) continue;
    processed++;
    
    // We can manually split or use regex. Since String escaping might vary, regex is best.
    const match = line.match(/name = '([^']+)' LIMIT 1\), (.*)\);/);
    if (!match) {
        parseErrors++;
        continue;
    }
    
    const mfgName = match[1];
    const mfgId = mfgMap[mfgName];
    if (!mfgId) {
        // Create manufacturer if missing
        console.log(`Creating missing manufacturer: ${mfgName}`);
        const { data: newMfg, error: errMfg } = await supabase.from('manufacturers').insert({ name: mfgName }).select().single();
        if (errMfg) { console.error("Error creating mfg", mfgName, errMfg); continue; }
        mfgMap[mfgName] = newMfg.id;
    }

    // A safer way to split the CSV-like part: (.*)\);
    // Since descriptions might contain commas, we can just eval it as an array string!
    let argsStr = match[2];
    // Replace NULL with null
    argsStr = argsStr.replace(/NULL/g, 'null');
    // argsStr is like: 'S-70', 'VE両サドル', 'VE管用...', null, 'http...', 'http...', null, null, null
    let arr;
    try {
        arr = eval(`[${argsStr}]`);
    } catch(e) {
        console.log(`Cannot parse: ${argsStr}`);
        parseErrors++;
        continue;
    }

    const item = {
        manufacturer_id: mfgMap[mfgName],
        model_number: arr[0],
        name: arr[1],
        description: arr[2],
        standard_price: arr[3],
        image_url: arr[4],
        catalog_url: arr[5],
        width_mm: arr[6],
        height_mm: arr[7],
        depth_mm: arr[8]
    };
    
    batch.push(item);

    if (batch.length >= 2000) {
      const { error } = await supabase.from('materials').insert(batch);
      if (error) console.error("Batch insert error:", error.message);
      else inserted += batch.length;
      
      console.log(`Progress: Processed ${processed}, Inserted ${inserted}`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('materials').insert(batch);
    if (error) console.error("Final batch insert error:", error.message);
    else inserted += batch.length;
  }

  console.log(`Done! Processed total: ${processed}. Inserted: ${inserted}. Parse errors: ${parseErrors}`);
}

run().catch(console.error);
