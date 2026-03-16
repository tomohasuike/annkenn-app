import fs from 'fs';

const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
const matches = content.match(/"({.*?})"/g);
const assignmentsStr = matches[0].slice(1, -1).replace(/""/g, '"');
const assignments = JSON.parse(assignmentsStr);

let vacationKeys = [];
for (const [key, resourceList] of Object.entries(assignments)) {
    if (key.includes('vacation')) {
        vacationKeys.push(key);
    }
}
console.log(`Found ${vacationKeys.length} vacation assignment entries.`);
if (vacationKeys.length > 0) {
    console.log("Sample:", vacationKeys[0], assignments[vacationKeys[0]]);
}
