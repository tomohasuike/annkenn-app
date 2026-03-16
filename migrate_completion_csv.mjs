import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const csvFilePath = '/Users/hasuiketomoo/Downloads/完了報告DB - 完了報告書.csv';

async function main() {
    const content = fs.readFileSync(csvFilePath, 'utf8');
    
    // Parse using csv-parse to handle multiline quotes correctly
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true
    });
    
    console.log(`Parsed ${records.length} records from CSV.`);
    
    // Header keys according to the file:
    // ID, 工事案件, 完了日, 報告者, 検査者, 検査日時, 検査項目, 検査内容, 立会者, 検査結果, 備考, 承認ステータス, 承認者コメント, 代表写真
    
    const { data: projects } = await supabase.from('projects').select('id, legacy_id');
    const projectMap = new Map();
    for (const p of projects) {
        if (p.legacy_id) projectMap.set(p.legacy_id, p.id);
        projectMap.set(p.id, p.id);
    }
    
    let successCount = 0;
    
    for (const record of records) {
        const r_id = record['ID'];
        const legacy_project = record['工事案件'];
        
        let project_id = projectMap.get(legacy_project);
        if (!project_id) {
             console.log(`Warning: Project not found map for ${legacy_project}. Skipping report ${r_id}.`);
             continue; 
        }
        
        // formatDate to YYYY-MM-DD
        let completion_date = null;
        if (record['完了日']) {
            const parts = record['完了日'].split('/');
            if (parts.length === 3) completion_date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        
        let inspection_datetime = null;
        if (record['検査日時']) {
            // "2026/02/14 17:00:00" -> ISO
            const [dpart, tpart] = record['検査日時'].split(' ');
            if (dpart && tpart) {
                const dp = dpart.split('/');
                const tp = tpart.split(':');
                inspection_datetime = `${dp[0]}-${dp[1].padStart(2, '0')}-${dp[2].padStart(2, '0')}T${tp[0].padStart(2, '0')}:${tp[1].padStart(2, '0')}:${tp[2].padStart(2, '0')}+09:00`;
            }
        }
        
        let inspection_items = [];
        if (record['検査項目']) {
            // Split by " , " or ","
            inspection_items = record['検査項目'].replace(/\s*,\s*/g, ',').split(',').map(s => s.trim()).filter(Boolean);
        }
        
        const payload = {
            report_id: r_id || null,
            project_id: project_id,
            reporter: record['報告者'] || '',
            inspector: record['検査者'] || '',
            completion_date: completion_date,
            inspection_datetime: inspection_datetime,
            inspection_items: inspection_items,
            inspection_details: record['検査内容'] || '',
            witness: record['立会者'] || '',
            inspection_result: record['検査結果'] || '',
            remarks: record['備考'] || ''
        };
        
        const { error } = await supabase.from('completion_reports').insert([payload]);
        if (error) {
            console.error(`Error inserting ${r_id}:`, error.message);
        } else {
            successCount++;
            console.log(`Inserted report ${r_id}`);
        }
    }
    
    console.log(`Migration complete. Successfully inserted: ${successCount} records.`);
}
main();
