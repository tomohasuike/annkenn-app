import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Reading CSV file...");
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  const matches = content.match(/"({.*?})"/g);
  if (!matches || matches.length < 3) return console.error("Could not parse JSON blocks");
  
  const assignmentsStr = matches[0].slice(1, -1).replace(/""/g, '"');
  const commentsStr = matches[1].slice(1, -1).replace(/""/g, '"');
  
  const assignments = JSON.parse(assignmentsStr);
  const comments = JSON.parse(commentsStr);

  console.log(`Parsed ${Object.keys(assignments).length} assignment date entries and ${Object.keys(comments).length} comment entries.`);

  console.log("Fetching reference data from database...");
  const { data: dbProj, error: pErr } = await supabase.from('projects').select('id, legacy_id, project_name');
  const { data: dbWorker, error: wErr } = await supabase.from('worker_master').select('id, legacy_id, name');
  const { data: dbVehicle, error: vErr } = await supabase.from('vehicle_master').select('id, legacy_id, vehicle_name');

  if (pErr || wErr || vErr) {
      console.error("Error fetching reference data:", pErr || wErr || vErr);
      return;
  }

  const projLookup = new Map(dbProj.map(p => [p.legacy_id, p.id]));
  const workerLookupByName = new Map();
  dbWorker.forEach(w => {
      if (w.name) workerLookupByName.set(w.name.replace(/\s+/g, ''), w.id);
  });
  const workerLookupById = new Map(dbWorker.map(w => [w.legacy_id, w.id]));
  
  const vehicleLookupByName = new Map();
  dbVehicle.forEach(v => {
      if (v.vehicle_name) vehicleLookupByName.set(v.vehicle_name.replace(/\s+/g, ''), v.id);
  });
  const vehicleLookupById = new Map(dbVehicle.map(v => [v.legacy_id, v.id]));

  const vacationProjId = dbProj.find(p => p.legacy_id === 'vacation')?.id || dbProj.find(p => p.project_name?.includes('休暇'))?.id;

  console.log("Wiping existing assignments and daily data...");
  const { error: delAssErr } = await supabase.from('assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: delDailyErr } = await supabase.from('project_daily_data').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (delAssErr || delDailyErr) {
      console.error("Error wiping data:", delAssErr || delDailyErr);
      return;
  }
  console.log("Wipe successful.");

  const insertPayloads = [];
  const handledKeys = new Set(); // to avoid duplicates in daily data
  const dailyDataPayloads = [];

  const parseKey = (key) => {
      let legacyProjId, year, month, day;
      if (key.match(/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/)) {
          const match = key.match(/^([\w-]+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (!match) return null;
          legacyProjId = match[1];
          year = match[2]; month = match[3]; day = match[4];
      } else {
          const match = key.match(/^(.+)-(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (!match) return null;
          legacyProjId = match[1];
          year = match[2]; month = match[3]; day = match[4];
      }
      return { 
          legacyProjId, 
          dateStr: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` 
      };
  };

  for (const [key, resourceList] of Object.entries(assignments)) {
    const parsed = parseKey(key);
    if (!parsed) continue;

    const { legacyProjId, dateStr } = parsed;
    const projectId = projLookup.get(legacyProjId) || (legacyProjId === 'vacation' ? vacationProjId : legacyProjId); 
    if (!projectId) continue;

    // Track assigned resources for this day to avoid duplicates
    const assignedResourceIds = new Set();

    for (const res of resourceList) {
        if (!res.name && !res.id) continue;
        
        const count = parseInt(res.count) || 1;
        const normalizedName = res.name?.replace(/\s+/g, '');
        
        // Try worker first
        let workerId = workerLookupByName.get(normalizedName) || workerLookupById.get(res.id);
        let vehicleId = null;
        
        // If not a worker, try vehicle
        if (!workerId) {
            vehicleId = vehicleLookupByName.get(normalizedName) || vehicleLookupById.get(res.id);
        }

        if (workerId && !assignedResourceIds.has(`worker_${workerId}`)) {
            assignedResourceIds.add(`worker_${workerId}`);
            insertPayloads.push({
                project_id: projectId,
                assignment_date: dateStr,
                worker_id: workerId,
                count: count
            });
        } else if (vehicleId && !assignedResourceIds.has(`vehicle_${vehicleId}`)) {
            assignedResourceIds.add(`vehicle_${vehicleId}`);
            insertPayloads.push({
                project_id: projectId,
                assignment_date: dateStr,
                vehicle_id: vehicleId,
                count: count
            });
        }
    }
  }

  for (const [key, content] of Object.entries(comments)) {
      const parsed = parseKey(key);
      if (!parsed) continue;
      
      const { legacyProjId, dateStr } = parsed;
      const projectId = projLookup.get(legacyProjId) || (legacyProjId === 'vacation' ? vacationProjId : legacyProjId); 
      if (!projectId) continue;

      if (typeof content === 'string' && content.trim() !== '') {
         dailyDataPayloads.push({
             project_id: projectId,
             target_date: dateStr,
             comment: content.trim()
         });
      }
  }

  // NOTE: If the original JSON had planned personnel count stored somewhere else, we'd add it here.
  // Assuming it was not structurally mapped in matches[1] based on sample, but let's check if the comment object actually is an object sometimes.
  
  console.log(`Inserting ${insertPayloads.length} assignments...`);
  if (insertPayloads.length > 0) {
      // Chunk to avoid payload size errors
      const chunkSize = 500;
      for (let i = 0; i < insertPayloads.length; i += chunkSize) {
          const chunk = insertPayloads.slice(i, i + chunkSize);
          const { error } = await supabase.from('assignments').insert(chunk);
          if (error) console.error("Error inserting assignments chunk:", error);
      }
      console.log("Assignments inserted.");
  }

  console.log(`Inserting ${dailyDataPayloads.length} daily comments...`);
  if (dailyDataPayloads.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < dailyDataPayloads.length; i += chunkSize) {
          const chunk = dailyDataPayloads.slice(i, i + chunkSize);
          const { error } = await supabase.from('project_daily_data').upsert(chunk, { onConflict: 'project_id,target_date' });
          if (error) console.error("Error inserting comments chunk:", error);
      }
      console.log("Comments inserted.");
  }
}

migrate();
