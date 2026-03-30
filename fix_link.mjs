import fs from 'fs';
const file = 'src/pages/attendance/AttendanceAdmin.tsx';
let content = fs.readFileSync(file, 'utf8');

const t1 = `<span className="truncate w-full block text-[13px]" title={pObj.name}>{pObj.name}</span>`;

const r1 = `{pObj.reportId ? (
                                           <Link to={\`/reports/\${pObj.reportId}\`} className="truncate w-full block text-[13px] text-blue-600 hover:text-blue-800 hover:underline transition-colors block" title={pObj.name} target="_blank" rel="noopener noreferrer">
                                             {pObj.name}
                                           </Link>
                                         ) : (
                                            <span className="truncate w-full block text-[13px]" title={pObj.name}>{pObj.name}</span>
                                         )}`;

content = content.replace(t1, r1); // Replaces only the first occurrence... Wait, I need to replace it down in the table, not necessarily the first occurrence. Let's do a targeted replace.

const tTarget = `<div key={idx} className="h-[22px] flex items-center w-full mb-0.5">
                                         <span className="truncate w-full block text-[13px]" title={pObj.name}>{pObj.name}</span>
                                       </div>`;
const rTarget = `<div key={idx} className="h-[22px] flex items-center w-full mb-0.5">
                                         {pObj.reportId ? (
                                           <Link to={\`/reports/\${pObj.reportId}\`} className="truncate w-full block text-[13px] text-blue-600 hover:text-blue-800 hover:underline transition-colors block" title={pObj.name} target="_blank" rel="noopener noreferrer">
                                             {pObj.name}
                                           </Link>
                                         ) : (
                                            <span className="truncate w-full block text-[13px]" title={pObj.name}>{pObj.name}</span>
                                         )}
                                       </div>`;

// Regex based replace to be impervious to spacing exactly
content = content.replace(/<div key=\{idx\} className="h-\[22px\] flex items-center w-full mb-0\.5">\s*<span className="truncate w-full block text-\[13px\]" title=\{pObj\.name\}>\{pObj\.name\}<\/span>\s*<\/div>/g, rTarget);

fs.writeFileSync(file, content);
console.log("Link insertion complete.");
