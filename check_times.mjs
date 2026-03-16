import fs from 'fs';
import { parse } from 'csv-parse/sync';

const DIR = '/Users/hasuiketomoo/Downloads/';
const nippoRows = parse(fs.readFileSync(DIR + '日報リソースDB - 工事日報.csv', 'utf8'), { columns: true, skip_empty_lines: true });
const yoteiRows = parse(fs.readFileSync(DIR + '明日の業務日報DB - 業務予定.csv', 'utf8'), { columns: true, skip_empty_lines: true });

console.log('\n--- Checking 2026-02-16 to 19 Data ---');
const datesToCheck = ['2026/02/16', '2026/02/17', '2026/02/18', '2026/02/19', '2026-02-16', '2026-02-17'];

nippoRows.forEach(r => {
   const dText = r['報告日時'];
   if (!dText) return;
   const d = dText.split(' ')[0]; // Handing "2026/02/16 10:00:00"
   if (datesToCheck.includes(d) || datesToCheck.includes(d.replace(/\//g, '-'))) {
       console.log({
           d: dText,
           kubun: r['作業内容・区分'] || r['区分'],
           type: '日報',
           startTime: r['作業開始時間'],
           endTime: r['作業終了時間'],
           workers: r['HITEC作業員'] || r['作業員']
       });
   }
});

yoteiRows.forEach(r => {
   const dText = r['業務日'];
   if (!dText) return;
   const d = dText.split(' ')[0];
   if (datesToCheck.includes(d) || datesToCheck.includes(d.replace(/\//g, '-'))) {
       console.log({
           d: dText,
           kubun: r['作業区分'] || r['区分'],
           type: '予定',
           startTime: r['出社時間'],
           endTime: r['退社時間'],
           workers: r['HITEC作業員'] || r['作業員']
       });
   }
});
