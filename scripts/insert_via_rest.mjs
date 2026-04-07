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

  for (const file of sqlFiles) {
    console.log(`Processing ${file}...`);
    const content = await fs.readFile(`scripts/sql_chunks/${file}`, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (!line.startsWith('INSERT INTO materials')) continue;
      
      // Match the pattern carefully
      // VALUES ((SELECT id FROM manufacturers WHERE name = 'NAME' LIMIT 1), 'MODEL', 'NAME', 'DESC', PRICE, 'IMAGE', 'URL', W, H, D);
      const regex = /VALUES \(\(SELECT id FROM manufacturers WHERE name = '([^']+)' LIMIT 1\),\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(NULL|\d+),\s*'([^']+)',\s*'([^']+)',\s*(NULL|\d+),\s*(NULL|\d+),\s*(NULL|\d+)\);/;
      const match = line.match(regex);
      
      if (match) {
        const [, manufName, modelNumber, name, description, priceStr, imageUrl, catalogUrl, wStr, hStr, dStr] = match;
        
        validRecords.push({
          manufacturer_id: manMap[manufName],
          model_number: modelNumber,
          name: name,
          description: description,
          standard_price: priceStr === 'NULL' ? null : parseInt(priceStr, 10),
          image_url: imageUrl,
          catalog_url: catalogUrl,
          width_mm: wStr === 'NULL' ? null : parseFloat(wStr),
          height_mm: hStr === 'NULL' ? null : parseFloat(hStr),
          depth_mm: dStr === 'NULL' ? null : parseFloat(dStr)
        });
      }
    }
  }

  console.log(`Extracted ${validRecords.length} valid records.`);
  
  // Insert via batches of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
    const batch = validRecords.slice(i, i + BATCH_SIZE);
    
    // Check if we already inserted some to avoid massive duplicates logic? 
    // Wait, let's just insert all if it's currently 0.
    const { error } = await supabase.from('materials').insert(batch);
    if (error) {
      console.error(`Error inserting batch at index ${i}:`, error.message);
      break; 
    } else {
      process.stdout.write(`\rInserted batch: ${i + batch.length} / ${validRecords.length}`);
    }
  }
  console.log('\nDone!');
}

pushData();
