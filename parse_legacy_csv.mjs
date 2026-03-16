import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  
  // Custom simple CSV parser for this specific 1-line format
  // The line looks like: "{...}","{...}","{...}",2026/03/13
  const matches = content.match(/"({.*?})"/g);
  if (!matches || matches.length < 3) {
    console.error("Could not parse JSON blocks");
    return;
  }
  
  const assignmentsStr = matches[0].slice(1, -1).replace(/""/g, '"');
  const commentsStr = matches[1].slice(1, -1).replace(/""/g, '"');
  const customResStr = matches[2].slice(1, -1).replace(/""/g, '"');
  
  let assignments = {};
  let customRes = {};
  
  try {
    assignments = JSON.parse(assignmentsStr);
    customRes = JSON.parse(customResStr);
    console.log("Parsed assignments keys:", Object.keys(assignments).length);
    console.log("Parsed custom items:", customRes.list ? customRes.list.length : 0);
  } catch (e) {
    console.error("JSON parse error", e);
  }
  
  // Check typical assignment key (e.g. 55-2026-4-2)
  const sampleKey = Object.keys(assignments)[0];
  console.log("Sample assignment key:", sampleKey);
  console.log("Sample assignment value:", assignments[sampleKey]);
  
  // Also, let's check what we have in DB
  const { data: dbProj, error: errProj } = await supabase.from('projects').select('id, legacy_id').limit(5);
  const { data: dbWorker, error: errWorker } = await supabase.from('worker_master').select('id, legacy_id, name').limit(5);
  
  console.log("Sample DB Projects:", dbProj);
  console.log("Sample DB Workers:", dbWorker);
}

inspectData();
