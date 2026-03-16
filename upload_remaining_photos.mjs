import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BUCKET = 'daily_report_photos'

async function uploadFile(filePath, subfolder = 'legacy') {
  if (!fs.existsSync(filePath)) {
    // console.log(`File missing locally: ${filePath}`)
    return null
  }
  const fileBuffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath)
  const newName = `${subfolder}/${crypto.randomUUID()}${ext}`
  
  let contentType = 'application/octet-stream'
  if (['.jpg', '.jpeg'].includes(ext.toLowerCase())) contentType = 'image/jpeg'
  if (ext.toLowerCase() === '.png') contentType = 'image/png'
  if (ext.toLowerCase() === '.pdf') contentType = 'application/pdf'

  const { data, error } = await supabase.storage.from(BUCKET).upload(newName, fileBuffer, {
    contentType: contentType,
    upsert: true
  })

  if (error) {
    console.error(`Upload error for ${filePath}:`, error.message)
    return null
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(newName)
  return publicUrl
}

async function migrate_daily_reports() {
  console.log('--- Migrating Daily Report Site Photos ---')
  const { data: reports, error: selectErr } = await supabase.from('daily_reports')
    .select('id, site_photos, report_date')
    .not('site_photos', 'is', null)
    .not('site_photos', 'like', '[%]') // Only fetch rows where photos are not yet JSON arrays

  if (selectErr) {
    console.error('Error fetching daily reports', selectErr); return;
  }

  console.log(`Found ${reports.length} daily reports with incomplete legacy photos...`)
  let count = 0;
  for (const rep of reports) {
    const paths = rep.site_photos.split(',').map(s => s.trim())
    const newUrls = []
    let missingAtLeastOne = false;
    for (let legacyPath of paths) {
        let localPath = legacyPath;
        if (!localPath.startsWith('/Users/hasuiketomoo/Downloads/')) {
            localPath = `/Users/hasuiketomoo/Downloads/${legacyPath}`
        }
        if (fs.existsSync(localPath)) {
            const url = await uploadFile(localPath, 'site_photos')
            if (url) newUrls.push(url)
            else missingAtLeastOne = true;
        } else {
            console.log(`Skipping report for id: ${rep.id} (${rep.report_date}) - locally missing file: ${localPath}`)
            missingAtLeastOne = true;
        }
    }
    
    // If we managed to upload ALL files for this report, update the database.
    if (newUrls.length > 0 && !missingAtLeastOne) {
        const { error } = await supabase.from('daily_reports')
           .update({ site_photos: JSON.stringify(newUrls) })
           .eq('id', rep.id)
        if (!error) count++; else console.error(`Error updating report ${rep.id}:`, error)
    } else if (newUrls.length > 0) {
        console.log(`Partial completion for ${rep.id}, skipped DB update to avoid data loss. Needs missing files.`)
    }
  }
  console.log(`Successfully migrated ${count} complete report site_photos batches.`)
  process.exit(0);
}

migrate_daily_reports()
