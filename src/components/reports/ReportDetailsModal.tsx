import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Loader2, Calendar, Clock, MapPin, Users, Truck, Package, Image as ImageIcon, FileText, CheckCircle2, Edit } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Link } from 'react-router-dom';

type ReportDetailsModalProps = {
  reportId: string;
  onClose: () => void;
};

export default function ReportDetailsModal({ reportId, onClose }: ReportDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function fetchReportDetails() {
      setLoading(true);
      try {
        // Fetch main report info
        const { data: report, error } = await supabase
          .from('daily_reports')
          .select(`
            id, report_date, work_category, start_time, end_time, progress, work_content, notes, reporter_name, site_photos,
            projects (project_name, project_number, site_name, category)
          `)
          .eq('id', reportId)
          .single();

        if (error) throw error;

        // Fetch related data
        const { data: personnel } = await supabase.from('report_personnel').select('worker_name, worker_master(name)').eq('report_id', reportId);
        const { data: subcontractors } = await supabase.from('report_subcontractors').select('subcontractor_name, worker_count').eq('report_id', reportId);
        const { data: vehicles } = await supabase.from('report_vehicles').select('vehicle_name, vehicle_master(vehicle_name)').eq('report_id', reportId);
        const { data: machinery } = await supabase.from('report_machinery').select('machinery_name, vehicle_master(vehicle_name)').eq('report_id', reportId);
        const { data: materials } = await supabase.from('report_materials').select('*').eq('report_id', reportId);

        // Process photos
        let photos: string[] = [];
        if (report.site_photos) {
          try {
            const parsed = JSON.parse(report.site_photos);
            photos = Array.isArray(parsed) ? parsed : [report.site_photos];
          } catch(e) {
            photos = report.site_photos.includes(',') ? report.site_photos.split(',') : [report.site_photos];
          }
        }

        // Process materials photos and docs
        const processedMaterials = materials?.map((m: any) => {
          let mPhotos = [];
          try { if (m.photo) mPhotos = JSON.parse(m.photo); } catch(e) { if(m.photo) mPhotos = [m.photo]; }
          let mDocs = [];
          try { if (m.documentation) mDocs = JSON.parse(m.documentation); } catch(e) { if(m.documentation) mDocs = [m.documentation]; }
          
          return {
            ...m,
            parsedPhotos: Array.isArray(mPhotos) ? mPhotos : [],
            parsedDocs: Array.isArray(mDocs) ? mDocs : []
          };
        }) || [];

        setData({
          ...report,
          personnel: personnel || [],
          subcontractors: subcontractors || [],
          vehicles: vehicles || [],
          machinery: machinery || [],
          materials: processedMaterials,
          photos: photos
        });

      } catch (err) {
        console.error('Failed to fetch report details', err);
      } finally {
        setLoading(false);
      }
    }

    if (reportId) {
      fetchReportDetails();
    }
  }, [reportId]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!reportId) return null;

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      if (dateString.includes('T')) {
        return format(parseISO(dateString), 'yyyy年MM月dd日 (E)', { locale: ja });
      }
      return format(new Date(dateString), 'yyyy年MM月dd日 (E)', { locale: ja });
    } catch (e) {
      return dateString.split('T')[0];
    }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    try {
      if (timeString.includes('T')) {
        return format(parseISO(timeString), 'HH:mm');
      }
      return timeString;
    } catch(e) {
      return timeString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div 
        className="bg-background rounded-xl shadow-xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh] border my-auto sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b bg-card shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" /> 日報詳細
            </h2>
          </div>
          <div className="flex items-center gap-3">
             {data && (
               <Link 
                 to={`/reports/${reportId}`} 
                 className="hidden sm:flex bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium px-3 py-1.5 rounded-md items-center gap-2 transition-colors border"
               >
                 <Edit className="w-4 h-4" /> 編集画面へ
               </Link>
             )}
             <button 
               onClick={onClose}
               className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors focus:outline-none"
             >
               <X className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p>データを読み込み中...</p>
            </div>
          ) : data ? (
            <>
              {/* Project & Basic Info */}
              <div className="bg-card border rounded-lg p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                  <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-2 border-b pb-4 mb-2">
                     <span className="text-[10px] font-bold bg-muted px-2 py-1 rounded-sm uppercase tracking-wider whitespace-nowrap">案件名</span>
                     <span className="text-lg font-bold">
                       {Array.isArray(data.projects) ? data.projects[0]?.project_name : data.projects?.project_name || '不明な案件'}
                     </span>
                     <span className="text-sm text-muted-foreground hidden sm:inline">/</span>
                     <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                       <MapPin className="w-4 h-4" /> {Array.isArray(data.projects) ? data.projects[0]?.site_name : data.projects?.site_name || '場所未設定'}
                     </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">報告日</span>
                    <p className="font-bold text-base">{formatDate(data.report_date)}</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">作業区分</span>
                    <p className="font-medium">
                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm font-bold border border-primary/20">
                        {data.work_category || '不明'}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">作業時間</span>
                    <p className="font-bold text-base flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {formatTime(data.start_time)} <span className="text-muted-foreground font-normal mx-1">〜</span> {formatTime(data.end_time)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">報告者</span>
                    <p className="font-medium text-sm flex items-center gap-1.5">
                       <div className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                         {data.reporter_name ? data.reporter_name.substring(0,1) : '?'}
                       </div>
                       {data.reporter_name || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Work Details & Progress */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="md:col-span-2 space-y-6">
                    {/* Work Content */}
                    <div>
                      <h3 className="font-bold flex items-center gap-2 mb-3 text-sm">
                        <FileText className="w-4 h-4 text-primary" /> 作業内容
                      </h3>
                      <div className="bg-muted/30 border rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed min-h-[100px]">
                        {data.work_content || <span className="text-muted-foreground italic">記載なし</span>}
                      </div>
                    </div>
                    
                    {/* Notes */}
                    {data.notes && (
                      <div>
                        <h3 className="font-bold flex items-center gap-2 mb-3 text-sm text-amber-600">
                          <CheckCircle2 className="w-4 h-4" /> 備考 / 申し送り事項
                        </h3>
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm text-amber-900 whitespace-pre-wrap">
                          {data.notes}
                        </div>
                      </div>
                    )}
                 </div>

                 {/* Progress & Personnel */}
                 <div className="space-y-6">
                    {/* Progress */}
                    <div className="bg-card border rounded-lg p-4 shadow-sm text-center">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">工事進捗</span>
                      <div className="text-4xl font-black text-primary tracking-tighter mb-2">{data.progress || 0}<span className="text-xl font-medium text-muted-foreground ml-1">%</span></div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: `${data.progress || 0}%` }}></div>
                      </div>
                    </div>

                    {/* Personnel & Subcontractors */}
                    <div>
                      <h3 className="font-bold flex items-center gap-2 mb-3 text-sm">
                        <Users className="w-4 h-4 text-blue-500" /> 作業員・協力会社
                      </h3>
                      <div className="space-y-2">
                        {data.personnel.length > 0 ? (
                           data.personnel.map((p: any, i: number) => {
                             const name = p.worker_master ? (Array.isArray(p.worker_master) ? p.worker_master[0]?.name : p.worker_master.name) : p.worker_name;
                             return (
                               <div key={`p-${i}`} className="flex items-center justify-between text-sm bg-card border rounded-md px-3 py-2 shadow-sm">
                                 <span className="font-medium">{name}</span>
                                 <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase">自社</span>
                               </div>
                             );
                           })
                        ) : null}

                        {data.subcontractors.length > 0 ? (
                           data.subcontractors.map((s: any, i: number) => (
                             <div key={`s-${i}`} className="flex items-center justify-between text-sm bg-card border rounded-md px-3 py-2 shadow-sm">
                               <span className="font-medium">{s.subcontractor_name}</span>
                               <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-bold uppercase shrink-0"><span className="text-sm mr-1">{s.worker_count || 0}</span>名</span>
                             </div>
                           ))
                        ) : null}

                        {data.personnel.length === 0 && data.subcontractors.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">作業員の記録はありません</p>
                        )}
                      </div>
                    </div>

                    {/* Vehicles & Machinery */}
                    <div>
                      <h3 className="font-bold flex items-center gap-2 mb-3 text-sm">
                        <Truck className="w-4 h-4 text-teal-500" /> 車両・建機
                      </h3>
                      <div className="space-y-2">
                        {data.vehicles.length > 0 ? (
                           data.vehicles.map((v: any, i: number) => {
                             const name = v.vehicle_master ? (Array.isArray(v.vehicle_master) ? v.vehicle_master[0]?.vehicle_name : v.vehicle_master.vehicle_name) : v.vehicle_name;
                             return (
                               <div key={`v-${i}`} className="flex items-center gap-2 text-sm bg-card border rounded-md px-3 py-2 shadow-sm shrink-0 truncate">
                                 <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                 <span className="font-medium truncate">{name}</span>
                               </div>
                             );
                           })
                        ) : null}
                        
                        {data.machinery.length > 0 ? (
                           data.machinery.map((m: any, i: number) => {
                             const name = m.vehicle_master ? (Array.isArray(m.vehicle_master) ? m.vehicle_master[0]?.vehicle_name : m.vehicle_master.vehicle_name) : m.machinery_name;
                             return (
                               <div key={`m-${i}`} className="flex items-center gap-2 text-sm bg-card border rounded-md px-3 py-2 shadow-sm shrink-0 truncate">
                                 <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                 <span className="font-medium truncate">{name}</span>
                               </div>
                             );
                           })
                        ) : null}

                        {data.vehicles.length === 0 && data.machinery.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">車両・建機の記録はありません</p>
                        )}
                      </div>
                    </div>
                 </div>
               </div>

               {/* Materials */}
               {data.materials && data.materials.length > 0 && (
                 <div>
                   <h3 className="font-bold flex items-center gap-2 mb-3 text-sm border-b pb-2">
                     <Package className="w-4 h-4 text-indigo-500" /> 使用材料
                   </h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {data.materials.map((m: any, i: number) => (
                       <div key={i} className="bg-card border rounded-lg p-4 shadow-sm flex flex-col justify-between">
                         <div className="flex justify-between items-start mb-4">
                           <span className="font-bold text-sm">{m.material_name}</span>
                           <span className="text-xs bg-muted px-2 py-1 rounded font-medium shrink-0">{m.quantity}</span>
                         </div>
                         <div className="flex gap-2">
                            {m.parsedDocs.length > 0 && (
                              <a href={m.parsedDocs[0]} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                                <FileText className="w-3.5 h-3.5" /> 資料・図面 ({m.parsedDocs.length})
                              </a>
                            )}
                            {m.parsedPhotos.length > 0 && (
                              <a href={m.parsedPhotos[0]} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                <ImageIcon className="w-3.5 h-3.5" /> 写真 ({m.parsedPhotos.length})
                              </a>
                            )}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               {/* General Photos */}
               {data.photos && data.photos.length > 0 && (
                 <div>
                   <h3 className="font-bold flex items-center gap-2 mb-3 text-sm border-b pb-2">
                     <ImageIcon className="w-4 h-4 text-rose-500" /> 現場写真
                   </h3>
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                     {data.photos.map((url: string, i: number) => (
                       <a key={i} href={url} target="_blank" rel="noreferrer" className="aspect-square bg-muted rounded-lg overflow-hidden border hover:opacity-90 transition-opacity block shadow-sm group relative">
                         <img src={url} alt={`現場写真 ${i+1}`} className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <ImageIcon className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md w-8 h-8 transition-opacity" />
                         </div>
                       </a>
                     ))}
                   </div>
                 </div>
               )}

             {/* Mobile bottom edit button */}
             <div className="pt-4 border-t sm:hidden">
               <Link 
                 to={`/reports/${reportId}`} 
                 className="flex w-full justify-center bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-bold px-4 py-3 rounded-lg items-center gap-2 transition-colors border shadow-sm"
               >
                 <Edit className="w-5 h-5" /> 編集画面へ移動する
               </Link>
             </div>
            </>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              <p>日報データの取得に失敗しました。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
