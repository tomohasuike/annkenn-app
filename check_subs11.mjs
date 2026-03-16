import fs from 'fs';
import { parse } from 'csv-parse/sync';

const scheduleCsv = fs.readFileSync('/Users/hasuiketomoo/Downloads/明日の業務日報DB - 業務予定.csv', 'utf-8');
const subCsv = fs.readFileSync('/Users/hasuiketomoo/Downloads/明日の業務日報DB - 業務予定_協力業者.csv', 'utf-8');

const schedules = parse(scheduleCsv, { columns: true, skip_empty_lines: true });
const subs = parse(subCsv, { columns: true, skip_empty_lines: true });

// Find schedules on 2026/03/16
const march16 = schedules.filter(s => s['業務日'].includes('03/16') && s['業務日'].includes('2026'));
console.log(`Found ${march16.length} schedules on 2026/03/16`);

march16.forEach(sch => {
    console.log(`Schedule ID: ${sch['ID']}, Content: ${sch['業務内容']}, Reporter: ${sch['報告者']}`);
    const mySubs = subs.filter(sub => sub['業務予定ID'] === sch['ID']);
    console.log(`  -> Subcontractors for this schedule:`, mySubs);
});
