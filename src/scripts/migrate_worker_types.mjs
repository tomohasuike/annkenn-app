import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateWorkerTypes() {
  console.log("Starting migration of worker_master types...");

  // 1. Fetch all workers from current DB
  const { data: dbWorkers, error: fetchErr } = await supabase.from('worker_master').select('id, name, type');
  if (fetchErr) {
    console.error("Failed to fetch workers:", fetchErr);
    return;
  }

  // 2. Read legacy CSV to find partner companies
  let partnerNames = new Set();
  try {
    const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
    const matches = content.match(/"({.*?})"/g);
    if (matches && matches.length >= 3) {
      const customResStr = matches[2].slice(1, -1).replace(/""/g, '"');
      const customRes = JSON.parse(customResStr);
      if (customRes.list && Array.isArray(customRes.list)) {
        customRes.list.forEach(item => {
          if (item.type === 'partner' && item.name) {
            partnerNames.add(item.name.replace(/\s+/g, ''));
          }
        });
      }
    }
  } catch (err) {
    console.warn("Could not read legacy CSV to find partners strictly, using fallback list.", err);
    // Fallbacks from previous exploration
    ['池沢', '三島電気', '岩崎電設', '吉田テック'].forEach(n => partnerNames.add(n));
  }
  
  console.log("Detected partner companies:", Array.from(partnerNames));

  let updateCount = 0;
  
  for (const worker of dbWorkers) {
    let newType = '社員'; // Default
    
    const normalizedName = worker.name ? worker.name.replace(/\s+/g, '') : '';
    
    if (normalizedName.includes('蓮池')) {
      newType = '社長';
    } else if (partnerNames.has(normalizedName) || normalizedName.includes('電気') || normalizedName.includes('電設') || normalizedName.includes('テック')) {
      newType = '協力会社';
    }
    
    // Only update if it's different
    if (worker.type !== newType) {
      const { error: updateErr } = await supabase
        .from('worker_master')
        .update({ type: newType })
        .eq('id', worker.id);
        
      if (updateErr) {
        console.error(`Failed to update ${worker.name}:`, updateErr);
      } else {
        console.log(`Updated [${worker.name}] to ${newType}`);
        updateCount++;
      }
    } else {
        // If it's already a partner but it was added later, we skip
    }
  }

  console.log(`Migration completed. Updated ${updateCount} records.`);
}

migrateWorkerTypes();
