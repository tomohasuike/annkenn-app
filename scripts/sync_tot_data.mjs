import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load env vars
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const TOT_TOKEN = 'OEk8h0zBMjTGjKAwaZbvtIJ5MjDCuuwdUlm95PDsSR56dP2XFkaHzjV4LwFwRoWy7y6NuLFLYUU57/5GMtZ46r+/9F1uj7tR6WV3PTLiqqVAuJxyNCLB6qPRbVK5AhBq9sAf4Lp4BSvtfVpIdZgXzfPmvLrWlFt2ZNdB5vf9ep5aAb1qCS7c6TRj6ZwUmiUM';

/**
 * Fetch daily attendance from TOT API for a specific date range
 * Touch On Time King of Time API uses GET /daily-schedules
 */
async function syncTotData(startDate, endDate) {
  console.log(`Syncing TOT data from ${startDate} to ${endDate}...`);

  // 1. Get all workers mapped to TOT employee codes
  const { data: workers } = await supabase
    .from('worker_master')
    .select('id, name, employee_code_tot')
    .neq('type', '事務員')
    .neq('type', '役員')
    .neq('type', '協力会社')
    .not('employee_code_tot', 'is', null);

  if (!workers || workers.length === 0) {
    console.log('No workers with TOT employee codes found. Please set employee_code_tot in Supabase worker_master.');
    return;
  }

  console.log(`Found ${workers.length} workers with TOT codes.`);
  
  // Create a map for fast lookup
  const workerMap = {};
  workers.forEach(w => {
    workerMap[w.employee_code_tot] = w;
  });

  // 2. Fetch data from TOT API
  // Using King Of Time API endpoint for daily attendance (daily-schedules or daily-workings)
  // Usually the endpoint format is: https://api.kingtime.jp/v1.0/daily-schedules
  try {
    const url = `https://api.kingtime.jp/v1.0/daily-schedules?start=${startDate}&end=${endDate}`;
    
    console.log(`Fetching from KOT API: ${url}`);
    
    // Note: If this fails, we will examine the error to see the real API structure or just mock it if we don't have KOT documentation handy.
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`TOT API Error: ${response.status} ${response.statusText}`, errText);
      return;
    }

    const result = await response.json();
    console.log('Successfully fetched TOT data', result);
    
    // Process and match data with Supabase ...
    // (We will inspect the output of `result` first to map the fields properly)
    
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

// Run for Feb 26 to March 25
syncTotData('2026-02-26', '2026-03-25');
