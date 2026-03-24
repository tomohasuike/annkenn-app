import fs from 'fs';

const filePath = 'src/pages/ScheduleManagement.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. canDragItem
content = content.replace(
  `  const canDragItem = (type: 'worker' | 'vehicle', assignmentId?: string) => {\n    if (isAdmin) return true;\n    if (type !== 'vehicle' || !currentWorkerId) return false;\n    if (!assignmentId) return true;`,
  `  const canDragItem = (_type: 'worker' | 'vehicle', assignmentId?: string) => {\n    if (isAdmin) return true;\n    if (!currentWorkerId) return false;\n    if (!assignmentId) return true;`
);

// 2. Desktop Time Group Plus buttons
const targetTimeGroup = `{isAdmin && (
                                                            <div className="flex items-center gap-0.5">
                                                              <button className="text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors" onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, group.start || '', group.end || '', e, 'personnel')} title="この時間帯に人員を配置"><Plus className="w-3 h-3"/></button>
                                                              <button className="text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, group.start || '', group.end || '', e, 'vehicle')} title="この時間帯に車両・機械を配置"><Truck className="w-3 h-3"/></button>
                                                              {group.assignments.length === 0 && (
                                                                <button className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTimeBlocks(prev => { const newB = {...prev}; newB[\`\${p.id}-\${dateStr}\`] = newB[\`\${p.id}-\${dateStr}\`].filter(b => b.start_time !== group.start || b.end_time !== group.end); return newB; }) }} title="時間枠を削除"><X className="w-3 h-3"/></button>
                                                              )}
                                                            </div>
                                                          )}`;
const replaceTimeGroup = `<div className="flex items-center gap-0.5">
                                                            <button className="text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors" onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, group.start || '', group.end || '', e, 'personnel')} title="この時間帯に人員を配置"><Plus className="w-3 h-3"/></button>
                                                            <button className="text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, group.start || '', group.end || '', e, 'vehicle')} title="この時間帯に車両・機械を配置"><Truck className="w-3 h-3"/></button>
                                                            {group.assignments.length === 0 && (
                                                              <button className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTimeBlocks(prev => { const newB = {...prev}; newB[\`\${p.id}-\${dateStr}\`] = newB[\`\${p.id}-\${dateStr}\`].filter(b => b.start_time !== group.start || b.end_time !== group.end); return newB; }) }} title="時間枠を削除"><X className="w-3 h-3"/></button>
                                                            )}
                                                          </div>`;
content = content.replace(targetTimeGroup, replaceTimeGroup);

// 3. Desktop Global Cell Plus buttons
const targetGlobalPlus = `{isAdmin && (
                                                   <button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'personnel')} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-100 transition-colors" title="人員を配置">
                                                       <Plus className="w-3.5 h-3.5" />
                                                   </button>
                                                 )}
                                                 <button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'vehicle')} className={\`p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-100 transition-colors \${isAdmin ? 'border-l border-slate-200' : ''}\`} title="車両・機械を配置">`;
const replaceGlobalPlus = `<button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'personnel')} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-100 transition-colors" title="人員を配置">
                                                       <Plus className="w-3.5 h-3.5" />
                                                   </button>
                                                 <button onClick={(e) => handleOpenAddModal(p.id, p.name, dateStr, '', '', e, 'vehicle')} className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-100 transition-colors border-l border-slate-200" title="車両・機械を配置">`;
content = content.replace(targetGlobalPlus, replaceGlobalPlus);
content = content.replace(targetGlobalPlus.replace(/\n/g, '\r\n'), replaceGlobalPlus.replace(/\n/g, '\r\n')); // CRLF fallback

fs.writeFileSync(filePath, content, 'utf8');
console.log('Replacements completed successfully');
