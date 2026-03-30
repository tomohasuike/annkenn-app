import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// Use the env file from root
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts', 'mondragon.txt'), 'utf8');

// Quick TSV parser
const rows = raw.split('\n').map(r => r.split('\t'));

async function run() {
  const { data: worker } = await supabase.from('worker_master').select('id, name').eq('name', 'モンドラゴン　ホセ').single();
  if (!worker) { console.error("Worker not found"); return; }
  
  let currentMonth = 2; 
  const year = 2026;
  
  const extractedReports = [];
  
  for (const row of rows) {
    if (row.length < 15) continue;
    const m = row[0]?.trim(); const dot = row[1]?.trim(); const d = row[2]?.trim();
    if (dot === '.' && d && !isNaN(parseInt(d))) {
      if (m && !isNaN(parseInt(m))) currentMonth = parseInt(m);
      const day = parseInt(d);
      
      const siteName = row.length >= 17 ? row[16]?.trim() : '';
      if (siteName) {
        const dateStr = `${year}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        // The original text includes weird newlines or quotes in the siteName
        const cleanSiteName = siteName.replace(/^["']|["']$/g, '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
        
        extractedReports.push({
          date: dateStr,
          siteName: cleanSiteName
        });
      }
    }
  }

  console.log(`Found ${extractedReports.length} reports to insert for ${worker.name}.`);

  const projectCache = {};

  for (const r of extractedReports) {
    // 1. Resolve Project ID
    let projectId = projectCache[r.siteName];
    if (!projectId) {
       // Search DB
       let { data: existingProject } = await supabase.from('projects')
         .select('id')
         .eq('project_name', r.siteName)
         .maybeSingle();

       if (existingProject) {
         projectId = existingProject.id;
       } else {
         // Create dummy project for this site name
         const { data: newProj, error } = await supabase.from('projects').insert([{
           project_name: r.siteName,
           project_number: 'TEMP-' + Math.floor(Math.random() * 100000),
           status_flag: '着工中'
         }]).select('id').single();

         if (error) {
           console.error('Failed to create project:', error); 
           continue; 
         }
         projectId = newProj.id;
       }
       projectCache[r.siteName] = projectId;
    }

    // 2. Insert Daily Report
    const payload = {
        project_id: projectId,
        report_date: r.date,
        start_time: '2000-01-01T08:00:00', // Need complete timestamp or what Type is it? Actually we can pass ISO, but let's pass a safe time string.
        end_time: '2000-01-01T17:00:00'
    };
    
    // Check if report already exists for this project on this date
    let { data: existingRep } = await supabase.from('daily_reports')
         .select('id')
         .eq('project_id', projectId)
         .eq('report_date', r.date)
         .maybeSingle();

    let reportId = existingRep?.id;

    if (!reportId) {
       const { data: newReport, error } = await supabase.from('daily_reports').insert([payload]).select('id').single();
       if (error) { console.error('report insert err:', error); continue; }
       reportId = newReport.id;
    }
    
    // 3. Insert personnel linked to jose
    const { data: pExist } = await supabase.from('report_personnel')
       .select('id')
       .eq('report_id', reportId)
       .eq('worker_id', worker.id)
       .maybeSingle();

    if (!pExist) {
       await supabase.from('report_personnel').insert([{
           report_id: reportId,
           worker_id: worker.id
       }]);
       console.log(`Inserted report mapped to Jose for ${r.date} at ${r.siteName}`);
    } else {
       console.log(`Already mapped report for ${r.date} at ${r.siteName}`);
    }
  }
  
  console.log("Done!");
}

run();
