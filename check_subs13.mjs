import fs from 'fs';

const scheduleCsv = fs.readFileSync('/Users/hasuiketomoo/Downloads/明日の業務日報DB - 業務予定.csv', 'utf-8');
const sLines = scheduleCsv.split('\n').map(l => l.split(','));

const march16 = sLines.filter(l => l[1] && l[1].includes('03/16') && l[1].includes('2026'));

march16.forEach(sch => {
    // sch[7] is 作業員 (Workers)
    console.log(`Schedule ID: ${sch[0]}, Reporter: ${sch[4]}, Workers: ${sch[7]}`);
});
