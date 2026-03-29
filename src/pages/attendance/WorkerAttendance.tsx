import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Clock, X, Plus, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface DailyAttendance {
  id: string;
  worker_id: string;
  target_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  role: '職長' | '現場代理人' | '一般' | null;
  prep_time_minutes: number;
  travel_time_minutes: number;
  personal_out_minutes?: number;
  personal_outs?: { start_time: string; end_time: string }[];
  is_locked: boolean;
  memo: string | null;
  site_declarations?: { project_id: string; project_name: string; start_time: string; end_time: string; role?: string }[];
}

interface TimelineEvent {
  id: string;
  time: string;
  type: 'clock_in' | 'travel' | 'prep' | 'site_work' | 'clock_out';
  project_id?: string;
  project_name?: string;
  role?: string;
}

export default function WorkerAttendance() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, DailyAttendance>>({});
  const [assignedProjects, setAssignedProjects] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [workerId, setWorkerId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allProjects, setAllProjects] = useState<{ id: string; project_name: string; status_flag: string; project_number?: string; client_name?: string; parent_project_id?: string | null }[]>([]);
  
  // Branch Selection State
  const [branchSelection, setBranchSelection] = useState<{
    isOpen: boolean;
    eventIndex: number;
    parentProject: any;
    children: any[];
  } | null>(null);
  
  // New Timeline State
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [personalOuts, setPersonalOuts] = useState<{ start_time: string; end_time: string }[]>([]);
  const [memo, setMemo] = useState<string>('');
  const [recordId, setRecordId] = useState<string | null>(null);

  useEffect(() => {
    fetchUserDataAndRecords();
  }, [currentDate.getMonth()]);

  const fetchAllProjects = async (wId: string) => {
    try {
        const { data: projects, error: pErr } = await supabase.from('projects')
          .select('id, project_name, status_flag, project_number, client_name, parent_project_id');
          
        if (pErr) {
            toast.error('エラー: ' + pErr.message);
            setAllProjects([{id: 'err', project_name: '取得エラー: ' + pErr.message, status_flag: ''}]);
            return;
        }
        if (!projects || projects.length === 0) {
            toast.error('現場が0件です（権限エラー等）');
            setAllProjects([{id: 'empty', project_name: '現場が見つかりません', status_flag: ''}]);
            return;
        }

        // 直近30日間のスケジュール（工程管理）データを取得してプロジェクトの出現頻度をカウント
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        let assignmentsData = null;
        if (wId) {
            const { data, error: aErr } = await supabase.from('assignments')
              .select('project_id')
              .eq('worker_id', wId)
              .gte('assignment_date', dateStr);
            if (aErr) {
                toast.error('履歴取得エラー: ' + aErr.message);
            }
            assignmentsData = data;
        }
          
        const freq: Record<string, number> = {};
        if (assignmentsData) {
           for (const a of assignmentsData) {
              if (a && a.project_id) {
                  freq[a.project_id] = (freq[a.project_id] || 0) + 1;
              }
           }
        }
        
        // 優先順位: 1.工程管理での出現回数(多->少), 2.ステータス(着工中->着工前->完工), 3.名前
        const sortedProjects = [...projects].sort((a, b) => {
           const fA = freq[a?.id] || 0;
           const fB = freq[b?.id] || 0;
           if (fA !== fB) return fB - fA;
           
           const statusOrder = { '着工中': 1, '着工前': 2, '完工': 3 };
           const sA = statusOrder[(a?.status_flag as keyof typeof statusOrder)] || 99;
           const sB = statusOrder[(b?.status_flag as keyof typeof statusOrder)] || 99;
           if (sA !== sB) return sA - sB;
           
           return (a?.project_name || '').localeCompare(b?.project_name || '', 'ja');
        });
        
        setAllProjects(sortedProjects);
    } catch (err: any) {
        toast.error('予期せぬエラー: ' + err.message);
        setAllProjects([{id: 'fail', project_name: 'プログラムエラー', status_flag: ''}]);
    }
  };

  const [testModeName, setTestModeName] = useState<string | null>(null);

  const fetchUserDataAndRecords = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      let { data: worker } = await supabase
        .from('worker_master')
        .select('id, name')
        .eq('email', user.email)
        .single();

      if (!worker) {
        // 社長（非作業員）のテスト用：一番最初の作業員データを借りる
        const { data: fallbackWorker } = await supabase
          .from('worker_master')
          .select('id, name')
          .limit(1)
          .single();
        
        if (fallbackWorker) {
            worker = fallbackWorker;
            setTestModeName(fallbackWorker.name);
        }
      }

      if (worker) {
        setWorkerId(worker.id);
        await fetchAllProjects(worker.id); // ユーザーが確定してから、そのユーザーの頻度を元に現場を取得
        await fetchMonthRecords(worker.id, currentDate);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthRecords = async (wId: string, date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

    const { data } = await supabase
      .from('daily_attendance')
      .select('*')
      .eq('worker_id', wId)
      .gte('target_date', startDate)
      .lte('target_date', endDate)
      .order('target_date', { ascending: true });

    if (data) {
      const recordsByDate = data.reduce((acc, current) => {
        acc[current.target_date] = current;
        return acc;
      }, {} as Record<string, DailyAttendance>);
      setAttendanceRecords(recordsByDate);
    }

    const { data: reportsData } = await supabase
      .from('daily_reports')
      .select(`
        id,
        report_date,
        project_id,
        projects ( project_name ),
        report_personnel!inner ( worker_id, start_time, end_time )
      `)
      .eq('report_personnel.worker_id', wId)
      .gte('report_date', startDate)
      .lte('report_date', endDate);

    const { data: assignmentsData } = await supabase
      .from('assignments')
      .select('project_id, assignment_date, projects(project_name)')
      .eq('worker_id', wId)
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate);

    const projectsByDate: Record<string, any[]> = {};
    
    if (assignmentsData) {
      assignmentsData.forEach((asg: any) => {
        const date = asg.assignment_date;
        const pName = asg.projects?.project_name;
        if (pName) {
           if (!projectsByDate[date]) projectsByDate[date] = [];
           projectsByDate[date].push({
             project_id: asg.project_id,
             project_name: pName,
             foreman_start: null, 
             foreman_end: null,
             report_id: null
           });
        }
      });
    }

    if (reportsData) {
      reportsData.forEach((report: any) => {
        const date = report.report_date;
        const pName = Array.isArray(report.projects) 
           ? report.projects[0]?.project_name 
           : report.projects?.project_name;
        
        const personnelRow = Array.isArray(report.report_personnel) ? report.report_personnel[0] : report.report_personnel;

        if (pName) {
           if (!projectsByDate[date]) projectsByDate[date] = [];
           
           const existingIdx = projectsByDate[date].findIndex(p => p.project_id === report.project_id);
           if (existingIdx >= 0) {
              projectsByDate[date][existingIdx].foreman_start = personnelRow?.start_time || null;
              projectsByDate[date][existingIdx].foreman_end = personnelRow?.end_time || null;
              projectsByDate[date][existingIdx].report_id = report.id;
           } else {
              projectsByDate[date].push({
                project_id: report.project_id,
                project_name: pName,
                foreman_start: personnelRow?.start_time || null,
                foreman_end: personnelRow?.end_time || null,
                report_id: report.id
              });
           }
        }
      });
    }
    
    setAssignedProjects(projectsByDate);
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const openModal = (dateStr: string) => {
    setSelectedDate(dateStr);
    const existingRecord = attendanceRecords[dateStr];
    
    const formatTime = (isoString: string | null) => {
      if (!isoString) return '';
      const d = new Date(isoString);
      return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    };

    let initialEvents: TimelineEvent[] = [];
    
    if (existingRecord) {
        setRecordId(existingRecord.id);
        const ci = formatTime(existingRecord.clock_in_time);
        if (ci) initialEvents.push({ id: crypto.randomUUID(), time: ci, type: 'clock_in' });
        
        const decls = [...(existingRecord.site_declarations || [])].sort((a,b) => (a.start_time || '').localeCompare(b.start_time || ''));
        
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
        setRecordId(null);
        setPersonalOuts([]);
        setMemo('');
        
        const assignedForDate = assignedProjects[dateStr] || [];
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
    setIsModalOpen(true);
  };

  const addEvent = (index: number) => {
    const newEvents = [...timelineEvents];
    newEvents.splice(index + 1, 0, { id: crypto.randomUUID(), time: '', type: 'travel' });
    setTimelineEvents(newEvents);
  };

  const removeEvent = (index: number) => {
    const newEvents = [...timelineEvents];
    newEvents.splice(index, 1);
    setTimelineEvents(newEvents);
  };

  const updateEventInfo = (index: number, updates: Partial<TimelineEvent>) => {
    const newEvents = [...timelineEvents];
    newEvents[index] = { ...newEvents[index], ...updates };
    setTimelineEvents(newEvents);
    
    // 分岐工事のピックアップ
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
    if (!workerId || !selectedDate) return;

    // 出社直後のアクションは出社時刻と同一にする（UIで時間入力を省いているため）
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
            } else if (prev.type === 'site_work' && prev.project_id) {
                site_declarations.push({
                    project_id: prev.project_id,
                    project_name: prev.project_name,
                    start_time: prev.time,
                    end_time: ev.time,
                    role: prev.role || '一般'
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
      setIsModalOpen(false);
      fetchMonthRecords(workerId, currentDate);
    } catch (err: any) {
      console.error(err);
      toast.error('保存に失敗しました: ' + err.message);
    }
  };

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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-5xl mx-auto space-y-6">
      <div className="shrink-0 space-y-2 pb-2">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Clock className="w-8 h-8 text-blue-600" />
          自分の勤怠・役割申告
        </h2>
        <p className="text-muted-foreground">出退勤の時間を中心に、1日のタイムラインを入力してください</p>
      </div>

      {testModeName && !loading && (
        <div className="bg-amber-50 text-amber-700 border border-amber-300 p-4 rounded-lg flex items-center gap-3 font-bold shadow-sm">
          <span className="text-xl">⚠️</span>
          <div>
              <div>【社長テストモード】作業員マスターに未登録のため、仮の作業員（{testModeName}さん）としてデータを表示・保存します。</div>
              <div className="text-sm font-normal opacity-80 mt-0.5">※実際にデータを保存すると、この作業員の実績として記録されるためテスト後は削除してください。</div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 rounded-xl border bg-card shadow-sm flex flex-col overflow-hidden relative">
        <div className="flex bg-slate-50 border-b p-4 justify-between items-center">
            <button onClick={handlePrevMonth} className="border bg-white hover:bg-slate-100 h-9 px-4 rounded-md font-medium text-sm">&lt; 前月</button>
            <h3 className="text-xl font-bold">{year}年 {month}月</h3>
            <button onClick={handleNextMonth} className="border bg-white hover:bg-slate-100 h-9 px-4 rounded-md font-medium text-sm">次月 &gt;</button>
        </div>
        
        {loading ? (
             <div className="flex justify-center p-12">読み込み中...</div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 border-b w-36">日付</th>
                  <th className="px-4 py-3 border-b">出退勤</th>
                  <th className="px-4 py-3 border-b min-w-[200px]">申告現場</th>
                  <th className="px-4 py-3 border-b w-28">役割</th>
                  <th className="px-4 py-3 border-b w-24">移動</th>
                  <th className="px-4 py-3 border-b w-24">準備</th>
                  <th className="px-4 py-3 border-b w-24 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map(day => {
                  const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                  const record = attendanceRecords[dateStr];
                  const dateObj = new Date(year, month - 1, day);
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  
                  return (
                    <tr key={day} className={`hover:bg-slate-50 transition-colors ${isWeekend ? 'bg-red-50/20' : ''}`}>
                      <td className="px-4 py-3 font-medium">{month}/{day} ({['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]})</td>
                      <td className="px-4 py-3">
                        {record?.clock_in_time ? (
                           <div className="font-medium">
                               {new Date(record.clock_in_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 
                               <span className="text-muted-foreground mx-1">〜</span> 
                               {record.clock_out_time ? new Date(record.clock_out_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ' 未打刻'}
                           </div>
                        ) : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                         {record?.site_declarations && record.site_declarations.length > 0 ? (
                           <div className="flex flex-col gap-1 text-xs">
                             {record.site_declarations.map((p:any, i:number) => (
                               <span key={i} className="text-slate-700 font-medium truncate w-full block bg-slate-100 px-1.5 py-0.5 rounded border">
                                 {p.project_name} ({p.start_time}〜{p.end_time})
                               </span>
                             ))}
                           </div>
                         ) : <span className="text-xs text-slate-400 italic">日報未登録</span>}
                      </td>
                      <td className="px-4 py-3">
                         {record?.site_declarations && record.site_declarations.length > 0 ? (
                           <div className="flex flex-col gap-1 text-xs">{record.site_declarations.map((sd:any, i:number) => (
                               <span key={i} className={`truncate w-fit block px-1.5 py-0.5 rounded border ${sd.role === '職長' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100'}`}>{sd.role || '一般'}</span>
                           ))}</div>
                         ) : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3">{record?.travel_time_minutes ? `${record.travel_time_minutes}分` : '-'}</td>
                      <td className="px-4 py-3">{record?.prep_time_minutes ? `${record.prep_time_minutes}分` : '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <button 
                           className="inline-flex items-center justify-center rounded text-xs font-medium transition-colors border bg-white shadow-sm hover:bg-slate-100 h-8 px-3"
                           onClick={() => openModal(dateStr)}
                        >{record ? '編集' : '入力'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-100 rounded-xl shadow-xl w-full max-w-xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b bg-white shadow-sm z-10">
              <h3 className="font-bold text-lg flex flex-col">
                  <span>{selectedDate && new Date(selectedDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })} のタイムライン記録</span>
                  <span className="text-xs font-normal text-muted-foreground mt-1 bg-slate-100 px-2 py-0.5 rounded inline-block w-fit">上から順番に行動時間を記録していく方式です</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-slate-200 p-1.5 rounded-full bg-slate-50 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-6 scroll-smooth">
              
              <div className="relative border-l-2 border-slate-300 ml-6 pl-8 space-y-2 py-4">
                {(() => {
                    const effectiveTimes = timelineEvents.map((e, i) => (i > 0 && timelineEvents[i - 1].type === 'clock_in' ? timelineEvents[i - 1].time : e.time));
                    return timelineEvents.map((ev, idx) => {
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
                                {/* Timeline Node dot */}
                                <div className={`absolute -left-[40px] top-4 w-4 h-4 rounded-full border-[3px] border-slate-100 shadow-sm ${isInvalidTime ? 'bg-red-500 ring-2 ring-red-400 animate-pulse' : getEventIconColor(ev.type)}`}></div>
                                
                                {/* Card Array */}
                                <div className={`border rounded-xl shadow-sm p-4 flex flex-col gap-3 relative transition-all focus-within:ring-2 ${isInvalidTime ? 'ring-2 ring-red-400 bg-red-50 border-red-300' : 'ring-blue-500 ' + getEventBgColor(ev.type)}`}>
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
                                                   className={`w-[100px] h-10 rounded-md border-0 ring-1 text-center font-bold font-mono shadow-inner text-lg focus:ring-2 focus:outline-none ${isInvalidTime ? 'ring-red-400 bg-red-100 text-red-900 focus:ring-red-500' : 'ring-slate-300 bg-white focus:ring-blue-500'}`}
                                                />
                                            )}
                                        <span className="font-bold text-slate-500 text-sm whitespace-nowrap">〜</span>
                                    </div>
                                    
                                    {ev.type !== 'clock_in' && ev.type !== 'clock_out' ? (
                                        <div className="flex-1 min-w-[200px]">
                                            <select 
                                            value={ev.type}
                                            onChange={(e) => updateEventInfo(idx, { type: e.target.value as any, project_id: '', project_name: '' })}
                                            className="w-full h-10 rounded-md border-0 ring-1 ring-slate-300 font-bold text-sm px-3 shadow-inner bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            >
                                            <option value="travel">🚕 移動</option>
                                            <option value="prep">🔧 準備</option>
                                            <option value="site_work">👷 現場で作業</option>
                                            </select>
                                        </div>
                                    ) : (
                                        <div className="font-bold text-base flex-1 min-w-[200px] flex items-center">
                                            {ev.type === 'clock_in' ? '🚀 出社・勤務スタート' : '🏠 退勤・勤務終了！'}
                                        </div>
                                    )}

                                    {ev.type !== 'clock_in' && ev.type !== 'clock_out' && (
                                        <button onClick={() => removeEvent(idx)} className="p-2 text-slate-300 hover:text-red-500 rounded bg-white/50 border shadow-sm ml-auto sm:ml-0"><Trash2 className="w-4 h-4"/></button>
                                    )}
                                </div>

                                {isSite && (
                                    <div className="mt-1 pt-3 border-t border-blue-200/50 flex flex-col sm:flex-row gap-3 w-full">
                                        <div className="flex-1 relative">
                                            <select 
                                                className="w-full h-10 px-3 text-sm border-0 ring-1 ring-slate-300 rounded-md bg-white shadow-inner focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700 appearance-none pr-8"
                                                value={ev.project_id || ''}
                                                onChange={(e) => {
                                                    const p = allProjects.find(ap => ap.id === e.target.value);
                                                    if (p) updateEventInfo(idx, { project_id: p.id, project_name: p.project_name });
                                                }}
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
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </div>
                                        </div>
                                        <div className="w-full sm:w-32 shrink-0">
                                            <select 
                                                className="w-full h-10 px-3 text-sm border-0 ring-1 ring-slate-300 bg-white rounded-md shadow-inner text-slate-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                value={ev.role || '一般'}
                                                onChange={(e) => updateEventInfo(idx, { role: e.target.value })}
                                            >
                                                <option value="一般">一般</option>
                                                <option value="職長">職長</option>
                                                <option value="現場代理人">代理人</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Insert button */}
                            {idx < timelineEvents.length - 1 && (
                                <div className="h-6 flex items-center justify-center -ml-[3rem] my-3 relative z-10 w-full group/add">
                                    <button onClick={() => addEvent(idx)} className="bg-white border-2 border-slate-200 text-blue-500 rounded-full p-1 hover:border-blue-300 hover:bg-blue-50 shadow-sm transition-all focus:outline-none focus:ring-2 ring-blue-500">
                                        <Plus className="w-5 h-5"/>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                });
                })()}
              </div>

              {/* Personal Outs / Notes */}
              <div className="mt-8 space-y-4 pt-6 border-t px-2 pb-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                     <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-sm text-slate-700">私用外出 (タイムライン外の中抜け)</h4>
                        <button type="button" onClick={() => setPersonalOuts([...personalOuts, { start_time: '', end_time: '' }])} className="text-xs bg-slate-50 text-slate-600 border px-3 py-1.5 rounded-md shadow-sm hover:bg-slate-100 flex gap-1 font-medium"><Plus className="w-3.5 h-3.5"/> 追加</button>
                     </div>
                     <div className="space-y-3">
                        {personalOuts.map((out, idx) => (
                           <div key={idx} className="flex gap-2 items-center">
                              <input type="time" value={out.start_time} onChange={(e) => { const a = [...personalOuts]; a[idx].start_time = e.target.value; setPersonalOuts(a); }} className="w-28 h-9 border rounded-md px-2 text-center text-sm shadow-inner" />
                              <span className="text-muted-foreground font-medium">〜</span>
                              <input type="time" value={out.end_time} onChange={(e) => { const a = [...personalOuts]; a[idx].end_time = e.target.value; setPersonalOuts(a); }} className="w-28 h-9 border rounded-md px-2 text-center text-sm shadow-inner" />
                              <button onClick={() => { const a = [...personalOuts]; a.splice(idx, 1); setPersonalOuts(a); }} className="text-slate-400 hover:text-red-500 p-2"><Trash2 className="w-4 h-4"/></button>
                           </div>
                        ))}
                        {personalOuts.length === 0 && <span className="text-slate-400 text-sm italic">登録なし</span>}
                     </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-bold text-slate-700 block mb-2">備考メモ</label>
                    <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full h-24 border border-slate-200 rounded-xl p-3 text-sm resize-none shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50 placeholder:text-slate-400" placeholder="遅刻や早退の理由、その他連絡事項があれば入力してください"/>
                  </div>
              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="border bg-white hover:bg-slate-100 h-11 px-6 rounded-lg font-bold text-sm shadow-sm transition-colors text-slate-600">キャンセル</button>
              <button onClick={saveRecord} className="bg-blue-600 text-white hover:bg-blue-700 shadow-md h-11 px-8 rounded-lg font-bold text-sm transition-colors flex items-center gap-2">保存する</button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Selection Modal */}
      {branchSelection?.isOpen && (
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
                      {/* Option to keep original parent */}
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
                      
                      {/* Branch children */}
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
    </div>
  );
}
