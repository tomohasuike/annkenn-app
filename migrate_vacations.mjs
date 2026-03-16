import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  const matches = content.match(/"({.*?})"/g);
  const assignmentsStr = matches[0].slice(1, -1).replace(/""/g, '"');
  const assignments = JSON.parse(assignmentsStr);

  const { data: dbProj } = await supabase.from('projects').select('id').eq('legacy_id', 'vacation').single();
  const vacationProjId = dbProj?.id;
  
  if (!vacationProjId) return console.error("vacation project not found!");
  
  const { data: dbWorker } = await supabase.from('worker_master').select('id, name');
  const workerLookupByName = new Map();
  dbWorker.forEach(w => {
      if (w.name) workerLookupByName.set(w.name.replace(/\s+/g, ''), w.id);
  });
  
  const insertPayloads = [];

  for (const [key, resourceList] of Object.entries(assignments)) {
      if (!key.includes('vacation')) continue;
      
      const match = key.match(/^([\w-]+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) continue;
      
      const year = match[2]; 
      const month = match[3]; 
      const day = match[4];
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      for (const res of resourceList) {
          if (!res.name) continue;
          
          const normalizedName = res.name.replace(/\s+/g, '');
          const workerId = workerLookupByName.get(normalizedName);
          const count = parseInt(res.count) || 1;
          
          if (workerId) {
             insertPayloads.push({
                 project_id: vacationProjId,
                 assignment_date: dateStr,
                 worker_id: workerId,
                 count: count
             });
          }
      }
  }
  
  console.log(`Inserting ${insertPayloads.length} vacation assignments...`);
  if (insertPayloads.length > 0) {
      const { error } = await supabase.from('assignments').insert(insertPayloads);
      if (error) console.error(error);
      else console.log("Success!");
  }
}
check();
