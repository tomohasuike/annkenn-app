import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load Env from both files
const envLocal = fs.readFileSync('.env.local', 'utf-8');
const envFunc = fs.readFileSync('supabase/functions/.env', 'utf-8');
const envConf = {};

const parseEnv = (str) => {
  str.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.substring(0, idx).trim();
      const v = line.substring(idx + 1).trim().replace(/^"|"$/g, '');
      envConf[k] = v;
    }
  });
};
parseEnv(envLocal);
parseEnv(envFunc);

const uploadEdgeUrl = 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/upload-drive-file';
const url = envConf['VITE_SUPABASE_URL'] || envConf['SUPABASE_URL'];
const anonKey = envConf['VITE_SUPABASE_ANON_KEY'];
const serviceKey = envConf['SUPABASE_SERVICE_ROLE_KEY'];

if (!url || !serviceKey || !anonKey) {
  console.error("Missing environment variables", {url, anonKey: !!anonKey, serviceKey: !!serviceKey});
  process.exit(1);
}

// Use Service Role to bypass RLS for DB updates
const supabase = createClient(url, serviceKey);

async function uploadToDrive(fileBlob, filename, mimeType) {
    const formData = new FormData();
    // FormData requires a File object or Blob with name in Node 20
    const file = new File([fileBlob], filename, { type: mimeType });
    formData.append('file', file);
    
    // We send to our Edge Function
    const res = await fetch(uploadEdgeUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${anonKey}`,
        },
        body: formData
    });
    
    if (!res.ok) {
        throw new Error(`Edge Error: ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.success) {
        throw new Error(`Edge Logic Error: ${data.error}`);
    }
    return data.thumbnailLink ? data.thumbnailLink.replace('=s220', '=s800') : data.webViewLink;
}

async function migrateUrlsInJson(jsonStr) {
    if (!jsonStr) return jsonStr;
    
    let isChanged = false;
    let urls = [];
    try {
        urls = JSON.parse(jsonStr);
        if (!Array.isArray(urls)) urls = [jsonStr];
    } catch(e) {
        if (jsonStr.includes('http')) {
            urls = [jsonStr];
        } else {
            return jsonStr;
        }
    }

    const newUrls = [];
    for (const u of urls) {
        if (typeof u === 'string' && u.includes('.supabase.co') && u.includes('/storage/v1/object/public/')) {
            console.log(`  Downloading: ${u}`);
            try {
                const imgRes = await fetch(u);
                if (!imgRes.ok) {
                    console.log(`  [SKIPPED] Source missing (404): ${u}`);
                    newUrls.push(u); // Keep old URL if download fails (probably deleted manually)
                    continue;
                }
                const blob = await imgRes.blob();
                const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
                // Extract filename from URL
                const urlParts = new URL(u).pathname.split('/');
                const filename = urlParts[urlParts.length - 1] || `migrated_${Date.now()}.jpg`;

                console.log(`  Uploading to Drive: ${filename}`);
                const driveUrl = await uploadToDrive(blob, filename, mimeType);
                console.log(`  Success -> ${driveUrl}`);
                newUrls.push(driveUrl);
                isChanged = true;
            } catch (e) {
                console.error(`  [ERROR] Failed to migrate ${u}`, e.message);
                newUrls.push(u); // Keep old url
            }
        } else {
            newUrls.push(u);
        }
    }
    
    if (isChanged) {
        return JSON.stringify(newUrls);
    }
    return null; // Return null if nothing changed
}

async function run() {
    console.log("=== STARTING MIGRATION ===\n");

    // 1. daily_reports
    console.log("Checking daily_reports...");
    const { data: reports } = await supabase.from('daily_reports').select('id, site_photos').not('site_photos', 'is', null);
    
    for (const r of reports || []) {
        if (r.site_photos?.includes('.supabase.co')) {
            console.log(`Processing daily_reports ID: ${r.id}`);
            const updated = await migrateUrlsInJson(r.site_photos);
            if (updated) {
                console.log(`  Saving updated DB row...`);
                await supabase.from('daily_reports').update({ site_photos: updated }).eq('id', r.id);
            }
        }
    }

    // 2. report_materials (photo and documentation)
    console.log("\nChecking report_materials...");
    const { data: materials } = await supabase.from('report_materials').select('id, photo, documentation').or('photo.not.is.null,documentation.not.is.null');
    
    for (const m of materials || []) {
        let updatePayload = {};
        if (m.photo && m.photo.includes('.supabase.co')) {
            console.log(`Processing report_materials ID: ${m.id} (photo)`);
            const upImage = await migrateUrlsInJson(m.photo);
            if (upImage) updatePayload.photo = upImage;
        }
        if (m.documentation && m.documentation.includes('.supabase.co')) {
            console.log(`Processing report_materials ID: ${m.id} (documentation)`);
            const upDoc = await migrateUrlsInJson(m.documentation);
            if (upDoc) updatePayload.documentation = upDoc;
        }
        
        if (Object.keys(updatePayload).length > 0) {
            console.log(`  Saving updated DB row...`);
            await supabase.from('report_materials').update(updatePayload).eq('id', m.id);
        }
    }

    // 3. completion_reports (main_photo)
    console.log("\nChecking completion_reports...");
    const { data: comps } = await supabase.from('completion_reports').select('id, main_photo').not('main_photo', 'is', null);
    
    for (const c of comps || []) {
        if (c.main_photo?.includes('.supabase.co')) {
            console.log(`Processing completion_reports ID: ${c.id}`);
            const updated = await migrateUrlsInJson(c.main_photo);
            if (updated) {
                console.log(`  Saving updated DB row...`);
                await supabase.from('completion_reports').update({ main_photo: updated }).eq('id', c.id);
            }
        }
    }

    console.log("\n=== MIGRATION FINISHED ===");
}

run();
