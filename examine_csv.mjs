import fs from 'fs';

function examine() {
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  const matches = content.match(/"({.*?})"/g);
  if (!matches || matches.length < 3) return console.error("Could not parse JSON blocks");
  
  const assignmentsStr = matches[0].slice(1, -1).replace(/""/g, '"');
  const customResStr = matches[2].slice(1, -1).replace(/""/g, '"');
  
  const assignments = JSON.parse(assignmentsStr);
  const customRes = JSON.parse(customResStr);

  console.log("Assignments Sample (first 2 keys):");
  let count = 0;
  for (const [key, val] of Object.entries(assignments)) {
      console.log(key, val);
      count++;
      if (count > 1) break;
  }

  console.log("\nCustom Res Sample (first 2 keys):");
  count = 0;
  for (const [key, val] of Object.entries(customRes)) {
      console.log(key, val);
      count++;
      if (count > 1) break;
  }
}

examine();
