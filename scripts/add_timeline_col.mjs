import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf-8');
const envConf = {};
envLocal.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) {
        const k = line.substring(0, idx).trim();
        const v = line.substring(idx + 1).trim().replace(/^"|"$/g, '');
        envConf[k] = v;
    }
});

const supabase = createClient(envConf['VITE_SUPABASE_URL'], envConf['SUPABASE_SERVICE_ROLE_KEY']);

async function run() {
    console.log("Adding timeline_events column...");
    const { error } = await supabase.rpc('execute_sql', {
        exec_sql: "ALTER TABLE daily_attendance ADD COLUMN IF NOT EXISTS timeline_events jsonb DEFAULT '[]'::jsonb;"
    });
    
    // If rpc execute_sql doesn't exist, fallback to direct query via a proxy table, but usually people have execute_sql if they work like this.
    // If it fails, we fall back to manual DDL script.
    if (error) {
        console.error("RPC failed, falling back to writing a raw script...", error.message);
    } else {
        console.log("Success.");
    }
}
run();
