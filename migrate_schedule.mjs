import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  const matches = content.match(/"({.*?})"/g);
  if (!matches || matches.length < 3) return console.error("Could not parse JSON blocks");
  
  const assignmentsStr = matches[0].slice(1, -1).replace(/""/g, '"');
  const customResStr = matches[2].slice(1, -1).replace(/""/g, '"');
  
  const assignments = JSON.parse(assignmentsStr);
  const customRes = JSON.parse(customResStr);

  const { data: dbProj } = await supabase.from('projects').select('id, legacy_id');
  const { data: dbWorker } = await supabase.from('worker_master').select('id, legacy_id, name');
  const { data: dbVehicle } = await supabase.from('vehicle_master').select('id, legacy_id, vehicle_name');

  const projLookup = new Map(dbProj.map(p => [p.legacy_id, p.id]));
  const workerLookupByName = new Map(dbWorker.map(w => [w.name ? w.name.replace(/\s+/g, '') : '', w.id]));
  const workerLookupById = new Map(dbWorker.map(w => [w.legacy_id, w.id]));

  const vacationProjId = dbProj.find(p => p.legacy_id === 'vacation')?.id || dbProj.find(p => p.project_name?.includes('休暇'))?.id;

  const missingWorkersToCreate = [];
  const handledNames = new Set(dbWorker.map(w => w.name ? w.name.replace(/\s+/g, '') : ''));

  for (const [key, resourceList] of Object.entries(assignments)) {
    for (const res of resourceList) {
      if (!res.name) continue;
      const normalizedName = res.name.replace(/\s+/g, '');
      if (!handledNames.has(normalizedName)) {
        handledNames.add(normalizedName);
        missingWorkersToCreate.push({
          name: res.name,
          type: '社員', // fallback
          legacy_id: res.id || null,
          is_active: true
        });
      }
    }
  }

  if (missingWorkersToCreate.length > 0) {
    const { data: newWorkers, error: errNew } = await supabase.from('worker_master').insert(missingWorkersToCreate).select();
    if (errNew) {
      console.error("Error inserting missing workers:", errNew);
    } else {
      newWorkers.forEach(w => {
        workerLookupByName.set(w.name.replace(/\s+/g, ''), w.id);
        if (w.legacy_id) workerLookupById.set(w.legacy_id, w.id);
      });
    }
  }

  const insertPayloads = [];

  for (const [key, resourceList] of Object.entries(assignments)) {
    let year, month, day, legacyProjId;
    if (key.match(/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/)) {
        const match = key.match(/^([\w-]+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
        legacyProjId = match[1];
        year = match[2]; month = match[3]; day = match[4];
    } else {
        const match = key.match(/^(.+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!match) continue;
        legacyProjId = match[1];
        year = match[2]; month = match[3]; day = match[4];
    }

    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const projectId = projLookup.get(legacyProjId) || (legacyProjId === 'vacation' ? vacationProjId : legacyProjId); 

    if (!projectId) continue;

    for (const res of resourceList) {
        if (!res.name && !res.id) continue;
        
        const workerId = workerLookupByName.get(res.name?.replace(/\s+/g, '')) || workerLookupById.get(res.id);
        const count = parseInt(res.count) || 1;

        if (workerId) {
            insertPayloads.push({
                project_id: projectId,
                assignment_date: dateStr,
                worker_id: workerId,
                count: count
            });
        }
    }
  }

  console.log(`Inserting ${insertPayloads.length} assignments...`);
  if (insertPayloads.length > 0) {
      const { data, error } = await supabase.from('assignments').upsert(insertPayloads);
      if (error) console.error("Error:", error);
      else console.log("Success!");
  }
}
migrate();
