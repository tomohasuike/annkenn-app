import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function getVal(row, possibleKeys) {
    for (const k of possibleKeys) {
        if (row[k] !== undefined) return row[k];
    }
    return null;
}

const DIR = '/Users/hasuiketomoo/Downloads/';

async function fixPersonnel() {
    console.log('Fetching workers...');
    const { data: workers } = await supabase.from('worker_master').select('id, name');
    
    console.log('Fetching reports mapping...');
    const { data: existingReps } = await supabase.from('daily_reports').select('id, legacy_id').not('legacy_id', 'is', null);
    const dbReports = new Map();
    existingReps.forEach(r => dbReports.set(r.legacy_id, r.id));

    const parseCsv = (filename) => {
        if (!fs.existsSync(DIR + filename)) return [];
        return parse(fs.readFileSync(DIR + filename, 'utf8'), { columns: true, skip_empty_lines: true });
    };

    const nippoRows = parseCsv('日報リソースDB - 工事日報.csv');
    const yoteiRows = parseCsv('明日の業務日報DB - 業務予定.csv');
    const allReports = [...nippoRows, ...yoteiRows];

    console.log('Parsed CSVs. Re-running personnel migration...');
    
    // Clear all legacy personnel first to avoid duplicates or orphans
    // Delete in chunks to avoid timeout
    console.log('Truncating legacy personnel...');
    const {data: persToDel} = await supabase.from('report_personnel').select('id').not('report_legacy_id', 'is', null);
    if(persToDel && persToDel.length > 0) {
       for(let i=0; i<persToDel.length; i+=100) {
           const chunk = persToDel.slice(i, i+100).map(p=>p.id);
           await supabase.from('report_personnel').delete().in('id', chunk);
           console.log(`Deleted chunk ${i} to ${i+100}`);
       }
    }

    let count = 0;
    for (const row of allReports) {
        const legacyId = getVal(row, ['日報I D', '日報ID', '業務予定ID', 'ID']);
        if (!legacyId) continue;

        const dbId = dbReports.get(legacyId);
        if (!dbId) continue;

        const staffs = getVal(row, ['HITEC作業員', '作業員', '氏名']);
        if (staffs) {
            // DO NOT split by space. Only split by actual delimiters.
            const arr = staffs.split(/[｜|，,、]+/).map(s => s.trim()).filter(s => s);
            
            for (const n of arr) {
                const normalizedName = n.replace(/[\s　]+/g, '');
                if (!normalizedName) continue;
                
                let matchedWorker = workers.find(w => {
                    if (!w.name) return false;
                    const normWName = w.name.replace(/[\s　]+/g, '');
                    return normWName === normalizedName;
                });
                
                // Fallback: if user typed something slightly different
                if (!matchedWorker) {
                     matchedWorker = workers.find(w => {
                        if (!w.name) return false;
                        const normWName = w.name.replace(/[\s　]+/g, '');
                        return normWName.includes(normalizedName) || normalizedName.includes(normWName);
                     });
                }

                await supabase.from('report_personnel').insert({
                    report_id: dbId,
                    report_legacy_id: legacyId,
                    worker_id: matchedWorker ? matchedWorker.id : null,
                    worker_name: n
                });
                count++;
            }
        }
    }
    console.log('Done! Inserted ' + count + ' accurate personnel records.');
}
fixPersonnel();
