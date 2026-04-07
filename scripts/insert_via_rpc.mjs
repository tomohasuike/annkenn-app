import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function pushData() {
  console.log('Fetching manufacturer IDs...');
  const { data: manufacturers } = await supabase.from('manufacturers').select('id, name');
  const manMap = {};
  if (manufacturers) {
    manufacturers.forEach(m => manMap[m.name] = m.id);
  }

  const files = await fs.readdir('scripts/sql_chunks');
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
  
  let validRecords = [];
  let noMatchCount = 0;

  for (const file of sqlFiles) {
    console.log(`Processing ${file}...`);
    const content = await fs.readFile(`scripts/sql_chunks/${file}`, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (!line.trim().startsWith('INSERT INTO materials')) continue;
      
      const valStr = line.substring(line.indexOf('VALUES'));
      
      // We can actually just parse it by splitting or by evaluating. Let's do a more robust regex that ignores contents inside quotes better or just capture everything up to comma.
      // E.g. (NULL|[0-9.]+|'[^']*')
      const regex = /VALUES \(\(SELECT id FROM manufacturers WHERE name = '([^']+)' LIMIT 1\),\s*'([^']+)',\s*'([^']+)',\s*'([^']*)',\s*(NULL|[0-9.]+),\s*'([^']*)',\s*'([^']*)',\s*(NULL|[0-9.]+),\s*(NULL|[0-9.]+),\s*(NULL|[0-9.]+)\);?/;
      const match = valStr.match(regex);
      
      if (match) {
        const [, manufName, modelNumber, name, description, priceStr, imageUrl, catalogUrl, wStr, hStr, dStr] = match;
        if (!manMap[manufName]) {
            console.log("Manu name not found:", manufName);
            continue;
        }

        validRecords.push({
          manufacturer_id: manMap[manufName],
          model_number: modelNumber,
          name: name,
          description: description,
          standard_price: priceStr === 'NULL' ? null : parseFloat(priceStr),
          image_url: imageUrl,
          catalog_url: catalogUrl,
          width_mm: wStr === 'NULL' ? null : parseFloat(wStr),
          height_mm: hStr === 'NULL' ? null : parseFloat(hStr),
          depth_mm: dStr === 'NULL' ? null : parseFloat(dStr)
        });
      } else {
        if (noMatchCount < 5) console.log("NO MATCH:", line.substring(0, 150));
        noMatchCount++;
      }
    }
  }

  console.log(`Extracted ${validRecords.length} valid records. (Failed to match: ${noMatchCount})`);
  if (validRecords.length === 0) return;
  
  const BATCH_SIZE = 500;
  for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
    const batch = validRecords.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase.rpc('bulk_insert_materials', { payload: batch });
    if (error) {
      console.error(`\nError inserting batch at index ${i}:`, error.message);
      break; 
    } else {
      process.stdout.write(`\rInserted batch: ${Math.min(i + batch.length, validRecords.length)} / ${validRecords.length}`);
    }
  }
  console.log('\nDone!');
}

pushData();
