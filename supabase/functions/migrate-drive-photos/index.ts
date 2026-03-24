import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

serve(async () => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const UPLOAD_URL = `${supabaseUrl}/functions/v1/upload-drive-file`

    async function processJSONUrls(jsonStr: string) {
        if (!jsonStr) return null;
        let isChanged = false;
        let urls: string[] = [];
        try {
            urls = JSON.parse(jsonStr);
            if (!Array.isArray(urls)) urls = [jsonStr];
        } catch(e) {
            if (jsonStr.includes('http')) urls = [jsonStr];
            else return null;
        }

        const newUrls = [];
        for (const u of urls) {
            if (typeof u === 'string' && u.includes('.supabase.co') && u.includes('/storage/v1/object/public/')) {
                console.log(`Downloading: ${u}`);
                try {
                    const imgRes = await fetch(u);
                    if (!imgRes.ok) {
                        console.log(`[SKIPPED] Download failed (e.g. 404): ${u}`);
                        newUrls.push(u); 
                        continue;
                    }

                    const blob = await imgRes.blob();
                    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
                    const parts = new URL(u).pathname.split('/');
                    const filename = parts[parts.length - 1] || `migrated_${Date.now()}.jpg`;

                    const finalFile = new File([blob], filename, { type: mimeType });
                    const formData = new FormData();
                    formData.append('file', finalFile);

                    const upRes = await fetch(UPLOAD_URL, {
                        method: 'POST',
                        body: formData
                    });

                    if (!upRes.ok) throw new Error(`Upload Edge Failed: ${await upRes.text()}`);
                    const upData = await upRes.json();
                    if (!upData.success) throw new Error(`Upload Edge Logic: ${upData.error}`);
                    
                    const driveUrl = upData.thumbnailLink ? upData.thumbnailLink.replace('=s220', '=s800') : upData.webViewLink;
                    console.log(`Success -> ${driveUrl}`);
                    newUrls.push(driveUrl);
                    isChanged = true;
                } catch (e: any) {
                    console.error(`[ERROR] Failed to migrate ${u}`, e.message);
                    newUrls.push(u);
                }
            } else {
                newUrls.push(u);
            }
        }
        return isChanged ? JSON.stringify(newUrls) : null;
    }

    try {
        let stats = { daily: 0, materials: 0, completions: 0 };
        const LIMIT = 5; // Start small to avoid edge function timeout

        // 1. daily_reports
        const { data: reports } = await supabase
            .from('daily_reports')
            .select('id, site_photos')
            .like('site_photos', '%supabase.co%')
            .limit(LIMIT);
            
        for (const r of reports || []) {
            const updated = await processJSONUrls(r.site_photos);
            if (updated) {
                await supabase.from('daily_reports').update({ site_photos: updated }).eq('id', r.id);
                stats.daily++;
            }
        }

        // 2. report_materials
        const { data: materials } = await supabase
            .from('report_materials')
            .select('id, photo, documentation')
            .or('photo.ilike.%supabase.co%,documentation.ilike.%supabase.co%')
            .limit(LIMIT);
            
        for (const m of materials || []) {
            const p: any = {};
            if (m.photo?.includes('.supabase.co')) {
                const up = await processJSONUrls(m.photo);
                if (up) p.photo = up;
            }
            if (m.documentation?.includes('.supabase.co')) {
                const up = await processJSONUrls(m.documentation);
                if (up) p.documentation = up;
            }
            if (Object.keys(p).length > 0) {
                await supabase.from('report_materials').update(p).eq('id', m.id);
                stats.materials++;
            }
        }

        // 3. completion_reports
        const { data: comps } = await supabase
            .from('completion_reports')
            .select('id, main_photo')
            .like('main_photo', '%supabase.co%')
            .limit(LIMIT);

        for (const c of comps || []) {
            const updated = await processJSONUrls(c.main_photo);
            if (updated) {
                await supabase.from('completion_reports').update({ main_photo: updated }).eq('id', c.id);
                stats.completions++;
            }
        }

        return new Response(JSON.stringify({ success: true, migrated_count: stats }), {
            headers: { "Content-Type": "application/json" },
        })
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { "Content-Type": "application/json" }
        })
    }
})
