import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function migrate() {
  // 1. Ensure vacation project exists
  let { data: vacProj } = await supabase.from('projects').select('id').eq('legacy_id', 'vacation').maybeSingle();
  if (!vacProj) {
    const { data, error } = await supabase.from('projects').insert([{
      project_name: '休暇・不在',
      legacy_id: 'vacation',
      category: 'その他',
      project_number: 'VACATION'
    }]).select().single();
    if(error) throw error;
    vacProj = data;
    console.log("Created vacation project:", vacProj.id);
  } else {
    console.log("Found vacation project:", vacProj.id);
  }
  const vacationProjId = vacProj.id;

  // 2. Parse CSV
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  const matches = content.match(/"({.*?})"/g);
  const assignments = JSON.parse(matches[0].slice(1, -1).replace(/""/g, '"'));
  const comments = JSON.parse(matches[1].slice(1, -1).replace(/""/g, '"'));

  // 3. Load workers/vehicles
  const { data: dbWorker } = await supabase.from('worker_master').select('id, legacy_id, name');
  const { data: dbVehicle } = await supabase.from('vehicle_master').select('id, legacy_id, vehicle_name');
  
  const workerLookupByName = new Map();
  dbWorker.forEach(w => w.name && workerLookupByName.set(w.name.replace(/\s+/g, ''), w.id));
  const workerLookupById = new Map(dbWorker.map(w => [w.legacy_id, w.id]));
  
  const vehicleLookupByName = new Map();
  dbVehicle.forEach(v => v.vehicle_name && vehicleLookupByName.set(v.vehicle_name.replace(/\s+/g, ''), v.id));
  const vehicleLookupById = new Map(dbVehicle.map(v => [v.legacy_id, v.id]));

  // 4. Wipe only vacation data to be safe (idempotent)
  await supabase.from('assignments').delete().eq('project_id', vacationProjId);
  await supabase.from('project_daily_data').delete().eq('project_id', vacationProjId);

  // 5. Build payloads
  const insertPayloads = [];
  const dailyDataPayloads = [];

  const parseKey = (key) => {
    let legacyProjId, year, month, day;
    const match1 = key.match(/^([\w-]+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match1) { legacyProjId = match1[1]; year = match1[2]; month = match1[3]; day = match1[4]; }
    else {
      const match2 = key.match(/^(.+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if(!match2) return null;
      legacyProjId = match2[1]; year = match2[2]; month = match2[3]; day = match2[4];
    }
    return { legacyProjId, dateStr: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` };
  };

  for (const [key, resourceList] of Object.entries(assignments)) {
    const parsed = parseKey(key);
    if (!parsed || parsed.legacyProjId !== 'vacation') continue;
    
    const assignedResourceIds = new Set();
    for (const res of resourceList) {
        if (!res.name && !res.id) continue;
        const count = parseInt(res.count) || 1;
        const normalizedName = res.name?.replace(/\s+/g, '');
        let workerId = workerLookupByName.get(normalizedName) || workerLookupById.get(res.id);
        let vehicleId = !workerId ? (vehicleLookupByName.get(normalizedName) || vehicleLookupById.get(res.id)) : null;

        if (workerId && !assignedResourceIds.has(`worker_${workerId}`)) {
            assignedResourceIds.add(`worker_${workerId}`);
            insertPayloads.push({ project_id: vacationProjId, assignment_date: parsed.dateStr, worker_id: workerId, count });
        } else if (vehicleId && !assignedResourceIds.has(`vehicle_${vehicleId}`)) {
            assignedResourceIds.add(`vehicle_${vehicleId}`);
            insertPayloads.push({ project_id: vacationProjId, assignment_date: parsed.dateStr, vehicle_id: vehicleId, count });
        }
    }
  }

  for (const [key, content] of Object.entries(comments)) {
      const parsed = parseKey(key);
      if (!parsed || parsed.legacyProjId !== 'vacation') continue;
      if (typeof content === 'string' && content.trim() !== '') {
         dailyDataPayloads.push({ project_id: vacationProjId, target_date: parsed.dateStr, comment: content.trim() });
      }
  }

  console.log(`Inserting ${insertPayloads.length} vacation assignments...`);
  if (insertPayloads.length > 0) await supabase.from('assignments').insert(insertPayloads);
  
  console.log(`Inserting ${dailyDataPayloads.length} vacation comments...`);
  if (dailyDataPayloads.length > 0) await supabase.from('project_daily_data').upsert(dailyDataPayloads, { onConflict: 'project_id,target_date' });
  console.log("Done.");
}
migrate();
