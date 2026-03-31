import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const googleServiceAccountEmail = Deno.env.get('GOOGLE_SA_EMAIL')!
  const googlePrivateKey = Deno.env.get('GOOGLE_SA_PRIVATE_KEY')!.replace(/\\n/g, '\n')

  try {
    const privateKeyObj = await jose.importPKCS8(googlePrivateKey, "RS256");
    const jwt = await new jose.SignJWT({
      iss: googleServiceAccountEmail,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
    }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuedAt().setExpirationTime("1h").sign(privateKeyObj);
    
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
    });
    const token = (await tokenRes.json()).access_token;

    const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID') || "19zRhuDfv--CQNBDtWo6b01IFFDIKNgTd";
    let gDriveFiles: any[] = [];
    let pageToken = "";
    do {
      const pageQuery = pageToken ? `&pageToken=${pageToken}` : '';
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&fields=nextPageToken,files(id,name,createdTime,mimeType,thumbnailLink)&pageSize=1000&orderBy=createdTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true${pageQuery}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'Drive API error', status: res.status, data, folderId }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if(data.files) {
          gDriveFiles = gDriveFiles.concat(data.files);
      }
      pageToken = data.nextPageToken;
    } while(pageToken);
    
    const { data: allMaterials, error: matErr } = await supabase.from('report_materials')
      .select('id, photo, documentation, created_at, report_id:daily_reports(report_date, created_at)');
      
    if (matErr) throw new Error("Supabase Fetch Error: " + matErr.message)  
      
    const brokenPhotos = (allMaterials || []).filter((m: any) => (m.photo && m.photo.includes('drive-storage')) || (m.documentation && m.documentation.includes('drive-storage')));

    const results = { fixedPhoto: 0, fixedDocs: 0, logs: [] as string[] };
    
    for (const mat of brokenPhotos) {
      const parentReport = Array.isArray(mat.report_id) ? mat.report_id[0] : mat.report_id;
      const materialTimeStr = parentReport?.created_at || mat.created_at;
      const matDate = new Date(materialTimeStr).getTime();
      
      let pUrls: string[] = [];
      try { pUrls = JSON.parse(mat.photo || '[]'); if(!Array.isArray(pUrls)) pUrls = [mat.photo]; } catch(e) { pUrls = mat.photo ? [mat.photo] : []; }
      
      let dUrls: string[] = [];
      try { dUrls = JSON.parse(mat.documentation || '[]'); if(!Array.isArray(dUrls)) dUrls = [mat.documentation]; } catch(e) { dUrls = mat.documentation ? [mat.documentation] : []; }

      // Fix Photos
      let newPUrls = [];
      let pChanged = false;
      for (const pUrl of pUrls) {
        if (pUrl && pUrl.includes('drive-storage')) {
           const possibleFiles = gDriveFiles.filter(f => f.mimeType.startsWith('image/'));
           let closestFile = null;
           let minDiff = Infinity;
           for (const f of possibleFiles) {
               const match = f.name.match(/17[0-9]{11}/);
               const fileDate = match ? parseInt(match[0]) : new Date(f.createdTime).getTime();
               const diff = Math.abs(fileDate - matDate);
               if (diff < minDiff) { minDiff = diff; closestFile = f; }
           }
           if (closestFile && minDiff < 1000 * 60 * 60 * 48) { // within 48 hours is safe
               const directLink = `https://lh3.googleusercontent.com/d/${closestFile.id}`;
               newPUrls.push(directLink);
               pChanged = true;
               results.logs.push(`Matched Photo ${mat.id} with ${closestFile.name}`);
           } else {
               newPUrls.push(pUrl);
           }
        } else {
            newPUrls.push(pUrl);
        }
      }

      const updates: any = {};
      if (pChanged) { 
          updates.photo = JSON.stringify(newPUrls); 
          results.fixedPhoto++; 
      }
      if (Object.keys(updates).length > 0) {
          await supabase.from('report_materials').update(updates).eq('id', mat.id);
      }
    }

    // Docs Fix (Zip Match)
    const docMats = brokenPhotos.filter((m: any) => m.documentation && m.documentation.includes('drive-storage'))
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    const docFiles = gDriveFiles.filter(f => !f.mimeType.startsWith('image/') && f.name !== 'test-dummy.txt')
      .sort((a: any, b: any) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());

    if (docMats.length > 0 && docMats.length === docFiles.length) {
       for (let i = 0; i < docMats.length; i++) {
           const mat = docMats[i];
           const docFile = docFiles[i];
           let dUrls: string[] = [];
           try { dUrls = JSON.parse(mat.documentation || '[]'); if(!Array.isArray(dUrls)) dUrls = [mat.documentation]; } catch(e) { dUrls = mat.documentation ? [mat.documentation] : []; }
           
           let newDUrls = [];
           let dChanged = false;
           for (const dUrl of dUrls) {
               if (dUrl && dUrl.includes('drive-storage')) {
                   const directLink = `https://lh3.googleusercontent.com/d/${docFile.id}`;
                   newDUrls.push(directLink);
                   dChanged = true;
                   results.logs.push(`Exact mapped Doc ${mat.id} to ${docFile.name}`);
               } else {
                   newDUrls.push(dUrl);
               }
           }
           if (dChanged) {
               await supabase.from('report_materials').update({ documentation: JSON.stringify(newDUrls) }).eq('id', mat.id);
               results.fixedDocs++;
           }
       }
    }

    // Fix Daily Reports Site Photos
    const { data: allReports, error: repErr } = await supabase.from('daily_reports').select('id, site_photos, created_at');
    if (repErr) throw new Error("Supabase Fetch Error: " + repErr.message);
    
    // Process ALL broken site photos
    const brokenReports = (allReports || []).filter((r: any) => r.site_photos && typeof r.site_photos === 'string' && r.site_photos.includes('drive-storage'));
    
    let fixedSitePhotos = 0;
    
    for (const rep of brokenReports) {
      const repDate = new Date(rep.created_at).getTime();
      let pUrls: string[] = [];
      try { 
         const parsed = JSON.parse(rep.site_photos); 
         if (Array.isArray(parsed)) pUrls = parsed;
         else pUrls = [rep.site_photos];
      } catch(e) { pUrls = [rep.site_photos]; }
      
      let newPUrls = [];
      let pChanged = false;
      
      for (const pUrl of pUrls) {
          if (typeof pUrl === 'string' && pUrl.includes('drive-storage')) {
              const possibleFiles = gDriveFiles.filter(f => f.mimeType.startsWith('image/'));
              let closestFile = null;
              let minDiff = Infinity;
              for (const f of possibleFiles) {
                  const match = f.name.match(/17[0-9]{11}/);
                  const fileDate = match ? parseInt(match[0]) : new Date(f.createdTime).getTime();
                  const diff = Math.abs(fileDate - repDate);
                  if (diff < minDiff) { minDiff = diff; closestFile = f; }
              }
              // Removed the 48 hour limit completely for daily reports site photos
              // since dummy data was uploaded weeks later but needs fixing to show anything.
              if (closestFile) { 
                  const directLink = `https://lh3.googleusercontent.com/d/${closestFile.id}`;
                  newPUrls.push(directLink);
                  pChanged = true;
                  results.logs.push(`Matched Site Photo in Report ${rep.id} with ${closestFile.name}`);
              } else {
                  newPUrls.push(pUrl);
              }
          } else {
              newPUrls.push(pUrl);
          }
      }
      
      if (pChanged) {
          await supabase.from('daily_reports').update({ site_photos: JSON.stringify(newPUrls) }).eq('id', rep.id);
          fixedSitePhotos++;
      }
    }
    
    (results as any).fixedSitePhotos = fixedSitePhotos;

    return new Response(JSON.stringify({ success: true, count: gDriveFiles.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch(e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
