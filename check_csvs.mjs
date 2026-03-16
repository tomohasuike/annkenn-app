import fs from 'fs';
const dir = '/Users/hasuiketomoo/Downloads/';
const files = fs.readdirSync(dir).filter(f => f.includes('予定') || f.includes('csv'));
console.log("CSV files:", files);
