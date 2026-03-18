import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    const { data, error } = await supabase.from('assignments').select('id, assignment_date, worker_master!inner(name, type)').eq('worker_master.type', '協力会社').order('created_at', { ascending: false }).limit(5);
    console.log("Assignments with Partners:", JSON.stringify(data, null, 2));
    if (error) console.error(error);
}
test();
