import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateIkezawa() {
    console.log("Looking up Ikezawa in worker_master...");
    const { data: ikezawaRecords, error: err1 } = await supabase
        .from('worker_master')
        .select('*')
        .like('name', '%池沢%');

    if (err1) {
        console.error("Error fetching Ikezawa:", err1);
        return;
    }

    if (!ikezawaRecords || ikezawaRecords.length === 0) {
        console.log("No records found for 池沢 in worker_master.");
        return;
    }

    const targetUser = ikezawaRecords[0];
    console.log(`Found Ikezawa: ID ${targetUser.id}, Name: ${targetUser.name}`);

    console.log("Searching for daily reports where Ikezawa was present...");
    const { data: personnelRecords, error: err2 } = await supabase
        .from('report_personnel')
        .select('id, report_id')
        .or(`worker_id.eq.${targetUser.id},worker_name.ilike.%池沢%`);

    if (err2) {
        console.error("Error finding personnel records:", err2);
        return;
    }

    console.log(`Found ${personnelRecords.length} daily report attachments for him.`);

    // For each record, delete it from report_personnel and add to report_subcontractors
    let migratedCount = 0;
    for (const record of personnelRecords) {
        // 1. Check if he is already a subcontractor on this report
        const { data: existingSub, error: err3 } = await supabase
            .from('report_subcontractors')
            .select('*')
            .eq('report_id', record.report_id)
            .eq('subcontractor_name', targetUser.name);
            
        if (!existingSub || existingSub.length === 0) {
            // He is not, so add him.
            const { error: errIns } = await supabase
                .from('report_subcontractors')
                .insert([{
                    report_id: record.report_id,
                    subcontractor_name: targetUser.name,
                    worker_count: '1'
                }]);
            
            if (errIns) {
                console.error("Failed to insert into subcontractors:", errIns);
            } else {
                migratedCount++;
            }
        }
        
        // 2. Delete the personnel record
        await supabase
            .from('report_personnel')
            .delete()
            .eq('id', record.id);
    }

    console.log(`Successfully migrated Ikezawa to subcontractors on ${migratedCount} reports.`);
    
    // Finally, delete Ikezawa from worker_master
    console.log("Deleting Ikezawa from worker_master to hide him from the UI...");
    
    // Sometimes there are other foreign key constraints. If he has auth etc it might block.
    // Setting type to '業等' or deleting directly.
    const { error: errDel } = await supabase
        .from('worker_master')
        .delete()
        .eq('id', targetUser.id);
        
    if (errDel) {
         console.error("Failed to fully delete Ikezawa from worker_master. He might have dependents (like being a reporter).");
         console.log("Instead, let's change his 'type' to something else or mask his name so he doesn't show in the UI list...");
         console.log("Wait, the worker query says `.neq('type', '事務員')` in ReportForm. Let's just set his type to '協力業者' to be safe, if delete fails.");
         
         const { error: errHide } = await supabase
            .from('worker_master')
            .update({ type: '事務員' }) // Quick hack: ReportForm filters out 事務員
            .eq('id', targetUser.id);
            
         if (!errHide) {
             console.log("Worker record hidden by changing type to '事務員'.");
         } else {
             console.error("Failed to hide:", errHide);
         }
    } else {
         console.log("Successfully deleted Ikezawa from worker_master.");
    }
}

migrateIkezawa();
