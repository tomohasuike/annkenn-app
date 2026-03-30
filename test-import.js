const text = `出勤表R8年2月分氏名
													小原 由禅"備　考
有休
遅刻･早退"
																		
月　日曜日出勤時間退社時間現場時間(入）現場時間(出）作業現場名現場代理人/職長/一般
1.26月::::
	.27火::::
	.28水::::
	.29木::::
	.30金::::
	.31土::::
	.1日::::
	.2月::::
	.3火7:5017:307:5017:30会社一般作業員
	.4水7:4017:307:4017:30会社一般作業員
	.5木7:4017:457:4017:45会社、市川屋一般作業員
	.6金7:4017:307:4017:30三島中学校一般作業員
	.7土::::
	.8日::::
	.9月6:5017:508:3017:30キヤノンメディカル一般作業員
	.10火7:3017:509:0016:00会社、一般住宅一般作業員
	.11水6:5018:308:0018:00カゴメ一般作業員
	.12木6:5017:308:0017:00カゴメ一般作業員
	.13金6:5018:108:0017:20カゴメ一般作業員
	.14土6:5019:058:0018:30カゴメ一般作業員
	.15日::::
	.16月6::2017:508:0017:00キャノンメディカル一般作業員
	.17火6:5517:507:3017:00キャノンメディカル一般作業員
	.18水6:5518:007:3016:25キャノンメディカル一般作業員
	.19木6:5517:457:4016:25キャノンメディカル一般作業員
	.20金7:0018:008:1016:30キャノンメディカル一般作業員
	.21土::::
	.22日::::
	.23月6:1518:228:0517:00カゴメ一般作業員
	.24火6:5518:007:5017:00キャノンメディカル一般作業員
	.25水7:0017:458:2016:30富士通、キャノンメディカル一般作業員
							小　　計hh現場代理人日数　合計職長日数 合計
							合　　計h00`;

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

const rows = parseTSV(text);
const pData = [];
for (const row of rows) {
    if (row.length < 10) {
        console.log("SKIPPED (too short):", row.join(" , "));
        continue;
    }
    let dowIdx = row.findIndex(cell => ['月', '火', '水', '木', '金', '土', '日'].includes(cell.trim()));
    if (dowIdx === -1) {
        console.log("SKIPPED (no dow):", row.join(" , "));
        continue;
    }
    
    const dStr = row[dowIdx - 1]?.trim();
    if (!dStr || isNaN(parseInt(dStr))) {
        console.log("SKIPPED (no day):", row.join(" , "));
        continue;
    }
    
    const day = parseInt(dStr);
    
    const inH = parseInt(row[dowIdx + 1]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    const inM = parseInt(row[dowIdx + 3]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    const outH = parseInt(row[dowIdx + 4]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    const outM = parseInt(row[dowIdx + 6]?.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) || 'NaN');
    
    console.log(`Testing day ${day}: inH=${inH}, inM=${inM}, outH=${outH}, outM=${outM}. (RAW: ${row[dowIdx+1]}, ${row[dowIdx+3]}, ${row[dowIdx+4]}, ${row[dowIdx+6]})`);
    
    if (!isNaN(inH) && !isNaN(inM) && !isNaN(outH) && !isNaN(outM)) {
        pData.push(day);
    } else {
        console.log("-> Failed NaN check");
    }
}
console.log("Parsed " + pData.length + " rows");
