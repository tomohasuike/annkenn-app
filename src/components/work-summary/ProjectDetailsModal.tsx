import { useEffect, useState } from 'react';
import type { ProjectSummary } from '../../pages/work-summary/useWorkSummary';
import { X, CalendarDays, ExternalLink, Truck, Package, Info } from 'lucide-react';
import ReportDetailsModal from '../reports/ReportDetailsModal';
import { Link } from 'react-router-dom';

type ProjectDetailsModalProps = {
  project: ProjectSummary;
  onClose: () => void;
};

export default function ProjectDetailsModal({ project, onClose }: ProjectDetailsModalProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!project) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto" 
        onClick={onClose}
      >
        <div 
          className="bg-background rounded-xl shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden max-h-[90vh] border border-border/50 my-auto sm:my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b bg-card shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{project.kubun}</span>
                <span className="text-xs font-mono text-muted-foreground">{project.no || '番号未定'}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 tracking-tight">
                {project.name}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/projects/${project.id}`}
                className="hidden sm:flex bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium px-3 py-1.5 rounded-md items-center gap-2 transition-colors border"
              >
                 <Info className="w-4 h-4" /> 案件を編集
              </Link>
              <button 
                onClick={onClose}
                className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors focus:outline-none bg-muted/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 lg:space-y-8 bg-muted/10">
            
            {/* Top Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">合計 実働時間</span>
                <div className="text-3xl sm:text-4xl font-black text-primary tracking-tighter mt-auto">
                  {project.totalHours.toFixed(1)}<span className="text-sm sm:text-lg font-medium text-muted-foreground ml-1">h</span>
                </div>
                <div className="text-[10px] font-medium text-muted-foreground mt-2 flex gap-1.5">
                  <span className="bg-muted px-1.5 py-0.5 rounded">日中 {project.normalHours.toFixed(1)}h</span>
                  {project.overtimeHours > 0 && <span className="text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded font-bold">残業 {project.overtimeHours.toFixed(1)}h</span>}
                </div>
              </div>

              <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">工事区分 実働</span>
                <div className="text-2xl sm:text-3xl font-bold text-blue-600 tracking-tight mt-auto">
                  {project.breakdown.kouji.toFixed(1)}<span className="text-sm font-medium text-muted-foreground ml-1">h</span>
                </div>
                <div className="text-[10px] font-medium text-muted-foreground mt-2 flex gap-1.5">
                  <span className="bg-muted px-1.5 py-0.5 rounded">日中 {project.breakdownDetails.kouji.normal.toFixed(1)}h</span>
                  {project.breakdownDetails.kouji.ot > 0 && <span className="text-orange-600 font-bold">残業 {project.breakdownDetails.kouji.ot.toFixed(1)}h</span>}
                </div>
              </div>

              <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">管理区分 実働</span>
                <div className="text-2xl sm:text-3xl font-bold text-purple-600 tracking-tight mt-auto">
                  {project.breakdown.kanri.toFixed(1)}<span className="text-sm font-medium text-muted-foreground ml-1">h</span>
                </div>
                <div className="text-[10px] font-medium text-muted-foreground mt-2 flex gap-1.5">
                  <span className="bg-muted px-1.5 py-0.5 rounded">日中 {project.breakdownDetails.kanri.normal.toFixed(1)}h</span>
                  {project.breakdownDetails.kanri.ot > 0 && <span className="text-orange-600 font-bold">残業 {project.breakdownDetails.kanri.ot.toFixed(1)}h</span>}
                </div>
              </div>

              <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">作業員 / 協力会社</span>
                <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mt-auto flex items-baseline gap-2">
                  {project.staffCount} <span className="text-sm font-normal text-muted-foreground">/</span> {project.partnerCount}
                  <span className="text-[10px] font-medium text-muted-foreground ml-1">名</span>
                </div>
                <div className="text-[10px] font-medium text-muted-foreground mt-2">
                  日報記録: <span className="font-bold text-primary">{project.dailyLogs.length} 日分</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Filtered Daily Reports Table (Main Column) */}
              <div className="lg:col-span-2">
                <h3 className="font-bold mb-3 text-sm flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-primary" /> 日報エビデンス一覧
                </h3>
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                      <thead className="bg-muted/80 backdrop-blur-sm uppercase text-[10px] sm:text-[11px] text-muted-foreground border-b sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 font-bold">報告日</th>
                          <th className="px-3 py-3 font-bold">区分</th>
                          <th className="px-4 py-3 font-bold">作業員 (協力会社)</th>
                          <th className="px-4 py-3 text-center font-bold">実働 (日中 / 残業)</th>
                          <th className="px-4 py-3 font-bold">車両 / 建機</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y relative">
                        {project.dailyLogs.length > 0 ? project.dailyLogs.map((log: any, i: number) => (
                          <tr key={i} className="hover:bg-muted/40 transition-colors group">
                            <td className="px-4 py-3 font-medium whitespace-nowrap">
                              <button 
                                onClick={() => setSelectedReportId(log.reportId)}
                                className="inline-flex items-center gap-1.5 text-primary hover:text-blue-600 hover:underline transition-colors focus:outline-none font-bold"
                              >
                                {log.date}
                                <ExternalLink className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap"><span className="text-[10px] bg-secondary text-secondary-foreground border px-2 py-1 rounded font-bold">{log.kubun}</span></td>
                            <td className="px-4 py-3 font-bold text-foreground/90">
                              {log.staffs || '-'} 
                              {log.partners && <span className="text-orange-600 ml-1.5 text-[11px] font-medium bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">[{log.partners}]</span>}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap flex flex-col items-center">
                              <span className="font-bold text-primary text-sm sm:text-base">{log.hours.toFixed(1)}h</span>
                              <div className="text-[10px] text-muted-foreground mt-1 flex justify-center gap-1">
                                <span className="bg-muted px-1.5 py-0.5 rounded">日中 {(log.hours - log.ot).toFixed(1)}h</span>
                                {log.ot > 0 && <span className="text-orange-600 font-bold bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">残業 {log.ot.toFixed(1)}h</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs font-medium max-w-[150px] truncate" title={log.car ? `${log.car} / ${log.machine}` : ''}>
                              {log.car || '-'} <span className="text-muted/50 mx-1">/</span> {log.machine || '-'}
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground italic">日報の記録がありません</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Side Stats */}
              <div className="space-y-6">
                
                {/* Equipment Summary for Project */}
                <div>
                  <h4 className="font-bold mb-3 text-sm flex items-center gap-2">
                    <Truck className="w-4 h-4 text-teal-500" /> 利用車両・建機
                  </h4>
                  <div className="flex flex-col gap-2 bg-card p-4 rounded-xl border shadow-sm max-h-[250px] overflow-y-auto">
                    {Object.keys(project.equipment).length > 0
                        ? Object.entries(project.equipment).sort((a,b) => (b[1] as number)-(a[1] as number)).map(([eq, count]) => (
                            <div key={eq} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0 pt-2 first:pt-0">
                              <span className="font-bold text-foreground/80 truncate mr-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-teal-500 rounded-full shrink-0"></span> {eq}
                              </span>
                              <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-0.5 rounded-full font-bold text-[11px] whitespace-nowrap">{count as React.ReactNode} 台(日)</span>
                            </div>
                          ))
                        : <span className="text-sm text-muted-foreground italic">利用実績なし</span>}
                  </div>
                </div>

                {/* Materials Summary */}
                <div>
                  <h4 className="font-bold mb-3 text-sm flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-500" /> 使用材料
                  </h4>
                  <div className="flex flex-col gap-2 bg-card p-4 rounded-xl border shadow-sm max-h-[250px] overflow-y-auto">
                    {project.materials.length > 0
                        ? project.materials.map((mat: string, i: number) => (
                            <div key={i} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0 pt-2 first:pt-0">
                              <span className="font-bold text-foreground/80 truncate mr-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span> {mat}
                              </span>
                            </div>
                          ))
                        : <span className="text-sm text-muted-foreground italic">材料記録なし</span>}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Render the daily report modal ON TOP of this modal if a report is selected */}
      {selectedReportId && (
        <ReportDetailsModal 
          reportId={selectedReportId} 
          onClose={() => setSelectedReportId(null)} 
        />
      )}
    </>
  );
}
