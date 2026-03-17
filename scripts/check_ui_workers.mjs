import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUIList() {
    const { data: wData } = await supabase.from('worker_master').select('id, name, type').neq('type', '事務員');
    console.log("Workers who will appear in the UI:");
    wData.forEach(w => console.log(w.name, `(${w.type})`));
}
checkUIList();
