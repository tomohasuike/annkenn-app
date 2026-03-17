import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSubcontractors() {
    console.log("Fetching distinct subcontractor names...");
    const { data: subs, error } = await supabase
        .from('report_subcontractors')
        .select('subcontractor_name');

    if (error) {
        console.error("Error fetching subcontractors:", error);
        return;
    }

    const uniqueNames = [...new Set(subs.map(s => s.subcontractor_name))];
    const ikezawas = uniqueNames.filter(name => name && name.includes('池'));

    console.log("Names containing '池':", ikezawas);
}

checkSubcontractors();
