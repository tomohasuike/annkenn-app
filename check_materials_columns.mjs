import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Fetching materials columns...');
    const { data, error } = await supabase.from('materials').select('*').limit(1);
    if (error) {
        console.error('Error:', error.message);
    } else {
        if (data && data.length > 0) {
            console.log('Columns derived from row 0:', Object.keys(data[0]));
        } else {
            console.log('Table is empty, trying to query properties indirectly or table has no rows to derive columns.');
        }
    }
}
run();
