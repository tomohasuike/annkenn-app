import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function getVal(row, possibleKeys) {
    for (const k of possibleKeys) {
        if (row[k] !== undefined) return row[k];
    }
    return null;
}

const DIR = '/Users/hasuiketomoo/Downloads/';

async function migrate() {
    console.log('Starting full migration sync...');
    const { data: projs } = await supabase.from('projects').select('id, legacy_id, project_number');
    const { data: workers } = await supabase.from('worker_master').select('id, name');
    const dbProjects = new Map();
    projs.forEach(p => dbProjects.set(p.legacy_id, p));

    // Get ALL existing daily reports to avoid duplicating report rows
    const { data: existingReps } = await supabase.from('daily_reports').select('id, legacy_id');
    const dbReports = new Map(); // legacy_id => id
    existingReps.forEach(r => dbReports.set(r.legacy_id, r.id));

    const parseCsv = (filename) => {
        if (!fs.existsSync(DIR + filename)) return [];
        return parse(fs.readFileSync(DIR + filename, 'utf8'), { columns: true, skip_empty_lines: true });
    };

    const nippoRows = parseCsv('日報リソースDB - 工事日報.csv');
    const yoteiRows = parseCsv('明日の業務日報DB - 業務予定.csv');
    const allReports = [...nippoRows, ...yoteiRows];

    console.log(`Parsed ${nippoRows.length} daily reports, ${yoteiRows.length} tomorrow schedules.`);
    
    // Process Reports
    let repCount = 0;
    for (const row of allReports) {
        const legacyId = getVal(row, ['日報I D', '日報ID', '業務予定ID', 'ID']);
        if (!legacyId) continue;

        let dbId = dbReports.get(legacyId);
        if (!dbId) {
            // Need to insert report
            const pIdRaw = getVal(row, ['工事案件', '工事案件ID']);
            const proj = dbProjects.get(pIdRaw);
            
            let prog = parseInt(getVal(row, ['工事進捗']) || '0') || 0;
            
            const insertData = {
                legacy_id: legacyId,
                project_id: proj ? proj.id : null,
                project_number: proj ? proj.project_number : null,
                report_date: getVal(row, ['報告日時', '業務日']) ? new Date(getVal(row, ['報告日時', '業務日'])).toISOString() : null,
                reporter_name: getVal(row, ['報告者']),
                work_category: getVal(row, ['作業区分', '区分']),
                start_time: getVal(row, ['作業開始時間', '出社時間']) ? `2000-01-01T${getVal(row, ['作業開始時間', '出社時間'])}:00` : null,
                end_time: getVal(row, ['作業終了時間']) ? `2000-01-01T${getVal(row, ['作業終了時間'])}:00` : null,
                progress: prog > 100 ? 100 : prog,
                work_content: getVal(row, ['工事内容', '業務内容']),
                materials_used: getVal(row, ['使用材料']),
                subcontractors: getVal(row, ['協力業者']),
                site_photos: getVal(row, ['現場写真']),
                notes: getVal(row, ['備考'])
            };
            
            const { data: newRep, error } = await supabase.from('daily_reports').insert(insertData).select('id').single();
            if (error) { console.error('Error inserting report', legacyId, error.message); continue; }
            dbId = newRep.id;
            dbReports.set(legacyId, dbId);
            repCount++;
        }

        // Now process its inline lists (personnel, vehicles, machinery)
        // Clean existing lists to avoid dupes? Or just assume if we are creating personnel it's fine,
        // but wait, if the report already existed, did we migrate its personnel? Let's just delete the existing personnel and recreate for safety, it's small data.
        await supabase.from('report_personnel').delete().eq('report_legacy_id', legacyId);
        await supabase.from('report_vehicles').delete().eq('report_legacy_id', legacyId);
        await supabase.from('report_machinery').delete().eq('report_legacy_id', legacyId);

        const staffs = getVal(row, ['HITEC作業員', '作業員', '氏名']);
        if (staffs) {
            const arr = staffs.split(/[｜|，,、\s]+/).map(s => s.trim()).filter(s => s);
            for (const n of arr) {
                const w = workers.find(w => w.name && w.name.includes(n)) || workers.find(w => n.includes(w.name));
                await supabase.from('report_personnel').insert({
                    report_id: dbId,
                    report_legacy_id: legacyId,
                    worker_id: w ? w.id : null,
                    worker_name: n
                });
            }
        }
        
        const cars = getVal(row, ['作業車', '車両']);
        if (cars) {
            const arr = cars.split(/[｜|，,、\s]+/).map(s => s.trim()).filter(s => s);
            for (const n of arr) {
                await supabase.from('report_vehicles').insert({ report_id: dbId, report_legacy_id: legacyId, vehicle_name: n });
            }
        }
        
        const machines = getVal(row, ['建設機械', '建機', '重機']);
        if (machines) {
            const arr = machines.split(/[｜|，,、\s]+/).map(s => s.trim()).filter(s => s);
            for (const n of arr) {
                await supabase.from('report_machinery').insert({ report_id: dbId, report_legacy_id: legacyId, machinery_name: n });
            }
        }
    }
    console.log(`Inserted ${repCount} new reports. Rebuilt inline arrays.`);

    // Materials
    const matRows = parseCsv('日報リソースDB - 使用材料リスト.csv');
    let matCount = 0;
    await supabase.from('report_materials').delete().not('report_legacy_id', 'is', null);
    
    for (const r of matRows) {
        const lid = getVal(r, ['日報I D', '日報ID', '業務予定ID', 'ID']);
        if (!lid) continue;
        const dbId = dbReports.get(lid);
        
        const insertData = {
            report_id: dbId || null,
            report_legacy_id: lid,
            material_name: getVal(r, ['材料名', '使用材料']),
            quantity: getVal(r, ['数量']),
            photo: getVal(r, ['写真', '現場写真']),
            documentation: getVal(r, ['資料・図面', '資料'])
        };
        const { error } = await supabase.from('report_materials').insert(insertData);
        if (!error) matCount++;
        else console.log('Mat Error', error);
    }
    console.log(`Re-inserted ${matCount} materials.`);

    // Subcontractors
    const subNippo = parseCsv('日報リソースDB - 日報_協力業者.csv');
    const subYotei = parseCsv('明日の業務日報DB - 業務予定_協力業者.csv');
    const allSubs = [...subNippo, ...subYotei];
    await supabase.from('report_subcontractors').delete().not('report_legacy_id', 'is', null);
    
    let subCount = 0;
    for (const r of allSubs) {
        const lid = getVal(r, ['日報ID', '業務予定ID', 'ID']);
        if (!lid || lid.includes('-')) continue; // the ID exists twice maybe? Sometimes ID is the row id. 
        // Wait, for child tables, usually there's ID and Parent_ID. Let's look at the keys:
        // 'ID', '日報ID', '業者名', '人数'
        const parentLid = getVal(r, ['日報ID', '業務予定ID']);

        const dbId = dbReports.get(parentLid || lid);
        
        const insertData = {
            report_id: dbId || null,
            report_legacy_id: parentLid || lid,
            subcontractor_name: getVal(r, ['業者名']),
            worker_count: parseInt(getVal(r, ['人数'])) || 0
        };
        const { error } = await supabase.from('report_subcontractors').insert(insertData);
        if (!error) subCount++;
        else console.log('Sub Error', error);
    }
    console.log(`Re-inserted ${subCount} subcontractors.`);
}
migrate();
