const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Initialize Supabase
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Read the CSV
const CSV_PATH = path.join(process.env.HOME, 'Downloads', '案件マスタDB - 工事案件マスター.csv');
if (!fs.existsSync(CSV_PATH)) {
  console.error("Could not find:", CSV_PATH);
  process.exit(1);
}

const content = fs.readFileSync(CSV_PATH, 'utf8');
const lines = content.split(/\r?\n/);

function splitCSVLine(line) {
  const result = [];
  let startValueIndex = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ',' && !inQuotes) {
      result.push(line.substring(startValueIndex, i).trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
      startValueIndex = i + 1;
    }
  }
  result.push(line.substring(startValueIndex).trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
  return result;
}

const headers = splitCSVLine(lines[0]);
const pNoIdx = headers.indexOf('工事番号');
const contactIdx = headers.indexOf('発注先担当者');

if (pNoIdx === -1 || contactIdx === -1) {
  console.error("Could not find required columns in CSV");
  process.exit(1);
}

async function updateProjects() {
  console.log("Starting to update projects with contact person data...");
  const updates = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = splitCSVLine(line);
    if (cols.length < headers.length) continue;
    
    const pNo = cols[pNoIdx];
    const contact = cols[contactIdx];
    
    if (!pNo || seen.has(pNo)) continue;
    seen.add(pNo);

    // We only update if there is a contact person, though we might want to clear it if empty. Let's update all.
    updates.push({
      project_number: pNo,
      contact_person: contact || null
    });
  }

  let successCount = 0;
  let failCount = 0;

  console.log(`Found ${updates.length} projects to check/update.`);

  for (const update of updates) {
    // Note: Our DB column is currently named client_company_name, but it acts as the contact person field.
    const { error } = await supabase
      .from('projects')
      .update({ client_company_name: update.contact_person })
      .eq('project_number', update.project_number);

    if (error) {
      console.error(`Error updating project ${update.project_number}:`, error.message);
      failCount++;
    } else {
      successCount++;
    }
  }

  console.log(`Update complete. Success: ${successCount}, Failures: ${failCount}`);
}

updateProjects();
