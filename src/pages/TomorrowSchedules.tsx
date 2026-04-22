import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { CalendarClock, Plus, Search, Loader2, Pencil, Calendar, Users, Target, ClipboardList, Building, Clock } from "lucide-react"
import { useNavigate, Link } from "react-router-dom"
import { format } from "date-fns"
import { ja } from "date-fns/locale"

type TomorrowSchedule = {
  id: string
  schedule_date: string | null
  arrival_time: string | null
  category: string | null
  reporter: string | null
  send_flag: string | null
  work_content: string | null
  workers: string | null
  notes: string | null
  one_point_ky: string | null
  projects: { name: string, number?: string, site_name?: string, client_name?: string } | { name: string, number?: string, site_name?: string, client_name?: string }[] | null
  tomorrow_subcontractors: { subcontractor_name: string, worker_count: string }[] | null
}

export default function TomorrowSchedules() {
  const [schedules, setSchedules] = useState<TomorrowSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [searchDate, setSearchDate] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    fetchSchedules()
  }, [])

  async function fetchSchedules() {
    try {
      const { data, error } = await supabase
        .from('tomorrow_schedules')
        .select(`
          id,
          schedule_date,
          arrival_time,
          category,
          reporter,
          send_flag,
          work_content,
          workers,
          notes,
          one_point_ky,
          projects:project_id(project_name, project_number, site_name, client_name),
          tomorrow_subcontractors(subcontractor_name, worker_count)
        `)
        .order('schedule_date', { ascending: false })

      if (error) throw error

      // Map the joined project_name to match our expected format
      const formattedData = data?.map((item: any) => ({
        ...item,
        projects: item.projects ?
          (Array.isArray(item.projects) ?
            item.projects.map((p: any) => ({ name: p.project_name, number: p.project_number, site_name: p.site_name, client_name: p.client_name })) :
            { name: item.projects.project_name, number: item.projects.project_number, site_name: item.projects.site_name, client_name: item.projects.client_name }
          ) : null
      })) as TomorrowSchedule[]

      setSchedules(formattedData || [])
    } catch (error) {
      console.error('Error fetching tomorrow schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const [showPastSchedules, setShowPastSchedules] = useState(false)

  const filteredSchedules = schedules.filter(schedule => {
    const searchLower = searchTerm.toLowerCase()
    const projectName = schedule.projects ?
      (Array.isArray(schedule.projects) ? schedule.projects[0]?.name : (schedule.projects as { name: string }).name) : ''

    const matchesSearch = (projectName && projectName.toLowerCase().includes(searchLower)) ||
      (schedule.reporter && schedule.reporter.toLowerCase().includes(searchLower))

    if (!matchesSearch) return false;

    if (!showPastSchedules && schedule.schedule_date) {
      // Compare dates (schedule_date vs today). Ignore time part for comparison.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const schedDate = new Date(schedule.schedule_date);
      schedDate.setHours(0, 0, 0, 0);

      if (schedDate < today) {
        return false;
      }
    }

    if (searchDate && schedule.schedule_date) {
      if (!schedule.schedule_date.startsWith(searchDate)) {
        return false;
      }
    }

    return true;
  })

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0 pr-4 -mr-4">
        <div className="space-y-6 max-w-7xl mx-auto pb-12">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 bg-background/80 backdrop-blur-sm py-4 z-10 border-b mb-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <CalendarClock className="w-6 h-6 text-primary" />
                翌日予定
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                明日以降の作業予定や人員・車両の手配状況を管理します。
              </p>
            </div>
            <button
              onClick={() => navigate('/tomorrow-schedules/new')}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2 gap-2"
            >
              <Plus className="w-4 h-4" />
              予定を追加
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="案件名や手配者で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="relative w-full sm:w-auto">
              <input
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="w-full sm:w-auto h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                title="日付で絞り込み"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap text-sm bg-card border px-3 py-2 rounded-md hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={showPastSchedules}
                onChange={(e) => setShowPastSchedules(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
              />
              <span className="font-medium text-foreground">過去の予定を表示</span>
            </label>
          </div>

          <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredSchedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <CalendarClock className="w-12 h-12 mb-4 opacity-20" />
                  <p>翌日予定が見つかりません</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/95 backdrop-blur-sm text-muted-foreground uppercase text-xs sticky top-0 z-10 shadow-sm border-b whitespace-nowrap">
                    <tr>
                      <th className="px-3 sm:px-4 py-3 font-medium w-48">区分 / 操作</th>
                      <th className="px-3 sm:px-4 py-3 font-medium min-w-[12rem]">案件名 / 日時</th>
                      <th className="px-3 sm:px-4 py-3 font-medium">作業内容 / リソース / 特記事項</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredSchedules.map((schedule) => (
                      <tr key={schedule.id} className="hover:bg-muted/50 transition-colors group bg-card">
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap align-top">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="font-bold text-foreground text-sm">{schedule.category || '一般'}</div>
                            <Link
                              to={`/tomorrow-schedules/${schedule.id}`}
                              className="inline-flex items-center justify-center rounded text-xs font-medium transition-colors border hover:bg-muted hover:text-foreground h-6 px-1.5 gap-1 text-foreground shadow-sm bg-background"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                              <span className="hidden sm:inline">編集</span>
                            </Link>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5 mt-2">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-sm font-medium">
                              {schedule.schedule_date ? format(new Date(schedule.schedule_date), 'yyyy/MM/dd(E)', { locale: ja }) : '-'}
                            </span>
                          </div>
                          <div className="text-sm font-semibold flex items-center gap-1.5 mt-3 bg-red-50 text-red-700 px-2 py-1 rounded w-fit border border-red-200">
                            <Clock className="w-4 h-4 shrink-0" />
                            会社出社: <span className="text-base text-red-600 ml-1">
                              {schedule.arrival_time ? schedule.arrival_time.split(':').slice(0, 2).join(':') : '08:00'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-2 ml-1">
                            報告者: {schedule.reporter || '-'}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 align-top">
                          <div className="text-xs text-muted-foreground mb-0.5">
                            {schedule.projects ?
                              (Array.isArray(schedule.projects) ? schedule.projects[0]?.number : (schedule.projects as { number?: string }).number)
                              : ''}
                          </div>
                          <div className="font-medium text-primary break-words line-clamp-2 mb-1.5 text-sm">
                            {schedule.projects ?
                              (Array.isArray(schedule.projects) ? schedule.projects[0]?.name : (schedule.projects as { name: string }).name)
                              : '不明な案件'}
                          </div>
                          {schedule.projects && (
                            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              現場名/発注者: {(() => {
                                const p = Array.isArray(schedule.projects) ? schedule.projects[0] : schedule.projects;
                                if (!p) return '-';
                                const siteStr = p.site_name || p.client_name || '-';
                                return (typeof siteStr === 'string' ? siteStr : '-').replace(/\s*[\(（]UNION[）\)]?/gi, '');
                              })()}
                            </div>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3 min-w-[20rem] align-top">
                          <p className="line-clamp-2 text-foreground text-sm max-w-lg mb-2 whitespace-pre-wrap">
                            {schedule.work_content || <span className="text-muted-foreground italic">記載なし</span>}
                          </p>
                          <div className="flex flex-col gap-1.5 mt-2">
                            {schedule.workers && (() => {
                                // 分割・重複除去
                                const parts = [...new Set(
                                  schedule.workers!.split(/[,、]+/).map(w => w.trim()).filter(Boolean)
                                )];
                                // 他の名前に含まれるフラグメントを除去
                                // 例: 「斎藤」→「斎藤 敦士」に含まれる → 除去
                                const cleaned = parts
                                  .filter(name => !parts.some(other => other !== name && other.includes(name)))
                                  .join('、');
                                return cleaned ? (
                                  <div className="flex flex-wrap gap-1 items-start mt-1">
                                    <Users className="w-3.5 h-3.5 text-blue-500 mr-1 mt-0.5 shrink-0" />
                                    <div className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-sm ring-1 ring-inset ring-blue-700/10 whitespace-pre-wrap">{cleaned}</div>
                                  </div>
                                ) : null;
                              })()}


                            {(schedule.tomorrow_subcontractors || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 items-center mt-1">
                                <Building className="w-3.5 h-3.5 text-indigo-500 mr-1 shrink-0" />
                                {schedule.tomorrow_subcontractors?.map((sub, i) => (
                                  <span key={i} className="inline-flex items-center rounded-sm bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10 whitespace-nowrap">
                                    {sub.subcontractor_name} ({sub.worker_count}名)
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {(schedule.one_point_ky || schedule.notes) && (
                            <div className="mt-3 flex flex-col gap-2">
                              {schedule.one_point_ky && (
                                <div className="text-xs bg-amber-50/50 border border-amber-100/50 rounded p-2 text-amber-900">
                                  <div className="font-semibold flex items-center gap-1 mb-1"><Target className="w-3 h-3" /> ワンポイントKY</div>
                                  <p className="whitespace-pre-wrap leading-relaxed">{schedule.one_point_ky}</p>
                                </div>
                              )}
                              {schedule.notes && (
                                <div className="text-xs bg-muted/30 border rounded p-2 text-muted-foreground">
                                  <div className="font-semibold flex items-center gap-1 mb-1"><ClipboardList className="w-3 h-3" /> 特記事項・引継事項</div>
                                  <p className="whitespace-pre-wrap leading-relaxed">{schedule.notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
