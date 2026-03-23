import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  ShieldAlert,
  Download,
  Activity,
  RefreshCw,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Mail
} from 'lucide-react';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import generatePDF, { Resolution, Margin } from 'react-to-pdf';

interface Worker {
  id: string;
  name: string;
  email?: string;
}

type SafetyStatus = '無事' | '軽傷' | '重傷';

interface SafetyReport {
  id: string;
  worker_id: string;
  worker_name: string;
  status: SafetyStatus;
  family_status: string;
  house_status: string;
  location: string;
  memo: string;
  created_at: string;
}

interface NotificationEvent {
  id: string;
  type: string;
  sent_at: string;
}

interface AppSettings {
  id: string;
  safety_webhook_url: string;
  safety_app_url: string;
}

export default function SafetyDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rawReports, setRawReports] = useState<SafetyReport[]>([]);
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Sending notification state
  const [sendingAlert, setSendingAlert] = useState(false);
  const [modalMessage, setModalMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const pdfTargetRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      
      // 1. Fetch Workers (Exclude subcontractors: 協力会社)
      const { data: workerData, error: workerErr } = await supabase
        .from('worker_master')
        .select('id, name, email')
        .neq('type', '協力会社')
        .order('name');
      if (workerErr) throw workerErr;
      setWorkers(workerData || []);

      // 2. Fetch Notification History (Events)
      const { data: eventData, error: eventErr } = await supabase
        .from('safety_notification_history')
        .select('id, type, sent_at')
        .order('sent_at', { ascending: false });
      if (eventErr) throw eventErr;
      
      const historyEvents = eventData || [];
      setEvents(historyEvents);
      
      // Auto-select latest event if available and none selected
      if (selectedEventId === 'all' && historyEvents.length > 0) {
        setSelectedEventId(historyEvents[0].id);
      }

      // 3. Fetch All Reports
      const { data: reportData, error: reportErr } = await supabase
        .from('safety_reports')
        .select(`
          id, worker_id, status, family_status, house_status, location, memo, created_at,
          worker_master ( name )
        `)
        .order('created_at', { ascending: false });
      if (reportErr) throw reportErr;

      const formattedReports: SafetyReport[] = (reportData || []).map(r => ({
        id: r.id,
        worker_id: r.worker_id,
        worker_name: (r.worker_master as unknown as { name: string })?.name || '不明',
        status: r.status as SafetyStatus,
        family_status: r.family_status,
        house_status: r.house_status,
        location: r.location,
        memo: r.memo,
        created_at: r.created_at
      }));
      setRawReports(formattedReports);

      // 4. Fetch Settings
      const { data: settingData } = await supabase.from('app_settings').select('*').limit(1).single();
      if (settingData) setSettings(settingData);

    } catch (err) {
      console.error('Error fetching safety dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Computed properties based on selected event
  const computeAggregatedData = () => {
    let targetReports = rawReports;

    if (selectedEventId !== 'all') {
      const selectedEventIndex = events.findIndex(e => e.id === selectedEventId);
      if (selectedEventIndex !== -1) {
        const selectedEvent = events[selectedEventIndex];
        const startTime = new Date(selectedEvent.sent_at).getTime();
        // The end time is the sent_at of the NEXT event (which is at index - 1 because array is DESC)
        let endTime = new Date('2099-12-31').getTime(); 
        if (selectedEventIndex > 0) {
          endTime = new Date(events[selectedEventIndex - 1].sent_at).getTime();
        }

        targetReports = rawReports.filter(r => {
          const t = new Date(r.created_at).getTime();
          return t >= startTime && t < endTime;
        });
      }
    }

    // Get latest report per worker in this window
    const latestReportsMap = new Map<string, SafetyReport>();
    targetReports.forEach(r => {
      // Since rawReports is ordered DESC, the first one we encounter is the oldest if we iterate forward...
      // Actually, since it's DESC, iterating from 0 to N means we see the LATEST first.
      if (!latestReportsMap.has(r.worker_id)) {
        latestReportsMap.set(r.worker_id, r);
      }
    });

    const activeReports = Array.from(latestReportsMap.values());
    const confirmedWorkerIds = new Set(activeReports.map(r => r.worker_id));
    const unconfirmedWorkers = workers.filter(w => !confirmedWorkerIds.has(w.id));

    const stats = {
      total: workers.length,
      replied: activeReports.length,
      safe: activeReports.filter(r => r.status === '無事').length,
      minor: activeReports.filter(r => r.status === '軽傷').length,
      major: activeReports.filter(r => r.status === '重傷').length,
      unconfirmed: unconfirmedWorkers.length
    };

    return { activeReports, unconfirmedWorkers, stats };
  };

  const { activeReports, unconfirmedWorkers, stats } = computeAggregatedData();

  // Send Chat Notification
  const sendNotification = async (type: 'test' | 'emergency') => {
    if (!settings || !settings.safety_webhook_url) {
      setModalMessage({ type: 'error', text: 'Webhook URLが設定されていません。設定画面から登録してください。' });
      return;
    }

    setSendingAlert(true);

    const isEmergency = type === 'emergency';
    const messageText = isEmergency
      ? `<users/all> 【緊急】安否確認のお願い\n災害等が発生しました。直ちに以下のURLより安否状況を報告してください。\n\n${settings.safety_app_url || window.location.origin + '/safety-report'}`
      : `【テスト配信】安否確認システムの動作テストです。\n以下のURLから安否状況を報告してください。\n\n${settings.safety_app_url || window.location.origin + '/safety-report'}`;

    try {
      const res = await fetch(settings.safety_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageText }),
      });

      if (!res.ok) throw new Error(`送信失敗: ${res.statusText}`);

      await supabase
        .from('safety_notification_history')
        .insert([{ type: isEmergency ? '本番（緊急）' : 'テスト送信' }]);

      setModalMessage({ type: 'success', text: `${isEmergency ? '緊急' : 'テスト'}通知を送信しました。` });
      fetchData(); // Refresh to show new event
    } catch (err: any) {
      setModalMessage({ type: 'error', text: `エラーが発生しました: ${err.message}` });
    } finally {
      setSendingAlert(false);
    }
  };

  const executeDelete = async () => {
    if (selectedEventId === 'all') return;

    try {
      const { error } = await supabase
        .from('safety_notification_history')
        .delete()
        .eq('id', selectedEventId);
        
      if (error) throw error;
      
      setModalMessage({ type: 'success', text: '通知履歴を削除しました。' });
      setSelectedEventId('all');
      fetchData();
    } catch (err: any) {
      setModalMessage({ type: 'error', text: `削除エラー: ${err.message}` });
    }
  };

  const handleSendReminderEmail = () => {
    const emails = unconfirmedWorkers
      .map(w => w.email)
      .filter((e): e is string => !!e && e.trim() !== '');

    if (emails.length === 0) {
      alert('未回答の作業員に有効なメールアドレスが登録されていません。別途作業員マスタをご確認ください。');
      return;
    }

    const bcc = emails.join(',');
    const subject = encodeURIComponent('【再送】安否確認のお願い');
    const bodyText = `未回答の方への再通知です。\n以下のURLより速やかにご自身の安否状況を報告してください。\n\n${settings?.safety_app_url || window.location.origin + '/safety-report'}`;
    const body = encodeURIComponent(bodyText);

    // Open default mail client
    window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
  };

  const handlePdfExport = async () => {
    const target = pdfTargetRef.current;
    if (!target) return;

    // To prevent html2canvas from clipping scrolled content, temporarily disable parent overflow and height limits
    const parents: {el: HTMLElement, overflow: string, height: string, position: string}[] = [];
    let curr = target.parentElement;
    while(curr && curr !== document.body) {
      parents.push({
        el: curr,
        overflow: curr.style.overflow,
        height: curr.style.height,
        position: curr.style.position
      });
      curr.style.setProperty('overflow', 'visible', 'important');
      curr.style.setProperty('height', 'auto', 'important');
      curr.style.setProperty('position', 'static', 'important');
      curr = curr.parentElement;
    }

    try {
      // Small delay to allow browser to calculate layout
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await generatePDF(() => target, {
        filename: `安否確認レポート_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`,
        page: { format: 'A4', margin: Margin.MEDIUM },
        resolution: Resolution.HIGH,
        canvas: {
          logging: false,
          useCORS: true
        },
        overrides: {
          canvas: {
            windowHeight: target.scrollHeight,
            scrollY: -window.scrollY // Reset scroll position for capture
          }
        }
      });
    } catch (error) {
       console.error("PDF generation failed:", error);
       setModalMessage({ type: 'error', text: 'PDF出力中にエラーが発生しました。' });
    } finally {
      // Restore original styles
      parents.forEach(p => {
        p.el.style.overflow = p.overflow;
        p.el.style.height = p.height;
        p.el.style.position = p.position;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  // Chart Data
  const responseChartData = [
    { name: '回答済', value: stats.replied, color: '#3B82F6' }, // Blue
    { name: '未回答', value: stats.unconfirmed, color: '#CBD5E1' } // Slate-300
  ];

  const safetyChartData = [
    { name: '無事', value: stats.safe, color: '#22C55E' }, // Green
    { name: '軽傷', value: stats.minor, color: '#EAB308' }, // Yellow
    { name: '重傷', value: stats.major, color: '#EF4444' } // Red
  ];

  // Custom Legends
  const renderResponseLegend = () => (
    <div className="flex justify-center gap-4 mt-2 text-xs text-slate-600 font-bold">
      <div className="flex items-center gap-1"><div className="w-4 h-2 bg-blue-500 rounded-sm"></div> 回答済</div>
      <div className="flex items-center gap-1"><div className="w-4 h-2 bg-slate-300 rounded-sm"></div> 未回答</div>
    </div>
  );

  const renderSafetyLegend = () => (
    <div className="flex justify-center gap-4 mt-2 text-xs text-slate-600 font-bold">
      <div className="flex items-center gap-1"><div className="w-4 h-2 bg-green-500 rounded-sm"></div> 無事</div>
      <div className="flex items-center gap-1"><div className="w-4 h-2 bg-yellow-500 rounded-sm"></div> 軽傷</div>
      <div className="flex items-center gap-1"><div className="w-4 h-2 bg-red-500 rounded-sm"></div> 重傷</div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-screen">
      
      {/* Main Container for PDF Export */}
      <div ref={pdfTargetRef} className="max-w-7xl mx-auto space-y-6 flex flex-col items-center">
        
        {/* Header Bar */}
        <div className="w-full bg-white rounded-xl shadow-sm border p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">安否確認ダッシュボード</h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide">管理者権限でアクセス中</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto overflow-x-auto print-hidden">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 shadow-sm shrink-0">
              <span className="text-xs font-bold text-slate-600 whitespace-nowrap">集計対象:</span>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-800 outline-none w-full sm:w-auto cursor-pointer"
              >
                <option value="all">最新の回答状況（全期間）</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {format(new Date(ev.sent_at), 'yyyy/MM/dd HH:mm')} ({ev.type.includes('テスト') ? 'テスト' : '緊急'})
                  </option>
                ))}
              </select>
              {selectedEventId !== 'all' && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="この履歴を削除"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            
            <button 
              onClick={handlePdfExport}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
              data-html2canvas-ignore="true"
            >
              <Download size={16} />
              PDF出力
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (window.confirm('テスト通知を送信します。よろしいですか？')) sendNotification('test');
              }}
              disabled={sendingAlert}
              className="flex items-center gap-2 px-5 py-2 bg-slate-200 text-slate-600 font-bold rounded-lg shadow-sm hover:bg-slate-300 transition-colors shrink-0 text-sm"
              data-html2canvas-ignore="true"
            >
              <Edit3 size={16} />
              テスト通知を送る
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (window.confirm('緊急安否確認通知を送信します。よろしいですか？')) sendNotification('emergency');
              }}
              disabled={sendingAlert}
              className="flex items-center gap-2 px-5 py-2 bg-[#dc2626] text-white font-bold rounded-lg shadow-sm hover:bg-red-700 transition-colors shrink-0 text-sm"
              data-html2canvas-ignore="true"
            >
              <ShieldAlert size={16} />
              緊急安否確認を送る
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="w-full grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow-sm border py-5 px-6 border-l-[6px] border-l-slate-400">
            <div className="text-xs font-bold text-slate-500 mb-1">全社員数</div>
            <div className="text-4xl font-black text-slate-800 tracking-tight">{stats.total}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border py-5 px-6 border-l-[6px] border-l-blue-500">
            <div className="text-xs font-bold text-slate-500 mb-1">回答済</div>
            <div className="text-4xl font-black text-blue-600 tracking-tight">{stats.replied}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border py-5 px-6 border-l-[6px] border-l-green-500">
            <div className="text-xs font-bold text-slate-500 mb-1">無事</div>
            <div className="text-4xl font-black text-green-500 tracking-tight">{stats.safe}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border py-5 px-6 border-l-[6px] border-l-yellow-400">
            <div className="text-xs font-bold text-slate-500 mb-1">軽傷</div>
            <div className="text-4xl font-black text-yellow-500 tracking-tight">{stats.minor}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border py-5 px-6 border-l-[6px] border-l-red-500">
            <div className="text-xs font-bold text-slate-500 mb-1">重傷</div>
            <div className="text-4xl font-black text-red-600 tracking-tight">{stats.major}</div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border pt-5 pb-6 px-6 flex flex-col items-center">
            <h3 className="w-full text-sm font-bold text-slate-700 mb-4">回答状況</h3>
            <div className="h-64 w-full flex justify-center items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={responseChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {responseChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => [`${value}名`, '人数']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {renderResponseLegend()}
          </div>

          <div className="bg-white rounded-xl shadow-sm border pt-5 pb-6 px-6 flex flex-col items-center">
            <h3 className="w-full text-sm font-bold text-slate-700 mb-4">安否状況 (回答者内)</h3>
            <div className="h-64 w-full flex justify-center items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={safetyChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {safetyChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => [`${value}名`, '人数']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {renderSafetyLegend()}
          </div>
        </div>

        {/* Tables Row */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Confirmed List */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border flex flex-col overflow-hidden">
             <div className="px-5 py-4 bg-slate-50 border-b flex justify-between items-center">
               <h3 className="text-sm font-bold text-slate-800">該当期間の回答状況</h3>
               <button onClick={fetchData} className="text-slate-400 hover:text-blue-500" title="更新" data-html2canvas-ignore="true">
                 <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
               </button>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left border-collapse">
                 <thead className="bg-white sticky top-0 z-10 text-slate-500 text-xs font-bold border-b">
                   <tr>
                     <th className="px-5 py-3">氏名</th>
                     <th className="px-4 py-3 text-center">本人</th>
                     <th className="px-4 py-3 text-center">家族</th>
                     <th className="px-4 py-3 text-center">住居</th>
                     <th className="px-4 py-3">現在地</th>
                     <th className="px-4 py-3 hidden md:table-cell">報告内容</th>
                     <th className="px-5 py-3 text-right">報告日時</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {activeReports.length > 0 ? activeReports.map(report => (
                     <tr key={report.id} className="hover:bg-slate-50">
                       <td className="px-5 py-3 font-bold text-slate-800 whitespace-nowrap">
                         {report.worker_name}
                       </td>
                       <td className="px-4 py-3 text-center">
                         <span className={`inline-block px-3 py-1 text-xs font-black rounded ${
                           report.status === '無事' ? 'bg-green-100 text-green-700' :
                           report.status === '軽傷' ? 'bg-yellow-100 text-yellow-800' :
                           'bg-red-100 text-red-700'
                         }`}>
                           {report.status}
                         </span>
                       </td>
                       <td className="px-4 py-3 text-center text-slate-600 text-xs whitespace-nowrap">
                         {report.family_status}
                       </td>
                       <td className="px-4 py-3 text-center text-slate-600 text-xs whitespace-nowrap">
                         {report.house_status}
                       </td>
                       <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[100px]" title={report.location}>
                         {report.location}
                       </td>
                       <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[150px] hidden md:table-cell" title={report.memo}>
                         {report.memo || '-'}
                       </td>
                       <td className="px-5 py-3 text-right text-slate-400 text-xs whitespace-nowrap">
                         {format(new Date(report.created_at), 'MM/dd HH:mm')}
                       </td>
                     </tr>
                   )) : (
                     <tr>
                        <td colSpan={7} className="text-center py-10 text-slate-400 text-sm font-medium">
                           該当する報告データはありません
                        </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </div>

          {/* Unconfirmed List */}
          <div className="bg-red-50 rounded-xl shadow-sm border border-red-100 flex flex-col overflow-hidden">
            <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
               <h3 className="text-sm font-bold text-red-800 tracking-wide">未回答者</h3>
               <div className="flex items-center gap-2">
                 <button 
                   onClick={handleSendReminderEmail}
                   className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-700 hover:bg-red-100 rounded-md text-xs font-bold transition-colors shadow-sm"
                   title="未回答者に一斉メール（BCC）を送信"
                 >
                   <Mail size={14} />
                   再通知メール
                 </button>
                 <span className="bg-red-200 text-red-800 text-xs font-black px-2.5 py-1 rounded-full">{unconfirmedWorkers.length} 名</span>
               </div>
            </div>
            <div className="p-3">
              {unconfirmedWorkers.length > 0 ? (
                <ul className="space-y-1">
                  {unconfirmedWorkers.map(worker => (
                    <li key={worker.id} className="px-3 py-2 hover:bg-red-100 rounded-lg flex items-center gap-3 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-500 font-bold text-xs shrink-0 shadow-sm border border-red-100">
                        {worker.name.charAt(0)}
                      </div>
                      <span className="font-bold text-slate-700 text-sm tracking-wide">{worker.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="h-full flex items-center justify-center text-red-400 font-bold text-sm p-4 text-center">
                  全員の報告が完了しています
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Result Modal */}
      {modalMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 print-hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className={`p-4 flex items-center gap-3 border-b ${modalMessage.type === 'success' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <div className={`p-2 rounded-full ${modalMessage.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {modalMessage.type === 'success' ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
              </div>
              <h3 className={`font-bold text-lg ${modalMessage.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                {modalMessage.type === 'success' ? '送信完了' : '送信失敗'}
              </h3>
            </div>
            <div className="p-6 text-slate-700 font-medium leading-relaxed">
              {modalMessage.text}
            </div>
            <div className="px-6 pb-6 flex justify-end">
              <button 
                type="button"
                onClick={() => setModalMessage(null)}
                className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
              >
                確認 (OK)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 print-hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 flex items-center gap-3 border-b bg-red-50 border-red-100">
              <div className="p-2 rounded-full bg-red-100 text-red-600">
                <Trash2 size={24} />
              </div>
              <h3 className="font-bold text-lg text-red-800">
                履歴の削除
              </h3>
            </div>
            <div className="p-6 text-slate-700 font-medium leading-relaxed break-words">
              選択中の通知履歴を削除します。よろしいですか？<br/>
              <span className="text-sm text-red-500 mt-2 block font-bold text-left">
                ※ 本番（緊急）の履歴は削除しないことをおすすめします。
              </span>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              >
                キャンセル
              </button>
              <button 
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  executeDelete();
                }}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Trash2 size={16} />
                <span>削除する</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
