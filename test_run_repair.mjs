import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function runRepair() {
    process.stdout.write("Running repair-drive Edge Function... ");
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/repair-drive`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
        }
    }); 
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
}
runRepair();
