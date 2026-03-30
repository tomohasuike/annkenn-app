const testLine = '\"2026/01/26(月)\",\"大金 正人\",\"100007\",\"2026/01/26(月)08:45\",\"2026/01/26(月)19:16\"';

const parseCsvLine = (text) => {
    const arr = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        arr.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    arr.push(cur);
    return arr.map(s => {
      let v = s.trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.substring(1, v.length - 1);
      }
      return v;
    });
};

const columns = parseCsvLine(testLine);
console.log('Parsed cols:', columns);

const normalizeKanji = (str) => {
    return str.replace(/\s+/g, '')
              .replace(/[齋齊斉]/g, '斎')
              .replace(/[邊邉]/g, '辺')
              .replace(/濱/g, '浜')
              .replace(/髙/g, '高')
              .replace(/﨑/g, '崎');
};

console.log('nameRaw=', columns[1]);
console.log('Match?', normalizeKanji('大金　正人').includes(normalizeKanji(columns[1])));
const inTime = columns[3] ? columns[3].slice(-5) : null;
console.log('inTime:', inTime);
