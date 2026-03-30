const fs = require('fs');

const parseTSV = (text) => {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    currentCell += '"';
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
                if (char === '\r' && text[i + 1] === '\n') i++;
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
};

// I will just mock up the row representing 3rd of the month:
const rows = [
    [ "", ".", "3", "火", "7", ":", "50", "17", ":", "30", "7", ":", "50", "17", ":", "30", "会社", "一般作業員" ]
];

let pData = [];
for (const row of rows) {
    if (row.length < 10) continue;
    let dowIdx = row.findIndex(cell => ['月', '火', '水', '木', '金', '土', '日'].includes(cell.trim()));
    if (dowIdx === -1) continue;
    
    const dStr = row[dowIdx - 1]?.trim();
    if (!dStr || isNaN(parseInt(dStr))) continue;
    
    const inH = parseInt(row[dowIdx + 1]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    const inM = parseInt(row[dowIdx + 3]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    const outH = parseInt(row[dowIdx + 4]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    const outM = parseInt(row[dowIdx + 6]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    
    console.log("dowIdx:", dowIdx);
    console.log("day:", dStr);
    console.log("inH:", row[dowIdx + 1], "=>", inH);
    console.log("inM:", row[dowIdx + 3], "=>", inM);
    console.log("outH:", row[dowIdx + 4], "=>", outH);
    console.log("outM:", row[dowIdx + 6], "=>", outM);
}
