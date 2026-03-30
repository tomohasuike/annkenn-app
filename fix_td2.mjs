import fs from 'fs';
const file = 'src/pages/attendance/AttendanceAdmin.tsx';
let content = fs.readFileSync(file, 'utf8');

const t1 = `<th className="p-3 border-r min-w-[120px] font-bold text-slate-700 text-left">作業現場名 (日報連携)</th>`;
const r1 = `<th className="p-3 border-r w-16 bg-blue-50/50 font-bold text-slate-700">現場入</th>
                     <th className="p-3 border-r w-16 bg-blue-50/50 font-bold text-slate-700">現場出</th>
                     ${t1}`;
content = content.replace(t1, r1);

// Look for the specific TD block
const t2 = `                           <td className="p-2 border-r text-left max-w-[250px] text-slate-600 font-medium h-[48px] overflow-hidden align-top pt-2">
                              {projs.length > 0 ? (
                                 <div className="flex flex-col gap-1.5 w-full">
                                   {projs.map((pObj: any, idx: number) => (
                                      <div key={idx} className="flex flex-col items-start w-full">
                                        {pObj.time && <span className="text-[10px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded leading-none whitespace-nowrap mb-0.5 border border-blue-100">{pObj.time}</span>}
                                        <span className="truncate w-full block text-[13px]" title={pObj.name}>{pObj.name}</span>
                                      </div>
                                   ))}
                                 </div>
                               ) : <span className="text-slate-300 flex items-center h-full">-</span>}
                           </td>`;

const r2 = `                           {/* 現場入 Column */}
                           <td className="p-2 border-r font-medium text-slate-700 h-[48px] align-top bg-blue-50/10 pt-2">
                              {projs.length > 0 ? (
                                <div className="flex flex-col gap-1 w-full text-center">
                                  {projs.map((pObj: any, idx: number) => (
                                     <div key={idx} className="h-[22px] flex items-center justify-center text-[10.5px] truncate text-blue-700 bg-white rounded px-1 mb-0.5 border border-blue-100/50">
                                       {pObj.sStr || '-'}
                                     </div>
                                  ))}
                                </div>
                              ) : <span className="text-slate-300 flex items-center justify-center h-[34px]">-</span>}
                           </td>

                           {/* 現場出 Column */}
                           <td className="p-2 border-r font-medium text-slate-700 h-[48px] align-top bg-blue-50/10 pt-2">
                              {projs.length > 0 ? (
                                <div className="flex flex-col gap-1 w-full text-center">
                                  {projs.map((pObj: any, idx: number) => (
                                     <div key={idx} className="h-[22px] flex items-center justify-center text-[10.5px] truncate text-blue-700 bg-white rounded px-1 mb-0.5 border border-blue-100/50">
                                       {pObj.eStr || '-'}
                                     </div>
                                  ))}
                                </div>
                              ) : <span className="text-slate-300 flex items-center justify-center h-[34px]">-</span>}
                           </td>

                           <td className="p-2 border-r text-left max-w-[250px] text-slate-600 font-medium h-[48px] overflow-hidden align-top pt-2">
                              {projs.length > 0 ? (
                                 <div className="flex flex-col gap-1 w-full">
                                   {projs.map((pObj: any, idx: number) => (
                                      <div key={idx} className="h-[22px] flex items-center w-full mb-0.5">
                                        <span className="truncate w-full block text-[13px]" title={pObj.name}>{pObj.name}</span>
                                      </div>
                                   ))}
                                 </div>
                               ) : <span className="text-slate-300 flex items-center h-[34px]">-</span>}
                           </td>`;

if(content.includes(t2)) {
    content = content.replace(t2, r2);
} else {
    // try removing whitespace issues
    content = content.replace(/<td className="p-2 border-r text-left max-w-\[250px\][\s\S]*?<\/td>/, r2);
}

const t3 = `<td colSpan={5} className="p-3 text-right border-r text-slate-700">月間合計 :</td>`;
const r3 = `<td colSpan={7} className="p-3 text-right border-r text-slate-700">月間合計 :</td>`;
content = content.replace(t3, r3);

fs.writeFileSync(file, content);
console.log("Replaced successfully!");
