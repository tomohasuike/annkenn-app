import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ShieldCheck, Search, Lock, Unlock, FileSpreadsheet, Plus, Trash2, Save } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AttendanceImportModal } from '../../components/attendance/AttendanceImportModal';
import TotImportModal from '../../components/attendance/TotImportModal';
import TimelineModal from '../../components/attendance/TimelineModal';
import RoleAssignmentAdmin from '../../components/attendance/RoleAssignmentAdmin';



interface Worker {
  id: string;
  name: string;
  employee_code_tot?: string;
}

interface DailyAttendance {
  id: string;
  worker_id: string;
  target_date: string;
  role: '職長' | '現場代理人' | '一般' | null;
  prep_time_minutes: number;
  travel_time_minutes: number;
  misc_time_minutes?: number;
  personal_out_minutes: number;
  personal_outs?: { start_time: string; end_time: string }[];
  memo: string | null;
  admin_memo?: string | null;
  is_locked: boolean;
  tot_clock_in_time?: string | null;
  tot_clock_out_time?: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  site_declarations?: { project_id: string; project_name: string; start_time: string; end_time: string; role?: string }[];
}

interface DraftSite {
  siteIndex: number;
  recordId?: string;
  projectId?: string;
  projectName: string;
  reportId?: string;
  declStart: string | null;
  declEnd: string | null;
  declRole: string;
  type: string;
}

interface DraftRecord {
  recordId?: string;
  workerId: string;
  clockIn: string | null;
  clockOut: string | null;
  sites: DraftSite[];
  isModified?: boolean;
}


export default function AttendanceAdmin() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeRoles, setActiveRoles] = useState<any[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [records, setRecords] = useState<DailyAttendance[]>([]);
  const [projects, setProjects] = useState<Record<string, string[]>>({}); // date -> project names
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTotModal, setShowTotModal] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // Drafts array holds edits before explicitly saving. key = dateStr
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  const hasUnsavedChanges = Object.keys(drafts).length > 0;

  const [activeTab, setActiveTab] = useState<'attendance' | 'roles'>('attendance');
  
  const [editingExtra, setEditingExtra] = useState<{
    dateStr: string;
    recordId?: string;
    workerId: string;
    personal_outs?: { start_time: string; end_time: string }[];
    memo: string | null;
    admin_memo: string | null;
  } | null>(null);

  const [timelineModal, setTimelineModal] = useState<{
    isOpen: boolean;
    dateStr: string;
    workerId: string;
    existingRecord: any;
    assignedProjectsForDate: any[];
  }>({
    isOpen: false,
    dateStr: '',
    workerId: '',
    existingRecord: null,
    assignedProjectsForDate: []
  });

  const openTimelineModal = (dateStr: string, workerId: string) => {
      const existingRecord = records.find(r => r.worker_id === workerId && r.target_date === dateStr);
      setTimelineModal({
          isOpen: true,
          dateStr,
          workerId,
          existingRecord: existingRecord || null,
          assignedProjectsForDate: []
      });
  };

  const [savingTime, setSavingTime] = useState(false);

  
  const normalizeTime = (input: string | null) => {
    if (!input) return null;
    let clean = input.replace(/[^0-9:]/g, "");
    if (!clean) return null;
    if (!clean.includes(":")) {
       if (clean.length === 3) clean = "0" + clean[0] + ":" + clean.substring(1);
       else if (clean.length === 4) clean = clean.substring(0,2) + ":" + clean.substring(2);
       else if (clean.length <= 2) clean = clean.padStart(2, "0") + ":00";
    }
    const parts = clean.split(":");
    let h = parseInt(parts[0] || "0", 10);
    let m = parseInt(parts[1] || "0", 10);
    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;
    return (h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0"));
  };




  const handleBulkSave = async () => {
    if (!selectedWorkerId) return;
    const modifiedDates = Object.keys(drafts);
    if (modifiedDates.length === 0) return;
    
    setSavingTime(true);
    try {
      for (const dateStr of modifiedDates) {
         const draft = drafts[dateStr];
         const payload = {
            worker_id: selectedWorkerId,
            target_date: dateStr,
            clock_in_time: draft.clockIn ? new Date(`${dateStr}T${draft.clockIn}:00+09:00`).toISOString() : null,
            clock_out_time: draft.clockOut ? new Date(`${dateStr}T${draft.clockOut}:00+09:00`).toISOString() : null,
         };

         let recId = draft.recordId;
         if (recId) {
             const { error } = await supabase.from('daily_attendance').update(payload).eq('id', recId);
             if (error) throw error;
         } else {
             const { data: newRow, error } = await supabase.from('daily_attendance').insert([{ ...payload, is_locked: false }]).select().single();
             if (error) throw error;
             recId = newRow.id;
         }

         const toMins = (hhmm: string) => {
             const [h, m] = hhmm.split(':').map(Number);
             return (h * 60) + (m || 0);
         };

         const validDecls = draft.sites.filter(s => s.type !== 'inherited' && s.type !== 'imported' && s.type !== 'unassigned').map(s => ({
             project_id: s.projectId || '',
             project_name: s.projectName || '',
             start_time: s.declStart ? (normalizeTime(s.declStart) || '') : '',
             end_time: s.declEnd ? (normalizeTime(s.declEnd) || '') : '',
             role: s.declRole || '一般',
             reportId: s.reportId
         }));

         const filledDecls = validDecls.filter(d => d.start_time && d.end_time);
         for (let i = 0; i < filledDecls.length; i++) {
             for (let j = i + 1; j < filledDecls.length; j++) {
                 const a = filledDecls[i];
                 const b = filledDecls[j];
                 if (toMins(a.start_time) < toMins(b.end_time) && toMins(a.end_time) > toMins(b.start_time)) {
                     throw new Error(`日付 ${dateStr} の申告時間（${a.project_name}と${b.project_name}）が一部重なっています。`);
                 }
             }
         }

         const { error: declsError } = await supabase
             .from('daily_attendance')
             .update({ site_declarations: validDecls.length > 0 ? validDecls.map(({reportId, ...rest}) => rest) : [] })
             .eq('id', recId);
         if (declsError) throw declsError;

         for (const d of validDecls) {
             if (d.reportId) {
                 let rsStr = d.start_time;
                 let reStr = d.end_time;
                 if (rsStr) rsStr = `1899-12-31T${rsStr.length === 5 ? rsStr + ":00" : rsStr}`;
                 if (reStr) reStr = `1899-12-31T${reStr.length === 5 ? reStr + ":00" : reStr}`;
                 
                 await supabase.from("report_personnel")
                    .update({ start_time: rsStr || null, end_time: reStr || null })
                    .eq("report_id", d.reportId)
                    .eq("worker_id", selectedWorkerId);
             }
         }
      }
      
      toast.success("すべての変更を保存しました");
      setDrafts({});
      fetchWorkerData(selectedWorkerId);
    } catch (err: any) {
      toast.error("保存エラー: " + err.message);
    } finally {
      setSavingTime(false);
    }
  };

  const updateDraft = (dateStr: string, updater: (prev: DraftRecord) => DraftRecord) => {
    setDrafts(prev => {
        const existing = prev[dateStr] || { 
            recordId: undefined, 
            isModified: true, 
             // We'll initialize these correctly lazily or exactly when updated
            sites: [] 
        };
        return {
            ...prev,
            [dateStr]: updater(existing)
        };
    });
  };

  const handleSaveExtra = async () => {
    if (!editingExtra || !selectedWorkerId || !editingExtra.recordId) {
        toast.error("勤怠データが存在しないため、付加情報を保存できません。まず出退勤等を入力して保存してください。");
        return;
    }
    setSavingTime(true);
    try {
        const payload = {
           personal_outs: editingExtra.personal_outs || [],
           personal_out_minutes: (() => {
               let sum = 0;
               (editingExtra.personal_outs || []).forEach(out => {
                  if (out.start_time && out.end_time) {
                     const [sh, sm] = out.start_time.split(':').map(Number);
                     const [eh, em] = out.end_time.split(':').map(Number);
                     const diff = (eh * 60 + em) - (sh * 60 + sm);
                     if (diff > 0) sum += diff;
                  }
               });
               return sum;
            })(),
           memo: editingExtra.memo,
           admin_memo: editingExtra.admin_memo
        };
        const { error } = await supabase.from('daily_attendance').update(payload).eq('id', editingExtra.recordId);
        if (error) throw error;
        toast.success("メモと私用外出を保存しました");
        setEditingExtra(null);
        fetchWorkerData(selectedWorkerId);
    } catch (e: any) {
        toast.error("保存失敗: " + e.message);
    } finally {
        setSavingTime(false);
    }
  };


  // Set the "Target Month" based on currentDate
  const targetYear = currentDate.getFullYear();
  const targetMonth = currentDate.getMonth() + 1; // "3月度" (cutoff is 3/25)

  // Cut-off calculation: Previous Month 26th ~ Current Month 25th
  const startDate = new Date(targetYear, targetMonth - 2, 26);
  const endDate = new Date(targetYear, targetMonth - 1, 25);
  
  const startDateStr = `${startDate.getFullYear()}-${(startDate.getMonth()+1).toString().padStart(2,'0')}-26`;
  const endDateStr = `${endDate.getFullYear()}-${(endDate.getMonth()+1).toString().padStart(2,'0')}-25`;

  // Generate date array
  const displayDates: Date[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    displayDates.push(new Date(d));
  }

  useEffect(() => {
    fetchWorkers();
  }, []);

  useEffect(() => {
    if (selectedWorkerId) {
       fetchWorkerData(selectedWorkerId);
    } else {
       setRecords([]);
       setProjects({});
    }
  }, [selectedWorkerId, targetYear, targetMonth]);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const { data: workerData } = await supabase
        .from('worker_master')
        .select('id, name, employee_code_tot, display_order')
        .neq('type', '協力会社')
        .neq('type', '事務員')
        .order('display_order', { ascending: true });
      
      if (workerData) {
        const filtered = workerData.filter(w => !w.name.includes('蓮池'));
        setWorkers(filtered);
        if (filtered.length > 0 && !selectedWorkerId) {
          setSelectedWorkerId(filtered[0].id);
        }
      }
    } catch (error) {
       console.error(error);
    } finally {
       setLoading(false);
    }
  };

  const fetchWorkerData = async (workerId: string) => {
    setLoading(true);
    try {
      // 1. Fetch Attendance
      const { data: recordData } = await supabase
        .from('daily_attendance')
        .select('*')
        .eq('worker_id', workerId)
        .gte('target_date', startDateStr)
        .lte('target_date', endDateStr);

      if (recordData) setRecords(recordData);

      // Fetch active roles for this worker
      const { data: roleData } = await supabase
        .from('project_role_assignments')
        .select(`project_id, role, start_date, end_date, project:projects(project_name)`)
        .eq('worker_id', workerId)
        .lte('start_date', endDateStr)
        .gte('end_date', startDateStr);
      
      if (roleData) {
         setActiveRoles(roleData);
      } else {
         setActiveRoles([]);
      }

      // 2. Fetch Projects mapping for this worker
      const { data: reportData } = await supabase
        .from('report_personnel')
        .select(`
          worker_id,
          start_time,
          end_time,
          daily_reports!inner(
            id,
            project_id,
            report_date,
            start_time,
            end_time,
            projects(project_number, project_name, client_name, client_company_name, site_name, category)
          )
        `)
        .eq('worker_id', workerId)
        .gte('daily_reports.report_date', startDateStr)
        .lte('daily_reports.report_date', endDateStr);

      const projMap: Record<string, {name: string, sStr: string | null, eStr: string | null, reportId?: string, projectId?: string, cn?: string, pName?: string, ord?: string, siteName?: string, category?: string}[]> = {};
      if (reportData) {
        reportData.forEach((r: any) => {
           const rawDateStr = Array.isArray(r.daily_reports) ? r.daily_reports[0]?.report_date : r.daily_reports?.report_date;
           const d = rawDateStr ? format(new Date(rawDateStr), 'yyyy-MM-dd') : null;
           
           // Navigate relationship: daily_reports -> projects
           const _r = Array.isArray(r.daily_reports) ? r.daily_reports[0] : r.daily_reports;
           const p_obj = _r?.projects;
           const p_obj_first = Array.isArray(p_obj) ? p_obj[0] : p_obj;
           
           const cn = p_obj_first?.project_number;
           const pName = p_obj_first?.project_name;
           const ord = p_obj_first?.client_name;
           const siteName = p_obj_first?.site_name;
           const category = p_obj_first?.category;
           
           const p = pName || '不明な案件'; // Just use the project name as the core identifier for deduplication
           
           const workerStart = r.start_time || _r?.start_time;
           const workerEnd = r.end_time || _r?.end_time;
           
           const formatTimeSafe = (timeString: string) => {
              if (!timeString) return null;
              try {
                 const match = timeString.toString().match(/([0-9]{1,2}):([0-9]{2})/);
                 if (match) {
                    const hour = match[1].padStart(2, '0');
                    const min = match[2];
                    return `${hour}:${min}`;
                 }
                 return null;
              } catch(e) {
                return null;
              }
           };

           const sStr = workerStart ? formatTimeSafe(workerStart) : null;
           const eStr = workerEnd ? formatTimeSafe(workerEnd) : null;
           const reportId = _r?.id;
           const projectId = _r?.project_id;
           
           if (d && p) {
             if (!projMap[d]) projMap[d] = [];
             // Check for duplicate by name
             if (!projMap[d].find(x => x.name === p)) {
                projMap[d].push({ name: p, sStr, eStr, reportId, projectId, cn, pName, ord, siteName, category });
             }
           }
        });
        
        // Sort projects chronologically by Foreman Start Time (sStr)
        Object.keys(projMap).forEach(key => {
           projMap[key].sort((a: any, b: any) => {
              if (!a.sStr && !b.sStr) return 0;
              if (!a.sStr) return 1;
              if (!b.sStr) return -1;
              return a.sStr.localeCompare(b.sStr);
           });
        });
      }
      setProjects(projMap as any);
    } catch (error) {
      console.error(error);
      toast.error('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => setCurrentDate(new Date(targetYear, targetMonth - 2, 1));
  const handleNextMonth = () => setCurrentDate(new Date(targetYear, targetMonth, 1));

  // Build matrix for this worker: [dateStr] = record
  const recordMatrix: Record<string, DailyAttendance> = {};
  records.forEach(r => {
    recordMatrix[r.target_date] = r;
  });

  const filteredWorkers = workers.filter(w => w.name.includes(search));

  const toggleLockMonth = async (lock: boolean) => {
    if (!selectedWorkerId) return;
    if (!confirm(`${targetYear}年${targetMonth}月度 (${startDateStr.slice(5)}〜${endDateStr.slice(5)}) の全データを${lock ? 'ロック' : 'ロック解除'}します。よろしいですか？`)) return;
    try {
      const idsToUpdate = records.map(r => r.id);
      if (idsToUpdate.length === 0) return;

      const { error } = await supabase
        .from('daily_attendance')
        .update({ is_locked: lock })
        .in('id', idsToUpdate);

      if (error) throw error;
      toast.success('更新しました');
      if (selectedWorkerId) fetchWorkerData(selectedWorkerId);
    } catch (e: any) {
      toast.error('更新に失敗しました: ' + e.message);
    }
  };


  return (
    <div className="flex-1 flex flex-col min-h-0 w-full mx-auto space-y-3">
      <div className="shrink-0 space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              全社員 勤怠・手当管理（事務局用）
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm pt-1">
              社員の申告状況を通月で確認し、月次締めやTOTチェックを行います
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
             <button
                onClick={() => setActiveTab('attendance')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-colors shadow-sm ${activeTab === 'attendance' ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}
             >
                📅 勤怠明細
             </button>
             <button
                onClick={() => setActiveTab('roles')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-colors shadow-sm ${activeTab === 'roles' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}
             >
                💼 現場代理人・指定
             </button>
          </div>

          <div className="flex gap-2 shrink-0 ml-auto">
             <button
                onClick={async () => {
                   if (window.confirm('1月24日以前の勤怠データを完全に一括消去します。よろしいですか？\n※操作を元に戻すことはできません。')) {
                      try {
                        const { error } = await supabase.from('daily_attendance').delete().lt('target_date', '2026-01-25');
                        if (error) throw error;
                        alert('1月24日以前の勤怠データの全消去が完了しました。');
                        if (selectedWorkerId) fetchWorkerData(selectedWorkerId);
                      } catch(err: any) {
                        alert('消去エラー: ' + err.message);
                      }
                   }
                }}
                className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 h-8 px-3 gap-1 shadow-sm text-xs"
             >
                🗑️ 1/24以前を一括消去
             </button>
            <button
               onClick={() => setShowTotModal(true)}
               className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 h-8 px-3 gap-1 shadow-sm text-xs"
            >
               TOT実績取込
            </button>
            <button
               onClick={() => setShowImportModal(true)}
               className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 h-8 px-3 gap-1 shadow-sm text-xs"
            >
               スプレッドシート一括貼付
            </button>
            <button className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 gap-1 shadow-sm text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" /> 締日CSV出力
            </button>
          </div>
        </div>

        {activeTab === 'attendance' && (
        <div className="flex bg-slate-50 border p-1.5 rounded-md justify-between items-center shadow-sm">
            <button onClick={handlePrevMonth} className="px-3 py-1 border bg-white rounded hover:bg-slate-50 text-xs font-medium shadow-sm active:scale-95">&lt; 前月26日</button>
            <h3 className="text-base sm:text-lg font-bold whitespace-nowrap px-4 tracking-tight">{targetYear}年 {targetMonth}月度 <span className="text-muted-foreground text-xs sm:text-sm font-normal ml-2 hidden sm:inline-block">({startDateStr.replace(/-/g, '/')} 〜 {endDateStr.replace(/-/g, '/')})</span></h3>
            <button onClick={handleNextMonth} className="px-3 py-1 border bg-white rounded hover:bg-slate-50 text-xs font-medium shadow-sm active:scale-95">次月25日 &gt;</button>
        </div>
        )}
      </div>

      {activeTab === 'roles' ? (
         <RoleAssignmentAdmin 
            workers={workers} 
         />
      ) : (
      <div className="flex flex-1 min-h-0 gap-3">
        {/* Left Sidebar: Worker List */}
        <div className="w-36 sm:w-48 shrink-0 flex flex-col bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-2 border-b bg-slate-50">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="作業員検索..."
                className="h-7 w-full rounded-md border border-input pl-7 pr-2 text-xs focus-visible:outline-none focus:ring-1 focus:ring-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredWorkers.map(w => (
               <button
                 key={w.id}
                 onClick={() => setSelectedWorkerId(w.id)}
                 className={`w-full text-left px-3 py-2 border-b transition-colors flex items-center ${selectedWorkerId === w.id ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-slate-50'}`}
               >
                 <span className={`text-[13px] ${selectedWorkerId === w.id ? 'text-primary font-bold' : 'text-slate-700 font-medium'}`}>{w.name}</span>
               </button>
            ))}
            {filteredWorkers.length === 0 && <div className="p-4 text-center text-slate-500 text-xs">該当なし</div>}
          </div>
        </div>

        {/* Right Content: Spreadsheet View */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden relative">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                {workers.find(w => w.id === selectedWorkerId)?.name || '未選択'}
                <span className="text-sm font-normal text-muted-foreground ml-2">さんの勤怠表</span>
              </h3>
              {activeRoles.length > 0 && (
                 <div className="flex gap-2 flex-wrap items-center">
                    {activeRoles.map(r => (
                       <span key={`${r.project_id}-${r.role}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-sm" title={`${r.start_date.replace(/-/g,'/')}〜${r.end_date.replace(/-/g,'/')}`}>
                          💼 {r.role} ({r.project?.project_name})
                       </span>
                    ))}
                 </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
               {records.length > 0 && selectedWorkerId && (
                 <button onClick={() => toggleLockMonth(!records[0]?.is_locked)} className="inline-flex items-center justify-center rounded-md font-medium transition-colors border hover:bg-slate-100 bg-white h-9 px-4 gap-2 shadow-sm text-xs">
                   {records.some(r => r.is_locked) ? (
                      <><Unlock className="w-4 h-4 text-emerald-600"/> ロック解除済み</>
                   ) : (
                      <><Lock className="w-4 h-4 text-red-600"/> この明細をロック</>
                   )}
                 </button>
               )}
            </div>
          </div>

          {loading ? (
             <div className="flex items-center justify-center p-12 flex-1">
               <span className="text-muted-foreground animate-pulse font-medium">読み込み中...</span>
             </div>
          ) : selectedWorkerId ? (
            <div className="flex-1 flex flex-col min-h-0 relative">
               {/* 変更がある場合のみ表示される固定バナー */}
               {hasUnsavedChanges && (
                  <div className="bg-amber-50 border-b border-amber-200 p-3 flex justify-between items-center z-10 sticky top-0 shadow-[0_2px_4px_rgba(251,191,36,0.1)]">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                           <Save className="w-4 h-4" />
                        </div>
                        <div>
                           <p className="text-sm font-bold text-amber-800">保存されていない変更があります</p>
                           <p className="text-xs text-amber-600">編集内容を保存するか、キャンセルしてください</p>
                        </div>
                     </div>
                     <div className="flex gap-2">
                        <button 
                           onClick={() => setDrafts({})} 
                           className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-sm"
                           disabled={savingTime}
                        >
                           キャンセル
                        </button>
                        <button 
                           onClick={handleBulkSave} 
                           className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded hover:bg-amber-600 transition-colors shadow-sm flex items-center gap-2"
                           disabled={savingTime}
                        >
                           {savingTime ? <span className="animate-spin text-sm">↻</span> : <Save className="w-4 h-4"/>}
                           一括保存する
                        </button>
                     </div>
                  </div>
               )}
            
            <div className="flex-1 overflow-auto">
               <table className="w-full text-sm text-center border-collapse whitespace-nowrap min-w-max">
                 <thead className="sticky top-0 z-20 bg-slate-100 shadow-sm border-b">
                   <tr>
                     <th className="p-3 border-r w-16 font-bold text-slate-700">月/日</th>
                     <th className="p-3 border-r w-12 font-bold text-slate-700">曜日</th>
                     <th className="p-3 border-r w-24 font-bold text-slate-700">出勤時間</th>
                     <th className="p-3 border-r w-24 font-bold text-slate-700">退社時間</th>
                     <th className="p-3 border-r w-16 bg-blue-50/50 font-bold text-slate-700">現場入</th>
                     <th className="p-3 border-r w-16 bg-blue-50/50 font-bold text-slate-700">現場出</th>
                     <th className="p-3 border-r min-w-[120px] font-bold text-slate-700 text-left">作業現場名 (日報連携)</th>
                     <th className="p-3 border-r w-16 font-bold text-slate-700 text-center">役割</th>
                     <th className="p-3 border-r w-16 font-bold text-slate-700">移動</th>
                     <th className="p-3 border-r w-16 font-bold text-slate-700">準備</th>
                     <th className="p-3 border-r w-16 font-bold text-slate-700">雑務</th>
                     <th className="p-3 border-r w-16 font-bold text-slate-700">私用外出</th>
                     <th className="p-3 border-r min-w-[150px] font-bold text-slate-700 text-left">備考</th>
                     <th className="p-3 font-bold text-slate-700 w-24 text-center">申告詳細</th>
                   </tr>
                 </thead>
                 <tbody>
                    {displayDates.map((d) => {
                       const dateStr = format(d, 'yyyy-MM-dd');
                       const dow = d.getDay();
                       const isWeekend = dow === 0 || dow === 6;
                       const dowStr = ['日', '月', '火', '水', '木', '金', '土'][dow];
                       
                       const record = recordMatrix[dateStr];
                       const projs = projects[dateStr] || [];
                       const siteDecls = record?.site_declarations || [];

                       const getDeclaredTime = (projectId: string | undefined, field: 'start_time' | 'end_time') => {
                          if (!projectId) return null;
                          const specific = siteDecls.find(s => s.project_id === projectId);
                          const imported = siteDecls.find(s => s.project_id === 'imported' || s.project_id === 'unassigned');
                          return specific && specific[field] ? specific[field] : (imported && imported[field] ? imported[field] : null);
                       };

                       const getDeclaredRole = (projectId: string | undefined) => {
                          if (!projectId) return record?.role || '一般';
                          const specific = siteDecls.find(s => s.project_id === projectId);
                          const imported = siteDecls.find(s => s.project_id === 'imported' || s.project_id === 'unassigned');
                          return specific && specific.role ? specific.role : (imported && imported.role ? imported.role : (record?.role || '一般'));
                       };



                       const formatInputTime = (tString?: string | null) => {
                          if (!tString) return '';
                          if (/^\d{1,2}:\d{2}/.test(tString)) {
                              return tString.substring(0, 5);
                          }
                          const d = new Date(tString);
                          if (!isNaN(d.getTime())) {
                              return format(d, 'HH:mm');
                          }
                          return '';
                       };

                       const hasOverlap = (() => {
                          if (projs.length < 2) return false;
                          const toMins = (hhmm: string | null) => {
                             if (!hhmm) return null;
                             const [h, m] = hhmm.split(':').map(Number);
                             return (h * 60) + (m || 0);
                          };
                          
                          const validProjs = projs.map((p: any) => ({
                              s: toMins(p.sStr),
                              e: toMins(p.eStr)
                          })).filter((p: any) => p.s !== null && p.e !== null);
                          
                          for (let i = 0; i < validProjs.length; i++) {
                              for (let j = i + 1; j < validProjs.length; j++) {
                                  const a = validProjs[i];
                                  const b = validProjs[j];
                                  if (a.s! < b.e! && a.e! > b.s!) {
                                      return true;
                                  }
                              }
                          }
                          return false;
                       })();

                       const combinedRecords: any[] = [];
                       projs.forEach((p: any) => {
                           combinedRecords.push({
                               type: 'assigned',
                               reportId: p.reportId,
                               projectId: p.projectId,
                               projectName: p.name, // this is now just the project_name without concat
                               reportStart: p.sStr,
                               reportEnd: p.eStr,
                               clientName: p.cn, // project_number
                               order: p.ord, // client_company_name
                               siteName: p.siteName,
                               category: p.category,
                               declStart: getDeclaredTime(p.projectId, 'start_time'),
                               declEnd: getDeclaredTime(p.projectId, 'end_time'),
                               declRole: getDeclaredRole(p.projectId)
                           });
                       });
                       siteDecls.forEach((sd: any) => {
                           // If it's imported or unassigned, and we already assigned it as fallback to projs, don't create an orphaned row
                           if ((sd.project_id === 'imported' || sd.project_id === 'unassigned') && projs.length > 0) {
                               return;
                           }
                           if (!combinedRecords.some(cr => cr.projectId === sd.project_id)) {
                               combinedRecords.push({
                                   type: sd.project_id === 'imported' ? 'imported' : 'unassigned',
                                   reportId: undefined,
                                   projectId: sd.project_id,
                                   projectName: sd.project_name || (sd.project_id === 'imported' ? '日報なし' : '割当外の現場'),
                                   reportStart: null,
                                   reportEnd: null,
                                   clientName: undefined,
                                   order: undefined,
                                   declStart: sd.start_time,
                                   declEnd: sd.end_time,
                                   declRole: sd.role || '一般'
                               });
                           }
                       });

                       const draft = drafts[dateStr];
                       
                       const openExtraModal = () => {
                          if (!selectedWorkerId) return;
                          setEditingExtra({ 
                            dateStr, 
                            workerId: selectedWorkerId, 
                            recordId: record?.id, 
                            personal_outs: record?.personal_outs || [],
                            memo: record?.memo || null,
                            admin_memo: record?.admin_memo || null,
                          });
                       };

                       const currentClockIn = draft?.clockIn !== undefined ? draft.clockIn : formatInputTime(record?.clock_in_time);
                       const currentClockOut = draft?.clockOut !== undefined ? draft.clockOut : formatInputTime(record?.clock_out_time);

                       const handleClockInChange = (val: string) => updateDraft(dateStr, d => ({...d, clockIn: val, recordId: record?.id}));
                       const handleClockOutChange = (val: string) => updateDraft(dateStr, d => ({...d, clockOut: val, recordId: record?.id}));

                       const updateSiteField = (idx: number, field: string, val: string) => {
                           updateDraft(dateStr, d => {
                               const newSites = [...(d.sites || [])];
                               const existingSiteIdx = newSites.findIndex(s => s.siteIndex === idx);
                               
                               if (existingSiteIdx >= 0) {
                                   newSites[existingSiteIdx] = { ...newSites[existingSiteIdx], [field]: val };
                               } else {
                                   const cr = combinedRecords[idx];
                                   newSites.push({
                                       siteIndex: idx,
                                       projectId: cr.projectId,
                                       projectName: cr.projectName,
                                       declStart: cr.declStart,
                                       declEnd: cr.declEnd,
                                       declRole: cr.declRole,
                                       type: cr.type,
                                       reportId: cr.reportId,
                                       [field]: val
                                   });
                               }
                               return { ...d, sites: newSites, recordId: record?.id };
                           });
                       };

                       const mergedCombinedRecords = combinedRecords.map((cr, idx) => {
                          const draftSite = draft?.sites?.find(s => s.siteIndex === idx);
                          return {
                              ...cr,
                              currentDeclStart: draftSite?.declStart !== undefined ? draftSite.declStart : formatInputTime(cr.declStart),
                              currentDeclEnd: draftSite?.declEnd !== undefined ? draftSite.declEnd : formatInputTime(cr.declEnd),
                              currentRole: draftSite?.declRole !== undefined ? draftSite.declRole : (cr.declRole || '一般')
                          };
                       });

                       return (
                         <tr key={dateStr} className={`border-b hover:bg-slate-50 transition-colors ${isWeekend ? (dow===0?'bg-red-50/20':'bg-blue-50/20') : ''} ${draft ? 'bg-yellow-50/20' : ''}`}>
                           <td className={`p-2 border-r ${dow===0 ? 'text-red-500 font-bold' : dow===6 ? 'text-blue-500 font-bold' : 'text-slate-700'}`}>
                              {d.getMonth() + 1}/{d.getDate()}
                           </td>
                           <td className={`p-2 border-r ${dow===0 ? 'text-red-500 font-bold' : dow===6 ? 'text-blue-500 font-bold' : 'text-slate-700'}`}>
                              {dowStr}
                           </td>
                           <td className="p-1 border-r font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                              <input 
                                 type="time" 
                                 value={currentClockIn || ''} 
                                 onChange={e => handleClockInChange(e.target.value)} 
                                 className={`w-full text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded p-1 ${draft?.clockIn !== undefined ? 'text-amber-600 font-bold bg-amber-50' : ''}`}
                              />
                           </td>
                           <td className="p-1 border-r font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                              <input 
                                 type="time" 
                                 value={currentClockOut || ''} 
                                 onChange={e => handleClockOutChange(e.target.value)} 
                                 className={`w-full text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded p-1 ${draft?.clockOut !== undefined ? 'text-amber-600 font-bold bg-amber-50' : ''}`}
                              />
                           </td>
                           
                           {/* 現場入 Column */}
                           <td className={`p-2 border-r font-medium align-top pt-2 px-1 text-left min-w-[80px] ${hasOverlap ? "bg-red-50/50 text-slate-700" : "bg-blue-50/10 text-slate-700"}`}>
                              {combinedRecords.length > 0 ? (
                                <div className="flex flex-col gap-1 w-full">
                                   {hasOverlap && (
                                      <div className="h-[20px] bg-red-600 text-white rounded text-[10px] font-bold flex items-center justify-center shadow-md w-full border border-red-700 animate-pulse">
                                         🚨 重複エラー
                                      </div>
                                   )}
                                  {mergedCombinedRecords.map((cr, idx) => {
                                     const isMismatch = cr.type === 'assigned' && cr.currentDeclStart && cr.currentDeclStart !== (cr.reportStart || '');
                                     
                                     return (
                                       <div key={idx} className={`h-[44px] flex flex-col justify-center text-[11px] rounded px-1.5 box-border border ${
                                          isMismatch ? 'border-red-400 bg-red-50 text-red-800 shadow-sm' : 'border-slate-200 bg-white text-slate-700'
                                       }`}>
                                         {cr.type === 'assigned' ? (
                                             <>
                                                 <div className="flex justify-between items-center w-full">
                                                    <span className="text-[9px] text-slate-500 mr-1">日報</span>
                                                    <span className={isMismatch ? "font-bold" : ""}>{cr.reportStart || '-'}</span>
                                                 </div>
                                                 <div className={`flex justify-between items-center w-full mt-0.5 pt-0.5 border-t ${isMismatch ? 'border-red-200' : 'border-slate-100 text-blue-700'}`}>
                                                    <span className={`text-[9px] mr-1 ${isMismatch ? 'text-red-500' : 'text-blue-400'}`}>本人</span>
                                                    <input 
                                                       type="time" 
                                                       value={cr.currentDeclStart || ''} 
                                                       onChange={e => updateSiteField(idx, 'declStart', e.target.value)} 
                                                       className={`w-16 text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded text-[11px] font-medium leading-[1] p-0 m-0 ${draft?.sites?.find(s => s.siteIndex === idx)?.declStart !== undefined ? 'text-amber-600 font-bold bg-amber-50' : ''}`}
                                                    />
                                                 </div>
                                             </>
                                         ) : (
                                             <div className="flex justify-between items-center w-full mt-0.5 pt-0.5">
                                                <span className="text-[9px] mr-1 text-blue-400">本人</span>
                                                <input 
                                                   type="time" 
                                                   value={cr.currentDeclStart || ''} 
                                                   onChange={e => updateSiteField(idx, 'declStart', e.target.value)} 
                                                   className={`w-16 text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded text-[11px] font-medium leading-[1] p-0 m-0 ${draft?.sites?.find(s => s.siteIndex === idx)?.declStart !== undefined ? 'text-amber-600 font-bold bg-amber-50' : ''}`}
                                                />
                                             </div>
                                         )}
                                       </div>
                                     );
                                  })}
                                </div>
                              ) : (
                                 <span className="text-slate-300 flex items-center justify-center h-[34px]">-</span>
                              )}
                           </td>

                           {/* 現場出 Column */}
                           <td className={`p-2 border-r font-medium align-top pt-2 px-1 text-left min-w-[80px] ${hasOverlap ? "bg-red-50/50 text-slate-700" : "bg-blue-50/10 text-slate-700"}`}>
                              {combinedRecords.length > 0 ? (
                                <div className="flex flex-col gap-1 w-full">
                                   {hasOverlap && (
                                      <div className="h-[20px] bg-red-50 text-red-600 rounded text-[10px] font-bold flex items-center justify-center shadow-sm w-full border border-red-200">
                                         要確認
                                      </div>
                                   )}
                                  {mergedCombinedRecords.map((cr, idx) => {
                                     const isMismatch = cr.type === 'assigned' && cr.currentDeclEnd && cr.currentDeclEnd !== (cr.reportEnd || '');
                                     
                                     return (
                                       <div key={idx} className={`h-[44px] flex flex-col justify-center text-[11px] rounded px-1.5 box-border border ${
                                          isMismatch ? 'border-red-400 bg-red-50 text-red-800 shadow-sm' : 'border-slate-200 bg-white text-slate-700'
                                       }`}>
                                         {cr.type === 'assigned' ? (
                                             <>
                                                 <div className="flex justify-between items-center w-full">
                                                    <span className="text-[9px] text-slate-500 mr-1">日報</span>
                                                    <span className={isMismatch ? "font-bold" : ""}>{cr.reportEnd || '-'}</span>
                                                 </div>
                                                 <div className={`flex justify-between items-center w-full mt-0.5 pt-0.5 border-t ${isMismatch ? 'border-red-200' : 'border-slate-100 text-blue-700'}`}>
                                                    <span className={`text-[9px] mr-1 ${isMismatch ? 'text-red-500' : 'text-blue-400'}`}>本人</span>
                                                    <input 
                                                       type="time" 
                                                       value={cr.currentDeclEnd || ''} 
                                                       onChange={e => updateSiteField(idx, 'declEnd', e.target.value)} 
                                                       className={`w-16 text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded text-[11px] font-medium leading-[1] p-0 m-0 ${draft?.sites?.find(s => s.siteIndex === idx)?.declEnd !== undefined ? 'text-amber-600 font-bold bg-amber-50' : ''}`}
                                                    />
                                                 </div>
                                             </>
                                         ) : (
                                             <div className="flex justify-between items-center w-full mt-0.5 pt-0.5">
                                                <span className="text-[9px] mr-1 text-blue-400">本人</span>
                                                <input 
                                                   type="time" 
                                                   value={cr.currentDeclEnd || ''} 
                                                   onChange={e => updateSiteField(idx, 'declEnd', e.target.value)} 
                                                   className={`w-16 text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded text-[11px] font-medium leading-[1] p-0 m-0 ${draft?.sites?.find(s => s.siteIndex === idx)?.declEnd !== undefined ? 'text-amber-600 font-bold bg-amber-50' : ''}`}
                                                />
                                             </div>
                                         )}
                                       </div>
                                     );
                                  })}
                                </div>
                              ) : (
                                 <span className="text-slate-300 flex items-center justify-center h-[34px]">-</span>
                              )}
                           </td>

                           <td className={`p-2 border-r text-left max-w-[250px] font-medium h-[48px] overflow-hidden align-top pt-2 ${hasOverlap ? "bg-red-50/50 text-red-700" : "text-slate-600"}`}>
                              {combinedRecords.length > 0 ? (
                                 <div className="flex flex-col gap-1 w-full">
                                    {hasOverlap && (
                                       <div className="h-[20px] bg-red-50 text-red-600 rounded text-[10px] font-bold flex items-center justify-center shadow-sm w-full border border-red-200">
                                          日報重複
                                       </div>
                                    )}
                                   {combinedRecords.map((cr, idx) => (
                                      <div key={idx} className="min-h-[44px] flex flex-col justify-center w-full px-1 py-1 box-border mb-1" title={cr.type === 'imported' ? '日報なし' : cr.type === 'unassigned' ? '日報に割当がない状態での申告時間' : cr.projectName}>
                                         {(() => {
                                            let thirdLineText = '';
                                            const cat = cr.category;
                                            if (cat === '一般' || cat === '役所') {
                                                thirdLineText = cr.order || '';
                                            } else if (cat === '川北' || cat === 'BPE') {
                                                const parts = [];
                                                if (cr.siteName) parts.push(cr.siteName);
                                                parts.push(cat);
                                                thirdLineText = parts.join(' / ');
                                            } else {
                                                const parts = [];
                                                if (cr.siteName) parts.push(cr.siteName);
                                                if (cr.order) parts.push(cr.order);
                                                thirdLineText = parts.join(' / ');
                                            }

                                            return cr.type === 'assigned' ? (
                                                cr.reportId ? (
                                                   <Link to={`/reports/${cr.reportId}`} className="w-full block hover:opacity-80 transition-opacity" target="_blank" rel="noopener noreferrer">
                                                      <div className="flex flex-col items-start w-full whitespace-normal break-all">
                                                        {cr.clientName && <span className="text-[10px] text-blue-500 leading-tight block">{cr.clientName}</span>}
                                                        {cr.projectName && <span className="text-[12px] text-blue-700 font-bold leading-tight block">{cr.projectName}</span>}
                                                        {thirdLineText && <span className="text-[10px] text-slate-500 leading-tight block">{thirdLineText}</span>}
                                                      </div>
                                                   </Link>
                                                 ) : (
                                                    <div className="w-full flex-col justify-start items-start flex block text-slate-700 whitespace-normal break-all">
                                                      {cr.clientName && <span className="text-[10px] text-slate-500 leading-tight block">{cr.clientName}</span>}
                                                      <span className="text-[12px] font-bold leading-tight block">{cr.projectName}</span>
                                                      {thirdLineText && <span className="text-[10px] text-slate-400 leading-tight block">{thirdLineText}</span>}
                                                    </div>
                                                 )
                                            ) : (
                                                 <span className={`w-full block text-[12px] italic whitespace-normal line-clamp-2 leading-tight ${cr.type === 'imported' ? 'text-slate-400' : 'text-blue-500 font-bold'}`}>
                                                    {cr.projectName}
                                                 </span>
                                            );
                                         })()}
                                      </div>
                                   ))}
                                 </div>
                               ) : (
                                 <span className="text-slate-300 flex items-center justify-center h-[34px]">-</span>
                               )}
                           </td>

                           <td className={`p-2 border-r align-top pt-2 px-1 ${hasOverlap ? "bg-red-50/50" : ""}`}>
                              {mergedCombinedRecords.length > 0 ? (
                                <div className="flex flex-col gap-1 w-full text-xs">
                                   {hasOverlap && (
                                      <div className="h-[20px] bg-red-50 text-transparent rounded border border-transparent"></div>
                                   )}
                                  {mergedCombinedRecords.map((cr, idx) => {
                                      const isDraftedRole = draft?.sites?.find(s => s.siteIndex === idx)?.declRole !== undefined;
                                      return (
                                        <div key={idx} className="h-[44px] flex items-center justify-center box-border mb-1">
                                          {(() => {
                                             const assignedRole = activeRoles.find(r => r.project_id === cr.projectId && r.start_date <= dateStr && r.end_date >= dateStr);
                                             if (assignedRole) {
                                                const shortRole = assignedRole.role === '現場代理人' ? '現代' : 
                                                                  assignedRole.role === '現場代理人（主任技術者）' ? '現主' : 
                                                                  assignedRole.role === '監理技術者' ? '監技' : assignedRole.role;
                                                return (
                                                  <div className="w-full text-center border rounded px-0.5 py-1 text-[11px] border-orange-300 bg-orange-50 text-orange-800 font-bold flex items-center justify-center cursor-not-allowed" title="期間指定で固定されています">
                                                     {shortRole}
                                                  </div>
                                                );
                                             }
                                             return (
                                              <select 
                                                 value={cr.currentRole} 
                                                 onChange={e => updateSiteField(idx, 'declRole', e.target.value)}
                                                 className={`w-full h-full text-center border rounded px-0.5 py-1 text-[11px] font-medium leading-[1] outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                                                    isDraftedRole ? 'border-amber-400 bg-amber-50 text-amber-800 font-bold' :
                                                    cr.currentRole === '職長' ? 'bg-blue-50/50 text-blue-800 border-blue-200 font-bold' : 
                                                    cr.currentRole === '現場代理人' || cr.currentRole === '現場代理人（主任技術者）' || cr.currentRole === '監理技術者' ? 'bg-orange-50/50 text-orange-800 border-orange-200 font-bold' :
                                                    'bg-slate-50 border-slate-200 text-slate-700'
                                                 }`}
                                              >
                                                 <option value="一般">一般</option>
                                                 <option value="職長">職長</option>
                                                 {(cr.currentRole === '現場代理人' || cr.currentRole === '現場代理人（主任技術者）' || cr.currentRole === '監理技術者') && (
                                                    <option value={cr.currentRole}>
                                                       {cr.currentRole === '現場代理人' ? '現代' : 
                                                        cr.currentRole === '現場代理人（主任技術者）' ? '現主' : 
                                                        cr.currentRole === '監理技術者' ? '監技' : cr.currentRole}
                                                    </option>
                                                 )}
                                              </select>
                                             );
                                          })()}
                                        </div>
                                      );
                                  })}
                                </div>
                              ) : (
                                  <span className="text-slate-300 flex justify-center items-center h-[34px]">-</span>
                              )}
                           </td>

                           <td className="p-2 border-r font-medium text-blue-700">
                              {record && record.travel_time_minutes > 0 ? `${record.travel_time_minutes} 分` : <span className="text-slate-300">-</span>}
                           </td>
                           <td className="p-2 border-r font-medium text-emerald-700">
                              {record && record.prep_time_minutes > 0 ? `${record.prep_time_minutes} 分` : <span className="text-slate-300">-</span>}
                           </td>
                           <td className="p-2 border-r font-medium text-purple-700">
                              {record && (record.misc_time_minutes || 0) > 0 ? `${record.misc_time_minutes} 分` : <span className="text-slate-300">-</span>}
                           </td>
                           <td 
                               onClick={openExtraModal} 
                               className="p-2 border-r font-medium text-amber-700 cursor-pointer hover:bg-amber-50 transition-colors group relative"
                               title={record?.personal_outs && record.personal_outs.length > 0 ? record.personal_outs.map(o => `${o.start_time || '?'}〜${o.end_time || '?'}`).join(' / ') : undefined}
                           >
                              {record && record.personal_out_minutes > 0 ? `${record.personal_out_minutes} 分` : <span className="text-slate-300 group-hover:text-amber-400">追加</span>}
                           </td>
                           <td onClick={openExtraModal} className="p-2 border-r text-left cursor-pointer hover:bg-slate-50 transition-colors align-top pt-2 group relative">
                              <div className="flex flex-col gap-1 min-h-[36px]">
                                {record?.memo ? (
                                  <span className="text-xs text-slate-600 truncate max-w-[150px] inline-block align-bottom" title={record.memo}>{record.memo}</span>
                                ) : <span className="text-slate-300 group-hover:text-slate-400">記載なし...</span>}
                                
                                {record?.admin_memo && (
                                  <div className="bg-yellow-50 text-yellow-800 text-[10px] p-1 rounded border border-yellow-200 truncate max-w-[150px]" title={record.admin_memo}>
                                    事務: {record.admin_memo}
                                  </div>
                                )}
                               </div>
                           </td>
                           <td className="p-2 border-r text-center align-middle hover:bg-slate-50 transition-colors">
                              <button
                                 onClick={() => openTimelineModal(dateStr, selectedWorkerId!)}
                                 className="text-xs font-bold text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-400 px-3 py-1.5 rounded transition-all shadow-sm w-full whitespace-nowrap flex items-center justify-center gap-1"
                                 title="従業員が入力した詳細な勤怠タイムラインを確認・編集します"
                              >
                                 📝 詳細
                              </button>
                           </td>
                         </tr>
                       );
                    })}
                 </tbody>
                 <tfoot className="sticky bottom-0 bg-slate-100 shadow-[0_-1px_3px_rgba(0,0,0,0.1)] font-bold">
                   <tr>
                      <td colSpan={8} className="p-3 text-right border-r text-slate-700">月間合計 :</td>
                      <td className="p-3 border-r text-center text-blue-700 text-sm">
                         {records.reduce((acc, r) => acc + (r.travel_time_minutes || 0), 0)} 分
                      </td>
                      <td className="p-3 border-r text-center text-emerald-700 text-sm">
                         {records.reduce((acc, r) => acc + (r.prep_time_minutes || 0), 0)} 分
                      </td>
                      <td className="p-3 border-r text-center text-purple-700 text-sm">
                         {records.reduce((acc, r) => acc + (r.misc_time_minutes || 0), 0)} 分
                      </td>
                      <td className="p-3 border-r text-center text-amber-700 text-sm">
                         {records.reduce((acc, r) => acc + (r.personal_out_minutes || 0), 0)} 分
                      </td>
                      <td colSpan={2} className="p-3 border-r text-left text-slate-700 flex-col gap-1 text-xs sm:flex">
                         <span>出勤: {records.length} 日</span>
                         <span>職長: {records.reduce((acc, r) => acc + (r.site_declarations ? r.site_declarations.filter(sd => sd.role === '職長').length : 0), 0)} 回</span>
                      </td>
                      <td colSpan={2} className="p-3 bg-red-50/50"></td>
                   </tr>
                 </tfoot>
               </table>
            </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
              左のリストから作業員を選択してください
            </div>
          )}
        </div>
      </div>
      )}

      <AttendanceImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        workers={workers}
        onSuccess={() => selectedWorkerId && fetchWorkerData(selectedWorkerId)}
      />


      {editingExtra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">備考・私用外出の編集</h3>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto w-full">
              <p className="text-sm font-bold text-slate-500 mb-6 bg-slate-100 p-2 rounded text-center">{editingExtra.dateStr}</p>
              
              <div className="space-y-4">
                 <div className="bg-blue-50/20 border border-blue-100 rounded-lg p-3 space-y-3">
                    <div className="flex justify-between items-center border-b border-blue-100 pb-2">
                       <h4 className="font-bold text-xs text-blue-800">私用外出 (中抜け)</h4>
                       <button 
                          type="button" 
                          onClick={() => setEditingExtra({...editingExtra, personal_outs: [...(editingExtra.personal_outs || []), { start_time: '', end_time: '' }]})}
                          className="text-[10px] bg-white border border-blue-200 text-blue-600 px-2 py-1 rounded shadow-sm hover:bg-blue-50 flex items-center gap-1"
                       >
                          <Plus className="w-3 h-3"/> 追加
                       </button>
                    </div>
                    
                    {(editingExtra.personal_outs || []).length > 0 ? (
                       <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                          {editingExtra.personal_outs?.map((out, idx) => (
                             <div key={idx} className="flex items-center gap-2">
                                <div className="flex-1">
                                   <input type="time" value={out.start_time || ''} onChange={(e) => {
                                      const newArr = [...(editingExtra.personal_outs || [])];
                                      newArr[idx].start_time = e.target.value;
                                      setEditingExtra({...editingExtra, personal_outs: newArr});
                                   }} className="flex h-8 w-full rounded border border-blue-200 bg-white px-2 py-1 text-xs shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500" />
                                </div>
                                <span className="text-slate-400">〜</span>
                                <div className="flex-1">
                                   <input type="time" value={out.end_time || ''} onChange={(e) => {
                                      const newArr = [...(editingExtra.personal_outs || [])];
                                      newArr[idx].end_time = e.target.value;
                                      setEditingExtra({...editingExtra, personal_outs: newArr});
                                   }} className="flex h-8 w-full rounded border border-blue-200 bg-white px-2 py-1 text-xs shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500" />
                                </div>
                                <button type="button" onClick={() => {
                                   const newArr = [...(editingExtra.personal_outs || [])];
                                   newArr.splice(idx, 1);
                                   setEditingExtra({...editingExtra, personal_outs: newArr});
                                }} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50">
                                   <Trash2 className="w-4 h-4" />
                                </button>
                             </div>
                          ))}
                       </div>
                    ) : (
                       <p className="text-[10px] text-slate-400 py-1">外出なし</p>
                    )}
                 </div>

                 <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">備考 (作業員からの連絡事項)</label>
                    <textarea 
                        value={editingExtra.memo || ''} 
                        onChange={e => setEditingExtra({...editingExtra, memo: e.target.value})} 
                        className="border p-2 rounded w-full min-h-[60px] resize-none"
                    />
                 </div>

                 <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                    <label className="text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1">
                       <ShieldCheck className="w-4 h-4" />
                       事務局用メモ <span className="text-[10px] font-normal text-emerald-600">(作業員には非公開)</span>
                    </label>
                    <textarea 
                        value={editingExtra.admin_memo || ''} 
                        onChange={e => setEditingExtra({...editingExtra, admin_memo: e.target.value})} 
                        placeholder="管理者用の引き継ぎや特記事項..."
                        className="border p-2 rounded w-full min-h-[60px] resize-none bg-white focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                 </div>
              </div>
            </div>
            
            <div className="p-4 border-t flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setEditingExtra(null)} className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-slate-100 bg-white">
                キャンセル
              </button>
              <button onClick={handleSaveExtra} disabled={savingTime} className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-w-[100px]">
                {savingTime ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}

      <TotImportModal
        isOpen={showTotModal}
        onClose={() => setShowTotModal(false)}
        workers={workers}
        onComplete={() => {
           setShowTotModal(false);
           if (selectedWorkerId) fetchWorkerData(selectedWorkerId);
        }}
      />

      <TimelineModal
        isOpen={timelineModal.isOpen}
        onClose={() => setTimelineModal({ ...timelineModal, isOpen: false })}
        selectedDate={timelineModal.dateStr}
        workerId={timelineModal.workerId}
        recordId={timelineModal.existingRecord?.id || null}
        existingRecord={timelineModal.existingRecord}
        assignedProjectsForDate={timelineModal.assignedProjectsForDate}
        onSaveSuccess={() => {
            if (selectedWorkerId) fetchWorkerData(selectedWorkerId);
        }}
      />
    </div>
  );
}
