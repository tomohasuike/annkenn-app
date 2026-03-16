import fs from 'fs';

const scheduleCsv = fs.readFileSync('/Users/hasuiketomoo/Downloads/明日の業務日報DB - 業務予定.csv', 'utf-8');
const subCsv = fs.readFileSync('/Users/hasuiketomoo/Downloads/明日の業務日報DB - 業務予定_協力業者.csv', 'utf-8');

const sLines = scheduleCsv.split('\n').map(l => l.split(','));
const subLines = subCsv.split('\n').map(l => l.split(','));

// Find schedules on 2026/03/16
// index 1 is 業務日
const march16 = sLines.filter(l => l[1] && l[1].includes('03/16') && l[1].includes('2026'));
console.log(`Found ${march16.length} schedules on 2026/03/16`);

march16.forEach(sch => {
    // index 0 is ID
    const sid = sch[0];
    console.log(`Schedule ID: ${sid}, Content: ${sch[5]}, Reporter: ${sch[4]}`);
    
    // index 1 is 業務予定ID in subCsv
    const mySubs = subLines.filter(l => l[1] === sid);
    console.log(`  -> Subcontractors for this schedule:`, mySubs);
});
