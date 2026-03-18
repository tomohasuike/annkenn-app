import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ShieldCheck, HardHat, FileText, AlertTriangle, CheckCircle2, FileCheck2, Loader2, JapaneseYen, Clock, LayoutDashboard } from "lucide-react"
import { supabase } from "../lib/supabase"
import * as dateFns from "date-fns"

// Utility to format numbers with commas
const toFormattedString = (num: number | undefined | null) => {
  if (num === undefined || num === null) return "";
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // User Info & Permissions
  const [allowedApps, setAllowedApps] = useState<string[]>([]);
  const hasBillingAccess = allowedApps.includes('billing') || allowedApps.includes('schedule-admin'); // Assume schedule-admin is full admin

  // Data States
  const [todaySchedules, setTodaySchedules] = useState<any[]>([]);
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  
  // Billing States
  const [expectedBillingAmount, setExpectedBillingAmount] = useState(0);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);

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
        .select('allowed_apps, is_admin')
        .eq('email', user.email)
        .single();
      
      const permissions = workerData?.allowed_apps || [];
      setAllowedApps(permissions);
      const canViewBilling = permissions.includes('billing') || workerData?.is_admin;

      const todayStr = dateFns.format(new Date(), 'yyyy-MM-dd');
      const startOfMonthStr = dateFns.format(dateFns.startOfMonth(new Date()), 'yyyy-MM-dd');
      const endOfMonthStr = dateFns.format(dateFns.endOfMonth(new Date()), 'yyyy-MM-dd');

      // 2. Fetch Assignments for Today
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
          project:projects ( id, project_name, site_name, project_number )
        `)
        .eq('assignment_date', todayStr);
      setTodaySchedules(schedules || []);

      // 3. Fetch Active Projects (着工中)
      const { data: projects } = await supabase
        .from('projects')
        .select('id, project_name, site_name, project_number, status_flag')
        .eq('status_flag', '着工中');
      setActiveProjects(projects || []);

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
          project:projects ( project_name, site_name )
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentReports(reports || []);

      // 5. Fetch Billing Data if authorized
      if (canViewBilling) {
        // Fetch all open billing details
        const { data: billingDetails } = await supabase
          .from('invoice_details')
          .select('id, amount, billing_date, expected_deposit_date, details_status')
          .not('details_status', 'eq', '完了')
          .not('details_status', 'eq', '入金済');
        
        let expectedAmount = 0;
        let overdue: any[] = [];

        if (billingDetails) {
          billingDetails.forEach(bd => {
            // Add to expected amount only if it's billed in the current month
            if (bd.billing_date >= startOfMonthStr && bd.billing_date <= endOfMonthStr) {
              expectedAmount += bd.amount || 0;
            }

            // Check if overdue: status is 請求済 and expected deposit date has passed
            if (bd.expected_deposit_date && bd.expected_deposit_date < todayStr && bd.details_status === '請求済') {
              overdue.push(bd);
            }
          });
        }
        setExpectedBillingAmount(expectedAmount);
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
  const projectsNeedingCompletionReport = activeProjects.filter(() => false);
  const activeSchedulesCount = new Set(todaySchedules.filter(s => s.project_id).map(s => s.project_id)).size;

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
            <p className="text-2xl font-black text-slate-800">{activeProjects.length} <span className="text-base font-medium text-slate-500">件</span></p>
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
              <JapaneseYen className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">今月の請求予定額</p>
              <p className="text-2xl font-black text-slate-800">¥ {toFormattedString(expectedBillingAmount)}</p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl border border-dashed border-slate-200 p-6 flex items-center justify-center opacity-70">
            <p className="text-sm text-slate-500">※経理・請求情報は表示されません</p>
          </div>
        )}
      </div>

      {/* MAIN CONTENT SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Actions & Alerts */}
        <div className="col-span-1 lg:col-span-2 space-y-8">
          
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
                          {p.project_name}
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
              {!((hasBillingAccess && overdueInvoices.length > 0) || projectsNeedingCompletionReport.length > 0) && (
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
              {todaySchedules.length > 0 ? (
                Object.values(todaySchedules.reduce((acc, curr) => {
                  const pid = curr.project?.id || 'unknown';
                  if (!acc[pid]) acc[pid] = { project: curr.project, workers: [], vehicles: [] };
                  const wName = Array.isArray(curr.worker_master) ? curr.worker_master[0]?.name : curr.worker_master?.name;
                  const vName = Array.isArray(curr.vehicle_master) ? curr.vehicle_master[0]?.vehicle_name : curr.vehicle_master?.vehicle_name;
                  if (wName) acc[pid].workers.push(wName);
                  if (vName) acc[pid].vehicles.push(vName);
                  return acc;
                }, {} as any)).map((schedGroup: any, idx) => {
                  const p = schedGroup.project || {};
                  const workers = schedGroup.workers.length > 0 ? schedGroup.workers.join(", ") : '-';
                  const vehicles = schedGroup.vehicles.length > 0 ? schedGroup.vehicles.join(", ") : '-';
                  
                  return (
                    <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => navigate(`/projects/${p.id}/edit`)}>
                      <div className="flex items-center gap-2 mb-2">
                         <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            {p.project_number || '番号なし'}
                         </span>
                         <span className="font-bold text-sm text-slate-800 truncate" title={p.project_name}>{p.project_name}</span>
                      </div>
                      <div className="space-y-1.5 mt-3">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-slate-400 w-10 shrink-0">人員:</span>
                          <span className="text-xs text-slate-700">{workers}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-slate-400 w-10 shrink-0">車両:</span>
                          <span className="text-xs text-slate-700">{vehicles}</span>
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
                  <h4 className="text-sm font-bold text-slate-800 mb-1">{report.project?.project_name || '案件名不明'}</h4>
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
