import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gsczefdkcrvudddeotlx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('projects')
    .select('project_number, project_name, category, client_name')
    .like('project_number', 'KD%');
  
  console.log(data);
}
check();
