const fs = require('fs');
const file = './src/pages/attendance/WorkerAttendance.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

const startIndex = 571; // line 572 (0-indexed)
const endIndex = 668; // line 669 (0-indexed)

const block = lines.splice(startIndex, endIndex - startIndex + 1);

const insertIndex = 484; // right after line 484 (</select>\n</div>)
lines.splice(insertIndex, 0, ...block);

fs.writeFileSync(file, lines.join('\n'));
console.log("Moved successfully.");
