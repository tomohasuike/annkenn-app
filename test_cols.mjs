import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function checkColumns() {
  const { data: dRep } = await supabase.from('daily_reports').select('id, site_photos, photo_url').limit(1).catch(()=>({data:[]}));
  console.log("daily_reports has site_photos?", dRep && dRep[0] && 'site_photos' in dRep[0]);
  console.log("daily_reports has photo_url?", dRep && dRep[0] && 'photo_url' in dRep[0]);
  
  const { data: rMat } = await supabase.from('report_materials').select('id, photo, documentation').limit(1).catch(()=>({data:[]}));
  console.log("report_materials has photo?", rMat && rMat[0] && 'photo' in rMat[0]);
  console.log("report_materials has documentation?", rMat && rMat[0] && 'documentation' in rMat[0]);
}

checkColumns()
