import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: all, error } = await supabase.from('report_personnel').select('worker_name');
    console.log("Total personnel attached ever:", all?.length);
    const ikezawas = all?.filter(p => p.worker_name && p.worker_name.includes('池沢'));
    console.log("Variations of ikezawa:", ikezawas);
}
check();
