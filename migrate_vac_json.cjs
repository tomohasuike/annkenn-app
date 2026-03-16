const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    console.log("Locating the new Vacation project ID...");
    const { data: proj } = await supabase.from('projects').select('id').eq('legacy_id', 'vacation').single();
    if (!proj) { console.error("No Vacation project found in DB. Did you delete it?"); return; }
    const vacId = proj.id;
    console.log(`Vacation project ID resolved to: ${vacId}`);

    console.log("Loading worker map mapping...");
    const { data: workers } = await supabase.from('worker_master').select('id, name');
    const nameToId = {};
    workers.forEach(w => nameToId[w.name.replace(/\s+/g, '')] = w.id);

    console.log("Loading AppData.csv back up...");
try {
    const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
    const matches = content.match(/"({.*?})"/g);
    
    // There are multiple JSON strings in the CSV. The assignments are the first large one usually, but let's be careful.
    let assignmentsStr = "";
    for (const m of matches) {
        if (m.includes('vacation-') || m.includes('worker_')) {
            assignmentsStr = m.slice(1, -1).replace(/""/g, '"');
            break;
        }
    }
    
    if (!assignmentsStr) {
        console.error("Could not find assignments JSON JSON in the downloaded CSV.");
        return;
    }

    const oldAssignments = JSON.parse(assignmentsStr);
    let toInsert = [];

    for (const [key, resourceList] of Object.entries(oldAssignments)) {
        if (!key.startsWith('vacation-')) continue;
        const pts = key.replace('vacation-', '').split('-');
        const y = pts[0];
        const m = pts[1].padStart(2, '0');
        const d = pts[2].padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        
        for (const item of resourceList) {
            if (item.type === 'person') {
                const queryName = item.name.replace(/\s+/g, '');
                const wId = nameToId[queryName];
                if (wId) {
                    toInsert.push({
                        project_id: vacId,
                        worker_id: wId,
                        assignment_date: dateStr,
                        count: 1
                    });
                } else {
                    console.log(`Could not resolve worker name to ID: "${item.name}"`);
                }
            }
        }
    }

    console.log(`Found ${toInsert.length} vacation assignments in CSV.`);
    
    if (toInsert.length > 0) {
        console.log(`Inserting ${toInsert.length} rows into Supabase...`);
        // Remove existing ones for the new vacation ID to avoid dupes/constraint errors just in case
        await supabase.from('assignments').delete().eq('project_id', vacId);
        
        const chunks = [];
        for (let i = 0; i < toInsert.length; i += 50) {
            chunks.push(toInsert.slice(i, i + 50));
        }
        
        for (const chunk of chunks) {
            const { error: insertErr } = await supabase.from('assignments').insert(chunk);
            if (insertErr) {
                console.error("Insert error in chunk:", insertErr);
                break;
            }
        }
        
        console.log("Restore complete!");
    } else {
        console.log("No valid vacation assignments parsed from the CSV to restore.");
    }
} catch (e) {
    console.error("Script failed:", e.message);
}
}
main();
