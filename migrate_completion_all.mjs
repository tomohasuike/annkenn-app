import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const csvFilePath = '/Users/hasuiketomoo/Downloads/完了報告DB - 完了報告書.csv';
const mainImagesDir = '/Users/hasuiketomoo/Downloads/完了報告書_Images';
const subImagesDir = '/Users/hasuiketomoo/Downloads/完了報告写真_Images';
const bucketName = 'completion_report_photos';

// Function to find all images for a given report ID
function findImagesForReport(reportId) {
    const images = [];
    
    // Check main images dir
    if (fs.existsSync(mainImagesDir)) {
        const files = fs.readdirSync(mainImagesDir);
        for (const file of files) {
            if (file.startsWith(reportId)) {
                images.push({
                    path: path.join(mainImagesDir, file),
                    name: file,
                    is_main: file.includes('.代表写真.')
                });
            }
        }
    }
    
    // Check sub images dir
    if (fs.existsSync(subImagesDir)) {
        const files = fs.readdirSync(subImagesDir);
        for (const file of files) {
            if (file.startsWith(reportId)) {
                images.push({
                    path: path.join(subImagesDir, file),
                    name: file,
                    is_main: file.includes('.代表写真.') // just in case
                });
            }
        }
    }
    
    return images;
}

// Function to upload a local file to Supabase Storage
async function uploadImage(localPath, fileName, reportUuid) {
    const fileExt = fileName.split('.').pop();
    const storagePath = `${reportUuid}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const fileBuffer = fs.readFileSync(localPath);
    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, fileBuffer, {
            contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
            upsert: false
        });
        
    if (error) {
        console.error(`  [!] Failed to upload ${fileName}:`, error.message);
        return null;
    }
    
    const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
    console.log(`  [+] Uploaded ${fileName} to ${storagePath}`);
    return publicUrl;
}

async function main() {
    const content = fs.readFileSync(csvFilePath, 'utf8');
    const records = parse(content, { columns: true, skip_empty_lines: true });
    console.log(`Parsed ${records.length} records from CSV.`);
    
    // Fetch project maps
    const { data: projects } = await supabase.from('projects').select('id, legacy_id');
    const projectMap = new Map();
    for (const p of projects) {
        if (p.legacy_id) projectMap.set(p.legacy_id, p.id);
        projectMap.set(p.id, p.id);
    }
    
    let successCount = 0;
    
    for (const record of records) {
        const legacy_id = record['ID'];
        const legacy_project = record['工事案件'];
        
        let project_id = projectMap.get(legacy_project);
        if (!project_id) {
             console.log(`Warning: Project not found map for ${legacy_project}. Skipping report ${legacy_id}.`);
             continue; 
        }
        
        // Format dates
        let completion_date = null;
        if (record['完了日']) {
            const parts = record['完了日'].split('/');
            if (parts.length === 3) completion_date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        
        let inspection_datetime = null;
        if (record['検査日時']) {
            const [dpart, tpart] = record['検査日時'].split(' ');
            if (dpart && tpart) {
                const dp = dpart.split('/');
                const tp = tpart.split(':');
                inspection_datetime = `${dp[0]}-${dp[1].padStart(2, '0')}-${dp[2].padStart(2, '0')}T${tp[0].padStart(2, '0')}:${tp[1].padStart(2, '0')}:${tp[2].padStart(2, '0')}+09:00`;
            }
        }
        
        let inspection_items = [];
        if (record['検査項目']) {
            inspection_items = record['検査項目'].replace(/\s*,\s*/g, ',').split(',').map(s => s.trim()).filter(Boolean);
        }
        
        const payload = {
            report_id: legacy_id || null,
            project_id: project_id,
            reporter: record['報告者'] || '',
            inspector: record['検査者'] || '',
            completion_date: completion_date,
            inspection_datetime: inspection_datetime,
            inspection_items: inspection_items,
            inspection_details: record['検査内容'] || '',
            witness: record['立会者'] || '',
            inspection_result: record['検査結果'] || '',
            remarks: record['備考'] || ''
        };
        
        // Insert record
        const { data: insertedReport, error } = await supabase.from('completion_reports').insert([payload]).select().single();
        
        if (error) {
            console.error(`Error inserting report ${legacy_id}:`, error.message);
            continue;
        }
        
        const newReportId = insertedReport.id;
        console.log(`Inserted report ${legacy_id} -> UUID: ${newReportId}`);
        successCount++;
        
        // Handle images
        const reportImages = findImagesForReport(legacy_id);
        let displayOrder = 0;
        
        for (const img of reportImages) {
            const publicUrl = await uploadImage(img.path, img.name, newReportId);
            if (publicUrl) {
                const photoPayload = {
                    completion_report_id: newReportId,
                    photo_url: publicUrl,
                    is_main: img.is_main,
                    display_order: displayOrder++
                };
                const { error: photoErr } = await supabase.from('completion_report_photos').insert([photoPayload]);
                if (photoErr) {
                    console.error(`  [!] Failed to insert photo record for ${img.name}:`, photoErr.message);
                } else {
                    console.log(`  [+] Inserted photo record for ${img.name} (is_main: ${img.is_main})`);
                }
            }
        }
    }
    
    console.log(`\nMigration complete. Successfully processed ${successCount} reports.`);
}
main();
