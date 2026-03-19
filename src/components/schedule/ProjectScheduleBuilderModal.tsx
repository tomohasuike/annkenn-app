import { useState, useEffect } from 'react';
import { X, Calendar, Users, Plus, Loader2, Clock, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';

type ProjectData = { id: string; name: string; category: string; status: string; no: string | null; site: string | null; };
type ResourceData = { id: string; name: string; type: 'worker' | 'vehicle'; categoryId?: string };
type AssignmentData = { id: string; assignment_date: string; project_id: string; worker_id: string | null; vehicle_id: string | null; count: number; start_time: string | null; end_time: string | null; };

type GroupResource = {
  id: string;
  count: number;
};

type TimeGroup = {
  id: string;
  start_time: string;
  end_time: string;
  workers: GroupResource[];
  vehicles: string[];
};

type ProjectScheduleBuilderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string; // YYYY-MM-DD
  initialProjectId: string | null;
  projectsList: ProjectData[];
  resources: ResourceData[];
  assignments: AssignmentData[];
  onSaveSuccess: () => void;
  currentUserId: string | null;
  isAdmin: boolean;
};

export default function ProjectScheduleBuilderModal({
  isOpen,
  onClose,
  dateStr,
  initialProjectId,
  projectsList,
  resources,
  assignments,
  onSaveSuccess,
  currentUserId,
}: ProjectScheduleBuilderModalProps) {
  const [projectId, setProjectId] = useState<string>(initialProjectId || '');
  const [timeGroups, setTimeGroups] = useState<TimeGroup[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize data when modal opens or inputs change
  useEffect(() => {
    if (isOpen) {
      if (initialProjectId) setProjectId(initialProjectId);
      
      // If a project is selected, load existing assignments into Time Groups
      if (projectId) {
        loadExistingAssignments(projectId, dateStr);
      } else {
        // Default empty group
        setTimeGroups([{ id: 'g-default', start_time: '08:00', end_time: '17:00', workers: [], vehicles: [] }]);
      }
    }
  }, [isOpen, initialProjectId, dateStr]);

  // Re-load if user changes the project inside the modal
  useEffect(() => {
    if (isOpen && projectId) {
      loadExistingAssignments(projectId, dateStr);
    }
  }, [projectId]);

  const loadExistingAssignments = (targetProject: string, targetDate: string) => {
    const existing = assignments.filter(a => a.project_id === targetProject && a.assignment_date === targetDate);
    
    if (existing.length === 0) {
      setTimeGroups([{ id: `g-${Date.now()}`, start_time: '08:00', end_time: '17:00', workers: [], vehicles: [] }]);
      return;
    }

    // Group by start_time and end_time
    const groupMap = new Map<string, TimeGroup>();
    
    existing.forEach(a => {
      const st = a.start_time ? a.start_time.substring(0, 5) : '08:00';
      const et = a.end_time ? a.end_time.substring(0, 5) : '17:00';
      const key = `${st}-${et}`;
      
      if (!groupMap.has(key)) {
        groupMap.set(key, { id: `g-${key}`, start_time: st, end_time: et, workers: [], vehicles: [] });
      }
      
      const group = groupMap.get(key)!;
      if (a.worker_id) {
        group.workers.push({ id: a.worker_id, count: a.count || 1 });
      } else if (a.vehicle_id) {
        group.vehicles.push(a.vehicle_id);
      }
    });

    setTimeGroups(Array.from(groupMap.values()));
  };

  const internalWorkersList = resources.filter(r => r.categoryId === 'president' || r.categoryId === 'employee');
  const partnersList = resources.filter(r => r.categoryId === 'partner');
  const vehicleList = resources.filter(r => r.categoryId === 'vehicle' || r.categoryId === 'machine');

  const getResourceName = (id: string) => resources.find(r => r.id === id)?.name || '不明';
  const isPartner = (id: string) => resources.find(r => r.id === id)?.categoryId === 'partner';

  // State handlers
  const handleAddGroup = () => {
    setTimeGroups([
      ...timeGroups, 
      { id: `g-${Date.now()}`, start_time: '', end_time: '', workers: [], vehicles: [] }
    ]);
  };

  const handleRemoveGroup = (groupId: string) => {
    setTimeGroups(timeGroups.filter(g => g.id !== groupId));
  };

  const handleUpdateGroupTime = (groupId: string, field: 'start_time' | 'end_time', value: string) => {
    setTimeGroups(timeGroups.map(g => g.id === groupId ? { ...g, [field]: value } : g));
  };

  const handleAddWorkerButton = (groupId: string, workerId: string) => {
    setTimeGroups(timeGroups.map(g => {
      if (g.id !== groupId) return g;
      if (g.workers.some(w => w.id === workerId)) return g;
      return { ...g, workers: [...g.workers, { id: workerId, count: 1 }] };
    }));
  };

  const handleUpdateWorkerCount = (groupId: string, workerId: string, count: number) => {
    setTimeGroups(timeGroups.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        workers: g.workers.map(w => w.id === workerId ? { ...w, count: Math.max(1, count) } : w)
      };
    }));
  };

  const handleRemoveWorker = (groupId: string, workerId: string) => {
    setTimeGroups(timeGroups.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, workers: g.workers.filter(w => w.id !== workerId) };
    }));
  };

  const handleAddVehicleButton = (groupId: string, vehicleId: string) => {
    setTimeGroups(timeGroups.map(g => {
      if (g.id !== groupId) return g;
      if (g.vehicles.includes(vehicleId)) return g;
      return { ...g, vehicles: [...g.vehicles, vehicleId] };
    }));
  };

  const handleRemoveVehicle = (groupId: string, vehicleId: string) => {
    setTimeGroups(timeGroups.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, vehicles: g.vehicles.filter(v => v !== vehicleId) };
    }));
  };

  const handleSave = async () => {
    if (!projectId) return alert("案件を選択してください");
    
    setIsSaving(true);
    try {
      // 1. Delete existing for Date and Project
      const { error: delError } = await supabase
        .from('assignments')
        .delete()
        .eq('assignment_date', dateStr)
        .eq('project_id', projectId);
        
      if (delError) throw delError;

      // 2. Build insertion payload
      const payload: any[] = [];
      timeGroups.forEach(g => {
        const st = g.start_time || null;
        const et = g.end_time || null;
        
        g.workers.forEach(w => {
          payload.push({
            assignment_date: dateStr,
            project_id: projectId,
            worker_id: w.id,
            count: w.count,
            start_time: st,
            end_time: et,
            assigned_by: currentUserId
          });
        });

        g.vehicles.forEach(v => {
          payload.push({
            assignment_date: dateStr,
            project_id: projectId,
            vehicle_id: v,
            count: 1,
            start_time: st,
            end_time: et,
            assigned_by: currentUserId
          });
        });
      });

      if (payload.length > 0) {
        const { error: insError } = await supabase.from('assignments').insert(payload);
        if (insError) throw insError;
      }
      
      onSaveSuccess();
      onClose();
    } catch (e: any) {
      console.error(e);
      alert("保存に失敗しました: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const validProjects = projectsList.filter(p => !p.name.includes("休暇") && p.id !== 'vacation');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div 
        className="bg-background rounded-xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh] border my-auto sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b bg-card shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" /> 現場のスケジュール設定
            </h2>
            <p className="text-sm text-muted-foreground mt-1">選択した日付と案件に対する人員や業者の詳細な時間枠を設定します。</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">対象日</label>
              <div className="font-bold text-lg">{format(new Date(dateStr), 'yyyy年MM月dd日')}</div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">対象の現場・案件</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">案件を選択してください</option>
                {validProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.no ? `${p.no} - ` : ''}{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {!projectId && (
            <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
              上のメニューから案件を選択してください
            </div>
          )}

          {projectId && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
                <Clock className="w-5 h-5 text-blue-500" /> 時間枠ごとの人員配置
              </h3>

              <div className="space-y-4">
                {timeGroups.map((group, index) => (
                  <div key={group.id} className="bg-card border rounded-lg overflow-hidden shadow-sm relative">
                    <div className="bg-muted px-4 py-3 border-b flex flex-wrap gap-3 items-center justify-between">
                       <div className="flex items-center gap-3">
                         <div className="font-bold text-sm bg-background px-2 py-0.5 rounded border shadow-sm">
                           枠 {index + 1}
                         </div>
                         <div className="flex items-center gap-2">
                           <input type="time" value={group.start_time} onChange={(e) => handleUpdateGroupTime(group.id, 'start_time', e.target.value)} className="text-sm px-2 py-1 rounded border bg-background w-[110px]" />
                           <span className="text-muted-foreground">〜</span>
                           <input type="time" value={group.end_time} onChange={(e) => handleUpdateGroupTime(group.id, 'end_time', e.target.value)} className="text-sm px-2 py-1 rounded border bg-background w-[110px]" />
                         </div>
                       </div>
                       
                       {timeGroups.length > 1 && (
                         <button onClick={() => handleRemoveGroup(group.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors" title="時間枠を削除">
                           <Trash2 className="w-4 h-4" />
                         </button>
                       )}
                    </div>
                    
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                       {/* Personnel & Partners */}
                       <div className="space-y-3">
                         <div className="font-bold text-sm flex items-center gap-1.5 text-blue-700 border-b pb-1">
                           <Users className="w-4 h-4" /> 人員・協力会社
                         </div>
                         
                         <div className="space-y-1.5">
                           {group.workers.map(w => {
                             const partner = isPartner(w.id);
                             return (
                               <div key={w.id} className="flex items-center gap-2 text-sm bg-muted/30 p-1.5 rounded-md border group">
                                 <div className="flex-1 font-medium truncate flex items-center gap-1">
                                   {partner && <span className="text-[10px] bg-orange-100 text-orange-800 px-1 py-0.5 rounded">協力</span>}
                                   {!partner && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">自社</span>}
                                   {getResourceName(w.id)}
                                 </div>
                                 {partner && (
                                   <div className="flex items-center gap-1 bg-background px-1.5 py-0.5 rounded border shrink-0">
                                     <input type="number" min="1" max="99" value={w.count} onChange={(e) => handleUpdateWorkerCount(group.id, w.id, parseInt(e.target.value) || 1)} className="w-10 text-right text-xs outline-none bg-transparent" />
                                     <span className="text-xs text-muted-foreground">名</span>
                                   </div>
                                 )}
                                 <button onClick={() => handleRemoveWorker(group.id, w.id)} className="text-muted-foreground hover:text-red-500 opacity-50 group-hover:opacity-100 transition-opacity p-0.5 text-xs"><X className="w-4 h-4" /></button>
                               </div>
                             );
                           })}
                         </div>
                         
                         {/* ピル型の追加ボタン一覧 */}
                         <div className="flex flex-wrap gap-1.5 mt-2 p-2 bg-muted/20 border-t border-dashed rounded-b-md">
                           <span className="text-[10px] text-muted-foreground w-full mb-0.5">＋ 追加する人・業者をタップ</span>
                           {internalWorkersList.filter(r => !group.workers.some(w => w.id === r.id)).map(r => (
                             <button
                                key={r.id}
                                onClick={() => handleAddWorkerButton(group.id, r.id)}
                                className="px-2 py-1 text-[11px] font-medium border border-blue-200 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-sm"
                             >
                                + {r.name}
                             </button>
                           ))}
                           {partnersList.filter(r => !group.workers.some(w => w.id === r.id)).map(r => (
                             <button
                                key={r.id}
                                onClick={() => handleAddWorkerButton(group.id, r.id)}
                                className="px-2 py-1 text-[11px] font-medium border border-orange-200 bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100 hover:border-orange-300 transition-colors shadow-sm"
                             >
                                + {r.name}
                             </button>
                           ))}
                           {internalWorkersList.filter(r => !group.workers.some(w => w.id === r.id)).length === 0 && partnersList.filter(r => !group.workers.some(w => w.id === r.id)).length === 0 && (
                              <span className="text-[10px] text-muted-foreground italic px-1 py-1">追加できる人がいません</span>
                           )}
                         </div>
                       </div>

                       {/* Vehicles */}
                       <div className="space-y-3">
                         <div className="font-bold text-sm flex items-center gap-1.5 text-emerald-700 border-b pb-1">
                           車両・建設機械
                         </div>
                         
                         <div className="space-y-1.5">
                           {group.vehicles.map(v => (
                               <div key={v} className="flex items-center gap-2 text-sm bg-muted/30 p-1.5 rounded-md border group">
                                 <div className="flex-1 font-medium truncate">{getResourceName(v)}</div>
                                 <button onClick={() => handleRemoveVehicle(group.id, v)} className="text-muted-foreground hover:text-red-500 opacity-50 group-hover:opacity-100 transition-opacity p-0.5"><X className="w-4 h-4" /></button>
                               </div>
                           ))}
                         </div>
                         
                         {/* ピル型の車両追加ボタン一覧 */}
                         <div className="flex flex-wrap gap-1.5 mt-2 p-2 bg-muted/20 border-t border-dashed rounded-b-md">
                           <span className="text-[10px] text-muted-foreground w-full mb-0.5">＋ 追加する車両・建機をタップ</span>
                           {vehicleList.filter(r => !group.vehicles.includes(r.id)).map(r => (
                             <button
                                key={r.id}
                                onClick={() => handleAddVehicleButton(group.id, r.id)}
                                className="px-2 py-1 text-[11px] font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100 hover:border-emerald-300 transition-colors shadow-sm"
                             >
                                + {r.name}
                             </button>
                           ))}
                           {vehicleList.filter(r => !group.vehicles.includes(r.id)).length === 0 && (
                              <span className="text-[10px] text-muted-foreground italic px-1 py-1">追加できる車両がありません</span>
                           )}
                         </div>
                       </div>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleAddGroup}
                className="w-full py-3 border-2 border-dashed border-primary/30 rounded-lg text-primary hover:bg-primary/5 hover:border-primary flex items-center justify-center gap-2 transition-colors font-medium text-sm"
              >
                <Plus className="w-4 h-4" /> 新しい時間枠を追加する
              </button>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 border-t bg-card shrink-0 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted transition-colors"
            disabled={isSaving}
          >
            キャンセル
          </button>
          <button 
            type="button" 
            className="px-6 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            onClick={handleSave}
            disabled={isSaving || !projectId}
          >
            {isSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 保存中...</>
            ) : (
              'この配置で保存する'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
