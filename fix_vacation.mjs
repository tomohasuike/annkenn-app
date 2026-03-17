import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envPath = '.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
const supabase = createClient(url, key);

async function checkOldVacationAssignments() {
  const { data: assignments } = await supabase.from('assignments')
    .select('project_id, projects(project_name)');
    
  if (assignments && assignments.length > 0) {
    const vacationAssignments = assignments.filter(a => a.projects && a.projects.project_name && a.projects.project_name.includes('休暇'));
    const projectIds = [...new Set(vacationAssignments.map(a => a.project_id))];
    console.log('Orphaned project IDs:', projectIds);
    for (const pid of projectIds) {
      if (!pid) continue;
      const { data: pData } = await supabase.from('projects').select('*').eq('id', pid).single();
      console.log('Project Details for', pid, ':', pData?.project_name, pData?.status_flag, pData?.legacy_id);
    }
  } else {
    console.log('No historical assignments found.');
  }
}

checkOldVacationAssignments();
