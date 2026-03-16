import fs from 'fs';

function examine() {
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  const matches = content.match(/"({.*?})"/g);
  if (!matches) return console.error("Could not parse JSON blocks");
  
  console.log(`Found ${matches.length} json blocks`);
  
  for (let i = 0; i < matches.length; i++) {
     const str = matches[i].slice(1, -1).replace(/""/g, '"');
     try {
         const json = JSON.parse(str);
         console.log(`Block ${i} keys sample:`, Object.keys(json).slice(0, 5));
         const firstKey = Object.keys(json)[0];
         console.log(`Block ${i} sample value:`, json[firstKey]);
     } catch(e) {
         console.log(`Block ${i} parse error`);
     }
  }
}

examine();
