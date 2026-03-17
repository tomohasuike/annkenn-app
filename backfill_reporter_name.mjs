import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE credentials in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backfillReporterNames() {
  console.log("Fetching worker mapping...");
  const { data: workers, error: wErr } = await supabase.from('worker_master').select('name, email');
  if (wErr) {
    console.error("Error fetching workers:", wErr);
    return;
  }

  console.log("Fetching completion reports...");
  const { data: compReports, error: cErr } = await supabase
    .from('completion_reports')
    .select('id, reporter');
  
  if (cErr) {
    console.error("Error setting up completion reports.", cErr);
  } else {
      let cUpdated = 0;
      for (const rep of compReports) {
          if (rep.reporter && /^[a-zA-Z.]+$/.test(rep.reporter)) {
              const matchedWorker = workers.find(w => w.email && w.email.startsWith(rep.reporter));
              if (matchedWorker) {
                  await supabase.from('completion_reports').update({ reporter: matchedWorker.name }).eq('id', rep.id);
                  cUpdated++;
              }
          }
      }
      console.log(`Updated ${cUpdated} completion reports with real names.`);
  }

  console.log("Fetching daily reports...");
  const { data: dailyReports, error: dErr } = await supabase
    .from('daily_reports')
    .select('*')
    .or('reporter_name.is.null,reporter_name.eq.,reporter_name.eq.未設定');

  if (dErr) {
    console.error("Error fetching daily reports:", dErr);
    return;
  }

  console.log(`Found ${dailyReports.length} daily reports missing reporter name.`);
  
  // To backfill daily reports we need their auth emails, which requires admin API.
  // We'll skip auth and just leave them, or match by personnel if there is exactly 1 person.
  let dUpdated = 0;
  for (const report of dailyReports) {
      if (!report.reporter_id) continue;
      
      const { data: personnel } = await supabase.from('report_personnel').select('worker_name, worker_master(name)').eq('report_id', report.id);
      
      if (personnel && personnel.length > 0) {
          // If there's personnel, maybe the first one is the reporter? It's a guess.
          const firstPerson = Array.isArray(personnel[0].worker_master) ? personnel[0].worker_master[0]?.name : personnel[0].worker_master?.name || personnel[0].worker_name;
          
          if (firstPerson) {
              await supabase.from('daily_reports').update({ reporter_name: firstPerson }).eq('id', report.id);
              dUpdated++;
          }
      }
  }
  
  console.log(`Updated ${dUpdated} daily reports with guessed names from personnel.`);
}

backfillReporterNames();
