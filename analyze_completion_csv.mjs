const fs = require('fs');
const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/完了報告DB - 完了報告書.csv', 'utf8');
const lines = content.split('\n');
console.log('Total rows:', lines.length);

if (lines.length > 0) {
    console.log('Headers:', lines[0]);
}
if (lines.length > 1) {
    console.log('Row 1:', lines[1]);
}
if (lines.length > 2) {
    console.log('Row 2:', lines[2]);
}
