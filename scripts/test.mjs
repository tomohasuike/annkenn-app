import fs from 'fs';

const fileContent = fs.readFileSync('scripts/foo.txt', 'utf8');
const chunks = fileContent.split('INSERT INTO');
for (let chunk of chunks) {
    if (!chunk.includes('materials')) continue;
    const valueStart = chunk.indexOf('VALUES (');
    const valueEnd = chunk.lastIndexOf(');');
    let inner = chunk.substring(valueStart + 8, valueEnd).trim();
    inner = inner.replace(/\n/g, '');
    
    const mfgMarker = "name = '";
    const mfgStart = inner.indexOf(mfgMarker);
    const mfgEnd = inner.indexOf("'", mfgStart + mfgMarker.length);
    const mfgName = inner.substring(mfgStart + mfgMarker.length, mfgEnd);
    
    const restStart = inner.indexOf("), ", mfgEnd);
    const restStr = inner.substring(restStart + 3);
    console.log({mfgName, restStr, inner});
    break;
}
