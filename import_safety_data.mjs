import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as csv from 'csv-parse/sync';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
   auth: { persistSession: false },
});

// CSV paths
const settingsCsvPath = '/Users/hasuiketomoo/Downloads/安否確認用データ - 設定.csv';
const historyCsvPath = '/Users/hasuiketomoo/Downloads/安否確認用データ - 通知履歴.csv';
const reportsCsvPath = '/Users/hasuiketomoo/Downloads/安否確認用データ - 回答データ.csv';

// Name corrections based on user feedback
const nameCorrections = {
    '大島\u3000稔廉': '大島\u3000稔康',
    '小原\u3000由弾': '小原\u3000由禅',
    'ホセ\u3000モンドラゴン': 'モンドラゴン\u3000ホセ',
    '大島 稔廉': '大島\u3000稔康',
    '小原 由弾': '小原\u3000由禅',
    'ホセ モンドラゴン': 'モンドラゴン\u3000ホセ'
};

async function importData() {
    try {
        console.log("--- Starting Safety Data Import ---");

        // 1. Settings (app_settings)
        if (fs.existsSync(settingsCsvPath)) {
            console.log("-> Importing settings...");
            const settingsRaw = fs.readFileSync(settingsCsvPath, 'utf8');
            const settingsData = csv.parse(settingsRaw, { columns: false, skip_empty_lines: true });

            if (settingsData.length > 1) {
                const webhookUrl = settingsData[0][1]; // B1
                const appUrl = settingsData[1][1];     // B2
                
                if (webhookUrl || appUrl) {
                    const { error } = await supabase.from('app_settings').insert({
                         safety_webhook_url: webhookUrl || null,
                         safety_app_url: appUrl || null
                    });
                    if (error) console.error("Error inserting settings:", error);
                    else console.log("   Settings imported successfully.");
                } else {
                     console.log("   No valid URLs found in settings.");
                }
            }
        }

        // 2. Notification History (safety_notification_history)
        if (fs.existsSync(historyCsvPath)) {
            console.log("-> Importing notification history...");
            const historyRaw = fs.readFileSync(historyCsvPath, 'utf8');
            const historyData = csv.parse(historyRaw, { columns: true, skip_empty_lines: true });
            
            const historyInserts = historyData.map(row => {
                return {
                    type: row['種別'],
                    sent_at: new Date(row['送信日時']).toISOString(),
                    // sent_by remains null as they are system/old gas triggered
                };
            }).filter(h => h.type && h.sent_at !== 'Invalid Date');

            if (historyInserts.length > 0) {
                const { error } = await supabase.from('safety_notification_history').insert(historyInserts);
                if (error) console.error("Error inserting history:", error);
                else console.log(`   ${historyInserts.length} history records imported successfully.`);
            }
        }

        // 3. Safety Reports (safety_reports)
         if (fs.existsSync(reportsCsvPath)) {
            console.log("-> Importing safety reports...");
            const reportsRaw = fs.readFileSync(reportsCsvPath, 'utf8');
            const reportsData = csv.parse(reportsRaw, { columns: true, skip_empty_lines: true });

            console.log("   Fetching worker_master...");
            const { data: workers, error: workerErr } = await supabase.from('worker_master').select('id, name, email');
            if (workerErr) throw workerErr;
            
            const workerMap = new Map();
            workers.forEach(w => {
                if (w.name) workerMap.set(w.name, w.id);
                if (w.name) workerMap.set(w.name.replace(/\s+/g, ''), w.id);
            });

            console.log(`   Found ${workers.length} workers in DB.`);

            const reportInserts = [];
            for (const row of reportsData) {
                const timestampStr = row['タイムスタンプ'];
                let reporterName = row['報告者名'];
                let status = row['安否状況'];
                
                // Map status exactly to ENUM
                if (!['無事', '軽傷', '重傷'].includes(status)) {
                    status = '無事'; 
                }

                // Apply name correction if any
                if (nameCorrections[reporterName]) {
                    console.log(`   Correcting name: ${reporterName} -> ${nameCorrections[reporterName]}`);
                    reporterName = nameCorrections[reporterName];
                } else {
                    // Normalize space just in case the dictionary missed some variation
                    const strippedName = reporterName.replace(/\s+/g, '');
                    const correctionsKey = Object.keys(nameCorrections).find(k => k.replace(/\s+/g, '') === strippedName);
                    if (correctionsKey) {
                         reporterName = nameCorrections[correctionsKey];
                    }
                }

                let workerId = workerMap.get(reporterName);
                if (!workerId && reporterName) {
                    workerId = workerMap.get(reporterName.replace(/\s+/g, ''));
                }

                if (workerId && timestampStr) {
                    try {
                        let dateObj = new Date(timestampStr);
                        if (!isNaN(dateObj.getTime())) {
                             reportInserts.push({
                                worker_id: workerId,
                                status: status,
                                family_status: row['家族の安否'] || null,
                                house_status: row['住居の状態'] || null,
                                location: row['現在地'] || null,
                                memo: row['報告内容'] || null,
                                created_at: dateObj.toISOString()
                            });
                        }
                    } catch(e) {}
                } else {
                    console.log(`   Warning: Could not find worker matching name "${reporterName}" for report at ${timestampStr}`);
                }
            }

            if (reportInserts.length > 0) {
                const { error } = await supabase.from('safety_reports').insert(reportInserts);
                if (error) console.error("Error inserting reports:", error);
                else console.log(`   ${reportInserts.length} report records imported successfully.`);
            } else {
                 console.log("   No valid report records found to import.");
            }
        }

        console.log("--- Import Finished ---");
    } catch (err) {
        console.error("Fatal Error:", err);
    }
}

importData();
