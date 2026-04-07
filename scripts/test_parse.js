const fs = require('fs');
const content = fs.readFileSync('scripts/catalogs_insert.sql', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);

let success = 0;
for (let line of lines) {
  if (line.includes('INSERT INTO')) {
    const valuePart = line.substring(line.indexOf('VALUES ') + 7).trim();
    const inner = valuePart.substring(1, valuePart.length - 2); 
    const regex = /\(SELECT id FROM manufacturers WHERE name = '(.*?)' LIMIT 1\), '(.*?)', '(.*?)', (.*?), (.*?), '(.*?)', '(.*?)', (.*?), (.*?), (.*)/;
    const match = inner.match(regex);
    if (match) success++;
  }
}
console.log('Success match:', success);
