const fs = require('fs');
const file = './src/pages/attendance/AttendanceAdmin.tsx';
let txt = fs.readFileSync(file, 'utf8');

// Replace setEditingTime({ ... }) calls to include 'role'
// They look like: declEnd: getDeclaredTime(..., "end_time") })
txt = txt.replace(/declEnd:\s*getDeclaredTime\(([^,]+),\s*"end_time"\)\s*\}\)/g, 
   'declEnd: getDeclaredTime($1, "end_time"), role: getDeclaredRole($1) })');

// Also update the UI column for "役割" (Role) 
// Around line 820
txt = txt.replace(
`                           <td onClick={openAttendanceModal} className="p-2 border-r text-left cursor-pointer hover:bg-slate-100 transition-colors">
                              {record?.role ? (
                                 <span className={\`px-2 py-1 rounded text-xs font-bold \${record.role === '職長' ? 'bg-blue-100 text-blue-800' : record.role === '現場代理人' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}\`}>
                                   {record.role}
                                 </span>
                              ) : <span className="text-slate-300">-</span>}
                           </td>`,
`                           <td onClick={openAttendanceModal} className="p-2 border-r text-left cursor-pointer hover:bg-slate-100 transition-colors">
                              {record?.site_declarations && record.site_declarations.length > 0 ? (
                                <div className="flex flex-col gap-1 text-xs">
                                  {record.site_declarations.map((sd, i) => {
                                    const siteRole = sd.role || '一般';
                                    return (
                                      <span key={i} className={\`truncate w-fit block px-1.5 py-0.5 rounded border \${siteRole === '職長' ? 'bg-blue-100 text-blue-800 border-blue-200' : siteRole === '現場代理人' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'}\`}>
                                        {siteRole}
                                      </span>
                                    )
                                  })}
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                           </td>`
);

// Update role count calculation in the footer
txt = txt.replace(
`<span>職長: {records.filter(r => r.role === '職長').length} 回</span>`,
`<span>職長: {records.reduce((acc, r) => acc + (r.site_declarations ? r.site_declarations.filter((sd) => sd.role === '職長').length : 0), 0)} 回</span>`
);

fs.writeFileSync(file, txt);
console.log("Updated AttendanceAdmin.");
