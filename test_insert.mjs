import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
let url = '', key = '';
envFile.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function test() {
    const { data: projects } = await supabase.from('projects').select('id').limit(1);
    const { data: workers } = await supabase.from('worker_master').select('id').limit(1);
    
    if (!projects || !workers || projects.length === 0 || workers.length === 0) {
        console.log("No projects or workers found");
        return;
    }

    const projectId = projects[0].id;
    const workerId = workers[0].id;
    
    const inserts = [{
        project_id: projectId,
        assignment_date: '2026-03-20',
        start_time: null,
        end_time: null,
        worker_id: workerId,
        count: 1,
        assigned_by: 'test'
    }];
    
    const { data, error } = await supabase.from('assignments').insert(inserts);
    console.log("Insert result:");
    console.log("Error:", error);
    console.log("Data:", data);
}

test();
