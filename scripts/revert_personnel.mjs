import fs from 'fs';
const file = 'src/pages/ScheduleManagement.tsx';
let txt = fs.readFileSync(file, 'utf8');

// Revert canDragItem
txt = txt.replace(
  `  const canDragItem = (_type: 'worker' | 'vehicle', assignmentId?: string) => {\n    if (isAdmin) return true;\n    if (!currentWorkerId) return false;`,
  `  const canDragItem = (type: 'worker' | 'vehicle', assignmentId?: string) => {\n    if (isAdmin) return true;\n    if (type !== 'vehicle' || !currentWorkerId) return false;`
);

// Revert Mobile Categories
txt = txt.replace(
  `// 全ユーザーがすべての種別を追加可能\n\n                    const catNameMap`,
  `// 非管理者は車両と建機のみ追加可能\n                    if (!isAdmin && (catId === 'president' || catId === 'employee' || catId === 'partner')) return null;\n                    \n                    const catNameMap`
);

// We won't revert the Desktop Plus buttons since we did that using a complex script, I'll just restore those lines from previous snapshot or manually rewrite them back via regex.
// Let's do regex for the Desktop cell Plus manually.
txt = txt.replace(
  `<button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, group.start || '', group.end || '', e, 'personnel')} title="この時間帯に人員を配置"><Plus className="w-3 h-3"/></button>`,
  `{isAdmin && (\n                                                              <button className="text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors" onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, group.start || '', group.end || '', e, 'personnel')} title="この時間帯に人員を配置"><Plus className="w-3 h-3"/></button>\n                                                            )}`
);

txt = txt.replace(
  `<button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'personnel')} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-100 transition-colors" title="人員を配置">\n                                                       <Plus className="w-3.5 h-3.5" />\n                                                   </button>`,
  `{isAdmin && (\n                                                   <button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'personnel')} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-100 transition-colors" title="人員を配置">\n                                                       <Plus className="w-3.5 h-3.5" />\n                                                   </button>\n                                                 )}`
);

txt = txt.replace(
  `className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-100 transition-colors border-l border-slate-200" title="車両・機械を配置">`,
  `className={\`p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-100 transition-colors \${isAdmin ? 'border-l border-slate-200' : ''}\`} title="車両・機械を配置">`
);

fs.writeFileSync(file, txt);
console.log('Reverted.');
