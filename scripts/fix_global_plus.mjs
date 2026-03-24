import fs from 'fs';

const filePath = 'src/pages/ScheduleManagement.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const t2 = `\${isAdmin ? 'border-l border-slate-200' : ''}\`}`;
const r2 = `border-l border-slate-200\`}`;
content = content.replace(t2, r2);

const t3 = `{isAdmin && (\n                                                   <button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'personnel')}`;
const r3 = `<button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'personnel')}`;
content = content.replace(t3, r3);
content = content.replace(t3.replace(/\n/g, '\r\n'), r3.replace(/\n/g, '\r\n')); // CRLF

const t4 = `                                                       <Plus className="w-3.5 h-3.5" />\n                                                   </button>\n                                                 )}`;
const r4 = `                                                       <Plus className="w-3.5 h-3.5" />\n                                                   </button>`;
content = content.replace(t4, r4);
content = content.replace(t4.replace(/\n/g, '\r\n'), r4.replace(/\n/g, '\r\n')); // CRLF

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed globally!');
