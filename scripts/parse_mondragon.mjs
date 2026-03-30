import fs from 'fs';
import path from 'path';

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts', 'mondragon.txt'), 'utf8');

// A simple function to parse TSV with potential quoted newlines
function parseTSV(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentCell += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === '\t') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') {
          i++; // skip \n
        }
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }
  if (currentRow.length > 0 || currentCell) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }
  return rows;
}

const rows = parseTSV(raw);

let currentMonth = 2; // derived from context
const year = 2026; // R8 is 2026

const parsedData = [];

for (const row of rows) {
  // We need to identify rows that look like dates
  // Usually they have a '.' at index 1 or they might be completely empty
  if (row.length < 15) continue;
  
  const m = row[0];
  const dot = row[1];
  const d = row[2];
  
  // if dot is '.' and d is a number, it's a date row
  if (dot === '.' && d && !isNaN(parseInt(d))) {
    if (m && !isNaN(parseInt(m))) {
      currentMonth = parseInt(m);
    }
    const day = parseInt(d);
    
    const inH = parseInt(row[4].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    const inM = parseInt(row[6].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    const outH = parseInt(row[7].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    const outM = parseInt(row[9].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    
    const siteInH = parseInt(row[10].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    const siteInM = parseInt(row[12].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    const siteOutH = parseInt(row[13].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    const siteOutM = parseInt(row[15].replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    
    // Only add if there is clock in time
    if (!isNaN(inH) && !isNaN(inM) && !isNaN(outH) && !isNaN(outM)) {
      const dateStr = `${year}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      
      let travelTime = 0;
      if (!isNaN(siteInH) && !isNaN(siteInM) && !isNaN(siteOutH) && !isNaN(siteOutM)) {
         // calculate travel time
         // commute morning = (siteInH*60 + siteInM) - (inH*60 + inM)
         const morningCommute = (siteInH * 60 + siteInM) - (inH * 60 + inM);
         const eveningCommute = (outH * 60 + outM) - (siteOutH * 60 + siteOutM);
         travelTime = (morningCommute > 0 ? morningCommute : 0) + (eveningCommute > 0 ? eveningCommute : 0);
      }
      
      let role = '一般';
      if (row.length > 17 && row[17] === '職長') role = '職長';
      
      parsedData.push({
        date: dateStr,
        clock_in: `${inH.toString().padStart(2, '0')}:${inM.toString().padStart(2, '0')}`,
        clock_out: `${outH.toString().padStart(2, '0')}:${outM.toString().padStart(2, '0')}`,
        travel_time_minutes: travelTime,
        role
      });
    }
  }
}

console.log(JSON.stringify(parsedData, null, 2));
