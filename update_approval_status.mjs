import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const csvFilePath = '/Users/hasuiketomoo/Downloads/完了報告DB - 完了報告書.csv';

async function main() {
    const content = fs.readFileSync(csvFilePath, 'utf8');
    const records = parse(content, { columns: true, skip_empty_lines: true });
    
    let successCount = 0;
    
    for (const record of records) {
        const legacy_id = record['ID'];
        const approval_status = record['承認ステータス'] || null;
        const approver_comment = record['承認者コメント'] || null;
        
        if (!legacy_id) continue;
        
        const { data, error } = await supabase
            .from('completion_reports')
            .update({
                approval_status: approval_status,
                approver_comment: approver_comment
            })
            .eq('report_id', legacy_id);
            
        if (error) {
            console.error(`Error updating report ${legacy_id}:`, error.message);
        } else {
            successCount++;
            console.log(`Updated status for report ${legacy_id}`);
        }
    }
    
    console.log(`\nStatus update complete. Processed ${successCount} reports.`);
}
main();
