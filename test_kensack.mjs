import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gsczefdkcrvudddeotlx.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'SECRET_REDACTED';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
  const { data, error } = await supabase.from('materials').select('name, model_number, manufacturers!inner(name)').eq('model_number', 'SR35');
  console.log('Direct:', data);

  const { data: d2, error: e2 } = await supabase.from('materials').select('name, model_number, manufacturers!inner(name)').ilike('manufacturers.name', '%ネグロス%').eq('model_number', 'SR35');
  console.log('With ilike manufacturer:', d2, e2);
}
testQuery();
