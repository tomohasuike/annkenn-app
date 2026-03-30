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
