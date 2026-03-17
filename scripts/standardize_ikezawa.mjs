import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function standardizeIkezawa() {
    console.log("Starting standardization of subcontractor name: 池沢...");

    // Find all records in report_subcontractors that match the variations
    const { data: subRecords, error: err1 } = await supabase
        .from('report_subcontractors')
        .select('id, subcontractor_name')
        .in('subcontractor_name', ['池澤', '池沢様', '池澤様', '(株)池沢', '株式会社池沢']); // Added a few common variations just in case

    if (err1) {
        console.error("Error fetching report_subcontractors:", err1);
        return;
    }

    console.log(`Found ${subRecords.length} records in report_subcontractors needing update.`);

    let updatedCount = 0;
    for (const record of subRecords) {
        const { error: errUpdate } = await supabase
            .from('report_subcontractors')
            .update({ subcontractor_name: '池沢' })
            .eq('id', record.id);
            
        if (!errUpdate) {
            updatedCount++;
        } else {
            console.error(`Failed to update record ID ${record.id}:`, errUpdate);
        }
    }
    console.log(`Successfully updated ${updatedCount} records in report_subcontractors.`);

    // Also check completion_reports if witness or inspector
    // We already moved reporter/inspector to use worker names, but let's check witness just in case.
    const { data: compRecords, error: err2 } = await supabase
        .from('completion_reports')
        .select('id, witness')
        .in('witness', ['池澤', '池沢様', '池澤様']);

    if (err2) {
        console.error("Error fetching completion_reports:", err2);
    } else if (compRecords && compRecords.length > 0) {
        console.log(`Found ${compRecords.length} records in completion_reports needing update for witness.`);
        let compUpdated = 0;
        for (const record of compRecords) {
            const { error: errUpdate } = await supabase
                .from('completion_reports')
                .update({ witness: '池沢' })
                .eq('id', record.id);
            if (!errUpdate) compUpdated++;
        }
        console.log(`Successfully updated ${compUpdated} witness records.`);
    }

    console.log("Finished standardization.");
}

standardizeIkezawa();
