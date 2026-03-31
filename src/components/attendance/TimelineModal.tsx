import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';

export interface TimelineEvent {
  id: string;
  time: string;
  type: 'clock_in' | 'travel' | 'prep' | 'misc' | 'site_work' | 'clock_out';
  project_id?: string;
  project_name?: string;
  role?: string;
}

interface TimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  workerId: string;
  recordId: string | null;
  existingRecord: any;
  assignedProjectsForDate: any[];
  allProjects?: any[];
  onSaveSuccess: () => void;
  readOnly?: boolean;
}

export default function TimelineModal({
  isOpen, onClose, selectedDate, workerId, recordId, existingRecord,
  assignedProjectsForDate, allProjects: initialAllProjects = [], onSaveSuccess, readOnly = false
}: TimelineModalProps) {
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [personalOuts, setPersonalOuts] = useState<{ start_time: string; end_time: string }[]>([]);
  const [memo, setMemo] = useState<string>('');
  const [allProjects, setAllProjects] = useState<any[]>(initialAllProjects);
  const [branchSelection, setBranchSelection] = useState<{
    isOpen: boolean;
    eventIndex: number;
    parentProject: any;
    children: any[];
  } | null>(null);
  const [activeRoles, setActiveRoles] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    
    // Fetch projects if not provided
    if (initialAllProjects.length === 0 && allProjects.length === 0) {
      const fetchProjects = async () => {
        const { data, error } = await supabase.from('projects').select('id, project_name, status_flag, project_number, client_name, parent_project_id').order('project_name');
        if (!error && data) setAllProjects(data);
      };
      fetchProjects();
    } else if (initialAllProjects.length > 0) {
      setAllProjects(initialAllProjects);
    }
    
    // Fetch active roles for this worker on this date
    const fetchActiveRoles = async () => {
       const { data } = await supabase
         .from('project_role_assignments')
         .select('project_id, role, start_date, end_date')
         .eq('worker_id', workerId)
         .lte('start_date', selectedDate)
         .gte('end_date', selectedDate);
       if (data) setActiveRoles(data);
       else setActiveRoles([]);
    };
    if (workerId && selectedDate) {
       fetchActiveRoles();
    }

    const formatTime = (isoString: string | null) => {
      if (!isoString) return '';
      const d = new Date(isoString);
      return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    };

    let initialEvents: TimelineEvent[] = [];
    
    if (existingRecord) {
        const ci = formatTime(existingRecord.clock_in_time);
        if (ci) initialEvents.push({ id: crypto.randomUUID(), time: ci, type: 'clock_in' });
        
        let decls = [...(existingRecord.site_declarations || [])].sort((a:any,b:any) => (a.start_time || '').localeCompare(b.start_time || ''));
        const assignedForDate = assignedProjectsForDate || [];
        const isAllImported = decls.length > 0 && decls.every(p => p.project_id === 'imported' || p.project_id === 'unassigned');
        
        if (isAllImported && assignedForDate.length > 0) {
             const originalTimes = { 
                 start: decls[0]?.start_time || '08:30', 
                 end: decls[decls.length - 1]?.end_time || '17:00' 
             };
             decls = assignedForDate.map(ap => ({
                   project_id: ap.project_id,
                   project_name: ap.project_name,
                   start_time: originalTimes.start,
                   end_time: originalTimes.end,
                   role: '一般'
             }));
        } else if (isAllImported) {
             decls = [];
        }

        let lastEnd = ci;
        for (const d of decls) {
             if (d.start_time) {
                 if (lastEnd && lastEnd !== d.start_time) {
                     initialEvents.push({ id: crypto.randomUUID(), time: lastEnd, type: 'travel' });
                 }
                 initialEvents.push({
                     id: crypto.randomUUID(), time: d.start_time, type: 'site_work',
                     project_id: d.project_id, project_name: d.project_name, role: d.role || '一般'
                 });
                 lastEnd = d.end_time;
             }
        }
        
        const co = formatTime(existingRecord.clock_out_time);
        if (co) {
             if (lastEnd && lastEnd !== co) {
                 initialEvents.push({ id: crypto.randomUUID(), time: lastEnd, type: 'travel' });
             }
             initialEvents.push({ id: crypto.randomUUID(), time: co, type: 'clock_out' });
        }
        
        setPersonalOuts(existingRecord.personal_outs || []);
        setMemo(existingRecord.memo || '');
    } else {
        setPersonalOuts([]);
        setMemo('');
        const assignedForDate = assignedProjectsForDate || [];
        if (assignedForDate.length > 0) {
            initialEvents.push({ id: crypto.randomUUID(), time: '07:30', type: 'clock_in' });
            initialEvents.push({ id: crypto.randomUUID(), time: '08:00', type: 'travel' });
            assignedForDate.forEach(ap => {
                initialEvents.push({
                     id: crypto.randomUUID(), time: '08:30', type: 'site_work',
                     project_id: ap.project_id, project_name: ap.project_name, role: '一般'
                });
            });
            initialEvents.push({ id: crypto.randomUUID(), time: '17:00', type: 'travel' });
            initialEvents.push({ id: crypto.randomUUID(), time: '18:00', type: 'clock_out' });
        } else {
            initialEvents.push({ id: crypto.randomUUID(), time: '', type: 'clock_in' });
            initialEvents.push({ id: crypto.randomUUID(), time: '', type: 'clock_out' });
        }
    }

    setTimelineEvents(initialEvents);
  }, [isOpen, selectedDate, recordId]);

  if (!isOpen) return null;

  const getEventBgColor = (type: string) => {
      switch(type) {
          case 'clock_in': return 'bg-amber-100/50 text-amber-800 border-amber-200';
          case 'clock_out': return 'bg-amber-100/50 text-amber-800 border-amber-200';
          case 'site_work': return 'bg-blue-50 text-blue-900 border-blue-200';
          case 'travel': return 'bg-slate-50 text-slate-700 border-slate-200';
          case 'prep': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
          default: return 'bg-white';
      }
  };

  const getEventIconColor = (type: string) => {
      switch(type) {
          case 'clock_in': return 'bg-amber-500';
          case 'clock_out': return 'bg-red-500';
          case 'site_work': return 'bg-blue-500';
          case 'travel': return 'bg-slate-400';
          case 'prep': return 'bg-emerald-400';
          default: return 'bg-slate-400';
      }
  };

  const addEvent = (index: number) => {
    if (readOnly) return;
    const newEvents = [...timelineEvents];
    newEvents.splice(index + 1, 0, { id: crypto.randomUUID(), time: '', type: 'travel' });
    setTimelineEvents(newEvents);
  };

  const removeEvent = (index: number) => {
    if (readOnly) return;
    const newEvents = [...timelineEvents];
    newEvents.splice(index, 1);
    
    // Auto-merge adjacent identical site_work blocks if they end up next to each other
    if (index > 0 && index < newEvents.length) {
        const prev = newEvents[index - 1];
        const next = newEvents[index];
        if (prev.type === 'site_work' && next.type === 'site_work' && 
            prev.project_id === next.project_id && prev.project_id !== undefined) {
            newEvents.splice(index, 1);
        }
    }
    
    setTimelineEvents(newEvents);
  };

  const addNakanuke = (index: number) => {
    if (readOnly) return;
    const currentEvent = timelineEvents[index];
    if (currentEvent.type !== 'site_work') return;
    
    // Add a 'misc' (雑務/中抜け) block, then a duplicate of the current site block
    const newEvents = [...timelineEvents];
    newEvents.splice(index + 1, 0, 
       { id: crypto.randomUUID(), time: '', type: 'misc' }, // Step out
       { id: crypto.randomUUID(), time: '', type: 'site_work', project_id: currentEvent.project_id, project_name: currentEvent.project_name, role: currentEvent.role } // Return
    );
    setTimelineEvents(newEvents);
  };

  const updateEventInfo = (index: number, updates: Partial<TimelineEvent>) => {
    if (readOnly) return;
    let finalUpdates = { ...updates };
    
    if ('project_id' in finalUpdates && finalUpdates.project_id) {
       const assignedRole = activeRoles.find(r => r.project_id === finalUpdates.project_id);
       if (assignedRole) {
           finalUpdates.role = assignedRole.role;
       } else if (timelineEvents[index].role && ['現場代理人', '現場代理人（主任技術者）', '監理技術者'].includes(timelineEvents[index].role || '')) {
           finalUpdates.role = '一般';
       }
    }

    const newEvents = [...timelineEvents];
    newEvents[index] = { ...newEvents[index], ...finalUpdates };
    setTimelineEvents(newEvents);
    
    if ('project_id' in updates && updates.project_id) {
       const selectedId = updates.project_id;
       const branches = allProjects.filter(p => p.parent_project_id === selectedId);
       if (branches.length > 0) {
           const parent = allProjects.find(p => p.id === selectedId);
           setBranchSelection({
               isOpen: true,
               eventIndex: index,
               parentProject: parent,
               children: branches
           });
       }
    }
  };

  const saveRecord = async () => {
    if (readOnly) {
       onClose();
       return;
    }
    if (!workerId || !selectedDate) return;

    const processedEvents = timelineEvents.map((ev, i) => {
        if (i > 0 && timelineEvents[i - 1].type === 'clock_in') {
            return { ...ev, time: timelineEvents[i - 1].time };
        }
        return ev;
    });

    for (const ev of processedEvents) {
       if (!ev.time) {
          toast.error('時間が未入力の項目があります。');
          return;
       }
    }

    let hasReversal = false;
    for (let i = 0; i < processedEvents.length - 1; i++) {
        if (processedEvents[i].time && processedEvents[i+1].time && processedEvents[i].time > processedEvents[i+1].time) {
             hasReversal = true; break;
        }
    }
    if (hasReversal) {
         toast.error('時間が逆転している箇所があります。赤枠の部分の時間を変更するか、並べ替えてください。');
         return;
    }
    
    let clock_in_time = null;
    let clock_out_time = null;
    let travel_time_minutes = 0;
    let prep_time_minutes = 0;
    let misc_time_minutes = 0;
    const site_declarations: any[] = [];
    
    const validEvents = processedEvents.filter(e => e.time).sort((a,b) => a.time.localeCompare(b.time));

    const toMins = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h * 60) + (m || 0);
    };

    validEvents.forEach((ev, i) => {
        if (ev.type === 'clock_in') {
            clock_in_time = new Date(`${selectedDate}T${ev.time}:00+09:00`).toISOString();
        }
        if (ev.type === 'clock_out') {
            clock_out_time = new Date(`${selectedDate}T${ev.time}:00+09:00`).toISOString();
        }
        
        if (i > 0) {
            const prev = validEvents[i-1];
            const diffMins = toMins(ev.time) - toMins(prev.time);
            
            if (prev.type === 'clock_in' || prev.type === 'prep') {
                prep_time_minutes += diffMins;
            } else if (prev.type === 'travel') {
                travel_time_minutes += diffMins;
            } else if (prev.type === 'misc') {
                misc_time_minutes += diffMins;
            } else if (prev.type === 'site_work' && prev.project_id) {
                const assignedRole = activeRoles.find(r => r.project_id === prev.project_id);
                site_declarations.push({
                    project_id: prev.project_id,
                    project_name: prev.project_name,
                    start_time: prev.time,
                    end_time: ev.time,
                    role: assignedRole ? assignedRole.role : (prev.role || '一般')
                });
            }
        }
    });

    let totalPrivateOutMins = 0;
    if (personalOuts && personalOuts.length > 0) {
      personalOuts.forEach(out => {
        if (out.start_time && out.end_time) {
          const diff = toMins(out.end_time) - toMins(out.start_time);
          if (diff > 0) totalPrivateOutMins += diff;
        }
      });
    }

    const payload = {
      worker_id: workerId,
      target_date: selectedDate,
      clock_in_time,
      clock_out_time,
      prep_time_minutes,
      travel_time_minutes,
      misc_time_minutes,
      personal_out_minutes: totalPrivateOutMins,
      personal_outs: personalOuts,
      memo: memo,
      site_declarations,
      role: site_declarations.length > 0 ? (site_declarations.some(d => d.role === '職長') ? '職長' : '一般') : '一般'
    };

    try {
      if (recordId) {
        const { error } = await supabase.from('daily_attendance').update(payload).eq('id', recordId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('daily_attendance').insert([payload]);
        if (error) throw error;
      }

      toast.success('スケジュール形式で保存しました！');
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('保存に失敗しました: ' + err.message);
    }
  };

  const effectiveTimes = timelineEvents.map((e, i) => (i > 0 && timelineEvents[i - 1].type === 'clock_in' ? timelineEvents[i - 1].time : e.time));

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-100 rounded-xl shadow-xl w-full max-w-xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b bg-white shadow-sm z-10">
          <h3 className="font-bold text-lg flex flex-col">
              <span>{selectedDate && new Date(selectedDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })} のタイムライン記録</span>
              <span className="text-xs font-normal text-muted-foreground mt-1 bg-slate-100 px-2 py-0.5 rounded inline-block w-fit">上から順番に行動時間を記録していく方式です</span>
          </h3>
          <button onClick={onClose} className="hover:bg-slate-200 p-1.5 rounded-full bg-slate-50 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto space-y-6 scroll-smooth">
          
          <div className="relative border-l-2 border-slate-300 ml-6 pl-8 space-y-2 py-4">
            {timelineEvents.map((ev, idx) => {
                const isSite = ev.type === 'site_work';
                
                let isInvalidTime = false;
                const myTime = effectiveTimes[idx];
                if (myTime) {
                    for (let i = 0; i < idx; i++) {
                        if (effectiveTimes[i] && myTime < effectiveTimes[i]) {
                            isInvalidTime = true;
                            break;
                        }
                    }
                }
                
                return (
                    <div key={ev.id} className="relative group">
                        <div className={`absolute -left-[40px] top-4 w-4 h-4 rounded-full border-[3px] border-slate-100 shadow-sm ${isInvalidTime ? 'bg-red-500 ring-2 ring-red-400 animate-pulse' : getEventIconColor(ev.type)}`}></div>
                        
                        <div className={`border rounded-xl shadow-sm p-4 flex flex-col gap-3 relative transition-all focus-within:ring-2 ${isInvalidTime ? 'ring-2 ring-red-400 bg-red-50 border-red-300' : 'ring-blue-500 ' + getEventBgColor(ev.type)} ${readOnly ? 'opacity-90' : ''}`}>
                            <div className="flex items-center gap-3 w-full flex-wrap sm:flex-nowrap">
                                <div className="flex items-center gap-2">
                                    {idx > 0 && timelineEvents[idx - 1].type === 'clock_in' ? (
                                        <div className="w-[100px] h-10 flex items-center justify-center bg-slate-100 rounded-md border border-slate-200 text-slate-500 font-bold text-sm shadow-inner tracking-tighter" title="出社と同時に始まった行動とみなされます">
                                            出社時刻から
                                        </div>
                                    ) : (
                                        <input 
                                            type="time" 
                                            value={ev.time}
                                            onChange={(e) => updateEventInfo(idx, { time: e.target.value })}
                                            disabled={readOnly}
                                            className={`w-[100px] h-10 rounded-md border-0 ring-1 text-center font-bold font-mono shadow-inner text-lg focus:ring-2 focus:outline-none disabled:bg-slate-100 disabled:text-slate-600 ${isInvalidTime ? 'ring-red-400 bg-red-100 text-red-900 focus:ring-red-500' : 'ring-slate-300 bg-white focus:ring-blue-500'}`}
                                        />
                                    )}
                                <span className="font-bold text-slate-500 text-sm whitespace-nowrap">〜</span>
                            </div>
                            
                            {ev.type !== 'clock_in' && ev.type !== 'clock_out' ? (
                                <div className="flex-1 min-w-[200px]">
                                    <select 
                                        value={ev.type}
                                        onChange={(e) => updateEventInfo(idx, { type: e.target.value as any, project_id: '', project_name: '' })}
                                        disabled={readOnly}
                                        className="w-full h-10 rounded-md border-0 ring-1 ring-slate-300 font-bold text-sm px-3 shadow-inner bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-600 appearance-none"
                                    >
                                    <option value="travel">🚕 移動</option>
                                    <option value="prep">🔧 準備</option>
                                    <option value="misc">🧹 雑務</option>
                                    <option value="site_work">👷 現場で作業</option>
                                    </select>
                                </div>
                            ) : (
                                <div className="font-bold text-base flex-1 min-w-[200px] flex items-center">
                                    {ev.type === 'clock_in' ? '🚀 出社・勤務スタート' : '🏠 退勤・勤務終了！'}
                                </div>
                            )}

                            {!readOnly && ev.type !== 'clock_in' && ev.type !== 'clock_out' && (
                                <div className="ml-auto sm:ml-0 flex items-center gap-1">
                                  {ev.type === 'site_work' && (
                                     <button onClick={() => addNakanuke(idx)} className="px-2 py-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-100/50 rounded bg-blue-50 border border-blue-100 shadow-sm text-[11px] font-bold flex items-center whitespace-nowrap transition-colors" title="この現場作業を一度中断し、中抜け後に同じ現場を再開します">
                                        + 中抜けを挟む
                                     </button>
                                  )}
                                  <button onClick={() => removeEvent(idx)} className="p-2 text-slate-300 hover:text-red-500 rounded bg-white/50 border shadow-sm"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            )}
                        </div>

                        {isSite && (
                            <div className="mt-1 pt-3 border-t border-blue-200/50 flex flex-col sm:flex-row gap-3 w-full">
                                <div className="flex-1 relative">
                                    <select 
                                        className="w-full h-10 px-3 text-sm border-0 ring-1 ring-slate-300 rounded-md bg-white shadow-inner focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700 appearance-none pr-8 disabled:bg-slate-100"
                                        value={ev.project_id || ''}
                                        onChange={(e) => {
                                            const p = allProjects.find(ap => ap.id === e.target.value);
                                            if (p) updateEventInfo(idx, { project_id: p.id, project_name: p.project_name });
                                        }}
                                        disabled={readOnly}
                                    >
                                        <option value="" disabled>{allProjects.length === 0 ? '読み込み中...' : 'どの現場でしたか？'}</option>
                                        {allProjects.map(p => {
                                            const parts = [];
                                            if (p.project_number) parts.push(`[${p.project_number}]`);
                                            parts.push(p.project_name);
                                            if (p.client_name) parts.push(`(${p.client_name})`);
                                            if (p.status_flag === '完工') parts.push('(完工)');
                                            return <option key={p.id} value={p.id}>{parts.join(' ')}</option>;
                                        })}
                                    </select>
                                    {!readOnly && (
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                    )}
                                </div>
                                <div className="w-full sm:w-32 shrink-0">
                                    {(() => {
                                        const assignedRole = activeRoles.find(r => r.project_id === ev.project_id);
                                        if (assignedRole) {
                                            return (
                                                <div className="w-full h-10 px-3 text-sm border-0 ring-1 ring-amber-300 bg-amber-50 rounded-md shadow-inner text-amber-900 flex items-center justify-between font-bold cursor-not-allowed" title="管理者によって割り当てられています">
                                                    {assignedRole.role}
                                                    <Lock className="w-3.5 h-3.5 text-amber-600"/>
                                                </div>
                                            );
                                        }
                                        return (
                                            <select 
                                                className="w-full h-10 px-3 text-sm border-0 ring-1 ring-slate-300 bg-white rounded-md shadow-inner text-slate-600 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100"
                                                value={ev.role || '一般'}
                                                onChange={(e) => updateEventInfo(idx, { role: e.target.value })}
                                                disabled={readOnly}
                                            >
                                                <option value="一般">一般</option>
                                                <option value="職長">職長</option>
                                            </select>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {!readOnly && idx < timelineEvents.length - 1 && (
                        <div className="h-6 flex items-center justify-center -ml-[3rem] my-3 relative z-10 w-full group/add">
                            <button onClick={() => addEvent(idx)} className="bg-white border-2 border-slate-200 text-blue-500 rounded-full p-1 hover:border-blue-300 hover:bg-blue-50 shadow-sm transition-all focus:outline-none focus:ring-2 ring-blue-500">
                                <Plus className="w-5 h-5"/>
                            </button>
                        </div>
                    )}
                </div>
            )})}
          </div>

          <div className="mt-8 space-y-4 pt-6 border-t px-2 pb-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                 <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-sm text-slate-700">私用外出 (タイムライン外の中抜け)</h4>
                    {!readOnly && (
                      <button type="button" onClick={() => setPersonalOuts([...personalOuts, { start_time: '', end_time: '' }])} className="text-xs bg-slate-50 text-slate-600 border px-3 py-1.5 rounded-md shadow-sm hover:bg-slate-100 flex gap-1 font-medium"><Plus className="w-3.5 h-3.5"/> 追加</button>
                    )}
                 </div>
                 <div className="space-y-3">
                    {personalOuts.map((out, idx) => (
                       <div key={idx} className="flex gap-2 items-center">
                          <input type="time" disabled={readOnly} value={out.start_time} onChange={(e) => { const a = [...personalOuts]; a[idx].start_time = e.target.value; setPersonalOuts(a); }} className="w-28 h-9 border rounded-md px-2 text-center text-sm shadow-inner disabled:bg-slate-100" />
                          <span className="text-muted-foreground font-medium">〜</span>
                          <input type="time" disabled={readOnly} value={out.end_time} onChange={(e) => { const a = [...personalOuts]; a[idx].end_time = e.target.value; setPersonalOuts(a); }} className="w-28 h-9 border rounded-md px-2 text-center text-sm shadow-inner disabled:bg-slate-100" />
                          {!readOnly && (
                            <button onClick={() => { const a = [...personalOuts]; a.splice(idx, 1); setPersonalOuts(a); }} className="text-slate-400 hover:text-red-500 p-2"><Trash2 className="w-4 h-4"/></button>
                          )}
                       </div>
                    ))}
                    {personalOuts.length === 0 && <span className="text-slate-400 text-sm italic">登録なし</span>}
                 </div>
              </div>
              
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-2">備考メモ</label>
                <textarea 
                    value={memo} 
                    onChange={(e) => setMemo(e.target.value)} 
                    disabled={readOnly}
                    className="w-full h-24 border border-slate-200 rounded-xl p-3 text-sm resize-none shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50 placeholder:text-slate-400 disabled:opacity-80 disabled:bg-slate-100" 
                    placeholder="遅刻や早退の理由、その他連絡事項があれば入力してください"
                />
              </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="border bg-white hover:bg-slate-100 h-11 px-6 rounded-lg font-bold text-sm shadow-sm transition-colors text-slate-600">{readOnly ? '閉じる' : 'キャンセル'}</button>
          {!readOnly && (
            <button onClick={saveRecord} className="bg-blue-600 text-white hover:bg-blue-700 shadow-md h-11 px-8 rounded-lg font-bold text-sm transition-colors flex items-center gap-2">保存する</button>
          )}
        </div>
      </div>
    </div>

    {branchSelection?.isOpen && !readOnly && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 bg-indigo-50/50">
                    <h3 className="font-bold text-slate-800 text-lg mb-1 leading-tight">
                        分岐（追加工事）があります
                    </h3>
                    <p className="text-xs text-slate-500">
                        {branchSelection.parentProject?.project_name} には枝番の案件が存在します。どれを作業しましたか？
                    </p>
                </div>
                <div className="p-2 overflow-y-auto flex-1 space-y-1">
                    <button
                        onClick={() => {
                            updateEventInfo(branchSelection.eventIndex, { project_id: branchSelection.parentProject.id });
                            setBranchSelection(null);
                        }}
                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200 flex flex-col gap-1"
                    >
                        <div className="flex items-center gap-2">
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">親案件</span>
                            <span className="font-bold text-slate-700 text-sm truncate">{branchSelection.parentProject?.project_name}</span>
                        </div>
                    </button>
                    
                    <div className="h-px bg-slate-100 mx-2 my-2" />
                    
                    {branchSelection.children.map(child => (
                        <button
                            key={child.id}
                            onClick={() => {
                                updateEventInfo(branchSelection.eventIndex, { project_id: child.id, project_name: child.project_name });
                                setBranchSelection(null);
                            }}
                            className="w-full text-left px-4 py-3 rounded-xl hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100 flex flex-col gap-1 group"
                        >
                            <div className="flex items-center gap-2">
                                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded">枝番</span>
                                <span className="font-bold text-slate-700 group-hover:text-indigo-900 text-sm truncate">{child.project_name}</span>
                            </div>
                            {child.project_number && (
                                <span className="text-xs text-slate-400 font-mono pl-11">[{child.project_number}]</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50">
                    <button
                        onClick={() => setBranchSelection(null)}
                        className="w-full h-11 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors text-sm"
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
}
