import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })

// Use service role key to bypass RLS for uploads
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BUCKET = 'daily_report_photos'

async function uploadFile(filePath, subfolder = 'legacy') {
  if (!fs.existsSync(filePath)) {
    console.log(`File missing: ${filePath}`)
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

async function migrate_materials() {
  console.log("--- Migrating Materials Photos ---")
  const { data: mats, error: selectErr } = await supabase.from('report_materials')
    .select('id, photo')
    .not('photo', 'is', null)
    .not('photo', 'like', '[%]') // only process unmigrated strings

  if (selectErr) {
    console.error("Error fetching materials", selectErr); return;
  }

  console.log(`Found ${mats.length} materials with legacy photos...`)
  let count = 0;
  for (const mat of mats) {
    if (!mat.photo || mat.photo.trim() === '') continue;
    let localPath = mat.photo;
    if (!localPath.startsWith('/Users/hasuiketomoo/Downloads/')) {
        localPath = `/Users/hasuiketomoo/Downloads/${mat.photo}`
    }

    if (fs.existsSync(localPath)) {
      const publicUrl = await uploadFile(localPath, 'materials')
      if (publicUrl) {
         const { error } = await supabase.from('report_materials')
           .update({ photo: JSON.stringify([publicUrl]) })
           .eq('id', mat.id)
         if (!error) count++; else console.error(`Error updating DB for material ${mat.id}:`, error)
      }
    } else {
      console.log(`Skipping material ${mat.id}, file not found locally: ${localPath}`)
    }
  }
  console.log(`Migrated ${count} material photos.`)
}

async function migrate_material_docs() {
  console.log("--- Migrating Materials Docs ---")
  const { data: mats, error: selectErr } = await supabase.from('report_materials')
    .select('id, documentation')
    .not('documentation', 'is', null)
    .not('documentation', 'like', '[%]') 

  if (selectErr) {
    console.error("Error fetching docs", selectErr); return;
  }

  console.log(`Found ${mats.length} materials with legacy documentation...`)
  let count = 0;
  for (const mat of mats) {
    if (!mat.documentation || mat.documentation.trim() === '') continue;
    let localPath = mat.documentation;
    if (!localPath.startsWith('/Users/hasuiketomoo/Downloads/')) {
        localPath = `/Users/hasuiketomoo/Downloads/${mat.documentation}`
    }

    if (fs.existsSync(localPath)) {
      const publicUrl = await uploadFile(localPath, 'materials_docs')
      if (publicUrl) {
         // Temporarily save to documentation string, but convert to JSON format matching our new array standard
         const { error } = await supabase.from('report_materials')
           .update({ documentation: JSON.stringify([publicUrl]) })
           .eq('id', mat.id)
         if (!error) count++; else console.error(`Error updating DB for material doc ${mat.id}:`, error)
      }
    } else {
      console.log(`Skipping material doc ${mat.id}, file not found: ${localPath}`)
    }
  }
  console.log(`Migrated ${count} material docs.`)
}

async function migrate_daily_reports() {
  console.log("--- Migrating Daily Report Site Photos ---")
  const { data: reports, error: selectErr } = await supabase.from('daily_reports')
    .select('id, site_photos')
    .not('site_photos', 'is', null)
    .not('site_photos', 'like', '[%]') // unmigrated strings, potentially comma-separated

  if (selectErr) {
    console.error("Error fetching daily reports", selectErr); return;
  }

  console.log(`Found ${reports.length} daily reports with legacy photos...`)
  let count = 0;
  for (const rep of reports) {
    // site_photos may be comma separated strings of paths
    const paths = rep.site_photos.split(',').map(s => s.trim())
    const newUrls = []
    for (let legacyPath of paths) {
        if (!legacyPath || legacyPath.trim() === '') continue;
        let localPath = legacyPath;
        if (!localPath.startsWith('/Users/hasuiketomoo/Downloads/')) {
            localPath = `/Users/hasuiketomoo/Downloads/${legacyPath}`
        }
        if (fs.existsSync(localPath)) {
            const url = await uploadFile(localPath, 'site_photos')
            if (url) newUrls.push(url)
        } else {
            console.log(`Skipping report ${rep.id} missing file: ${localPath}`)
        }
    }
    
    if (newUrls.length > 0) {
        const { error } = await supabase.from('daily_reports')
           .update({ site_photos: JSON.stringify(newUrls) })
           .eq('id', rep.id)
        if (!error) count++; else console.error(`Error updating report ${rep.id}:`, error)
    }
  }
  console.log(`Migrated ${count} report site_photos batches.`)
}

async function main() {
  await migrate_materials()
  await migrate_material_docs()
  await migrate_daily_reports()
  console.log(`--- Migration Complete ---`)
}

main()
