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
  const commentsStr = matches[1].slice(1, -1).replace(/""/g, '"');
  const comments = JSON.parse(commentsStr);

  const { data: dbProj } = await supabase.from('projects').select('id').eq('legacy_id', 'vacation').single();
  const vacationProjId = dbProj?.id;
  
  if (!vacationProjId) return console.error("vacation project not found!");
  
  const dailyDataPayloads = [];

  for (const [key, content] of Object.entries(comments)) {
      if (!key.includes('vacation')) continue;
      
      const match = key.match(/^([\w-]+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) continue;
      
      const year = match[2]; 
      const month = match[3]; 
      const day = match[4];
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      if (typeof content === 'string' && content.trim() !== '') {
          dailyDataPayloads.push({
              project_id: vacationProjId,
              target_date: dateStr,
              comment: content.trim()
          });
      }
  }
  
  console.log(`Inserting ${dailyDataPayloads.length} vacation comments...`);
  if (dailyDataPayloads.length > 0) {
      const { error } = await supabase.from('project_daily_data').upsert(dailyDataPayloads, { onConflict: 'project_id,target_date' });
      if (error) console.error(error);
      else console.log("Success!");
  }
}
check();
