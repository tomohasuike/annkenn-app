const fs = require('fs');

const path = '/Users/hasuiketomoo/Developer/annkenn-app/src/pages/ScheduleManagement.tsx';
let content = fs.readFileSync(path, 'utf8');

// The rewrite is substantial, so we will replace large blocks of code.
// I'll create a new functional React component that matches the layout.

const fullRewrite = `import React, { useState, useEffect, Fragment } from "react"
import { supabase } from "../lib/supabase"
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, Users, Truck, RefreshCw, X, MessageSquare, ListTodo, Plus, Info, List, History } from "lucide-react"
import { format, addDays, subDays } from "date-fns"
import { ja } from "date-fns/locale"

type ProjectData = { id: string; name: string; category: string; status: string; no: string | null; site: string | null }
type ResourceData = { id: string; name: string; type: 'worker' | 'vehicle' }

type AssignmentData = {
  id: string
  assignment_date: string
  project_id: string
  worker_id: string | null
  vehicle_id: string | null
  count: number
  notes: string | null
  projects: { project_name: string } | null
  worker_master: { name: string } | null
  vehicle_master: { vehicle_name: string } | null
}

export default function ScheduleManagement() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(true)
  
  // Settings
  const [cellWidth, setCellWidth] = useState(120)
  const [fontSize, setFontSize] = useState(14)
  const [showRightPanel, setShowRightPanel] = useState(true)
  
  // Data
  const [projectsList, setProjectsList] = useState<ProjectData[]>([])
  const [resources, setResources] = useState<ResourceData[]>([])
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  
  // Custom resource addition state
  const [newResName, setNewResName] = useState("")
  const [newResType, setNewResType] = useState("person")
  const [isAddingResource, setIsAddingResource] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{ id: string, type: 'worker' | 'vehicle', sourceProjectId?: string, sourceDate?: string } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    fetchAssignments()
  }, [currentDate])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [projRes, workerRes, vehicleRes] = await Promise.all([
        supabase.from('projects').select('id, project_name, category, status_flag, project_number, site_name').order('created_at', { ascending: false }),
        supabase.from('worker_master').select('id, name').eq('is_active', true).order('name'),
        supabase.from('vehicle_master').select('id, vehicle_name').eq('is_active', true).order('vehicle_name')
      ])

      const pl = (projRes.data || []).map(p => ({ 
          id: p.id, 
          name: p.project_name, 
          category: p.category, 
          status: p.status_flag,
          no: p.project_number,
          site: p.site_name
      }))
      
      // Manually ensure sorting by categories roughly matching the screenshot if possible
      // or just group them
      setProjectsList(pl)
      
      const newResources: ResourceData[] = []
      if (workerRes.data) {
        workerRes.data.forEach(w => newResources.push({ id: w.id, name: w.name, type: 'worker' }))
      }
      if (vehicleRes.data) {
        vehicleRes.data.forEach(v => newResources.push({ id: v.id, name: v.vehicle_name, type: 'vehicle' }))
      }
      setResources(newResources)

      await fetchAssignments()
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignments = async () => {
    try {
      const start = currentDate
      const startDateStr = format(start, 'yyyy-MM-dd')
      const endDateStr = format(addDays(start, 6), 'yyyy-MM-dd')

      const { data, error } = await supabase
        .from('assignments')
        .select(\`
          id, assignment_date, project_id, worker_id, vehicle_id, count, notes,
          projects(project_name), worker_master(name), vehicle_master(vehicle_name)
        \`)
        .gte('assignment_date', startDateStr)
        .lte('assignment_date', endDateStr)

      if (error) throw error
      setAssignments((data as any) || [])
    } catch (err) {
      console.error(err)
    }
  }

  // --- Date Array ---
  const dates = Array.from({ length: 7 }).map((_, i) => addDays(currentDate, i))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Group by category (preserving some order based on names)
  const categoryOrder = ["一般", "役所", "川北", "BPE", "未分類"]
  
  const groupedProjects = projectsList.reduce((acc, p) => {
    // try to match brackets like 【区分：一般】 or just category
    let cat = p.category || '未分類'
    cat = cat.replace('【区分：', '').replace('】', '')
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, ProjectData[]>)
  
  // Sort categories by predefined order, others at the end
  const sortedCategories = Object.keys(groupedProjects).sort((a, b) => {
      const idxA = categoryOrder.indexOf(a)
      const idxB = categoryOrder.indexOf(b)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return a.localeCompare(b)
  })

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, id: string, type: 'worker' | 'vehicle', sourceProjectId?: string, sourceDate?: string) => {
    e.dataTransfer.setData("text/plain", \`\${type}:\${id}\`)
    setDraggedItem({ id, type, sourceProjectId, sourceDate })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = async (e: React.DragEvent, targetProjectId: string, targetDate: Date) => {
    e.preventDefault()
    if (!draggedItem) return
    const dateStr = format(targetDate, 'yyyy-MM-dd')
    
    // Check if moving to same spot
    if (draggedItem.sourceProjectId === targetProjectId && draggedItem.sourceDate === dateStr) {
      setDraggedItem(null)
      return
    }

    // Check if already assigned to target spot (unless it's a move)
    const alreadyAssigned = assignments.some(a => 
      a.project_id === targetProjectId && 
      a.assignment_date === dateStr && 
      ((draggedItem.type === 'worker' && a.worker_id === draggedItem.id) || 
       (draggedItem.type === 'vehicle' && a.vehicle_id === draggedItem.id))
    )
    
    if (alreadyAssigned) return

    // Find if we are moving an existing assignment
    const sourceAssignment = assignments.find(a => 
       a.project_id === draggedItem.sourceProjectId && 
       a.assignment_date === draggedItem.sourceDate &&
       ((draggedItem.type === 'worker' && a.worker_id === draggedItem.id) || 
       (draggedItem.type === 'vehicle' && a.vehicle_id === draggedItem.id))
    )

    const tempId = \`temp-\${Date.now()}\`
    
    // Optimistic Update
    setAssignments(prev => {
        let next = [...prev]
        if (sourceAssignment) {
            // Remove from source if it was a move and not a copy from unassigned pool
            next = next.filter(a => a.id !== sourceAssignment.id)
        }
        
        // Target can be "unassigned", meaning we just delete the assignment.
        // We will represent "unassigned" as "UNASSIGNED_POOL" pseudo-project id.
        if (targetProjectId !== "UNASSIGNED_POOL") {
            const newAssignment: AssignmentData = {
                id: tempId,
                assignment_date: dateStr,
                project_id: targetProjectId,
                worker_id: draggedItem.type === 'worker' ? draggedItem.id : null,
                vehicle_id: draggedItem.type === 'vehicle' ? draggedItem.id : null,
                count: 1,
                notes: null,
                projects: { project_name: '' },
                worker_master: draggedItem.type === 'worker' ? { name: resources.find(r => r.id === draggedItem.id)?.name || '' } : null,
                vehicle_master: draggedItem.type === 'vehicle' ? { vehicle_name: resources.find(r => r.id === draggedItem.id)?.name || '' } : null,
            }
            next.push(newAssignment)
        }
        return next
    })

    const payload = {
        assignment_date: dateStr,
        project_id: targetProjectId,
        worker_id: draggedItem.type === 'worker' ? draggedItem.id : null,
        vehicle_id: draggedItem.type === 'vehicle' ? draggedItem.id : null,
        count: 1
    }

    try {
        if (sourceAssignment) {
            if (targetProjectId === "UNASSIGNED_POOL") {
                // Return to pool = delete assignment
                await supabase.from('assignments').delete().eq('id', sourceAssignment.id)
            } else {
                // Move assignment (update)
                // Actually, due to DB constraints or compound keys it might be safer to upsert or update
                // For now, if we don't have unique constraint on (project, date, worker), update should be fine
                await supabase.from('assignments').update(payload).eq('id', sourceAssignment.id)
                // Real ID remains the same, optimistic update was local
            }
        } else {
            if (targetProjectId !== "UNASSIGNED_POOL") {
                // Copy from pool -> Insert new
                const { data, error } = await supabase.from('assignments').insert([payload]).select().single()
                if (error) throw error
                setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: data.id } : a))
            }
        }
    } catch (err) {
        console.error("Drag and drop save error:", err)
        alert('操作の保存に失敗しました。再読み込みしてください。')
        fetchAssignments() // Re-fetch on error to sync state
    }
    
    setDraggedItem(null)
  }

  const handleDeleteAssignment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const previousAssignments = [...assignments]
    setAssignments(prev => prev.filter(a => a.id !== id))
    
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      console.error(err)
      setAssignments(previousAssignments)
      alert('削除に失敗しました')
    }
  }

  // --- Render Helpers ---
  const getAssignmentsForCell = (projectId: string, dateStr: string) => {
    return assignments.filter(a => a.project_id === projectId && a.assignment_date === dateStr)
  }

  // Unassigned pool logic
  const getUnassignedResources = (dateStr: string, type: 'worker'|'vehicle') => {
      return resources.filter(r => r.type === type && !assignments.some(a => 
          a.assignment_date === dateStr && 
          ((type === 'worker' && a.worker_id === r.id) || (type === 'vehicle' && a.vehicle_id === r.id))
      ))
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden -m-4 sm:-m-6 md:-m-8 text-slate-800" style={{ fontSize: \`\${fontSize}px\`}}>
      
      {/* ツールバー / ヘッダー */}
      <div className="bg-[#eef2f6] border-b px-4 py-2 flex items-center justify-between shrink-0 z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <CalendarDays className="w-5 h-5" /> 建設DX 工程管理
          </h1>
          <button onClick={fetchData} className="p-1 text-slate-500 hover:text-blue-600 bg-white border border-slate-300 rounded shadow-sm flex items-center gap-1 text-xs">
            <RefreshCw className={\`w-3.5 h-3.5 \${loading ? 'animate-spin' : ''}\`} />
            <span>待機中</span>
          </button>
        </div>
        
        <div className="flex items-center gap-6 bg-white px-4 py-1.5 rounded-full border shadow-sm">
          {/* 文字サイズスライダー */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">文字</span>
            <input 
              type="range" 
              min="10" 
              max="18" 
              value={fontSize} 
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-24 accent-blue-500"
            />
          </div>
          <div className="w-px h-6 bg-slate-200"></div>
          {/* 案件幅スライダー */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">案件幅</span>
            <input 
              type="range" 
              min="100" 
              max="300" 
              value={cellWidth} 
              onChange={(e) => setCellWidth(parseInt(e.target.value))}
              className="w-24 accent-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md border font-bold text-sm">
            <Users className="w-4 h-4" /> 閲覧モード
          </button>
          
          <div className="flex items-center border rounded-md shadow-sm bg-white overflow-hidden">
            <button onClick={() => setCurrentDate(subDays(currentDate, 7))} className="p-1.5 hover:bg-slate-100 px-2"><ChevronLeft className="w-4 h-4" /></button>
            <div className="font-bold text-sm px-4 border-x min-w-[5rem] text-center">{format(currentDate, 'M月')}</div>
            <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-1.5 hover:bg-slate-100 px-2"><ChevronRight className="w-4 h-4" /></button>
          </div>
          
          <button onClick={() => setCurrentDate(new Date())} className="bg-blue-600 text-white px-4 py-1.5 rounded-md font-bold text-sm shadow hover:bg-blue-700">
            今日
          </button>
          
          <button 
            onClick={() => setShowRightPanel(!showRightPanel)} 
            className={\`p-1.5 rounded-md border shadow-sm transition-colors \${showRightPanel ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-slate-600 hover:bg-slate-50'}\`}
            title="管理パネルの表示/非表示"
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <main className="flex-1 overflow-auto">
          <table className="border-collapse select-none bg-white min-w-max w-full">
            <thead className="sticky top-0 z-40 bg-[#eef2f6] shadow-sm">
              <tr>
                <th className="p-2 border-r border-b text-left text-sm font-bold text-slate-700 sticky left-0 z-50 bg-[#eef2f6]" style={{ width: '280px', minWidth: '280px' }}>
                  <div className="flex items-center justify-between">
                    <span>工事案件名称 / 現場名</span>
                    <select className="bg-white border text-xs px-1 py-0.5 rounded shadow-sm">
                       <option>すべての状態</option>
                       <option>着工中</option>
                    </select>
                  </div>
                  <div className="mt-2 relative">
                     <span className="absolute left-2 top-1.5 text-slate-400">🔍</span>
                     <input type="text" placeholder="案件名、現場名を検索..." className="w-full pl-6 pr-2 py-1 text-xs border rounded shadow-inner outline-none focus:ring-1 focus:ring-blue-500 font-normal" />
                  </div>
                </th>
                {dates.map((d, i) => {
                  const isToday = format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const colorClass = d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-blue-500' : 'text-slate-600'
                  return (
                    <th key={i} className={\`p-1.5 border-r border-b text-center align-top bg-[#eef2f6]\`} style={{ width: \`\${cellWidth}px\`, minWidth: \`\${cellWidth}px\`}}>
                      <div className={\`flex flex-col items-center justify-center p-1 rounded \${isToday ? 'bg-blue-100 ring-1 ring-blue-400' : ''}\`}>
                         <div className={\`text-xl font-bold leading-none \${colorClass}\`}>{d.getDate()}</div>
                         <div className={\`text-[10px] font-bold mt-0.5 \${colorClass}\`}>{format(d, 'E', { locale: ja })}</div>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            
            <tbody>
              {/* 未配置プール (Sticky Row) */}
              <tr className="bg-[#e9f5e9] sticky top-[71px] z-30 shadow-[0_2px_4px_rgba(0,0,0,0.05)] border-b-2 border-emerald-200">
                <td className="p-2 border-r font-bold text-emerald-700 border-b-emerald-200 text-sm align-top sticky left-0 bg-[#e9f5e9] z-40" style={{ width: '280px', minWidth: '280px' }}>
                  【未配置】 <span className="text-xs text-emerald-600/80 font-normal">人員のみ</span>
                </td>
                {dates.map(d => {
                  const dateStr = format(d, 'yyyy-MM-dd')
                  const poolWorkers = getUnassignedResources(dateStr, 'worker')
                  
                  return (
                    <td 
                      key={\`pool-\${dateStr}\`} 
                      className="p-1 border-r border-b-emerald-200 align-top max-h-[120px] overflow-y-auto"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, "UNASSIGNED_POOL", d)}
                    >
                      <div className="flex flex-wrap gap-1 content-start">
                        {poolWorkers.map(w => (
                           <div 
                              key={w.id} 
                              draggable
                              onDragStart={(e) => handleDragStart(e, w.id, 'worker', "UNASSIGNED_POOL", dateStr)}
                              className="px-1.5 py-0.5 text-xs bg-white border rounded shadow-sm text-slate-700 font-bold whitespace-nowrap cursor-grab hover:bg-slate-50 transition-colors flex items-center gap-1"
                           >
                              {w.name}
                              {w.name === "モンドラゴン　ホセ" && <span className="text-slate-400 font-normal text-[10px]">...</span>} 
                           </div>
                        ))}
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* 協力会社プール (Sticky Row pseudo) */}
              <tr className="bg-[#f3f0ff] border-b-2 border-purple-200">
                <td className="p-2 border-r font-bold text-purple-700 border-b-purple-200 text-sm align-top sticky left-0 bg-[#f3f0ff] z-20" style={{ width: '280px', minWidth: '280px' }}>
                  【協力会社 集計】
                </td>
                {dates.map((d, i) => (
                   <td key={i} className="p-1 border-r border-b-purple-200 align-top">
                      <div className="text-[10px] text-purple-600 bg-white border border-purple-100 rounded px-1 w-fit shadow-sm">
                         池沢:1名
                      </div>
                   </td>
                ))}
              </tr>

              {/* プロジェクト行 */}
              {sortedCategories.map(cat => (
                <Fragment key={cat}>
                  <tr className="bg-[#eef2f6] border-b border-t shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                    <td colSpan={8} className="px-2 py-1 font-bold text-slate-600 text-xs sticky left-0 z-20 bg-[#eef2f6]">
                      【区分：{cat}】 <span className="text-[10px] font-normal text-slate-400">※データありのみ表示中</span>
                    </td>
                  </tr>
                  
                  {groupedProjects[cat].map(p => (
                    <tr key={p.id} className="border-b hover:bg-slate-50/50 group">
                      <td className="p-2 border-r align-top sticky left-0 z-10 bg-white group-hover:bg-slate-50/50" style={{ width: '280px', minWidth: '280px' }}>
                         <div className="flex flex-col">
                            {p.no && <span className="text-[10px] font-bold text-blue-500">[{p.no}]</span>}
                            <span className="font-bold text-sm text-slate-800 leading-tight">{p.name}</span>
                            {p.site && <span className="text-[10px] text-slate-500 mt-0.5">{p.site}</span>}
                         </div>
                      </td>
                      {dates.map((d) => {
                          const dateStr = format(d, 'yyyy-MM-dd')
                          const cellAssignments = getAssignmentsForCell(p.id, dateStr)
                          
                          return (
                            <td 
                              key={\`\${p.id}-\${dateStr}\`}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, p.id, d)}
                              className="p-1 border-r align-top min-h-[60px] relative hover:bg-blue-50/20"
                            >
                               <div className="flex flex-col gap-1 min-h-[3rem]">
                                  {cellAssignments.map(a => (
                                     <div 
                                        key={a.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, a.worker_id ? a.worker_id : (a.vehicle_id as string), a.worker_id ? 'worker' : 'vehicle', p.id, dateStr)}
                                        className={\`flex items-center justify-between px-1.5 py-0.5 text-xs bg-white border border-l-[3px] rounded shadow-sm cursor-grab \${a.worker_id ? 'border-l-blue-500 font-bold text-slate-700' : 'border-l-emerald-500 font-bold text-slate-700'}\`}
                                     >
                                         <span className="truncate">{a.worker_id ? a.worker_master?.name : a.vehicle_master?.vehicle_name}</span>
                                         <button onClick={(e) => handleDeleteAssignment(a.id, e)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                                     </div>
                                  ))}
                               </div>
                            </td>
                          )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
              
            </tbody>
          </table>
          <div className="h-32"></div> {/* Bottom padding */}
        </main>

        {/* 右ペイン：管理パネル (TODO/メモ) */}
        {showRightPanel && (
          <aside className="w-72 bg-[#f8f9fa] border-l flex flex-col shrink-0 z-30 shadow-[-2px_0_8px_rgba(0,0,0,0.05)] transition-all">
             <div className="p-3 bg-[#eef2f6] border-b flex flex-col justify-center sticky top-0 h-[73px]">
                <h2 className="font-bold text-sm flex items-center gap-2 text-slate-700">
                   <Info className="w-4 h-4" /> 管理パネル
                </h2>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div>
                   <h3 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1"><MessageSquare className="w-4 h-4" /> 共有メモ</h3>
                   <div className="bg-[#fdfdfd] border border-slate-200 rounded p-3 text-xs text-slate-700 font-medium shadow-sm min-h-[120px]">
                      富士通ヴィラ⇒高圧ケーブル撤去工事<br/>
                      （工事日4月未定、人員4〜5人）
                   </div>
                </div>

                <div>
                   <div className="flex items-center justify-between mb-2">
                       <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1"><ListTodo className="w-4 h-4" /> TODO</h3>
                       <button className="text-slate-400 hover:text-blue-500"><History className="w-4 h-4" /></button>
                   </div>
                   {/* Empty TODO list for now */}
                   <div className="text-xs text-slate-400 text-center py-4">TODOはありません</div>
                </div>
             </div>
             
             {/* Temporary fab buttons like original app */}
             <div className="absolute right-4 bottom-8 flex flex-col gap-3">
                 <button className="w-10 h-10 bg-white border shadow-lg rounded-full flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all">
                    <List className="w-5 h-5" />
                 </button>
                 <button className="w-10 h-10 border shadow-lg rounded-full flex items-center justify-center hover:scale-105 transition-all overflow-hidden relative">
                    {/* Just a colorful icon replication */}
                    <div className="absolute inset-0 bg-blue-500"></div>
                    <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-yellow-400"></div>
                    <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-red-500"></div>
                    <Info className="w-5 h-5 text-white z-10 relative drop-shadow-md" />
                 </button>
             </div>
          </aside>
        )}
      </div>

      {/* 凡例フッター */}
      <div className="bg-[#eef2f6] border-t px-4 py-1.5 flex items-center gap-4 text-xs font-medium text-slate-500 z-50">
         <span>凡例:</span>
         <span className="text-red-600 font-bold">社長</span> / 
         <span className="text-blue-600 font-bold">人員</span> / 
         <span className="text-purple-600 font-bold">協力</span> / 
         <span className="text-emerald-600 font-bold">車両</span>
         <span className="ml-4 text-slate-400 border-l pl-4">| クラウド自動同期中</span>
      </div>

    </div>
  )
}
`

fs.writeFileSync(path, fullRewrite);

console.log("Rewrite complete.");
