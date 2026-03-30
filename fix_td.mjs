import fs from 'fs';
const file = 'src/pages/attendance/AttendanceAdmin.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `{projs.length > 0 ? projs.join(', ') : <span className="text-slate-300">-</span>}`;
const replacement = `{projs.length > 0 ? (
                                 <div className="flex flex-col gap-1.5 w-full">
                                   {projs.map((pObj: any, idx: number) => (
                                      <div key={idx} className="flex flex-col items-start w-full">
                                        {pObj.time && <span className="text-[10px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded leading-none whitespace-nowrap mb-0.5 border border-blue-100">{pObj.time}</span>}
                                        <span className="truncate w-full block text-[13px]" title={pObj.name}>{pObj.name}</span>
                                      </div>
                                   ))}
                                 </div>
                               ) : <span className="text-slate-300 flex items-center h-full">-</span>}`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("Replaced successfully!");
} else {
    console.log("Target not found!");
}
