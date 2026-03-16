const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_PATH = path.join(process.env.HOME, 'Downloads', '案件マスタDB - 工事案件マスター.csv');
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

const headers = splitCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
const pNoIdx = headers.indexOf('工事番号');
const contactIdx = headers.indexOf('発注先担当者');

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

    if (contact && contact.trim() !== '') {
      updates.push({
        project_number: pNo,
        contact_person: contact.trim()
      });
    }
  }

  let successCount = 0;
  let failCount = 0;

  console.log(`Found ${updates.length} projects with actual contact persons to update.`);

  for (const update of updates) {
    if (update.project_number === '241127' || update.project_number === '241203') {
        console.log(`Attempting update for ${update.project_number} -> ${update.contact_person}`);
    }
    const { data, error, count } = await supabase
      .from('projects')
      // Map contact_person to client_company_name column in DB
      .update({ client_company_name: update.contact_person })
      .eq('project_number', update.project_number)
      .select();

    if (error) {
      console.error(`Error updating project ${update.project_number}:`, error.message);
      failCount++;
    } else {
      if (update.project_number === '241127' || update.project_number === '241203') {
          console.log(`Result for ${update.project_number}:`, data);
      }
      successCount++;
    }
  }

  console.log(`Update complete. Success (API calls): ${successCount}, Failures: ${failCount}`);
}

updateProjects();
