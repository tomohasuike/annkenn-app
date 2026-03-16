import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { CheckSquare, Plus, Search, Loader2, Calendar, Pencil, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { format } from "date-fns"

type CompletionReport = {
  id: string
  project_id: string
  completion_date: string | null
  reporter: string | null
  inspector: string | null
  approval_status: string | null
  witness: string | null
  inspection_datetime: string | null
  inspection_items: string[] | null
  inspection_details: string | null
  inspection_result: string | null
  projects: { project_number: string, project_name: string, site_name: string, client_company_name: string, client_name: string, category: string } | { project_number: string, project_name: string, site_name: string, client_company_name: string, client_name: string, category: string }[] | null
  completion_report_photos: { photo_url: string, is_main: boolean }[] | null
}

export default function CompletionReports() {
  const [reports, setReports] = useState<CompletionReport[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<Record<string, string>>({})
  const navigate = useNavigate()

  useEffect(() => {
    fetchReports()
  }, [])

  async function fetchReports() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('completion_reports')
        .select(`
          id, project_id, completion_date, reporter, inspector, witness, approval_status, inspection_datetime, inspection_items, inspection_details, inspection_result,
          projects ( project_number, project_name, site_name, client_company_name, client_name, category ),
          completion_report_photos ( photo_url, is_main )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setReports(data || [])
    } catch (e: any) {
      console.error('Error fetching completion reports:', e.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredReports = reports.filter(r => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    const pName = Array.isArray(r.projects) ? r.projects[0]?.project_name : r.projects?.project_name;
    const pNum = Array.isArray(r.projects) ? r.projects[0]?.project_number : r.projects?.project_number;
    return (
      (pName && pName.toLowerCase().includes(searchLower)) ||
      (pNum && pNum.toLowerCase().includes(searchLower)) ||
      (r.reporter && r.reporter.toLowerCase().includes(searchLower))
    )
  })

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-6xl mx-auto">
      <div className="shrink-0 space-y-6 pb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
               <CheckSquare className="w-8 h-8 text-primary" />
               完了報告管理
            </h2>
            <p className="text-muted-foreground mt-1">工事や作業の完了報告の一覧と検索</p>
          </div>
          <button 
            onClick={() => navigate('/completion-reports/new')}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新規作成
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 shadow-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="案件名、工事番号、報告者で検索..."
              className="flex h-10 w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 pl-9 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors hover:bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
                  <th className="px-3 sm:px-4 py-3 font-medium w-56">ステータス / 操作</th>
                  <th className="px-3 sm:px-4 py-3 font-medium min-w-[12rem]">案件名 / 日付</th>
                  <th className="px-3 sm:px-4 py-3 font-medium">検査内容 / 結果</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-64">完成写真</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReports.map((report) => {
                  const pNum = Array.isArray(report.projects) ? report.projects[0]?.project_number : report.projects?.project_number;
                  const pName = Array.isArray(report.projects) ? report.projects[0]?.project_name : report.projects?.project_name || '案件未設定';
                  
                  // find default main photo
                  let defaultPhotoUrl = report.completion_report_photos?.[0]?.photo_url;
                  const mainPhotoObj = report.completion_report_photos?.find(p => p.is_main);
                  if (mainPhotoObj) {
                    defaultPhotoUrl = mainPhotoObj.photo_url;
                  }

                  // Use selected photo if clicked, else default
                  const currentDisplayPhotoUrl = selectedPhotos[report.id] || defaultPhotoUrl;

                  return (
                  <tr key={report.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-top">
                      <div className="flex items-center gap-2 mb-3">
                        {report.approval_status === '承認済' || report.approval_status === '承認済み' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {report.approval_status}
                            </span>
                        ) : report.approval_status === '未承認' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                {report.approval_status}
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                                {report.approval_status || '未設定'}
                            </span>
                        )}
                        <button 
                          onClick={() => navigate(`/completion-reports/${report.id}`)}
                          className="inline-flex items-center justify-center rounded text-xs font-medium transition-colors border hover:bg-muted hover:text-foreground h-6 px-1.5 gap-1 text-foreground shadow-sm bg-background"
                        >
                           <Pencil className="w-3 h-3 text-muted-foreground" />
                           <span className="hidden sm:inline">詳細・編集</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-3">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-medium">{report.completion_date ? format(new Date(report.completion_date), 'yyyy年MM月dd日') : '日時未設定'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-col gap-1.5 ml-0.5">
                         <span className="bg-muted/30 px-2 py-1 rounded-sm border inline-block w-fit">報告者: <span className="text-foreground font-medium">{report.reporter || '-'}</span></span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 align-top">
                      <div className="text-xs text-muted-foreground mb-1">
                        {pNum || '-'}
                      </div>
                      <div className="font-semibold text-primary break-words line-clamp-2 mb-1 text-sm">
                        {pName}
                      </div>

                      <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5 overflow-hidden">
                        <span className="shrink-0 bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium border border-border/50">現場名/発注者</span>
                        <span className="line-clamp-1">
                          {Array.isArray(report.projects) 
                            ? (report.projects[0]?.site_name || report.projects[0]?.client_name || '-') 
                            : (report.projects?.site_name || report.projects?.client_name || '-')}
                        </span>
                      </div>

                      <div className="text-xs font-medium text-foreground mb-3 flex items-center gap-1.5">
                        <span className="text-muted-foreground shrink-0">検査日時:</span>
                        {report.inspection_datetime ? format(new Date(report.inspection_datetime), 'yyyy年MM月dd日 HH:mm') : '-'}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-2 flex-wrap mt-2">
                         <span className="bg-muted/30 px-2 py-1 rounded-sm border inline-block w-fit">検査者: <span className="text-foreground font-medium">{report.inspector || '-'}</span></span>
                         <span className="bg-muted/30 px-2 py-1 rounded-sm border inline-block w-fit">立会者: <span className="text-foreground font-medium">{report.witness || '-'}</span></span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 min-w-[20rem] align-top">
                       <div className="flex flex-col gap-1.5 mb-2">
                         {report.inspection_items && report.inspection_items.length > 0 && (
                           <div className="flex flex-wrap gap-1 items-center">
                             <CheckSquare className="w-3.5 h-3.5 text-blue-500 mr-1" />
                             {report.inspection_items.map((item, i) => (
                               <span key={i} className="inline-flex items-center rounded-sm bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 whitespace-nowrap">{item}</span>
                             ))}
                           </div>
                         )}
                       </div>
                       <p className="line-clamp-2 text-foreground text-sm max-w-lg mb-3">
                         {report.inspection_details || <span className="text-muted-foreground italic">記載なし</span>}
                       </p>
                       <div className="flex flex-col gap-1.5 mt-2">
                         {report.inspection_result && (
                           <div className="mb-1 text-sm font-medium flex items-center gap-1.5">
                             <span className="w-2 h-2 rounded-full bg-primary/60"></span>
                             判定: <span className={report.inspection_result === '合格' ? 'text-emerald-600' : 'text-red-600'}>{report.inspection_result}</span>
                           </div>
                         )}
                       </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right align-top">
                      {currentDisplayPhotoUrl ? (
                        <div className="flex flex-col items-end gap-2">
                          <img 
                            src={currentDisplayPhotoUrl} 
                            alt="完了写真" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEnlargedPhoto(currentDisplayPhotoUrl!);
                            }}
                            className="h-28 w-44 rounded-lg object-cover border bg-muted shadow-sm shrink-0 cursor-pointer hover:opacity-90 hover:ring-2 hover:ring-primary/50 transition-all"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          {report.completion_report_photos && report.completion_report_photos.length > 1 && (
                            <div className="flex gap-1.5 w-44 overflow-x-auto pb-1 no-scrollbar justify-end">
                              {report.completion_report_photos.map((photo, i) => (
                                <img
                                  key={i}
                                  src={photo.photo_url}
                                  alt={`サムネイル ${i+1}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPhotos(prev => ({ ...prev, [report.id]: photo.photo_url }));
                                  }}
                                  className={`h-10 w-14 rounded-md object-cover border cursor-pointer shrink-0 transition-opacity hover:opacity-80 ${currentDisplayPhotoUrl === photo.photo_url ? 'ring-2 ring-primary ring-offset-1 border-transparent' : 'border-border opacity-70'}`}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex justify-end h-28 w-44 ml-auto rounded-lg border border-dashed bg-muted/20 items-center justify-center text-muted-foreground text-xs font-medium">
                          写真なし
                        </div>
                      )}
                    </td>
                  </tr>
                )})}
                
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-12 text-center text-muted-foreground">
                      {searchTerm ? "検索条件に一致する完了報告が見つかりません" : "完了報告データがありません"}
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
