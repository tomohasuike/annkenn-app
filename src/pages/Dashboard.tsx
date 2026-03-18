import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ShieldCheck, HardHat, FileText, AlertTriangle, CheckCircle2, FileCheck2, Loader2, Clock, LayoutDashboard, CalendarClock } from "lucide-react"
import { supabase } from "../lib/supabase"
import * as dateFns from "date-fns"

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // User Info & Permissions
  const [allowedApps, setAllowedApps] = useState<string[]>([]);
  const hasBillingAccess = allowedApps.includes('billing') || allowedApps.includes('schedule-admin'); // Assume schedule-admin is full admin

  // Data States
  const [todaySchedules, setTodaySchedules] = useState<any[]>([]);
  const [tomorrowSchedules, setTomorrowSchedules] = useState<any[]>([]);
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [submittedTodayReports, setSubmittedTodayReports] = useState<Record<string, string>>({});
  const [submittedTomorrowReports, setSubmittedTomorrowReports] = useState<Record<string, string>>({});
  const [tomorrowPlans, setTomorrowPlans] = useState<any[]>([]);
  const [myWeeklySchedules, setMyWeeklySchedules] = useState<any[]>([]);
  
  const [isExecutiveOrClerk, setIsExecutiveOrClerk] = useState(false);
  const [allWorkers, setAllWorkers] = useState<any[]>([]);
  const [allWorkersWeeklySchedules, setAllWorkersWeeklySchedules] = useState<any[]>([]);

  // Billing States
  const [fiscalYearSales, setFiscalYearSales] = useState(0);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);

  const formatSiteName = (p: any) => {
      if (!p) return '';
      const name = ['一般', '役所'].includes(p.category) ? (p.client_name || p.site_name) : (p.site_name || p.client_name);
      return (typeof name === 'string' ? name : '').replace(/\s*[\(（]UNION[）\)]/gi, '');
  };

  const getProjectDisplayName = (p: any) => {
      if (!p) return '名称未設定';
      const num = p.project_number ? `${p.project_number}　` : '';
      const name = p.project_name || p.name || '名称未設定';
      const clientOrSite = formatSiteName(p);
      const suffix = clientOrSite ? `（${clientOrSite}）` : '';
      return `${num}${name}${suffix}`;
  };

  const isVacationOrMisc = (p: any) => {
      if (!p) return false;
      return p.category === 'その他' || p.project_number === 'VACATION' || (typeof p.project_name === 'string' && p.project_name.includes('休暇'));
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      // 1. Fetch Permissions
      const { data: workerData } = await supabase
        .from('worker_master')
        .select('id, allowed_apps, is_admin, type')
        .eq('email', user.email)
        .single();
      
      const permissions = workerData?.allowed_apps || [];
      setAllowedApps(permissions);
      const canViewBilling = permissions.includes('billing') || workerData?.is_admin;
      const currentWorkerId = workerData?.id;
      const isExecOrClerk = workerData?.type === '社長' || workerData?.type === '事務員';
      setIsExecutiveOrClerk(isExecOrClerk);

      const todayStr = dateFns.format(new Date(), 'yyyy-MM-dd');
      const tomorrowStr = dateFns.format(dateFns.addDays(new Date(), 1), 'yyyy-MM-dd');
      const isBeforeNoon = new Date().getHours() < 12;

      const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  
  let fiscalStart, fiscalEnd;
  if (currentMonth >= 5) {
      fiscalStart = new Date(currentYear, 4, 1); // May 1st
      fiscalEnd = new Date(currentYear + 1, 3, 30); // April 30th next year
  } else {
      fiscalStart = new Date(currentYear - 1, 4, 1); // May 1st last year
      fiscalEnd = new Date(currentYear, 3, 30); // April 30th
  }

  const fiscalYearStartStr = dateFns.format(fiscalStart, 'yyyy-MM-dd');
  const fiscalYearEndStr = dateFns.format(fiscalEnd, 'yyyy-MM-dd');

  // 2. Fetch Assignments for Today and Tomorrow
      // Today schedules
      const { data: schedules } = await supabase
        .from('assignments')
        .select(`
          id,
          project_id,
          assignment_date,
          worker_id,
          vehicle_id,
          worker_master ( name, type ),
          vehicle_master ( vehicle_name ),
          project:projects ( id, project_name, site_name, project_number, category, client_name )
        `)
        .eq('assignment_date', todayStr);
      setTodaySchedules(schedules || []);

      // Tomorrow assignments (for display)
      const { data: tomAssignments } = await supabase
        .from('assignments')
        .select(`
          id,
          project_id,
          assignment_date,
          worker_id,
          vehicle_id,
          worker_master ( name, type ),
          vehicle_master ( vehicle_name ),
          project:projects ( id, project_name, site_name, project_number, category, client_name )
        `)
        .eq('assignment_date', tomorrowStr);
      setTomorrowSchedules(tomAssignments || []);

      // 2.5 Fetch My Weekly Schedule OR All Workers Weekly Schedule
      const weeklyEndStr = dateFns.format(dateFns.addDays(new Date(), 6), 'yyyy-MM-dd');
      
      if (isExecOrClerk) {
          const { data: activeWorkersRaw } = await supabase
              .from('worker_master')
              .select('id, name, type, display_order')
              .eq('is_active', true)
              .order('display_order', { ascending: true })
              .order('name', { ascending: true });
          
          const filteredWorkers = (activeWorkersRaw || []).filter(w => !['社長', '事務員', '協力会社'].includes(w.type));
          setAllWorkers(filteredWorkers);

          const { data: allAssignments } = await supabase
              .from('assignments')
              .select(`
                  id,
                  project_id,
                  assignment_date,
                  worker_id,
                  project:projects ( id, project_name, site_name, project_number, category, client_name )
              `)
              .gte('assignment_date', todayStr)
              .lte('assignment_date', weeklyEndStr)
              .not('worker_id', 'is', null)
              .order('assignment_date', { ascending: true });
          
          setAllWorkersWeeklySchedules(allAssignments || []);
      } else if (currentWorkerId) {
          const { data: myAssignments } = await supabase
              .from('assignments')
              .select(`
                  id,
                  project_id,
                  assignment_date,
                  project:projects ( id, project_name, site_name, project_number, category, client_name )
              `)
              .eq('worker_id', currentWorkerId)
              .gte('assignment_date', todayStr)
              .lte('assignment_date', weeklyEndStr)
              .order('assignment_date', { ascending: true });
          
          setMyWeeklySchedules(myAssignments || []);
      }

      // 3. Fetch Active Projects (着工中)
      const { data: projects } = await supabase
        .from('projects')
        .select('id, project_name, site_name, project_number, status_flag, category, client_name')
        .eq('status_flag', '着工中');
      setActiveProjects(projects || []);

      // 3.5 Fetch Today's Daily Reports (作成済の日報)
      const { data: todayReports } = await supabase
        .from('daily_reports')
        .select('id, project_id')
        .gte('report_date', `${todayStr}T00:00:00`)
        .lte('report_date', `${todayStr}T23:59:59.999Z`);
        
      const submittedMap: Record<string, string> = {};
      if (todayReports) {
          todayReports.forEach(r => {
              if (r.project_id) submittedMap[r.project_id] = r.id;
          });
      }
      setSubmittedTodayReports(submittedMap);

      // 3.6 Fetch Future Next Day Plans (今後の予定翌日予定)
      const { data: tomorrowReportsRaw } = await supabase
        .from('tomorrow_schedules')
        .select(`
            id, project_id, schedule_date, arrival_time, workers,
            project:projects(project_name, project_number, site_name, client_name, category)
        `);
        
      const submittedTomMap: Record<string, string> = {};
      if (tomorrowReportsRaw) {
          // In-memory filter with sanitized dates (since past dates with `/` could bypass Supabase `.gte` string comparison against `-`)
          const tomorrowReports = tomorrowReportsRaw.filter((r: any) => {
              if (!r.schedule_date) return false;
              const cleanDate = r.schedule_date.replace(/\//g, '-');
              if (cleanDate >= tomorrowStr) return true;
              if (isBeforeNoon && cleanDate === todayStr) return true;
              return false;
          });

          tomorrowReports.forEach((r: any) => {
              const cleanDate = r.schedule_date ? r.schedule_date.replace(/\//g, '-') : '';
              if (r.project_id && cleanDate === tomorrowStr) {
                  submittedTomMap[r.project_id] = r.id;
              }
          });

          setTomorrowPlans(tomorrowReports.sort((a: any, b: any) => {
              const dateA = (a.schedule_date || '9999-12-31').replace(/\//g, '-');
              const dateB = (b.schedule_date || '9999-12-31').replace(/\//g, '-');
              const dateCmp = dateA.localeCompare(dateB);
              if (dateCmp !== 0) return dateCmp;

              const timeA = a.arrival_time || '99:99';
              const timeB = b.arrival_time || '99:99';
              return timeA.localeCompare(timeB);
          }));
      }
      setSubmittedTomorrowReports(submittedTomMap);

      // 4. Fetch Recent Reports (Daily)
      const { data: reports } = await supabase
        .from('daily_reports')
        .select(`
          id,
          project_id,
          report_date,
          created_at,
          work_content,
          reporter_name,
          project:projects ( project_name, site_name, project_number, category, client_name )
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentReports(reports || []);

      // 5. Fetch Billing Data if authorized
      if (canViewBilling) {
        // Fetch all billing details except unbilled (未請求)
        const { data: billingDetails } = await supabase
          .from('invoice_details')
          .select('id, amount, billing_date, expected_deposit_date, details_status')
          .neq('details_status', '未請求');
        
        let fiscalYearSalesTotal = 0;
        let overdue: any[] = [];

        if (billingDetails) {
          billingDetails.forEach(bd => {
            // Add to fiscal year sales if billing date is within the fiscal year and status is '請求済', '入金済', or '完了'
            const isBilledOrPaid = ['請求済', '入金済', '完了'].includes(bd.details_status);
            if (isBilledOrPaid && bd.billing_date >= fiscalYearStartStr && bd.billing_date <= fiscalYearEndStr) {
              fiscalYearSalesTotal += bd.amount || 0;
            }

            // Check if overdue: status is 請求済 and expected deposit date has passed
            if (bd.expected_deposit_date && bd.expected_deposit_date < todayStr && bd.details_status === '請求済') {
              overdue.push(bd);
            }
          });
        }
        setFiscalYearSales(fiscalYearSalesTotal);
        setOverdueInvoices(overdue);
      }

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Derived Data
  const realActiveProjects = activeProjects.filter(p => !isVacationOrMisc(p));
  const projectsNeedingCompletionReport = realActiveProjects.filter(() => false);
  const activeSchedulesCount = new Set(
      todaySchedules
          .filter(s => s.project_id && s.project && !isVacationOrMisc(s.project))
          .map(s => s.project_id)
  ).size;

  // 翌日の予定があるのに、本日の日報が出ていないアラート
  const currentHour = new Date().getHours();
  const currentMinutes = new Date().getMinutes();
  const isPast1730 = currentHour > 17 || (currentHour === 17 && currentMinutes >= 30);

  const tomorrowScheduleGroups = Object.values(tomorrowSchedules.reduce((acc, curr) => {
    const p = curr.project;
    if (!p) return acc;
    const pid = p.id;
    if (!acc[pid]) acc[pid] = { project: p, workers: [], vehicles: [], workersRaw: [], vehiclesRaw: [], subcontractorsRaw: [] };
    const wRaw = Array.isArray(curr.worker_master) ? curr.worker_master[0] : curr.worker_master;
    const vRaw = Array.isArray(curr.vehicle_master) ? curr.vehicle_master[0] : curr.vehicle_master;
    
    if (wRaw) {
        if (wRaw.type === '協力会社') {
            acc[pid].subcontractorsRaw.push({ id: curr.worker_id, name: wRaw.name, count: curr.count || 1 });
        } else {
            acc[pid].workers.push(wRaw.name);
            acc[pid].workersRaw.push({ id: curr.worker_id, name: wRaw.name });
        }
    }
    if (vRaw) {
        acc[pid].vehicles.push(vRaw.vehicle_name);
        acc[pid].vehiclesRaw.push({ id: curr.vehicle_id, vehicle_name: vRaw.vehicle_name });
    }
    return acc;
  }, {} as any)).sort((a: any, b: any) => {
    const isAVac = a.project?.project_number === 'VACATION' || a.project?.project_name?.includes('休暇');
    const isBVac = b.project?.project_number === 'VACATION' || b.project?.project_name?.includes('休暇');
    return isAVac === isBVac ? 0 : isAVac ? -1 : 1;
  });

  const todayScheduleGroups = Object.values(todaySchedules.reduce((acc, curr) => {
    const p = curr.project;
    if (!p) return acc;
    const pid = p.id;
    if (!acc[pid]) acc[pid] = { project: p, workers: [], vehicles: [], workersRaw: [], vehiclesRaw: [], subcontractorsRaw: [] };
    const wRaw = Array.isArray(curr.worker_master) ? curr.worker_master[0] : curr.worker_master;
    const vRaw = Array.isArray(curr.vehicle_master) ? curr.vehicle_master[0] : curr.vehicle_master;
    
    if (wRaw) {
        if (wRaw.type === '協力会社') {
            acc[pid].subcontractorsRaw.push({ id: curr.worker_id, name: wRaw.name, count: curr.count || 1 });
        } else {
            acc[pid].workers.push(wRaw.name);
            acc[pid].workersRaw.push({ id: curr.worker_id, name: wRaw.name });
        }
    }
    if (vRaw) {
        acc[pid].vehicles.push(vRaw.vehicle_name);
        acc[pid].vehiclesRaw.push({ id: curr.vehicle_id, vehicle_name: vRaw.vehicle_name });
    }
    return acc;
  }, {} as any)).sort((a: any, b: any) => {
    const isAVac = a.project?.project_number === 'VACATION' || a.project?.project_name?.includes('休暇');
    const isBVac = b.project?.project_number === 'VACATION' || b.project?.project_name?.includes('休暇');
    return isAVac === isBVac ? 0 : isAVac ? -1 : 1;
  });

  const missingTomorrowGroups = tomorrowScheduleGroups.filter((group: any) => {
      const p = group.project;
      if (!p || isVacationOrMisc(p)) return false;
      return !submittedTomorrowReports[p.id];
  });

  const missingTodayGroups = todayScheduleGroups.filter((group: any) => {
      const p = group.project;
      if (!p || isVacationOrMisc(p)) return false;
      return !submittedTodayReports[p.id];
  });

  const showTomorrowScheduleAlert = currentHour >= 15 && missingTomorrowGroups.length > 0;
  const showTodayScheduleAlert = isPast1730 && missingTodayGroups.length > 0;

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-slate-50 p-6 md:p-8 space-y-8">
      
      {/* Header & Safety Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="w-7 h-7 text-blue-600" />
            ダッシュボード
          </h1>
          <p className="text-sm text-slate-500 mt-1">本日の状況と重要なアラートを確認できます。</p>
        </div>

        <button 
          onClick={() => navigate('/safety-report')}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full shadow-md hover:shadow-lg transition-all flex items-center gap-2 animate-pulse shrink-0"
        >
          <ShieldCheck className="w-6 h-6" />
          <span>緊急安否報告</span>
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 cursor-pointer hover:border-blue-300 transition-colors" onClick={() => navigate('/projects')}>
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <HardHat className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500">稼働中の現場</p>
            <p className="text-2xl font-black text-slate-800">{realActiveProjects.length} <span className="text-base font-medium text-slate-500">件</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 cursor-pointer hover:border-emerald-300 transition-colors" onClick={() => navigate('/schedule-management')}>
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500">本日の稼働スケジュール</p>
            <p className="text-2xl font-black text-slate-800">{activeSchedulesCount} <span className="text-base font-medium text-slate-500">現場</span></p>
          </div>
        </div>

        {hasBillingAccess ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 cursor-pointer hover:border-orange-300 transition-colors" onClick={() => navigate('/billing')}>
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-orange-600">¥</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">今年度の売上額</p>
              <p className="text-2xl font-black text-slate-800">¥ {fiscalYearSales.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl border border-dashed border-slate-200 p-6 flex items-center justify-center opacity-70">
            <p className="text-sm text-slate-500">※経理・請求情報は表示されません</p>
          </div>
        )}
      </div>

      {/* MAIN CONTENT SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
        
        {/* LEFT COLUMN: Actions & Alerts */}
        <div className="col-span-1 lg:col-span-2 space-y-8">
          
          {/* あなたの週間予定 / 作業員の週間予定 */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">
                {isExecutiveOrClerk ? '作業員の週間予定' : 'あなたの週間予定'}
              </h2>
            </div>
            
            {isExecutiveOrClerk ? (
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-6 flex flex-col">
                <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar relative">
                  <table className="w-max border-collapse bg-white text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-sm">
                      <tr>
                        <th className="sticky left-0 z-30 bg-slate-50 border-r border-slate-200 p-2 min-w-[120px] max-w-[120px] text-left font-bold text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.02)] whitespace-nowrap">
                          氏名
                        </th>
                        {Array.from({ length: 7 }).map((_, i) => {
                          const date = dateFns.addDays(new Date(), i);
                          const dayStr = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
                          const displayDate = i === 0 ? '今日' : i === 1 ? '明日' : `${date.getMonth() + 1}/${date.getDate()}`;
                          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                          const colorClass = date.getDay() === 0 ? 'text-red-600' : date.getDay() === 6 ? 'text-blue-600' : 'text-slate-700';
                          return (
                            <th key={i} className={`p-1.5 border-r border-slate-200 min-w-[120px] max-w-[120px] text-center ${isWeekend ? 'bg-slate-100/50' : 'bg-transparent'}`}>
                              <div className="font-bold text-slate-800 text-[13px]">{displayDate}</div>
                              <div className={`text-[10px] font-medium leading-none mt-0.5 ${colorClass}`}>({dayStr})</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allWorkers.map(w => (
                        <tr key={w.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 p-2 align-middle min-w-[120px] max-w-[120px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                            <div className="font-bold text-slate-700 text-[12px] pl-1 truncate" title={w.name}>{w.name}</div>
                          </td>
                          {Array.from({ length: 7 }).map((_, i) => {
                            const date = dateFns.addDays(new Date(), i);
                            const dateStr = dateFns.format(date, 'yyyy-MM-dd');
                            const dayAssignments = allWorkersWeeklySchedules.filter(a => a.assignment_date === dateStr && a.worker_id === w.id);
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            
                            return (
                              <td key={dateStr} className={`p-1.5 border-r border-slate-100 align-top min-w-[120px] max-w-[120px] ${isWeekend ? 'bg-slate-50/50' : ''}`}>
                                <div className="flex flex-col gap-1 min-h-[36px]">
                                  {dayAssignments.length > 0 ? (
                                    dayAssignments.map(assignment => {
                                      const p = assignment.project;
                                      const isVacation = isVacationOrMisc(p);
                                      if (isVacation) {
                                          return (
                                              <div key={assignment.id} className="text-[10px] font-bold text-center py-1.5 px-1 bg-orange-50 text-orange-700 rounded-md border border-orange-200 shadow-[0_1px_1px_rgba(0,0,0,0.02)]">
                                                  休暇・不在
                                              </div>
                                          );
                                      }
                                      return (
                                        <div key={assignment.id} 
                                             className="text-[10px] bg-indigo-50 border border-indigo-100 rounded-md p-1.5 shadow-[0_1px_1px_rgba(0,0,0,0.02)] cursor-pointer hover:border-indigo-300 transition-colors flex flex-col gap-0.5"
                                             onClick={() => navigate('/projects/'+p?.id)}
                                        >
                                          <div className="flex items-center gap-1 shrink-0 overflow-hidden">
                                            {p?.project_number && (
                                              <span className="text-[8px] font-mono font-bold bg-indigo-100 text-indigo-700 px-1 rounded-[3px] leading-tight shrink-0">{p.project_number}</span>
                                            )}
                                            {formatSiteName(p) && (
                                              <span className="text-[8px] font-bold text-slate-500 truncate mt-[1px]" title={formatSiteName(p)}>
                                                {formatSiteName(p)}
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-bold text-slate-800 line-clamp-2 leading-tight mt-0.5" title={getProjectDisplayName(p)}>
                                            {p?.project_name || '未定'}
                                          </span>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="h-full flex items-center justify-center p-1 opacity-0 group-hover:opacity-30 transition-opacity">
                                      <span className="text-[10px] font-bold text-slate-400">-</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white border rounded-xl shadow-sm p-4 sm:p-5 overflow-x-auto">
                <div className="flex gap-4 min-w-max pb-2">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const date = dateFns.addDays(new Date(), i);
                    const dateStr = dateFns.format(date, 'yyyy-MM-dd');
                    const dayStr = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
                    const displayDate = i === 0 ? '今日' : i === 1 ? '明日' : `${date.getMonth() + 1}/${date.getDate()}(${dayStr})`;
                    
                    const dayAssignments = myWeeklySchedules.filter(a => a.assignment_date === dateStr);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    
                    return (
                      <div key={dateStr} className={`flex flex-col w-40 shrink-0 border rounded-lg overflow-hidden ${isWeekend ? 'bg-slate-50' : 'bg-white'}`}>
                        {/* Date Header */}
                        <div className={`text-center py-2 text-sm font-bold border-b ${
                          i === 0 ? 'bg-indigo-600 text-white border-indigo-700' :
                          i === 1 ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                          date.getDay() === 0 ? 'bg-red-50 text-red-600 border-red-100' :
                          date.getDay() === 6 ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {displayDate}
                        </div>
                        
                        {/* Content */}
                        <div className="p-3 flex-1 flex flex-col gap-2 min-h-[90px]">
                          {dayAssignments.length > 0 ? (
                            dayAssignments.map(assignment => {
                              const p = assignment.project;
                              const isVacation = isVacationOrMisc(p);
                              if (isVacation) {
                                  return (
                                      <div key={assignment.id} className="text-xs font-bold text-center py-2 bg-orange-50 text-orange-700 rounded-md border border-orange-200 shadow-sm mt-auto mb-auto">
                                          休暇・その他
                                      </div>
                                  );
                              }
                              return (
                                <div key={assignment.id} 
                                     className="text-xs bg-indigo-50 border border-indigo-100 rounded-md p-2 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors flex flex-col gap-1"
                                     onClick={() => navigate('/projects/'+p?.id)}
                                >
                                  <div className="flex items-center gap-1 shrink-0 overflow-hidden">
                                    {p?.project_number && (
                                      <span className="text-[9px] font-mono font-bold text-indigo-500 shrink-0">{p.project_number}</span>
                                    )}
                                    {formatSiteName(p) && (
                                      <span className="text-[9px] font-bold text-slate-400 truncate mt-0.5" title={formatSiteName(p)}>
                                        {formatSiteName(p)}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-bold text-slate-700 line-clamp-2 leading-tight" title={getProjectDisplayName(p)}>
                                    {p?.project_name || '未定'}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-slate-400 font-medium text-center flex-1 flex flex-col justify-center items-center py-2">
                              <span className="opacity-60">未定</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 今後の出社時間 */}
          {tomorrowPlans.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <CalendarClock className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-lg font-bold text-slate-800">
                    {currentHour < 12 ? '本日・今後の出社時間' : '今後の出社時間'}
                  </h2>
                </div>
                <div className="bg-white border rounded-xl shadow-sm p-4 sm:p-5">
                    <ul className="space-y-4">
                        {tomorrowPlans.map((plan: any, idx: number) => {
                            const pName = getProjectDisplayName(plan.project);
                            
                            let time = '未設定';
                            if (plan.arrival_time) {
                                const tParts = plan.arrival_time.split(':');
                                if (tParts.length >= 2) {
                                    time = `${tParts[0].padStart(2, '0')}:${tParts[1]}`;
                                } else {
                                    time = plan.arrival_time.substring(0, 5).replace(/:$/, '');
                                }
                            }

                            const workers = plan.workers || '人員未定';
                            let dateDisplay = '日付不明';
                            if (plan.schedule_date) {
                                const cleanDateStr = plan.schedule_date.replace(/\//g, '-');
                                const parts = cleanDateStr.split('-');
                                if (parts.length === 3) {
                                    const y = parseInt(parts[0], 10);
                                    const m = parseInt(parts[1], 10);
                                    const d = parseInt(parts[2], 10);
                                    const dateObj = new Date(y, m - 1, d);
                                    const dayStr = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
                                    dateDisplay = `${m}/${d}(${dayStr})`;
                                }
                            }

                            return (
                                <li key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                                    <div className="flex flex-col items-center min-w-[95px] shrink-0">
                                        <div className="text-sm font-black text-indigo-800 mb-1 tracking-wide bg-indigo-100 px-2.5 py-0.5 rounded-t-md w-full text-center border-b-2 border-indigo-200">
                                            {dateDisplay}
                                        </div>
                                        <div className="bg-indigo-600 text-white font-black px-4 py-2 rounded-b-lg text-xl sm:text-2xl w-full text-center tracking-widest shadow-md ring-1 ring-indigo-300">
                                            {time}
                                        </div>
                                    </div>
                                    <div className="flex flex-col w-full mt-1 sm:mt-0 sm:ml-4 justify-center">
                                        <div className="font-bold text-slate-800 text-base sm:text-lg w-full mb-1 flex items-center gap-1.5">
                                            <span className="text-slate-400 text-sm">👤</span>
                                            {workers}
                                        </div>
                                        <div className="text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 w-fit max-w-full truncate" title={pName}>
                                            {pName}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
              </section>
          )}

          {/* TO-DO & ALERTS */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              確認事項・アラート
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
              
              {/* Overdue Invoices Alert */}
              {hasBillingAccess && overdueInvoices.length > 0 && (
                <div className="p-4 bg-red-50/50 flex items-start gap-4">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-red-700">入金遅延のアラート ({overdueInvoices.length}件)</h3>
                    <p className="text-sm text-red-600 mt-1 mb-2">請求済ですが、予定日を過ぎても入金確認が取れていない案件があります。</p>
                    <button onClick={() => navigate('/billing')} className="text-xs font-bold text-red-700 bg-red-100 px-3 py-1.5 rounded-md hover:bg-red-200 transition-colors">
                      請求管理を確認する
                    </button>
                  </div>
                </div>
              )}

              {/* Today Schedule Alert */}
              {showTodayScheduleAlert && (
                <div className="p-4 flex items-start gap-4 border-b last:border-0 border-slate-100 bg-red-50/50">
                  <Clock className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-red-700">本日の日報 未提出</h3>
                    <p className="text-sm text-red-600 mt-1 mb-2">17:30を過ぎましたが、本日の現場スケジュールのうち、<strong>{missingTodayGroups.length}件</strong>の日報がまだ提出されていません。</p>
                    <ul className="mt-3 space-y-2">
                      {missingTodayGroups.map((group: any, idx: number) => {
                         const p = group.project;
                         const workers = group.workers.length > 0 ? group.workers.join(", ") : '人員指定なし';
                         return (
                           <li key={idx}>
                             <button
                               onClick={() => {
                                  const personnelData = group.workersRaw ? group.workersRaw.map((w: any) => ({ worker_id: w.id, worker_name: w.name })) : [];
                                  const subcontractorData = group.subcontractorsRaw ? group.subcontractorsRaw.map((s: any) => ({ subcontractor_name: s.name, worker_count: String(s.count) })) : [];
                                  const vehicleData = group.vehiclesRaw ? group.vehiclesRaw.map((v: any) => ({ vehicle_id: v.id, vehicle_name: v.vehicle_name })) : [];
                                  navigate(`/reports/new`, { 
                                      state: { 
                                          projectId: p.id,
                                          personnel: personnelData,
                                          passedSubcontractors: subcontractorData,
                                          vehicles: vehicleData,
                                          category: p.category
                                      } 
                                  });
                               }}
                               className="text-left w-full bg-white/70 hover:bg-white border border-red-200/60 hover:border-red-300 rounded-md px-3 py-2 text-sm transition-colors flex items-center justify-between shadow-sm"
                             >
                                <div className="flex flex-col gap-0.5 overflow-hidden w-full max-w-[calc(100%-80px)] pr-2">
                                  <span className="font-bold text-slate-700 truncate" title={getProjectDisplayName(p)}>{getProjectDisplayName(p)}</span>
                                  <span className="text-xs text-slate-500 font-medium truncate">人員: <span className="text-slate-600">{workers}</span></span>
                                </div>
                                <span className="text-red-600 font-bold text-[10px] bg-red-100/80 border border-red-200 px-2 py-1 rounded shrink-0 flex items-center gap-1">作成画面<span className="text-lg leading-none transform translate-y-[-1px]">&rarr;</span></span>
                             </button>
                           </li>
                         );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {/* Tomorrow Schedule Reminder (Missing Next Day Plan for Tomorrow's Schedule) */}
              {showTomorrowScheduleAlert && (
                <div className="p-4 flex items-start gap-4 border-b last:border-0 border-slate-100 bg-orange-50/50">
                  <Clock className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-orange-700">明日の予定（翌日予定）未作成</h3>
                    <p className="text-sm text-orange-600 mt-1 mb-2">15時を過ぎましたが、明日の配置スケジュールが組まれている現場のうち、<strong>{missingTomorrowGroups.length}件</strong>の明日分の翌日予定がまだ提出されていません。</p>
                    <ul className="mt-3 space-y-2">
                       {missingTomorrowGroups.map((group: any, idx: number) => {
                         const p = group.project;
                         const workers = group.workers.length > 0 ? group.workers.join(", ") : '人員指定なし';
                         return (
                           <li key={idx}>
                             <button
                               onClick={() => {
                                  const personnelData = group.workersRaw ? group.workersRaw.map((w: any) => ({ worker_id: w.id, worker_name: w.name })) : [];
                                  const subcontractorData = group.subcontractorsRaw ? group.subcontractorsRaw.map((s: any) => ({ subcontractor_name: s.name, worker_count: String(s.count) })) : [];
                                  const vehicleData = group.vehiclesRaw ? group.vehiclesRaw.map((v: any) => ({ vehicle_id: v.id, vehicle_name: v.vehicle_name })) : [];
                                  const tomorrowStr = dateFns.format(dateFns.addDays(new Date(), 1), "yyyy-MM-dd");
                                  navigate(`/tomorrow-schedules/new`, { 
                                      state: { 
                                          projectId: p.id,
                                          personnel: personnelData,
                                          passedSubcontractors: subcontractorData,
                                          vehicles: vehicleData,
                                          category: p.category,
                                          schedule_date: tomorrowStr
                                      } 
                                  });
                               }}
                               className="text-left w-full bg-white/70 hover:bg-white border border-orange-200/60 hover:border-orange-300 rounded-md px-3 py-2 text-sm transition-colors flex items-center justify-between shadow-sm"
                             >
                                <div className="flex flex-col gap-0.5 overflow-hidden w-full max-w-[calc(100%-80px)] pr-2">
                                  <span className="font-bold text-slate-700 truncate" title={getProjectDisplayName(p)}>{getProjectDisplayName(p)}</span>
                                  <span className="text-xs text-slate-500 font-medium truncate">人員: <span className="text-slate-600">{workers}</span></span>
                                </div>
                                <span className="text-orange-600 font-bold text-[10px] bg-orange-100/80 border border-orange-200 px-2 py-1 rounded shrink-0 flex items-center gap-1">作成画面<span className="text-lg leading-none transform translate-y-[-1px]">&rarr;</span></span>
                             </button>
                           </li>
                         );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {/* Completion Report Reminder */}
              {projectsNeedingCompletionReport.length > 0 && (
                <div className="p-4 flex items-start gap-4">
                  <FileCheck2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-700">完了報告待ちの案件 ({projectsNeedingCompletionReport.length}件)</h3>
                    <p className="text-sm text-slate-600 mt-1">進捗が100%に達していますが、完了報告書が未作成または未承認です。</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {projectsNeedingCompletionReport.slice(0, 3).map(p => (
                        <span key={p.id} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer hover:bg-amber-100" onClick={() => navigate(`/projects/${p.id}/edit`)}>
                          {getProjectDisplayName(p)}
                        </span>
                      ))}
                      {projectsNeedingCompletionReport.length > 3 && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium text-slate-500">他 {projectsNeedingCompletionReport.length - 3}件</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State for To-Do */}
              {!((hasBillingAccess && overdueInvoices.length > 0) || projectsNeedingCompletionReport.length > 0 || showTomorrowScheduleAlert || showTodayScheduleAlert) && (
                <div className="p-8 text-center text-slate-500 text-sm">
                  現在、対応が必要なアラートはありません。
                </div>
              )}
            </div>
          </section>

          {/* TODAY'S SCHEDULE */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                本日の現場スケジュール
              </h2>
              <button onClick={() => navigate('/schedule-management')} className="text-sm font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2">
                配員表を見る
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {todayScheduleGroups.length > 0 ? (
                todayScheduleGroups.map((schedGroup: any, idx: number) => {
                  const p = schedGroup.project || {};
                  const workers = schedGroup.workers.length > 0 ? schedGroup.workers.join(", ") : '-';
                  const vehicles = schedGroup.vehicles.length > 0 ? schedGroup.vehicles.join(", ") : '-';
                  const isVacation = p.project_number === 'VACATION' || p.project_name?.includes('休暇');
                  const reportId = submittedTodayReports[p.id];
                  const isSubmitted = !!reportId;
                  
                  return (
                    <div key={idx} 
                      className={`rounded-xl shadow-sm border p-4 transition-colors cursor-pointer ${
                        isVacation 
                          ? 'bg-orange-50/80 border-orange-200 hover:border-orange-300'
                          : isSubmitted 
                            ? 'bg-slate-50 border-emerald-200/60 opacity-90 hover:border-emerald-300' 
                            : 'bg-white border-slate-200 hover:border-blue-300'
                      }`} 
                      onClick={() => {
                        const personnelData = schedGroup.workersRaw ? schedGroup.workersRaw.map((w: any) => ({ worker_id: w.id, worker_name: w.name })) : [];
                        const subcontractorData = schedGroup.subcontractorsRaw ? schedGroup.subcontractorsRaw.map((s: any) => ({ subcontractor_name: s.name, worker_count: String(s.count) })) : [];
                        const vehicleData = schedGroup.vehiclesRaw ? schedGroup.vehiclesRaw.map((v: any) => ({ vehicle_id: v.id, vehicle_name: v.vehicle_name })) : [];
                        
                        if (isSubmitted) {
                            navigate(`/reports/${reportId}`, {
                                state: {
                                    personnel: personnelData,
                                    passedSubcontractors: subcontractorData,
                                    vehicles: vehicleData
                                }
                            });
                        } else {
                            navigate(`/reports/new`, { 
                                state: { 
                                    projectId: p.id,
                                    personnel: personnelData,
                                    passedSubcontractors: subcontractorData,
                                    vehicles: vehicleData,
                                    category: p.category
                                } 
                            });
                        }
                    }}>
                      <div className="flex items-center mb-3">
                         <div className="flex items-center gap-2 max-w-[calc(100%-70px)]">
                             <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${isVacation ? 'bg-orange-100/70 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {p.project_number || '番号なし'}
                             </span>
                             <span className={`font-bold text-sm truncate ${isVacation ? 'text-orange-900' : 'text-slate-700'}`} title={getProjectDisplayName(p)}>
                               {isVacation && <span className="text-orange-500 mr-1">■</span>}
                               {getProjectDisplayName(p)}
                             </span>
                         </div>
                         {isSubmitted && (
                             <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200/50">
                                 <CheckCircle2 className="w-3 h-3" />
                                 日報済
                             </span>
                         )}
                      </div>
                      <div className="space-y-1 mt-2">
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold text-slate-400 w-8 shrink-0">人員:</span>
                          <span className="text-xs text-slate-600 font-medium">{workers}</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold text-slate-400 w-8 shrink-0">車両:</span>
                          <span className="text-xs text-slate-600 font-medium">{vehicles}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-1 sm:col-span-2 bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  本日のスケジュールは登録されていません。
                </div>
              )}
            </div>
          </section>

          {/* TOMORROW'S SCHEDULE */}
          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                明日の現場スケジュール
              </h2>
              <button onClick={() => navigate('/schedule-management')} className="text-sm font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2">
                配員表を見る
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tomorrowScheduleGroups.length > 0 ? (
                tomorrowScheduleGroups.map((schedGroup: any, idx: number) => {
                  const p = schedGroup.project || {};
                  const workers = schedGroup.workers.length > 0 ? schedGroup.workers.join(", ") : '-';
                  const vehicles = schedGroup.vehicles.length > 0 ? schedGroup.vehicles.join(", ") : '-';
                  const isVacation = p.project_number === 'VACATION' || p.project_name?.includes('休暇');
                  const reportId = submittedTomorrowReports[p.id];
                  const isSubmitted = !!reportId;
                  
                  return (
                    <div key={idx} 
                      className={`rounded-xl shadow-sm border p-4 transition-colors cursor-pointer ${
                        isVacation 
                          ? 'bg-orange-50/80 border-orange-200 hover:border-orange-300'
                          : isSubmitted 
                            ? 'bg-slate-50 border-emerald-200/60 opacity-90 hover:border-emerald-300' 
                            : 'bg-white border-slate-200 hover:border-blue-300'
                      }`} 
                      onClick={() => {
                        const personnelData = schedGroup.workersRaw ? schedGroup.workersRaw.map((w: any) => ({ worker_id: w.id, worker_name: w.name })) : [];
                        const vehicleData = schedGroup.vehiclesRaw ? schedGroup.vehiclesRaw.map((v: any) => ({ vehicle_id: v.id, vehicle_name: v.vehicle_name })) : [];
                        if (isSubmitted) {
                            navigate(`/tomorrow-schedules/${reportId}`, {
                                state: {
                                    personnel: personnelData,
                                    vehicles: vehicleData
                                }
                            });
                        } else {
                            navigate(`/tomorrow-schedules/new`, { 
                                state: { 
                                    projectId: p.id,
                                    personnel: personnelData,
                                    vehicles: vehicleData,
                                    category: p.category,
                                    schedule_date: dateFns.format(dateFns.addDays(new Date(), 1), "yyyy-MM-dd")
                                } 
                            });
                        }
                    }}>
                      <div className="flex items-center mb-3">
                         <div className="flex items-center gap-2 max-w-[calc(100%-70px)]">
                             <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${isVacation ? 'bg-orange-100/70 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {p.project_number || '番号なし'}
                             </span>
                             <span className={`font-bold text-sm truncate ${isVacation ? 'text-orange-900' : 'text-slate-700'}`} title={getProjectDisplayName(p)}>
                               {isVacation && <span className="text-orange-500 mr-1">■</span>}
                               {getProjectDisplayName(p)}
                             </span>
                         </div>
                         {isSubmitted && (
                             <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200/50">
                                 <CheckCircle2 className="w-3 h-3" />
                                 予定済
                             </span>
                         )}
                      </div>
                      <div className="space-y-1 mt-2">
                        <div className="flex items-start gap-3">
                          <span className={`text-xs font-bold w-8 shrink-0 ${isVacation ? 'text-orange-600/70' : 'text-slate-400'}`}>人員:</span>
                          <span className={`text-xs font-medium ${isVacation ? 'text-orange-900' : 'text-slate-600'}`}>{workers}</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className={`text-xs font-bold w-8 shrink-0 ${isVacation ? 'text-orange-600/70' : 'text-slate-400'}`}>車両:</span>
                          <span className={`text-xs font-medium ${isVacation ? 'text-orange-900' : 'text-slate-600'}`}>{vehicles}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-1 sm:col-span-2 bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  明日のスケジュールはまだ登録されていません。
                </div>
              )}
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: Timeline & Activity */}
        <div className="col-span-1 lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-8 pt-8 lg:pt-0 space-y-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-600" />
            最近の日報・動き
          </h2>
          
          <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 pb-4">
            {recentReports.length > 0 ? (
              recentReports.map((report) => (
                <div key={report.id} className="relative pl-6">
                  {/* Timeline Dot */}
                  <div className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full -left-[7px] top-1.5 ring-4 ring-slate-50"></div>
                  
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600">
                      {dateFns.format(new Date(report.created_at), 'MM/dd HH:mm')}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {report.reporter_name || '不明'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1">{getProjectDisplayName(report.project)}</h4>
                  <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded border border-slate-100">
                    {report.work_content || '本文なし'}
                  </p>
                </div>
              ))
            ) : (
              <div className="pl-6 text-sm text-slate-500">最近の活動履歴はありません。</div>
            )}
            
          </div>
          
          <div className="pt-4 text-center">
            <button onClick={() => navigate('/reports')} className="text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors">
              すべての日報を見る →
            </button>
          </div>
        </div>
        
      </div>
      
    </div>
  )
}
