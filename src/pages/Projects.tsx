import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { Loader2, Search, Plus, Building2, Folder, Pencil, ClipboardList, CalendarPlus } from "lucide-react"
import { Link } from "react-router-dom"

type Project = {
  id: string
  project_number: string
  project_name: string
  category: string
  status_flag: string
  client_name: string
  site_name: string
  client_company_name: string
  folder_url: string
  parent_project_id: string | null
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  useEffect(() => {
    async function fetchProjects() {
      try {
        setLoading(true)
        // Set order to project_number to naturally group 260301-t01, 260301-k01 and 260301 together
        let query = supabase.from('projects').select('*').order('project_number', { ascending: false, nullsFirst: false })
        
        if (selectedStatuses.length > 0) {
          query = query.in('status_flag', selectedStatuses)
        }
        if (selectedCategories.length > 0) {
          query = query.in('category', selectedCategories)
        }

        const { data, error } = await query
        if (error) throw error
        
        // 休暇（VACATION）案件は除外し、KD/BS始まり、または数字6桁始まりのもの（及びその子案件）のみ表示
        const visibleProjects = (data || []).filter(p => {
          if (p.project_number === 'VACATION' || p.project_name === '■ 休暇') return false;
          
          const num = p.project_number || '';
          if (num.startsWith('KD') || num.startsWith('BS')) return true;
          
          const base = num.split('-')[0];
          if (/^[0-9]{6}$/.test(base)) return true;
          
          // 親案件が条件を満たしている場合は子案件（枝番）も表示
          if (p.parent_project_id) {
            const parent = data.find(parent => parent.id === p.parent_project_id);
            if (parent) {
              const pNum = parent.project_number || '';
              if (pNum.startsWith('KD') || pNum.startsWith('BS')) return true;
              if (/^[0-9]{6}$/.test(pNum.split('-')[0])) return true;
            }
          }
          
          return false;
        })
        
        setProjects(visibleProjects)
      } catch (err) {
        console.error("Error fetching projects:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [selectedStatuses, selectedCategories])

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    )
  }

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status_flag: newStatus })
        .eq('id', projectId)
      
      if (error) throw error
      
      // Update local state
      setProjects(projects.map(p => 
        p.id === projectId ? { ...p, status_flag: newStatus } : p
      ))
    } catch (err: any) {
      console.error("Error updating status:", err)
      alert("ステータスの更新に失敗しました: " + err.message)
    }
  }

  const searchLower = search.toLowerCase()
  const directMatches = projects.filter(p => 
    (p.project_name || '').toLowerCase().includes(searchLower) || 
    (p.client_name || '').toLowerCase().includes(searchLower) ||
    (p.site_name || '').toLowerCase().includes(searchLower) ||
    (p.project_number || '').toLowerCase().includes(searchLower)
  )

  const matchedFamilyIds = new Set(
    directMatches.map(p => p.parent_project_id || p.id)
  )

  const filteredProjects = projects.filter(p => {
    const familyId = p.parent_project_id || p.id
    return matchedFamilyIds.has(familyId)
  })

  // 親案件が先頭に来て、枝番がすぐ下に来るように並び替え
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const numA = a.project_number || ''
    const numB = b.project_number || ''
    const baseA = numA.split('-')[0]
    const baseB = numB.split('-')[0]
    
    if (baseA !== baseB) {
      // メイン案件としては新しい順（降順）にする
      return baseB.localeCompare(baseA)
    }
    // 同じ案件の親子関係では、短い方（親）が先に来て、あとは昇順（k01, t01など）
    return numA.localeCompare(numB)
  })

  const statuses = ["すべて", "着工前", "着工中", "完工", "保留", "失注"]

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-6xl mx-auto">
      <div className="shrink-0 space-y-6 pb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">案件管理</h2>
            <p className="text-muted-foreground">すべての工事案件の基本情報を管理します</p>
          </div>
          <Link 
            to="/projects/new"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新規案件登録
          </Link>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative shadow-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="案件名、顧客名、現場名で検索..."
              className="flex h-10 w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 pl-9 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors hover:bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap gap-y-4 gap-x-6 items-start sm:items-center">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <span className="text-xs font-semibold text-muted-foreground sm:w-12 sm:text-right">区分</span>
              <div className="flex flex-wrap gap-1.5">
                {["一般", "役所", "川北", "BPE"].map(c => (
                  <button
                    key={c}
                    onClick={() => toggleCategory(c)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                      selectedCategories.includes(c)
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-muted-foreground border-input hover:bg-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <span className="text-xs font-semibold text-muted-foreground sm:w-16 sm:text-right">ステータス</span>
              <div className="flex flex-wrap gap-1.5">
                {["着工前", "着工中", "完工", "保留", "失注"].map(s => {
                  const isSelected = selectedStatuses.includes(s);
                  let activeClass = 'bg-primary text-primary-foreground border-primary shadow-sm';
                  
                  if (isSelected) {
                    if (s === '着工前') activeClass = 'bg-blue-600 text-white border-blue-600 shadow-sm';
                    else if (s === '着工中') activeClass = 'bg-red-600 text-white border-red-600 shadow-sm';
                    else if (s === '完工') activeClass = 'bg-green-600 text-white border-green-600 shadow-sm';
                    else if (s === '保留' || s === '失注') activeClass = 'bg-gray-500 text-white border-gray-500 shadow-sm';
                  }

                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                        isSelected
                          ? activeClass
                          : 'bg-background text-muted-foreground border-input hover:bg-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
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
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/95 backdrop-blur-sm text-muted-foreground uppercase text-xs sticky top-0 z-10 shadow-sm border-b">
                <tr>
                  <th className="px-6 py-3 font-medium">工事番号 / 案件名</th>
                  <th className="px-6 py-3 font-medium">発注者 / 現場名</th>
                  <th className="px-6 py-3 font-medium">ステータス</th>
                  <th className="px-6 py-3 font-medium text-right">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                      <Building2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      条件に一致する案件が見つかりません
                    </td>
                  </tr>
                ) : (
                  sortedProjects.map((project) => (
                    <tr key={project.id} className={`hover:bg-muted/30 transition-colors ${project.parent_project_id ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-6 py-5">
                        <div className="text-xs text-muted-foreground/80 mb-1.5 font-mono flex items-center gap-1.5">
                          {project.parent_project_id ? (
                            <span className="inline-flex items-center rounded-sm bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">枝番</span>
                          ) : (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/40" />
                          )}
                          {project.project_number || '番号未定'}
                        </div>
                        <div className={`font-bold text-foreground text-base truncate max-w-sm ${project.parent_project_id ? 'pl-3 border-l-2 border-indigo-200' : ''}`}>
                          {project.project_name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                            {project.category || '一般'}
                          </span>
                          <span className="text-muted-foreground/50">•</span>
                          <span className="font-medium text-foreground/80">担当: {project.client_company_name || '未設定'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="truncate max-w-[200px]">
                          {(project.category === '一般' || project.category === '役所') 
                            ? (project.client_name || <span className="text-muted-foreground italic">未設定</span>)
                            : (project.site_name || <span className="text-muted-foreground italic">未設定</span>)
                          }
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer appearance-none text-center min-w-[5rem] ${
                            project.status_flag === '着工前'
                              ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                              : project.status_flag === '着工中' 
                              ? 'bg-red-500/10 text-red-600 border-red-500/20' 
                              : project.status_flag === '完工'
                              ? 'bg-green-500/10 text-green-600 border-green-500/20'
                              : project.status_flag === '保留' || project.status_flag === '失注'
                              ? 'bg-gray-200/50 text-gray-500 border-gray-300 opacity-80'
                              : 'bg-secondary text-secondary-foreground border-transparent'
                          }`}
                          value={project.status_flag || '着工前'}
                          onChange={(e) => handleStatusChange(project.id, e.target.value)}
                        >
                          {statuses.filter(s => s !== "すべて").map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {project.folder_url && (
                          <a href={project.folder_url} target="_blank" rel="noopener noreferrer" className="p-2 inline-flex flex-col items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors group align-middle" title="Google Driveを開く">
                            <Folder className="w-5 h-5 mb-0.5 group-hover:text-blue-500 transition-colors" />
                            <span className="text-[10px] uppercase font-semibold leading-none text-muted-foreground/70 group-hover:text-blue-500 transition-colors">DRIVE</span>
                          </a>
                        )}
                        <Link 
                          to="/tomorrow-schedules/new" 
                          state={{ projectId: project.id, category: project.category }}
                          className="p-2 inline-flex flex-col items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors group align-middle" 
                          title="翌日予定を作成"
                        >
                          <CalendarPlus className="w-5 h-5 mb-0.5 group-hover:text-emerald-500 transition-colors" />
                          <span className="text-[10px] uppercase font-semibold leading-none text-muted-foreground/70 group-hover:text-emerald-500 transition-colors">PLAN</span>
                        </Link>
                        <Link 
                          to="/reports/new" 
                          state={{ projectId: project.id, category: project.category }}
                          className="p-2 inline-flex flex-col items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors group align-middle" 
                          title="作業日報を作成"
                        >
                          <ClipboardList className="w-5 h-5 mb-0.5 group-hover:text-amber-500 transition-colors" />
                          <span className="text-[10px] uppercase font-semibold leading-none text-muted-foreground/70 group-hover:text-amber-500 transition-colors">REPORT</span>
                        </Link>
                        <Link to={`/projects/${project.id}`} className="p-2 inline-flex flex-col items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors group align-middle" title="詳細編集">
                          <Pencil className="w-5 h-5 mb-0.5" />
                          <span className="text-[10px] uppercase font-semibold leading-none text-muted-foreground/70">EDIT</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
