import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { Loader2, Search, Plus, Calendar, Pencil, Users, Truck, Package, Building, X, ClipboardList } from "lucide-react"
import { Link } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { ja } from "date-fns/locale"

type DailyReport = {
  id: string
  report_date: string
  work_category: string
  work_content: string
  reporter_name: string
  start_time: string
  end_time: string
  progress: string
  personnel: string[]
  vehicles: string[]
  machinery: string[]
  materials: { name: string; photos: string[]; docs: string[] }[]
  subcontractors: string[]
  project: {
    project_number: string
    project_name: string
  }
  site_photos: string[]
}

export default function ReportsList() {
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReports() {
      try {
        setLoading(true)
        
        // We select the columns we need, using standard Supabase join syntax for foreign keys
        const { data, error } = await supabase
          .from('daily_reports')
          .select(`
            id,
            report_date,
            work_category,
            work_content,
            reporter_name,
            start_time,
            end_time,
            progress,
            site_photos,
            projects (
              project_number,
              project_name
            ),
            report_personnel ( worker_master(name), worker_name, start_time, end_time ),
            report_vehicles ( vehicle_master(vehicle_name), vehicle_name ),
            report_machinery ( vehicle_master(vehicle_name), machinery_name ),
            report_materials ( material_name, quantity, photo, documentation ),
            report_subcontractors ( subcontractor_name, worker_count, start_time, end_time )
          `)
          .order('report_date', { ascending: false })
          .limit(500)

        if (error) throw error
        
        const mappedData = data.map((item: any) => ({
          id: item.id,
          report_date: item.report_date,
          work_category: item.work_category || '未設定',
          work_content: item.work_content || '',
          reporter_name: item.reporter_name || '未設定',
          start_time: item.start_time || '',
          end_time: item.end_time || '',
          progress: item.progress || '0',
          personnel: item.report_personnel?.map((p: any) => {
              const name = Array.isArray(p.worker_master) ? p.worker_master[0]?.name : p.worker_master?.name || p.worker_name;
              if (!name) return null;
              if (p.start_time || p.end_time) {
                  const s = p.start_time ? p.start_time.substring(0, 5) : '';
                  const e = p.end_time ? p.end_time.substring(0, 5) : '';
                  return `${name} (${s}〜${e})`;
              }
              return name;
          }).filter(Boolean) || [],
          vehicles: item.report_vehicles?.map((v: any) => Array.isArray(v.vehicle_master) ? v.vehicle_master[0]?.vehicle_name : v.vehicle_master?.vehicle_name || v.vehicle_name).filter(Boolean) || [],
          machinery: item.report_machinery?.map((m: any) => Array.isArray(m.vehicle_master) ? m.vehicle_master[0]?.vehicle_name : m.vehicle_master?.vehicle_name || m.machinery_name).filter(Boolean) || [],
          materials: item.report_materials?.map((m: any) => {
            const name = m.material_name ? `${m.material_name}${m.quantity ? `（${m.quantity}）` : ''}` : '';
            if (!name) return null;
            let photos: string[] = [];
            if (m.photo) {
                try { photos = JSON.parse(m.photo); if (!Array.isArray(photos)) photos = [m.photo]; }
                catch(e) { photos = [m.photo]; }
            }
            let docs: string[] = [];
            if (m.documentation) {
                try { docs = JSON.parse(m.documentation); if (!Array.isArray(docs)) docs = [m.documentation]; }
                catch(e) { docs = [m.documentation]; }
            }
            return { name, photos, docs };
          }).filter(Boolean) || [],
          subcontractors: item.report_subcontractors?.map((s: any) => {
              const name = s.subcontractor_name || '不明業者';
              let customTime = '';
              if (s.start_time || s.end_time) {
                  const st = s.start_time ? s.start_time.substring(0, 5) : '';
                  const et = s.end_time ? s.end_time.substring(0, 5) : '';
                  customTime = ` (${st}〜${et})`;
              }
              const count = s.worker_count && Number(s.worker_count) > 1 ? ` [${s.worker_count}名]` : '';
              return `${name}${count}${customTime}`;
          }).filter(Boolean) || [],
          project: {
            project_number: item.projects?.project_number || '',
            project_name: item.projects?.project_name || '案件未設定'
          },
          site_photos: (() => {
            if (!item.site_photos) return [];
            let photos: string[] = [];
            try {
              const parsed = typeof item.site_photos === 'string' ? JSON.parse(item.site_photos) : item.site_photos;
              if (Array.isArray(parsed)) photos = parsed;
              else photos = [item.site_photos];
            } catch (e) {
              photos = typeof item.site_photos === 'string' && item.site_photos.includes(',')
                ? item.site_photos.split(',').map((s: string) => s.trim())
                : [item.site_photos];
            }
            // Filter to only valid HTTP URLs to avoid broken legacy local paths
            return photos.filter(p => typeof p === 'string' && p.startsWith('http'));
          })()
        }))

        setReports(mappedData)
      } catch (err) {
        console.error("Error fetching reports:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchReports()
  }, [])

  const filteredReports = reports.filter(r => 
    (r.project.project_number?.includes(search) || '') || 
    (r.project.project_name?.includes(search) || '') || 
    (r.work_content?.includes(search) || '') ||
    (r.reporter_name?.includes(search) || '')
  )

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    try {
      return format(parseISO(dateString), 'yyyy年MM月dd日 (E)', { locale: ja })
    } catch (e) {
      return dateString
    }
  }

  const formatDateTimeRange = (start: string, end: string) => {
    if (!start || !end) return '時間未設定'
    
    // Check if it's purely a legacy time string like "08:00:00" or "08:00"
    if (/^\s*\d{2}:\d{2}(:\d{2})?\s*$/.test(start)) {
        const sMatch = start.match(/(\d{2}:\d{2})/);
        const eMatch = end.match(/(\d{2}:\d{2})/);
        return `${sMatch ? sMatch[1] : start} - ${eMatch ? eMatch[1] : end}`;
    }

    try {
        // Safely parse various date string formats by unifying separators
        const sDate = new Date(start.replace(/-/g, '/').replace('T', ' '));
        const eDate = new Date(end.replace(/-/g, '/').replace('T', ' '));
        
        if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
            const sameDay = sDate.getFullYear() === eDate.getFullYear() && 
                            sDate.getMonth() === eDate.getMonth() && 
                            sDate.getDate() === eDate.getDate();
                            
            const sFormat = format(sDate, 'MM/dd HH:mm');
            const eFormat = format(eDate, sameDay ? 'HH:mm' : 'MM/dd HH:mm');
            return `${sFormat} - ${eFormat}`;
        }
    } catch (e) {
        // Ignore and fallback
    }

    // Fallback: strip seconds from raw strings
    const stripSeconds = (s: string) => {
        const parts = s.split(':');
        if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
        return s;
    };
    return `${stripSeconds(start)} - ${stripSeconds(end)}`;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-6xl mx-auto">
      <div className="shrink-0 space-y-6 pb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">日報管理</h2>
            <p className="text-muted-foreground">現場の作業日報の一覧と検索</p>
          </div>
          <Link 
            to="/reports/new"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新規日報作成
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 shadow-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="工事番号、案件名、作業内容、報告者で検索..."
              className="flex h-10 w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 pl-9 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors hover:bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border bg-card shadow-sm flex flex-col overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center p-12 flex-1">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/95 backdrop-blur-sm text-muted-foreground uppercase text-xs sticky top-0 z-10 shadow-sm border-b whitespace-nowrap">
                <tr>
                  <th className="px-3 sm:px-4 py-3 font-medium w-56">区分 / 操作</th>
                  <th className="px-3 sm:px-4 py-3 font-medium min-w-[12rem]">工事番号 / 案件名 / 時間</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">作業内容 / リソース</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-64">現場写真</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-top">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="font-bold text-foreground text-sm">{report.work_category}</div>
                        <Link 
                          to={`/reports/${report.id}`}
                          className="inline-flex items-center justify-center rounded text-xs font-medium transition-colors border hover:bg-muted hover:text-foreground h-6 px-1.5 gap-1 text-foreground shadow-sm bg-background"
                        >
                           <Pencil className="w-3 h-3 text-muted-foreground" />
                           <span className="hidden sm:inline">編集</span>
                        </Link>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm">{formatDate(report.report_date)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground ml-5">{report.reporter_name}</div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 align-top">
                      <div className="text-xs text-muted-foreground mb-0.5">
                        {report.project.project_number}
                      </div>
                      <div className="font-medium text-primary break-words line-clamp-2 mb-1.5 text-sm">
                        {report.project.project_name}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium">
                        {formatDateTimeRange(report.start_time, report.end_time)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 min-w-[20rem] align-top">
                       <p className="line-clamp-2 text-foreground text-sm max-w-lg mb-2">
                         {report.work_content || <span className="text-muted-foreground italic">記載なし</span>}
                       </p>
                       <div className="flex flex-col gap-1.5 mt-2">
                         {report.personnel.length > 0 && (
                           <div className="flex flex-wrap gap-1 items-center">
                             <Users className="w-3.5 h-3.5 text-blue-500 mr-1" />
                             {report.personnel.map((name, i) => (
                               <span key={i} className="inline-flex items-center rounded-sm bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 whitespace-nowrap">{name}</span>
                             ))}
                           </div>
                         )}
                         {report.subcontractors.length > 0 && (
                           <div className="flex flex-wrap gap-1 items-center">
                             <Building className="w-3.5 h-3.5 text-orange-500 mr-1" />
                             {report.subcontractors.map((name, i) => (
                               <span key={i} className="inline-flex items-center rounded-sm bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-700/10 whitespace-nowrap">{name}</span>
                             ))}
                           </div>
                         )}
                         {report.vehicles.length + report.machinery.length > 0 && (
                           <div className="flex flex-wrap gap-1 items-center">
                             <Truck className="w-3.5 h-3.5 text-emerald-500 mr-1" />
                             {[...report.vehicles, ...report.machinery].map((name, i) => (
                               <span key={i} className="inline-flex items-center rounded-sm bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 whitespace-nowrap">{name}</span>
                             ))}
                           </div>
                         )}
                         {report.materials.length > 0 && (
                           <div className="flex flex-col gap-2 mt-3">
                             <div className="flex items-center gap-1.5 text-amber-600 font-medium text-xs">
                               <Package className="w-4 h-4" />
                               <span>使用材料</span>
                             </div>
                             <div className="flex flex-col gap-2 sm:pl-5">
                               {report.materials.map((mat, i) => (
                                 <div key={i} className="flex flex-col gap-2 p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                                   <span className="text-sm font-medium text-foreground">{mat.name}</span>
                                   {(mat.photos.length > 0 || mat.docs.length > 0) && (
                                     <div className="flex flex-wrap gap-2">
                                       {mat.photos.map((url, j) => (
                                         <img 
                                           key={`p-${j}`}
                                           src={url}
                                           alt="材料写真"
                                           className="h-14 w-20 object-cover rounded border bg-background shadow-sm hover:opacity-90 hover:ring-2 hover:ring-primary/50 cursor-zoom-in transition-all"
                                           onClick={(e) => { e.stopPropagation(); setEnlargedPhoto(url); }}
                                         />
                                       ))}
                                       {mat.docs.map((url, j) => {
                                         const isPdf = url.toLowerCase().includes('.pdf');
                                         return (
                                           <a 
                                             key={`d-${j}`}
                                             href={url}
                                             target="_blank"
                                             rel="noopener noreferrer"
                                             onClick={(e) => e.stopPropagation()}
                                             className="flex items-center justify-center h-14 w-14 bg-background rounded shadow-sm border hover:bg-muted transition-colors"
                                             title="ファイルを開く"
                                           >
                                             {isPdf ? <ClipboardList className="w-6 h-6 text-red-500/80" /> : <Package className="w-6 h-6 text-muted-foreground" />}
                                           </a>
                                         );
                                       })}
                                     </div>
                                   )}
                                 </div>
                               ))}
                             </div>
                           </div>
                         )}
                         {report.subcontractors.length > 0 && (
                           <div className="flex flex-wrap gap-1 items-center">
                             <Building className="w-3.5 h-3.5 text-purple-500 mr-1" />
                             {report.subcontractors.map((name, i) => (
                               <span key={i} className="inline-flex items-center rounded-sm bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-600/10 whitespace-nowrap">{name}</span>
                             ))}
                           </div>
                         )}
                       </div>
                       <div className="mt-3 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                         <span className="w-2 h-2 rounded-full bg-primary/60"></span>
                         進捗: {report.progress.includes('%') ? report.progress : `${report.progress}%`}
                       </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right align-top">
                      {report.site_photos && report.site_photos.length > 0 ? (
                        <div className="flex justify-end">
                          <img 
                            src={report.site_photos[report.site_photos.length - 1]} 
                            alt="現場写真" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEnlargedPhoto(report.site_photos![report.site_photos!.length - 1]);
                            }}
                            className="h-28 w-44 rounded-lg object-cover border bg-muted shadow-sm shrink-0 cursor-pointer hover:opacity-90 hover:ring-2 hover:ring-primary/50 transition-all"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-end h-28 w-44 ml-auto rounded-lg border border-dashed bg-muted/20 items-center text-muted-foreground text-xs font-medium">
                          写真なし
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-12 text-center text-muted-foreground">
                      {search ? "検索条件に一致する日報が見つかりません" : "日報データがありません"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {enlargedPhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8 transition-opacity" 
          onClick={() => setEnlargedPhoto(null)}
        >
          <div className="relative max-w-5xl w-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setEnlargedPhoto(null)}
              className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white bg-black/50 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={enlargedPhoto} 
              alt="拡大写真" 
              className="max-h-[85vh] max-w-full rounded-md shadow-2xl object-contain border border-white/20" 
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
