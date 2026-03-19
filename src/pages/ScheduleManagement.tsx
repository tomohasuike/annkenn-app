import React, { useState, useEffect, Fragment } from "react"
import { createPortal } from "react-dom"
import { supabase } from "../lib/supabase"
import { format, addDays, subDays, startOfWeek } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Search, ChevronLeft, ChevronRight, Plus, RefreshCw, Users, MessageSquare, Info, X, CalendarDays, List, ListTodo, History, PanelLeft, ChevronDown, ChevronRight as ChevronRightIcon, Truck, FolderGit2, Trash2 } from 'lucide-react'

type ProjectData = { id: string; name: string; category: string; status: string; no: string | null; site: string | null; legacy_id?: string; client_name?: string | null; client_company_name?: string | null; folder_url?: string | null }
type ResourceData = { id: string; name: string; type: 'worker' | 'vehicle'; categoryId?: 'president' | 'employee' | 'partner' | 'vehicle' | 'machine' }
type ProjectDailyData = { id?: string; project_id: string; target_date: string; planned_count?: number | null; comment?: string | null }
type AssignmentData = {
  id: string
  assignment_date: string
  project_id: string
  worker_id: string | null
  vehicle_id: string | null
  count: number
  notes: string | null
  assigned_by?: string | null
  projects: { project_name: string } | null
  worker_master: { name: string, type?: string } | null
  vehicle_master: { vehicle_name: string } | null
}

type GlobalMemo = {
  id: string
  content: string
}

type TodoItem = {
  id: string
  text: string
  completed: boolean
  created_at?: string
}

export default function ScheduleManagement() {
  const [currentDate, setCurrentDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [syncStatus, setSyncStatus] = useState<'同期済み' | '更新中...'>('同期済み')
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentWorkerId, setCurrentWorkerId] = useState<string | null>(null)
  
  // Settings
  const [cellWidth, setCellWidth] = useState(120)
  const [fontSize, setFontSize] = useState(14)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('すべての状態')
  const [showLeftPanel, setShowLeftPanel] = useState(false)
  const [collapsedResources, setCollapsedResources] = useState<Record<string, boolean>>({})
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  
  // Mobile UI States
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    // Check initial width and set listener
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Data
  const [projectsList, setProjectsList] = useState<ProjectData[]>([])
  const [resources, setResources] = useState<ResourceData[]>([])
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  const [dailyData, setDailyData] = useState<ProjectDailyData[]>([])
  const [globalMemo, setGlobalMemo] = useState<GlobalMemo | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  
  // Right Panel state
  const [showTodoHistory, setShowTodoHistory] = useState(false)
  const [newTodoText, setNewTodoText] = useState("")
  
  // Modals state
  const [commentModalState, setCommentModalState] = useState<{ isOpen: boolean, projectId: string, dateStr: string, initialValue: string }>({ isOpen: false, projectId: '', dateStr: '', initialValue: '' })
  const [plannedCountModalState, setPlannedCountModalState] = useState<{ isOpen: boolean, projectId: string, dateStr: string, initialValue: string }>({ isOpen: false, projectId: '', dateStr: '', initialValue: '' })
  const [partnerCountModalState, setPartnerCountModalState] = useState<{ isOpen: boolean, assignmentId: string, initialValue: number }>({ isOpen: false, assignmentId: '', initialValue: 1 })
  const [mobileCellModalState, setMobileCellModalState] = useState<{ isOpen: boolean, projectId: string, dateStr: string, dailyDataId?: string }>({ isOpen: false, projectId: '', dateStr: '' })
  
  // Add Resource Modal
  const [showAddResourceModal, setShowAddResourceModal] = useState(false)
  const [newResourceName, setNewResourceName] = useState("")
  const [newResourceType, setNewResourceType] = useState<'president'|'employee'|'partner'|'vehicle'|'machine'>('employee')

  // Drag and drop / selection state
  type SelectedItem = { id: string, type: 'worker' | 'vehicle', sourceProjectId?: string, sourceDate?: string, assignmentId?: string };
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [draggedItems, setDraggedItems] = useState<SelectedItem[]>([])
  
  const checkIsSelected = (id: string, sourceProjectId?: string, sourceDate?: string, assignmentId?: string) => {
    return selectedItems.some(i => i.id === id && i.sourceProjectId === sourceProjectId && i.sourceDate === sourceDate && i.assignmentId === assignmentId);
  }

  const handleItemClick = (e: React.MouseEvent, item: SelectedItem) => {
    e.stopPropagation()
    if (!isAdmin) return
    setSelectedItems(prev => {
      const isSelected = prev.some(i => i.id === item.id && i.sourceProjectId === item.sourceProjectId && i.sourceDate === item.sourceDate && i.assignmentId === item.assignmentId)
      if (isSelected) {
        return prev.filter(i => !(i.id === item.id && i.sourceProjectId === item.sourceProjectId && i.sourceDate === item.sourceDate && i.assignmentId === item.assignmentId))
      } else {
        return [...prev, item]
      }
    })
  }

  const clearSelection = () => {
    if (selectedItems.length > 0) setSelectedItems([])
  }

  useEffect(() => {
    fetchData()
    
    // Setup Realtime Subscription
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log('Realtime update received:', payload)
          setSyncStatus('更新中...')
          
          if (payload.table === 'assignments' || payload.table === 'project_daily_data') {
            fetchAssignments().then(() => setSyncStatus('同期済み'))
          } else {
            fetchData().then(() => setSyncStatus('同期済み'))
          }
        }
      )
      .subscribe()

    // Auth and Permission Check
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email) {
          supabase.from('worker_master').select('is_admin, allowed_apps').eq('email', user.email).single()
            .then(({ data, error }) => {
                if (!error && data) {
                    const hasAdminApp = data.allowed_apps?.includes('schedule-admin') || false;
                    setIsAdmin(data.is_admin || hasAdminApp);
                    setCurrentWorkerId((data as any).id);
                }
            });
      }
    });

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    fetchAssignments()
  }, [currentDate])

  const fetchData = async () => {
    setSyncStatus('更新中...')
    try {
      const [projRes, workerRes, vehicleRes] = await Promise.all([
        supabase.from('projects').select('id, project_name, category, status_flag, project_number, site_name, legacy_id, client_name, client_company_name, folder_url').order('created_at', { ascending: false }),
        supabase.from('worker_master').select('id, name, type').eq('is_active', true).neq('type', '事務員').order('display_order', { ascending: true, nullsFirst: false }).order('id', { ascending: true }),
        supabase.from('vehicle_master').select('id, vehicle_name, category').eq('is_active', true).or('is_inspection_only.is.null,is_inspection_only.eq.false').order('created_at', { ascending: true })
      ])

      const pl = (projRes.data || []).map(p => ({ 
          id: p.id, 
          name: p.project_name, 
          category: p.category, 
          status: p.status_flag,
          no: p.project_number,
          site: p.site_name,
          legacy_id: p.legacy_id,
          client_name: p.client_name,
          client_company_name: p.client_company_name,
          folder_url: p.folder_url
      }))
      
      setProjectsList(pl)
      
      const newResources: ResourceData[] = []
      if (workerRes.data) {
        workerRes.data.forEach(w => {
           let catId: 'president' | 'employee' | 'partner' = 'employee'
           if (w.type === '社長') catId = 'president'
           if (w.type === '協力会社') catId = 'partner'
           newResources.push({ id: w.id, name: w.name, type: 'worker', categoryId: catId })
        })
      }
      if (vehicleRes.data) {
        vehicleRes.data.forEach(v => {
           const isMachine = v.category === '建設機械'
           newResources.push({ id: v.id, name: v.vehicle_name, type: 'vehicle', categoryId: isMachine ? 'machine' : 'vehicle' })
        })
      }
      setResources(newResources)

      const [memoRes, todoRes] = await Promise.all([
        supabase.from('global_memos').select('*').limit(1).maybeSingle(),
        supabase.from('todos').select('*').order('created_at', { ascending: false })
      ])
      
      if (memoRes.data) {
        setGlobalMemo(memoRes.data as GlobalMemo)
      } else {
        const { data: newMemo } = await supabase.from('global_memos').insert({ content: '' }).select().single()
        setGlobalMemo(newMemo as GlobalMemo)
      }
      
      if (todoRes.data) setTodos(todoRes.data as TodoItem[])

      await fetchAssignments()
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setSyncStatus('同期済み')
    }
  }

  const fetchAssignments = async () => {
    try {
      const start = currentDate
      const startDateStr = format(start, 'yyyy-MM-dd')
      const endDateStr = format(addDays(start, 6), 'yyyy-MM-dd')

      const { data, error } = await supabase
        .from('assignments')
        .select(`
          id, assignment_date, project_id, worker_id, vehicle_id, count, notes, assigned_by,
          projects(project_name), worker_master!assignments_worker_id_fkey(name, type), vehicle_master(vehicle_name)
        `)
        .gte('assignment_date', startDateStr)
        .lte('assignment_date', endDateStr)

      if (error) throw error
      setAssignments((data as any) || [])

      const { data: dailyRes, error: dailyErr } = await supabase
        .from('project_daily_data')
        .select('*')
        .gte('target_date', startDateStr)
        .lte('target_date', endDateStr)
      
      if (dailyErr) console.error("Error fetching daily data", dailyErr)
      else setDailyData(dailyRes || [])

    } catch (err) {
      console.error(err)
    } finally {
      setSyncStatus('同期済み')
    }
  }

  // --- Date Array ---
  const dates = Array.from({ length: 7 }).map((_, i) => addDays(currentDate, i))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Group by category
  const categoryOrder = ["一般", "役所", "川北", "BPE", "未分類"]
  
  const vacationProjId = projectsList.find(p => p.legacy_id === 'vacation' || p.category === 'その他' || p.name?.includes('休暇'))?.id || "vacation"
  
  const groupedProjects = projectsList.reduce((acc, p) => {
    if (p.id === vacationProjId) return acc

    if (statusFilter !== 'すべての状態' && p.status !== statusFilter) return acc

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matchNo = p.no?.toLowerCase().includes(term)
      const matchName = p.name?.toLowerCase().includes(term)
      const matchSite = p.site?.toLowerCase().includes(term)
      const matchClientName = p.client_name?.toLowerCase().includes(term)
      const matchClientCompany = p.client_company_name?.toLowerCase().includes(term)
      
      if (!matchNo && !matchName && !matchSite && !matchClientName && !matchClientCompany) {
        return acc
      }
    }

    let cat = p.category || '未分類'
    cat = cat.replace('【区分：', '').replace('】', '')
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, ProjectData[]>)
  
  const sortedCategories = Object.keys(groupedProjects).sort((a, b) => {
      const idxA = categoryOrder.indexOf(a)
      const idxB = categoryOrder.indexOf(b)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return a.localeCompare(b)
  })

  const toggleAllCategories = () => {
    const expectedLength = sortedCategories.length
    const collapsedCount = Object.values(collapsedCategories).filter(Boolean).length
    const isAllCollapsed = collapsedCount === expectedLength

    const newState: Record<string, boolean> = {}
    sortedCategories.forEach(cat => {
      newState[cat] = !isAllCollapsed
    })
    setCollapsedCategories(newState)
  }

  // --- Drag & Drop Handlers ---
  const canDragItem = (type: 'worker' | 'vehicle', assignmentId?: string) => {
    if (isAdmin) return true;
    if (type !== 'vehicle' || !currentWorkerId) return false;
    if (!assignmentId) return true;
    const a = assignments.find(x => x.id === assignmentId);
    return a?.assigned_by === currentWorkerId;
  };

  const handleDragStart = (e: React.DragEvent, id: string, type: 'worker' | 'vehicle', sourceProjectId?: string, sourceDate?: string, assignmentId?: string) => {
    if (!canDragItem(type, assignmentId)) {
      e.preventDefault();
      return;
    }
    const isSelected = checkIsSelected(id, sourceProjectId, sourceDate, assignmentId);
    let itemsToDrag = selectedItems;
    
    if (!isSelected) {
      // 選択されていないアイテムをつかんだ場合は、それが単一の選択（ドラッグ対象）になる
      itemsToDrag = [{ id, type, sourceProjectId, sourceDate, assignmentId }];
      setSelectedItems(itemsToDrag);
    }
    
    e.dataTransfer.setData("text/plain", `${type}:${id}`);
    setDraggedItems(itemsToDrag);
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = async (e: React.DragEvent, targetProjectId: string, targetDate: Date) => {
    e.preventDefault()
    if (draggedItems.length === 0) return
    const dateStr = format(targetDate, 'yyyy-MM-dd')
    
    const itemsToProcess = [...draggedItems];
    setDraggedItems([]);
    setSelectedItems([]); // ドロップ成功（またはリセット）とみなす
    
    // UIを即座に更新する（Optimistic UI）
    setAssignments(prev => {
        let next = [...prev];
        itemsToProcess.forEach((item, index) => {
            // 自身へのドロップは何もしない
            if (item.sourceProjectId === targetProjectId && item.sourceDate === dateStr) return;
            
            const sourceAssignment = item.assignmentId ? prev.find(a => a.id === item.assignmentId) : null;
            
            // 協力会社以外の場合、同じ日に既に配置されていないかチェックする
            if (item.type === 'worker') {
              const isPartner = resources.find(r => r.id === item.id)?.categoryId === 'partner'
              if (!isPartner && targetProjectId !== "UNASSIGNED_POOL") {
                const alreadyAssigned = next.some(a => 
                  a.assignment_date === dateStr && 
                  a.worker_id === item.id &&
                  a.id !== item.assignmentId
                )
                if (alreadyAssigned) return;
              }
            } else if (item.type === 'vehicle' && targetProjectId !== "UNASSIGNED_POOL") {
                const alreadyAssigned = next.some(a => 
                  a.assignment_date === dateStr && 
                  a.vehicle_id === item.id &&
                  a.id !== item.assignmentId
                )
                if (alreadyAssigned) return;
            }
            
            const tempId = `temp-${Date.now()}-${index}`;
            
            if (sourceAssignment) {
                next = next.filter(a => a.id !== sourceAssignment.id);
            }
            
            if (targetProjectId !== "UNASSIGNED_POOL") {
                const countToUse = sourceAssignment ? sourceAssignment.count : 1;
                const newAssignment: AssignmentData = {
                    id: tempId,
                    assignment_date: dateStr,
                    project_id: targetProjectId,
                    worker_id: item.type === 'worker' ? item.id : null,
                    vehicle_id: item.type === 'vehicle' ? item.id : null,
                    count: countToUse,
                    notes: sourceAssignment ? sourceAssignment.notes : null,
                    assigned_by: currentWorkerId,
                    projects: { project_name: '' },
                    worker_master: item.type === 'worker' ? (() => {
                       const r = resources.find(res => res.id === item.id);
                       if (!r) return null;
                       let dbType = '作業員';
                       if (r.categoryId === 'partner') dbType = '協力会社';
                       if (r.categoryId === 'president') dbType = '社長';
                       return { ...r, type: dbType } as any;
                    })() : null,
                    vehicle_master: item.type === 'vehicle' ? { vehicle_name: resources.find(r => r.id === item.id)?.name || '' } : null,
                }
                next.push(newAssignment);
            }
        });
        return next;
    });

    // DBへの保存
    for (const item of itemsToProcess) {
        if (item.sourceProjectId === targetProjectId && item.sourceDate === dateStr) continue;
        
        const sourceAssignment = item.assignmentId ? assignments.find(a => a.id === item.assignmentId) : null;
        
        let shouldSkip = false;
        if (item.type === 'worker') {
          const isPartner = resources.find(r => r.id === item.id)?.categoryId === 'partner'
          if (!isPartner && targetProjectId !== "UNASSIGNED_POOL") {
            const alreadyAssigned = assignments.some(a => 
              a.assignment_date === dateStr && 
              a.worker_id === item.id &&
              a.id !== item.assignmentId
            )
            if (alreadyAssigned) shouldSkip = true;
          }
        } else if (item.type === 'vehicle' && targetProjectId !== "UNASSIGNED_POOL") {
            const alreadyAssigned = assignments.some(a => 
              a.assignment_date === dateStr && 
              a.vehicle_id === item.id &&
              a.id !== item.assignmentId
            )
            if (alreadyAssigned) shouldSkip = true;
        }
        
        if (shouldSkip) continue;
        
        const payload = {
            assignment_date: dateStr,
            project_id: targetProjectId,
            worker_id: item.type === 'worker' ? item.id : null,
            vehicle_id: item.type === 'vehicle' ? item.id : null,
            count: sourceAssignment ? sourceAssignment.count : 1,
            assigned_by: currentWorkerId
        };

        try {
            if (sourceAssignment) {
                if (targetProjectId === "UNASSIGNED_POOL") {
                    await supabase.from('assignments').delete().eq('id', sourceAssignment.id);
                } else {
                    await supabase.from('assignments').update(payload).eq('id', sourceAssignment.id);
                }
            } else {
                if (targetProjectId !== "UNASSIGNED_POOL") {
                    await supabase.from('assignments').insert([payload]);
                }
            }
        } catch (err) {
            console.error("Drag and drop save error:", err);
        }
    }
    
    // 全ての更新が終わったら再取得
    fetchAssignments();
  }

  const handleAddResource = async () => {
    if (!newResourceName.trim()) return
    try {
      if (newResourceType === 'vehicle' || newResourceType === 'machine') {
        const catStr = newResourceType === 'machine' ? '建設機械' : '作業車'
        const { error } = await supabase.from('vehicle_master').insert({ vehicle_name: newResourceName.trim(), category: catStr, is_active: true })
        if (error) throw error
      } else {
        const typeStr = newResourceType === 'president' ? '社長' : newResourceType === 'partner' ? '協力会社' : '作業員'
        const { error } = await supabase.from('worker_master').insert({ name: newResourceName.trim(), type: typeStr, is_active: true })
        if (error) throw error
      }
      setShowAddResourceModal(false)
      setNewResourceName("")
      setNewResourceType('employee')
      fetchData() // Refresh list
    } catch (err) {
      console.error("Add resource error:", err)
      alert("リソースの追加に失敗しました。")
    }
  }

  const handleDeleteAssignment = async (assignmentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAdmin) return
    
    // Save previous state for optimistic UI rollback if needed
    const prevAssignments = [...assignments]
    setAssignments(prev => prev.filter(a => a.id !== assignmentId))
    
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)
      if (error) throw error
    } catch (err: any) {
      console.error('削除エラー:', err)
      alert('配置の解除に失敗しました。')
      setAssignments(prevAssignments)
    }
  }

  const getAssignmentsForCell = (projectId: string, dateStr: string) => {
    return assignments.filter(a => a.project_id === projectId && a.assignment_date === dateStr)
  }

  const getUnassignedResources = (dateStr: string, categoryId: 'president'|'employee'|'partner'|'vehicle'|'machine') => {
      // Very naive logic: if they are assigned to *any* project on this day, they are not unassigned.
      return resources.filter(r => r.categoryId === categoryId && !assignments.some(a => 
          a.assignment_date === dateStr && a.project_id !== "UNASSIGNED_POOL" &&
          ((r.type === 'worker' && a.worker_id === r.id) || (r.type === 'vehicle' && a.vehicle_id === r.id))
      ))
  }

  const updateDailyData = async (projectId: string, dateStr: string, updates: Partial<ProjectDailyData>) => {
    try {
      // Optimistic update
      setDailyData(prev => {
        const existingIdx = prev.findIndex(d => d.project_id === projectId && d.target_date === dateStr)
        if (existingIdx >= 0) {
          const next = [...prev]
          next[existingIdx] = { ...next[existingIdx], ...updates }
          return next
        } else {
          return [...prev, { project_id: projectId, target_date: dateStr, ...updates }]
        }
      })

      const { data: existing } = await supabase
        .from('project_daily_data')
        .select('id')
        .eq('project_id', projectId)
        .eq('target_date', dateStr)
        .maybeSingle()

      if (existing && existing.id) {
        await supabase.from('project_daily_data').update(updates).eq('id', existing.id)
      } else {
        await supabase.from('project_daily_data').insert({ project_id: projectId, target_date: dateStr, ...updates })
      }
    } catch (err) {
      console.error("Failed to update daily data:", err)
      fetchAssignments() // Revert on error
    }
  }

  const handlePlannedCountClick = (projectId: string, dateStr: string, currentVal: number | null | undefined, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setPlannedCountModalState({ isOpen: true, projectId, dateStr, initialValue: currentVal?.toString() || "" })
  }

  const handlePartnerCountClick = (assignmentId: string, currentVal: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!isAdmin) return
    setPartnerCountModalState({ isOpen: true, assignmentId, initialValue: currentVal })
  }

  const handleCommentClick = (projectId: string, dateStr: string, currentVal: string | null | undefined, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setCommentModalState({ isOpen: true, projectId, dateStr, initialValue: currentVal || "" })
  }

  // --- Right Panel Actions ---
  const handleMemoChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    if (globalMemo) {
      setGlobalMemo({ ...globalMemo, content: val })
      await supabase.from('global_memos').update({ content: val }).eq('id', globalMemo.id)
    }
  }

  const addTodo = async () => {
    if (!newTodoText.trim()) return
    const { data, error } = await supabase.from('todos').insert({ text: newTodoText }).select().single()
    if (!error && data) {
      setTodos([{ ...data, created_at: undefined }, ...todos]) // local UI insert
      setNewTodoText("")
    }
  }

  const toggleTodo = async (id: string, currentStatus: boolean) => {
    const updated = !currentStatus
    setTodos(todos.map(t => t.id === id ? { ...t, completed: updated } : t))
    await supabase.from('todos').update({ completed: updated }).eq('id', id)
  }

  const deleteTodo = async (id: string) => {
    if (!confirm('このTODOを削除しますか？')) return
    setTodos(todos.filter(t => t.id !== id))
    await supabase.from('todos').delete().eq('id', id)
  }

  const activeTodos = todos.filter(t => !t.completed)
  const completedTodos = todos.filter(t => t.completed)

  const renderCellModals = () => (
    <>
      {/* Modals for Cell Actions */}
      {commentModalState.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onPointerDown={() => setCommentModalState({ ...commentModalState, isOpen: false })}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in duration-200" onPointerDown={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700 flex items-center gap-0.5"><MessageSquare className="w-4 h-4 text-amber-500" /> コメント入力</h3>
              <button type="button" onClick={() => setCommentModalState({ ...commentModalState, isOpen: false })} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <textarea 
                className="w-full p-1 text-[0.95em] border border-slate-300 rounded outline-none focus:border-blue-500 min-h-[100px] resize-none focus:ring-1 focus:ring-blue-500"
                placeholder="コメントを入力してください"
                value={commentModalState.initialValue}
                onChange={(e) => setCommentModalState({ ...commentModalState, initialValue: e.target.value })}
                autoFocus
              />
              <div className="flex justify-end gap-0.5 pt-2">
                <button type="button" onClick={() => setCommentModalState({ ...commentModalState, isOpen: false })} className="px-4 py-2 font-bold text-[0.95em] text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition-colors">キャンセル</button>
                <button type="button" onClick={() => {
                  updateDailyData(commentModalState.projectId, commentModalState.dateStr, { comment: commentModalState.initialValue.trim() || null });
                  setCommentModalState({ ...commentModalState, isOpen: false });
                }} className="px-5 py-2 font-bold text-[0.95em] text-white bg-blue-600 rounded hover:bg-blue-700 shadow flex items-center gap-0.5 transition-colors">
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {plannedCountModalState.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onPointerDown={() => setPlannedCountModalState({ ...plannedCountModalState, isOpen: false })}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in duration-200" onPointerDown={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700">予定人員の入力</h3>
              <button type="button" onClick={() => setPlannedCountModalState({ ...plannedCountModalState, isOpen: false })} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <input 
                type="number"
                min="0"
                className="w-full p-0.5 text-[0.95em] border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="半角数字"
                value={plannedCountModalState.initialValue}
                onChange={(e) => setPlannedCountModalState({ ...plannedCountModalState, initialValue: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    let parsed: number | null = parseInt(plannedCountModalState.initialValue, 10);
                    if (isNaN(parsed) || plannedCountModalState.initialValue.trim() === "") parsed = null;
                    updateDailyData(plannedCountModalState.projectId, plannedCountModalState.dateStr, { planned_count: parsed });
                    setPlannedCountModalState({ ...plannedCountModalState, isOpen: false });
                  }
                }}
                autoFocus
              />
              <div className="flex justify-end gap-0.5 pt-2">
                <button type="button" onClick={() => setPlannedCountModalState({ ...plannedCountModalState, isOpen: false })} className="px-4 py-2 font-bold text-[0.95em] text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition-colors">キャンセル</button>
                <button type="button" onClick={() => {
                  let parsed: number | null = parseInt(plannedCountModalState.initialValue, 10);
                  if (isNaN(parsed) || plannedCountModalState.initialValue.trim() === "") parsed = null;
                  updateDailyData(plannedCountModalState.projectId, plannedCountModalState.dateStr, { planned_count: parsed });
                  setPlannedCountModalState({ ...plannedCountModalState, isOpen: false });
                }} className="px-5 py-2 font-bold text-[0.95em] text-white bg-blue-600 rounded hover:bg-blue-700 shadow flex items-center gap-0.5 transition-colors">
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {partnerCountModalState.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onPointerDown={() => setPartnerCountModalState({ ...partnerCountModalState, isOpen: false })}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in duration-200" onPointerDown={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700">協力会社の人数の入力</h3>
              <button type="button" onClick={() => setPartnerCountModalState({ ...partnerCountModalState, isOpen: false })} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <input 
                type="number"
                min="0"
                className="w-full p-0.5 text-[0.95em] border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="半角数字"
                value={partnerCountModalState.initialValue}
                onChange={(e) => setPartnerCountModalState({ ...partnerCountModalState, initialValue: parseInt(e.target.value) || 0 })}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const parsed = partnerCountModalState.initialValue;
                    if (isNaN(parsed) || parsed < 0) return;
                    try {
                      setAssignments(prev => prev.map(a => a.id === partnerCountModalState.assignmentId ? { ...a, count: parsed } : a));
                      const { error } = await supabase.from('assignments').update({ count: parsed }).eq('id', partnerCountModalState.assignmentId);
                      if (error) throw error;
                    } catch (err) {
                      console.error("Failed to update partner count:", err);
                      fetchAssignments();
                    }
                    setPartnerCountModalState({ ...partnerCountModalState, isOpen: false });
                  }
                }}
                autoFocus
              />
              <div className="flex justify-end gap-0.5 pt-2">
                <button type="button" onClick={() => setPartnerCountModalState({ ...partnerCountModalState, isOpen: false })} className="px-4 py-2 font-bold text-[0.95em] text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition-colors">キャンセル</button>
                <button type="button" onClick={async () => {
                  const parsed = partnerCountModalState.initialValue;
                  if (isNaN(parsed) || parsed < 0) return;
                  try {
                    setAssignments(prev => prev.map(a => a.id === partnerCountModalState.assignmentId ? { ...a, count: parsed } : a));
                    const { error } = await supabase.from('assignments').update({ count: parsed }).eq('id', partnerCountModalState.assignmentId);
                    if (error) throw error;
                  } catch (err) {
                    console.error("Failed to update partner count:", err);
                    fetchAssignments();
                  }
                  setPartnerCountModalState({ ...partnerCountModalState, isOpen: false });
                }} className="px-5 py-2 font-bold text-[0.95em] text-white bg-blue-600 rounded hover:bg-blue-700 shadow flex items-center gap-0.5 transition-colors">
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );

  const handleAddAssignmentMobile = async (resourceId: string) => {
    const { projectId, dateStr } = mobileCellModalState;
    if (!projectId || !dateStr) return;
    
    // Default count to 1
    const { error } = await supabase.from('assignments').insert({
      project_id: projectId,
      worker_id: resources.find(r => r.id === resourceId)?.type === 'worker' ? resourceId : null,
      vehicle_id: resources.find(r => r.id === resourceId)?.type === 'vehicle' ? resourceId : null,
      assignment_date: dateStr,
      count: 1,
      assigned_by: currentWorkerId
    }).select().single();
    
    if (error) {
      console.error("Failed to add assignment", error);
      return;
    }
    
    fetchAssignments();
  }

  const handleDeleteAssignmentMobile = async (assignmentId: string) => {
     try {
       setAssignments(prev => prev.filter(a => a.id !== assignmentId))
       const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)
       if (error) throw error
     } catch (err) {
       console.error("Failed to delete assignment:", err)
       fetchAssignments()
     }
  }

  const renderMobileCellModal = () => {
    if (!mobileCellModalState.isOpen) return null;
    const { projectId, dateStr } = mobileCellModalState;
    const project = projectsList.find(p => p.id === projectId);
    
    // Get existing assignments
    const asg = assignments.filter(a => a.project_id === projectId && a.assignment_date === dateStr);
    
    return createPortal(
      <>
        <div className="fixed inset-0 bg-slate-900/40 z-[9999] opacity-100 transition-opacity" onClick={() => setMobileCellModalState({ ...mobileCellModalState, isOpen: false })} />
        <div className="fixed inset-x-0 bottom-0 z-[10000] bg-slate-50 rounded-t-xl shadow-2xl flex flex-col h-[85vh] transform transition-transform border border-slate-200" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-white rounded-t-xl shrink-0">
             <div>
               <div className="font-bold text-[14px] text-slate-800 flex items-center gap-1"><CalendarDays className="w-4 h-4 text-blue-600"/> {format(new Date(dateStr), 'M/d')} ({['日','月','火','水','木','金','土'][new Date(dateStr).getDay()]})</div>
               <div className="text-[12px] text-slate-500 font-medium line-clamp-1 break-all pr-2 mt-0.5">{project?.name}</div>
             </div>
             <button onClick={() => setMobileCellModalState({ ...mobileCellModalState, isOpen: false })} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0">
               <X className="w-5 h-5"/>
             </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar flex flex-col gap-4">
             {/* 既に配置されているリソース一覧 */}
             <div className="bg-white rounded border border-slate-200 shadow-sm p-3">
               <div className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-100"><Users className="w-3.5 h-3.5"/> 配置済みリソース</div>
               {asg.length === 0 ? (
                 <div className="text-[11px] text-slate-400 py-2 text-center">配置されていません</div>
               ) : (
                 <div className="flex flex-col gap-1.5 mt-2">
                   {asg.map(a => {
                     const isWorker = !!a.worker_id;
                     const isPartner = a.worker_master?.type === '協力会社';
                     const canEdit = isAdmin || a.assigned_by === currentWorkerId;
                     
                     let bgClass = "bg-blue-50 border-blue-200 text-blue-800";
                     if (isPartner) bgClass = "bg-purple-50 border-purple-200 text-purple-800";
                     if (!isWorker) bgClass = "bg-teal-50 border-teal-200 text-teal-800";
                     
                     return (
                       <div key={a.id} className={`flex items-center justify-between p-1.5 px-2 rounded border shadow-sm ${bgClass}`}>
                         <span className="text-[12px] font-bold truncate pr-2">
                           {a.worker_master?.name || a.vehicle_master?.vehicle_name}
                           {isPartner && <span className="ml-2 font-black">× {a.count}</span>}
                         </span>
                         {canEdit && (
                           <button onClick={(e) => { e.stopPropagation(); handleDeleteAssignmentMobile(a.id); }} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded bg-white flex-shrink-0 border border-rose-200/50">
                             <Trash2 className="w-3.5 h-3.5" />
                           </button>
                         )}
                       </div>
                     )
                   })}
                 </div>
               )}
             </div>

             {/* 新規リソースの追加 */}
             <div className="bg-white rounded border border-slate-200 shadow-sm p-3">
               <div className="text-[12px] font-bold text-slate-700 mb-2 pb-1.5 border-b border-slate-100 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-blue-500"/> リソースを追加</div>
               
               {/* Categories */}
               <div className="flex flex-col gap-3 mt-2">
                  {(['president', 'employee', 'partner', 'vehicle', 'machine'] as const).map(catId => {
                    // 非管理者は車両と建機のみ追加可能
                    if (!isAdmin && (catId === 'president' || catId === 'employee' || catId === 'partner')) return null;
                    
                    const catNameMap = { president: '社長', employee: '作業員', partner: '協力会社', vehicle: '車両', machine: '建設機械' };
                    const unassg = getUnassignedResources(dateStr, catId);
                    
                    if (unassg.length === 0) return null;
                     
                    return (
                      <div key={catId} className="flex flex-col gap-1.5">
                        <div className="text-[11px] font-bold text-slate-500 flex justify-between items-center">
                          {catNameMap[catId]}
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px]">{unassg.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {unassg.map(r => (
                            <button
                              key={r.id}
                              onClick={() => handleAddAssignmentMobile(r.id)}
                              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-bold text-slate-700 shadow-sm hover:bg-blue-50 active:bg-blue-100 transition-colors"
                            >
                              {r.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
               </div>
             </div>
          </div>
        </div>
      </>,
      document.body
    );
  };

  // --- Render Mobile View (Horizontal 1-Week Scroll) ---
  if (isMobile) {
    const prevWeek = () => setCurrentDate(subDays(currentDate, 7))
    const nextWeek = () => setCurrentDate(addDays(currentDate, 7))

    return (
      <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-50 font-sans text-slate-800 -m-4 sm:-m-8">
         {/* モバイルヘッダー */}
         <div className="bg-white border-b px-2 py-2 flex flex-col gap-2 shrink-0 z-50">
            <div className="flex items-center justify-between">
               <h1 className="text-[15px] font-bold flex items-center gap-1 text-slate-800">
                  <CalendarDays className="w-4 h-4 text-blue-600" /> 工程管理 <span className="text-[10px] text-slate-400 border px-1 rounded-full bg-slate-50 shadow-sm ml-0.5">モバイル</span>
               </h1>
               <div className="flex gap-1">
                 <button onClick={() => setCurrentDate(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 font-bold rounded shadow-sm hover:bg-blue-200">今日</button>
                 <button onClick={fetchData} className="p-1.5 bg-slate-100 text-slate-600 rounded flex items-center shadow-sm hover:bg-slate-200">
                   <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === '更新中...' ? 'animate-spin' : ''}`} />
                 </button>
               </div>
            </div>
            
            <div className="flex items-center justify-between border border-slate-200 rounded-md bg-white shadow-sm px-1 py-0.5">
               <button onClick={prevWeek} className="p-1 hover:bg-slate-100 rounded text-slate-500"><ChevronLeft className="w-6 h-6"/></button>
               <div className="font-extrabold text-[14px] text-slate-700 tracking-wide">
                 {format(dates[0], 'M/d')} - {format(dates[6], 'M/d')}
               </div>
               <button onClick={nextWeek} className="p-1 hover:bg-slate-100 rounded text-slate-500"><ChevronRight className="w-6 h-6"/></button>
            </div>
         </div>
         
         {/* 横スクロール対応の週次マトリックス */}
         <div className="flex-1 overflow-auto relative custom-scrollbar bg-slate-200">
           <table className="w-max border-collapse bg-white text-xs">
             <thead className="sticky top-0 z-40 bg-[#f8f9fa] shadow-sm">
               <tr>
                 <th className="sticky left-0 z-50 bg-[#f8f9fa] border-r border-b border-slate-300 p-2 w-[120px] min-w-[120px] max-w-[120px] shadow-[2px_0_5px_rgba(0,0,0,0.05)] text-left font-bold text-slate-600 align-bottom">
                   工事件名
                 </th>
                 {dates.map((d, i) => {
                   const isToday = format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                   const dayStr = ['日','月','火','水','木','金','土'][d.getDay()];
                   const colorClass = d.getDay() === 0 ? 'text-red-600' : d.getDay() === 6 ? 'text-blue-600' : 'text-slate-700';
                   return (
                     <th key={i} className={`p-1 border-r border-b border-slate-300 w-[100px] min-w-[100px] max-w-[100px] text-center ${isToday ? 'bg-blue-100' : 'bg-white'}`}>
                       <div className={`font-bold text-[14px] leading-tight ${colorClass}`}>{format(d, 'd')}</div>
                       <div className={`text-[10px] font-medium leading-none mt-0.5 ${colorClass}`}>{dayStr}</div>
                     </th>
                   )
                 })}
               </tr>
             </thead>
             <tbody>
               
               {/* 休暇・不在（常に上部固定に近い感じで配置） */}
               <tr className="bg-rose-50/80 border-b-2 border-rose-200">
                 <td className="sticky left-0 z-30 bg-rose-50 border-r border-rose-200 p-1.5 align-top font-bold text-[10px] text-rose-800 leading-tight w-[120px] min-w-[120px] max-w-[120px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    【休暇・不在】
                 </td>
                 {dates.map((d, i) => {
                   const dStr = format(d, 'yyyy-MM-dd');
                   const asg = getAssignmentsForCell(vacationProjId, dStr);
                   const isColToday = dStr === format(today, 'yyyy-MM-dd');
                   return (
                      <td key={i} className={`p-1 border-r border-rose-100 align-top w-[100px] min-w-[100px] max-w-[100px] ${isColToday ? 'bg-blue-50/30' : ''}`}>
                         <div className="flex flex-col gap-0.5 min-h-[1.5rem]">
                            {asg.map(a => (
                               <div key={a.id} className="text-[10px] font-bold bg-white text-rose-700 border border-rose-200 rounded-sm px-1 py-0.5 shadow-sm truncate w-full text-center">
                                 {a.worker_id ? a.worker_master?.name : a.vehicle_master?.vehicle_name}
                               </div>
                            ))}
                         </div>
                      </td>
                   )
                 })}
               </tr>

               {/* 稼働プロジェクト */}
               {sortedCategories.map(cat => {
                 const isCollapsed = collapsedCategories[cat];
                 const currentCatProjects = groupedProjects[cat];
                 if (!currentCatProjects || currentCatProjects.length === 0) return null;

                 const headerRow = (
                   <tr key={`cat-${cat}`} className="bg-[#eef2f6] border-b border-t border-slate-300 cursor-pointer hover:bg-[#e2e8f0] transition-colors" onClick={() => setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}>
                      <td className="sticky left-0 z-30 bg-[#eef2f6] border-r border-slate-300 p-1.5 font-bold text-slate-700 text-[10px] w-[120px] min-w-[120px] max-w-[120px]">
                         <div className="flex items-center gap-0.5">
                            {isCollapsed ? <ChevronRightIcon className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                            <span className="truncate">【区分：{cat}】</span> 
                         </div>
                      </td>
                      <td colSpan={7} className="px-1 py-0.5 bg-[#eef2f6]">
                         <span className="text-[9px] font-normal text-slate-400">
                           {isCollapsed ? `※データありのみ (${currentCatProjects.filter(p => dates.some(d => {
                               const dStr = format(d, 'yyyy-MM-dd');
                               const asg = getAssignmentsForCell(p.id, dStr);
                               const daily = dailyData.find(dd => dd.project_id === p.id && dd.target_date === dStr);
                               return asg.length > 0 || !!daily?.planned_count || !!daily?.comment;
                           })).length}件)` : `※すべて表示 (${currentCatProjects.length}件)`}
                         </span>
                      </td>
                   </tr>
                 );

                 return (
                   <Fragment key={`mobile-cat-${cat}`}>
                     {headerRow}
                     {currentCatProjects.map(p => {
                        const projectHasData = dates.some(d => {
                           const dStr = format(d, 'yyyy-MM-dd')
                           const asg = getAssignmentsForCell(p.id, dStr)
                           const daily = dailyData.find(dd => dd.project_id === p.id && dd.target_date === dStr)
                           return asg.length > 0 || !!daily?.planned_count || !!daily?.comment
                        });

                        if (isCollapsed && !projectHasData) return null;

                        return (
                          <tr key={p.id} className="border-b border-slate-200 hover:bg-blue-50/50 transition-colors bg-white">
                         {/* 左側ヘッダー（固定） */}
                         <td className="sticky left-0 z-30 bg-white border-r border-slate-200 p-1.5 align-top shadow-[2px_0_5px_rgba(0,0,0,0.02)] w-[120px] min-w-[120px] max-w-[120px]">
                            <div className="flex flex-col gap-0.5">
                               {p.no && <span className="text-[9px] font-bold text-blue-600 leading-none">[{p.no}]</span>}
                               <div className="font-bold text-[11px] text-slate-800 leading-snug break-all line-clamp-2">{p.name}</div>
                               <div className="text-[9px] text-slate-500 leading-tight truncate">
                                  {(p.category === '一般' || p.category === '役所') ? (p.client_company_name || p.client_name) : p.site}
                               </div>
                            </div>
                         </td>
                         {/* 日付セル */}
                         {dates.map((d, i) => {
                           const dStr = format(d, 'yyyy-MM-dd');
                           const asg = getAssignmentsForCell(p.id, dStr);
                           const daily = dailyData.find(dd => dd.project_id === p.id && dd.target_date === dStr);
                           
                           const workers = asg.filter(a => a.worker_id && a.worker_master?.type !== '協力会社');
                           const partners = asg.filter(a => a.worker_master?.type === '協力会社');
                           const vehicles = asg.filter(a => a.vehicle_id);
                           
                           const sumWorkers = workers.length + partners.reduce((sum, ptr) => sum + (ptr.count || 1), 0);
                           const isColToday = dStr === format(today, 'yyyy-MM-dd')
                           
                           const isShort = daily?.planned_count && sumWorkers < daily.planned_count;

                           return (
                             <td 
                               key={i} 
                               className={`group/cell p-1 border-r border-slate-100 align-top w-[100px] min-w-[100px] max-w-[100px] relative cursor-pointer hover:bg-slate-50 transition-colors ${isColToday ? 'bg-blue-50/20' : ''}`}
                               onClick={() => setMobileCellModalState({ isOpen: true, projectId: p.id, dateStr: dStr, dailyDataId: daily?.id })}
                             >
                               <div className="flex flex-col gap-1 min-h-[40px]">
                                  {/* 予定人数とコメント入力エリア */}
                                  <div className="flex items-start justify-between mb-0.5 border-b border-slate-100 pb-0.5 gap-1">
                                     {/* 予定人数 */}
                                     <div 
                                       className="flex-shrink-0 cursor-pointer"
                                       onClick={(e) => handlePlannedCountClick(p.id, dStr, daily?.planned_count, e)}
                                       title="予定人員を入力"
                                     >
                                       {(sumWorkers > 0 || !!daily?.planned_count) ? (
                                         <span className={`text-[9px] font-bold px-1 rounded-sm tracking-tighter ${isShort ? 'bg-red-50 text-red-600' : 'text-emerald-700'} hover:bg-slate-200 transition-colors block leading-none py-0.5`}>
                                            予:{daily?.planned_count || '-'} / 実:{sumWorkers}
                                         </span>
                                       ) : (
                                         <span className="text-[9px] font-bold px-1 rounded-sm text-slate-300 hover:text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 border-dashed block leading-none py-0.5 transition-colors">
                                            予: +
                                         </span>
                                       )}
                                     </div>
                                     
                                     {/* コメント */}
                                     <div 
                                       className="flex-1 cursor-pointer min-w-0 flex justify-end"
                                       onClick={(e) => handleCommentClick(p.id, dStr, daily?.comment, e)}
                                       title={daily?.comment ? "コメントを編集" : "コメントを追加"}
                                     >
                                       {daily?.comment ? (
                                         <div className="text-[8px] px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 line-clamp-2 leading-tight break-all text-left w-full shadow-[0_1px_1px_rgba(0,0,0,0.02)]">
                                           {daily.comment}
                                         </div>
                                       ) : (
                                         <div className="p-0.5 bg-slate-50 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 border border-slate-200 border-dashed transition-colors flex items-center justify-center">
                                           <MessageSquare className="w-2.5 h-2.5" />
                                         </div>
                                       )}
                                     </div>
                                  </div>
                                  
                                  <div className="flex flex-col gap-0.5">
                                     {/* 作業員 */}
                                     {workers.map(w => (
                                       <div key={`w-${w.id}`} className="text-[10px] font-bold bg-blue-50 text-blue-700 border-l-[2px] border-blue-400 px-1 py-0.5 rounded-sm truncate w-full shadow-[0_1px_1px_rgba(0,0,0,0.02)]">
                                         {w.worker_master?.name}
                                       </div>
                                     ))}
                                     {/* 協力会社 */}
                                     {partners.map(w => (
                                       <div key={`p-${w.id}`} className="text-[10px] font-bold bg-purple-50 text-purple-700 border-l-[2px] border-purple-400 pl-1 pr-0.5 py-0.5 rounded-sm truncate w-full flex justify-between items-center shadow-[0_1px_1px_rgba(0,0,0,0.02)] mt-[1px]">
                                         <span className="truncate">{w.worker_master?.name}</span>
                                         <span className="ml-[1px] shrink-0 border border-purple-200 bg-white text-purple-800 rounded px-[2px] text-[8px] leading-none py-[1px] font-black">{w.count||1}</span>
                                       </div>
                                     ))}
                                     {/* 車両 */}
                                     {vehicles.map(v => (
                                       <div key={`v-${v.id}`} className="text-[9px] font-bold bg-teal-50 text-teal-700 border-l-[2px] border-teal-400 px-1 py-0.5 rounded-sm truncate w-full shadow-[0_1px_1px_rgba(0,0,0,0.02)] mt-[1px]">
                                         {v.vehicle_master?.vehicle_name}
                                       </div>
                                     ))}
                                     
                                     {/* +追加ボタン（見た目のみ、タップは親のtd要素で処理される） */}
                                     <div className="mt-1 flex justify-center">
                                       <div className="text-[9px] text-slate-400 border border-slate-200 border-dashed rounded bg-slate-50 w-full py-0.5 flex items-center justify-center gap-0.5 hover:bg-slate-100 transition-colors">
                                         <Plus className="w-2.5 h-2.5" /> 追加
                                       </div>
                                     </div>
                                  </div>
                               </div>
                             </td>
                           );
                         })}
                       </tr>
                     );
                     })}
                   </Fragment>
                 );
               })}
             </tbody>
           </table>
         </div>
         {/* ボトムスペーサー代わり */}
         <div className="h-6 shrink-0 bg-slate-50"></div>
         {renderCellModals()}
         {renderMobileCellModal()}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden -m-4 sm:-m-6 md:-m-8 text-slate-800" style={{ fontSize: `${fontSize}px`}} onClick={clearSelection}>
      
      {/* ツールバー / ヘッダー */}
      <div className="bg-[#eef2f6] border-b px-4 py-2 flex items-center justify-between shrink-0 z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-0.5">
            {isAdmin && (
              <button onClick={() => setShowLeftPanel(!showLeftPanel)} className={`p-0.5 rounded transition-colors ${showLeftPanel ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100 hover:text-blue-600'}`} title="リソース一覧">
                <PanelLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-xl font-bold flex items-center gap-0.5 text-slate-800 ml-1">
              <CalendarDays className="w-5 h-5 text-slate-600" /> 建設DX 工程管理
            </h1>
          </div>
          <button onClick={fetchData} className={`p-1 px-2 text-slate-500 hover:text-blue-600 bg-white border border-slate-300 rounded shadow-sm flex items-center gap-0.5 text-[0.85em] transition-colors ${syncStatus === '更新中...' ? 'bg-blue-50 border-blue-200 text-blue-600' : ''}`}>
            {syncStatus === '更新中...' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>{syncStatus}</span>
          </button>
        </div>
        
        <div className="flex items-center gap-6 bg-[#f8f9fa] px-4 py-1.5 rounded-full border shadow-sm">
          <div className="flex items-center gap-0.5">
            <span className="text-[0.85em] font-bold text-slate-500">文字</span>
            <input type="range" min="10" max="18" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-24 accent-blue-500" />
          </div>
          <div className="w-px h-6 bg-slate-300"></div>
          <div className="flex items-center gap-0.5">
            <span className="text-[0.85em] font-bold text-slate-500">案件幅</span>
            <input type="range" min="100" max="300" value={cellWidth} onChange={(e) => setCellWidth(parseInt(e.target.value))} className="w-24 accent-blue-500" />
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button 
            className={`flex items-center gap-0.5 px-1 py-0.5 rounded border font-bold text-[0.95em] shadow-sm transition-colors ${isAdmin ? 'bg-purple-600 text-white border-purple-700' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            <Users className="w-4 h-4" /> {isAdmin ? "👑 管理モード" : "👤 閲覧モード"}
          </button>
          
          <div className="flex items-center border border-slate-300 rounded shadow-sm bg-white overflow-hidden">
            <button onClick={() => setCurrentDate(subDays(currentDate, 7))} className="p-0.5 hover:bg-slate-100 px-3 border-r border-slate-200 text-slate-600"><ChevronLeft className="w-4 h-4" /></button>
            <div className="font-bold text-[0.95em] px-4 min-w-[5rem] text-center">{format(currentDate, 'M月')}</div>
            <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-0.5 hover:bg-slate-100 px-3 border-l border-slate-200 text-slate-600"><ChevronRight className="w-4 h-4" /></button>
          </div>
          
          <button onClick={() => setCurrentDate(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="bg-blue-600 text-white px-4 py-1.5 rounded font-bold text-[0.95em] shadow hover:bg-blue-700 transition-colors">
            今日
          </button>
          
          <button onClick={() => setShowRightPanel(!showRightPanel)} className={`p-0.5 rounded shadow-sm transition-colors border ${showRightPanel ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`} title="管理パネル">
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        
        {/* 左サイドバー：リソース一覧（表示ONの時） */}
        {showLeftPanel && (
          <aside className="w-64 bg-white border-r border-[#dee2e6] flex flex-col shadow-inner shrink-0 z-30">
            <div className="p-1 border-b border-[#dee2e6] bg-[#f8f9fa]">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-bold text-slate-700 flex items-center gap-0.5 text-[0.95em]"><Users className="w-4 h-4 text-blue-500" /> リソース</h2>
                <button 
                  onClick={() => setShowAddResourceModal(true)}
                  className="p-1 rounded text-blue-600 hover:bg-blue-100 transition-colors"
                  title="リソースを追加"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-0.5 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="人員・車両を検索..." 
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-[0.95em] outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-inner" 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-1 bg-slate-50/50">
              {(['president', 'employee', 'partner', 'vehicle', 'machine'] as const).map((typeKey) => {
                const resourcesForThisKey = resources.filter(r => r.categoryId === typeKey && r.name.includes(searchTerm));
                if (resourcesForThisKey.length === 0) return null;
                const isCollapsed = collapsedResources[`left_${typeKey}`];
                const typeLabel = typeKey === 'president' ? '社長' : typeKey === 'employee' ? '作業員' : typeKey === 'partner' ? '協力会社' : typeKey === 'vehicle' ? '作業車' : '建設機械';
                const typeColor = typeKey === 'president' ? 'text-blue-800' : typeKey === 'employee' ? 'text-blue-600' : typeKey === 'partner' ? 'text-purple-600' : typeKey === 'machine' ? 'text-teal-600' : 'text-emerald-600';
                const typeBorder = typeKey === 'president' ? 'border-l-blue-800 border-opacity-70' : typeKey === 'employee' ? 'border-l-blue-400' : typeKey === 'partner' ? 'border-l-purple-400' : typeKey === 'machine' ? 'border-l-teal-400' : 'border-l-emerald-400';
                const Icon = (typeKey === 'vehicle' || typeKey === 'machine') ? Truck : Users;

                return (
                  <div key={typeKey} className="mb-4">
                    <h3 
                      className="text-[0.85em] font-bold text-slate-500 mb-2 uppercase tracking-wide flex items-center gap-0.5 cursor-pointer hover:text-slate-700 transition-colors"
                      onClick={() => setCollapsedResources(prev => ({ ...prev, [`left_${typeKey}`]: !prev[`left_${typeKey}`] }))}
                    >
                      <Icon className={`w-3.5 h-3.5 ${typeColor}`} /> {typeLabel} 
                      {isCollapsed ? <ChevronRightIcon className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                    </h3>
                    {!isCollapsed && (
                        <div className="space-y-1">
                        {resourcesForThisKey.map(res => {
                            return (
                            <div 
                                key={res.id} 
                                draggable={canDragItem(res.type as 'worker'|'vehicle')}
                                onDragStart={(e) => handleDragStart(e, res.id, res.type as 'worker'|'vehicle')}
                                onClick={(e) => handleItemClick(e, { id: res.id, type: res.type as 'worker' | 'vehicle' })}
                                className={`px-1 py-0.5 border border-slate-200 rounded-md border-l-4 ${typeBorder} font-bold text-[0.95em] flex items-center justify-between transition-all bg-white shadow-sm ${checkIsSelected(res.id) ? 'shadow-md ring-2 ring-blue-400 bg-blue-50/50 scale-[1.02] -translate-y-[1px] z-10' : ''} ${canDragItem(res.type as 'worker'|'vehicle') ? 'cursor-grab hover:bg-slate-50 hover:border-slate-300' : 'cursor-default opacity-60'}`}
                            >
                                <span className="truncate">{res.name}</span>
                            </div>
                            );
                        })}
                        </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-auto bg-[#f8f9fa]">
          <table className="border-collapse select-none bg-white min-w-max w-full">
            <thead className="sticky top-0 z-40 bg-[#f8f9fa]">
              <tr>
                <th className="p-0.5 py-3 border-b-2 border-r border-[#dee2e6] text-left text-[0.95em] font-bold text-slate-700 sticky left-0 z-50 bg-[#eef2f6]" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent text-[0.95em] font-bold text-slate-700 cursor-pointer outline-none">
                       <option>すべての状態</option>
                       <option>着工前</option>
                       <option>着工中</option>
                    </select>
                    <button 
                       onClick={toggleAllCategories}
                       title="すべての区分を開閉（一括表示）"
                       className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors ml-2 flex items-center gap-0.5"
                    >
                       <List className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative px-1">
                     <span className="absolute left-3 top-0.5 text-slate-400 font-normal">🔍</span>
                     <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="工事番号、案件名、現場名、発注者を検索..." className="w-full pl-7 pr-2 py-1.5 font-normal text-[0.95em] border border-slate-300 rounded outline-none focus:ring-1 focus:ring-blue-500 shadow-inner" />
                  </div>
                </th>
                {dates.map((d, i) => {
                  const isToday = format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
                  const colorClass = d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-slate-400' : 'text-slate-500'
                  return (
                    <th key={i} className={`p-0.5 border-r border-b-2 border-[#dee2e6] text-center align-top bg-[#eef2f6] w-[120px] min-w-[120px] max-w-[120px]`} >
                      <div className={`flex flex-col items-center justify-center py-2 rounded ${isToday ? 'bg-white shadow-sm ring-1 ring-slate-200' : ''}`}>
                         <div className={`text-xl font-bold leading-none ${colorClass}`}>{d.getDate()}</div>
                         <div className={`text-[0.8em] font-bold mt-1 ${colorClass}`}>{format(d, 'E', { locale: ja })}</div>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            
            <tbody>
              {/* 未配置プール (Sticky Row) */}
              <tr className="bg-[#e8f5e9] sticky top-[92px] z-30 shadow-sm border-b-2 border-[#c8e6c9]">
                <td className="p-1 border-r border-[#c8e6c9] font-bold text-emerald-800 text-[0.95em] align-top sticky left-0 bg-[#e8f5e9] z-40" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                  【未配置】 <span className="text-[0.85em] text-emerald-600 font-normal ml-2">作業員のみ</span>
                </td>
                {dates.map(d => {
                  const dateStr = format(d, 'yyyy-MM-dd')
                  
                  // ユーザー要望により、未配置プールに表示するのは「作業員」のみとする
                  let poolEmployee  = getUnassignedResources(dateStr, 'employee')
                  
                  return (
                    <td 
                      key={`pool-${dateStr}`} 
                      className="p-0.5 border-r border-b-2 border-[#c8e6c9] align-top bg-[#e8f5e9]/50 w-[120px] min-w-[120px] max-w-[120px]"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, "UNASSIGNED_POOL", d)}
                    >
                      <div className="flex flex-col gap-0.5 content-start max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                        {(['employee'] as const).map(typeKey => {
                          const pool = poolEmployee;
                          if (pool.length === 0) return null;
                          const isCollapsed = collapsedResources[typeKey];
                          const label = '作業員';
                          const typeBorder = 'border-l-blue-500';
                          
                          return (
                            <div key={typeKey}>
                              <div 
                                className="text-[0.75em] font-bold text-slate-500 mb-0.5 cursor-pointer hover:text-slate-700 flex items-center gap-0.5"
                                onClick={() => setCollapsedResources(prev => ({ ...prev, [typeKey]: !prev[typeKey] }))}
                              >
                                {label} {isCollapsed ? <ChevronRightIcon className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </div>
                              {!isCollapsed && (
                                <div className="flex flex-col gap-0.5 mb-2">
                                  {pool.map(res => (
                                      <div 
                                        key={res.id} 
                                        draggable={canDragItem(res.type as 'worker'|'vehicle')}
                                        onDragStart={(e) => handleDragStart(e, res.id, res.type as 'worker'|'vehicle', "UNASSIGNED_POOL", dateStr)}
                                        onClick={(e) => handleItemClick(e, { id: res.id, type: res.type as 'worker'|'vehicle', sourceProjectId: "UNASSIGNED_POOL", sourceDate: dateStr })}
                                        className={`px-2 py-0.5 text-[0.85em] bg-white border border-[#c8e6c9] border-l-[3px] ${typeBorder} rounded-md shadow-sm text-slate-700 font-bold whitespace-nowrap flex items-center justify-between w-full transition-all ${checkIsSelected(res.id, "UNASSIGNED_POOL", dateStr) ? 'shadow-md ring-2 ring-blue-400 bg-blue-50/50 scale-[1.02] -translate-y-[1px] z-10' : ''} ${canDragItem(res.type as 'worker'|'vehicle') ? 'cursor-grab hover:bg-emerald-50 active:cursor-grabbing' : 'cursor-default opacity-60'}`}
                                      >
                                      {res.name}
                                      <Info className="w-3 h-3 text-slate-300" />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>

              {/* 休暇・不在 */}
              <tr className="bg-rose-50/40 border-b-2 border-rose-200">
                <td className="p-1 border-r border-slate-200 font-bold text-rose-800 text-[0.95em] align-top sticky left-0 bg-rose-50/90 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                  【休暇・不在】
                </td>
                {dates.map((d, i) => {
                   const dateStr = format(d, 'yyyy-MM-dd')
                   const isToday = dateStr === format(today, 'yyyy-MM-dd')
                   const isPast = dateStr < format(today, 'yyyy-MM-dd')
                   const assignmentsForCell = getAssignmentsForCell(vacationProjId, dateStr)
                   const daily = dailyData.find(dd => dd.project_id === vacationProjId && dd.target_date === dateStr)
                   return (
                     <td 
                       key={i} 
                       className={`p-0.5 border-r border-b border-rose-200 align-top min-h-[3rem] relative transition-colors ${isToday ? 'bg-blue-50/60 ring-2 ring-blue-300 ring-inset shadow-[inset_0_0_10px_rgba(59,130,246,0.1)]' : 'bg-rose-50/40'} ${isPast ? 'opacity-50 saturate-50' : ''} w-[120px] min-w-[120px] max-w-[120px]`}
                       onDragOver={handleDragOver}
                       onDrop={(e) => handleDrop(e, vacationProjId, d)}
                     >
                       <div className="flex flex-col gap-0.5 min-h-[2.5rem]">
                          <div className="flex flex-col gap-0.5 mb-0.5 px-1">
                             <div className="flex justify-end items-center">
                               {!daily?.comment && (
                                 <div 
                                    className="p-0.5 rounded transition-colors flex items-center justify-center cursor-pointer text-slate-300 hover:bg-slate-200"
                                    onClick={(e) => handleCommentClick(vacationProjId, dateStr, daily?.comment, e)}
                                    title="コメントを追加"
                                 >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                 </div>
                               )}
                             </div>
                             {daily?.comment && (
                               <div 
                                 className="text-[0.75em] px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 cursor-pointer hover:bg-amber-100 break-words whitespace-pre-wrap leading-tight"
                                 onClick={(e) => handleCommentClick(vacationProjId, dateStr, daily?.comment, e)}
                                 title="コメントを編集"
                               >
                                 {daily.comment}
                               </div>
                             )}
                          </div>
                          {assignmentsForCell.map(a => (
                             <div 
                                 key={a.id} 
                                 draggable={canDragItem(a.worker_id ? 'worker' : 'vehicle', a.id)}
                                 onDragStart={(e) => handleDragStart(e, (a.worker_id || a.vehicle_id) as string, a.worker_id ? 'worker' : 'vehicle', vacationProjId, dateStr, a.id)}
                                 onClick={(e) => handleItemClick(e, { id: (a.worker_id || a.vehicle_id) as string, type: a.worker_id ? 'worker' : 'vehicle', sourceProjectId: vacationProjId, sourceDate: dateStr, assignmentId: a.id })}
                                 className={`group/item px-1 py-0 text-[0.85em] bg-white border border-slate-200 border-l-[3px] ${a.worker_id ? 'border-l-blue-500' : 'border-l-emerald-500'} rounded-md shadow-sm text-slate-700 font-bold flex items-center justify-between transition-all ${checkIsSelected((a.worker_id || a.vehicle_id) as string, vacationProjId, dateStr, a.id) ? 'shadow-md ring-2 ring-blue-400 bg-blue-50/50 scale-[1.02] -translate-y-[1px] z-10' : ''} ${canDragItem(a.worker_id ? 'worker' : 'vehicle', a.id) ? 'cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow' : 'cursor-default'}`}
                             >
                                 <span className="truncate">{a.worker_id ? a.worker_master?.name : a.vehicle_master?.vehicle_name}</span>
                                 <div className="flex items-center gap-0.5">
                                    {a.notes && <MessageSquare className="w-3 h-3 text-yellow-500" />}
                                    {isAdmin && <button onClick={(e) => handleDeleteAssignment(a.id, e)} className="opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"><X className="w-3 h-3" /></button>}
                                 </div>
                             </div>
                          ))}
                          {/* Drop target visual hint */}
                          {draggedItems.length > 0 && isAdmin && (
                             <div className="w-full h-6 border-2 border-dashed border-rose-200 rounded-md opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center bg-rose-50/50">
                                 <span className="text-[0.85em] font-bold text-rose-400">配置</span>
                             </div>
                          )}
                       </div>
                     </td>
                   )
                })}
              </tr>

              {/* 協力会社集計行 */}
              <tr className="bg-[#f3e5f5] border-b-2 border-[#e1bee7]">
                <td className="p-1 border-r border-[#e1bee7] font-bold text-purple-800 text-[0.95em] align-top sticky left-0 bg-[#f3e5f5] z-20" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                  【協力会社 集計】
                </td>
                {dates.map((d, i) => {
                   const dateStr = format(d, 'yyyy-MM-dd')
                   const dailyPartners = assignments.filter(a => a.assignment_date === dateStr && a.worker_master?.type === '協力会社')
                   
                   const groupedPartners: Record<string, number> = {}
                   dailyPartners.forEach(a => {
                       const name = a.worker_master?.name || '不明'
                       groupedPartners[name] = (groupedPartners[name] || 0) + (a.count || 1)
                   })

                   return (
                     <td key={i} className="p-0.5 border-r border-b-2 border-[#e1bee7] align-top bg-[#f3e5f5]/50 w-[120px] min-w-[120px] max-w-[120px]" >
                        <div className="flex flex-col gap-0.5">
                           {Object.entries(groupedPartners).map(([name, count]) => (
                              <div key={name} className="text-[0.75em] text-purple-800 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5 w-fit shadow-sm font-bold whitespace-nowrap">
                                 {name}:{count}名
                              </div>
                           ))}
                        </div>
                     </td>
                   )
                })}
              </tr>

              {/* プロジェクト行 */}
              {sortedCategories.map(cat => {
                const isCollapsed = collapsedCategories[cat];
                return (
                  <Fragment key={cat}>
                    <tr 
                      className="bg-[#eef2f6] border-b border-t border-slate-300 cursor-pointer hover:bg-[#e2e8f0] transition-colors"
                      onClick={() => setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                    >
                      <td className="px-1 py-0.5 font-bold text-slate-700 text-[0.85em] sticky left-0 z-20 bg-[#eef2f6] border-r border-slate-300" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px`, maxWidth: `${cellWidth}px` }}>
                        <div className="flex items-center gap-0.5">
                            {isCollapsed ? <ChevronRightIcon className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                            <span className="truncate">【区分：{cat}】</span> 
                        </div>
                      </td>
                      <td colSpan={7} className="px-1 py-0.5">
                        <span className="text-[0.75em] font-normal text-slate-400">
                          {isCollapsed ? `※データありのみ表示中 (${groupedProjects[cat].filter(p => {
                              return dates.some(d => {
                                  const dateStr = format(d, 'yyyy-MM-dd')
                                  const cellAssignments = getAssignmentsForCell(p.id, dateStr)
                                  const daily = dailyData.find(dd => dd.project_id === p.id && dd.target_date === dateStr)
                                  return cellAssignments.length > 0 || !!daily?.planned_count || !!daily?.comment
                              })
                          }).length}件)` : `※すべて表示中 (${groupedProjects[cat].length}件)`}
                        </span>
                      </td>
                    </tr>
                    
                    {groupedProjects[cat].map(p => {
                      // Check if the project has any data (assignments, planned_count, comments) in the current week
                      const projectHasData = dates.some(d => {
                        const dateStr = format(d, 'yyyy-MM-dd')
                        const cellAssignments = getAssignmentsForCell(p.id, dateStr)
                        const daily = dailyData.find(dd => dd.project_id === p.id && dd.target_date === dateStr)
                        return cellAssignments.length > 0 || !!daily?.planned_count || !!daily?.comment
                      })
                      
                      // Render if category is expanded OR if the project has data
                      if (isCollapsed && !projectHasData) return null;
                      
                      return (
                      <tr key={p.id} className="border-b shadow-sm hover:bg-blue-50/10 group bg-white">
                        <td className="p-1 border-r border-slate-200 align-top sticky left-0 z-10 bg-white group-hover:bg-slate-50 relative" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}>
                           <div className="flex flex-col">
                              <div className="flex items-center gap-1 mb-0.5">
                                {p.no && <span className="text-[0.8em] font-bold text-blue-600">[{p.no}]</span>}
                                {p.folder_url && (
                                  <a 
                                    href={p.folder_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-slate-400 hover:text-blue-500 transition-colors flex-shrink-0"
                                    title="関連フォルダを開く"
                                  >
                                    <FolderGit2 className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                              <div className="flex items-center gap-1 pr-4">
                                <span className="font-bold text-[0.95em] text-slate-800 leading-snug break-all">{p.name}</span>
                              </div>
                              {(cat === '一般' || cat === '役所') ? (
                                 (p.client_company_name || p.client_name) && <span className="text-[0.85em] text-slate-500 mt-1 font-medium">{p.client_company_name || p.client_name}</span>
                              ) : (
                                 p.site && <span className="text-[0.85em] text-slate-500 mt-1">{p.site}</span>
                              )}
                           </div>
                        </td>
                        {dates.map((d) => {
                          const dateStr = format(d, 'yyyy-MM-dd')
                          const isToday = dateStr === format(today, 'yyyy-MM-dd')
                          const isPast = dateStr < format(today, 'yyyy-MM-dd')
                          const cellAssignments = getAssignmentsForCell(p.id, dateStr)
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6
                          const daily = dailyData.find(dd => dd.project_id === p.id && dd.target_date === dateStr)
                          
                          // 予定人員カラーロジック：
                          // 配置されている作業員数の合計を計算 (車両以外)
                          // 作業員は1人としてカウント、協力会社は count の数値
                          const assignedWorkerCount = cellAssignments.reduce((total, a) => {
                            if (a.vehicle_id) return total; // 車両は除外
                            if (a.worker_master?.type === '協力会社') return total + (a.count || 1);
                            return total + 1; // 社長・作業員
                          }, 0);

                          let plannedCountClasses = 'text-slate-400 border border-transparent';
                          if (daily?.planned_count) {
                             if (assignedWorkerCount < daily.planned_count) {
                                // 不足時は赤色
                                plannedCountClasses = 'text-red-600 bg-red-50 border border-red-200';
                             } else {
                                // 充足時は緑色
                                plannedCountClasses = 'text-emerald-700 bg-emerald-50 border border-emerald-200';
                             }
                          }
                          
                          return (
                            <td 
                              key={`${p.id}-${dateStr}`}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, p.id, d)}
                              className={`p-0.5 border-r border-slate-200 align-top min-h-[80px] transition-colors ${isToday ? 'bg-blue-50/60 ring-2 ring-blue-300 ring-inset shadow-[inset_0_0_10px_rgba(59,130,246,0.1)]' : isWeekend ? 'bg-slate-50/30 hover:bg-slate-100' : 'hover:bg-blue-50/30'} ${isPast ? 'opacity-50 saturate-50' : ''} w-[120px] min-w-[120px] max-w-[120px]`}
                            >
                               <div className="flex flex-col gap-0.5 mb-0.5 px-1">
                                  <div className="flex justify-between items-center">
                                    <div 
                                      className={`text-[0.75em] font-bold px-1 rounded transition-colors cursor-pointer hover:border-slate-300 ${plannedCountClasses}`}
                                      onClick={(e) => handlePlannedCountClick(p.id, dateStr, daily?.planned_count, e)}
                                      title={`予定: ${daily?.planned_count || '-'}人 / 現在: ${assignedWorkerCount}人`}
                                    >
                                      予:{daily?.planned_count || '-'}名
                                    </div>
                                    {!daily?.comment && (
                                      <div 
                                         className="p-0.5 rounded transition-colors flex items-center justify-center cursor-pointer text-slate-300 hover:bg-slate-200"
                                         onClick={(e) => handleCommentClick(p.id, dateStr, daily?.comment, e)}
                                         title="コメントを追加"
                                      >
                                         <MessageSquare className="w-3.5 h-3.5" />
                                      </div>
                                    )}
                                  </div>
                                  {daily?.comment && (
                                    <div 
                                      className="text-[0.75em] px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 cursor-pointer hover:bg-amber-100 break-words whitespace-pre-wrap leading-tight"
                                      onClick={(e) => handleCommentClick(p.id, dateStr, daily?.comment, e)}
                                      title="コメントを編集"
                                    >
                                      {daily.comment}
                                    </div>
                                  )}
                               </div>
                               <div className="flex flex-col gap-0.5 min-h-[2.5rem] mt-0.5">
                                  {(() => {
                                     const regularAssignments = cellAssignments.filter(a => a.worker_master?.type !== '協力会社')
                                     const partnerAssignments = cellAssignments.filter(a => a.worker_master?.type === '協力会社')
                                     return (
                                        <>
                                            {regularAssignments.map(a => (
                                              <div 
                                                  key={a.id}
                                                  draggable={canDragItem(a.worker_id ? 'worker' : 'vehicle', a.id)}
                                                  onDragStart={(e) => handleDragStart(e, (a.worker_id || a.vehicle_id) as string, a.worker_id ? 'worker' : 'vehicle', p.id, dateStr, a.id)}
                                                  className={`group/item flex items-center justify-between px-1 py-0 text-[0.85em] bg-white border rounded shadow-sm hover:shadow ${a.worker_id ? 'border-l-4 border-[#3b82f6] text-slate-700 font-bold border-y-slate-200 border-r-slate-200' : 'border-l-4 border-[#10b981] text-slate-700 font-bold border-y-slate-200 border-r-slate-200'} ${canDragItem(a.worker_id ? 'worker' : 'vehicle', a.id) ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                                              >
                                                  <span className="truncate">{a.worker_id ? a.worker_master?.name : a.vehicle_master?.vehicle_name}</span>
                                                  <div className="flex items-center gap-0.5">
                                                      {a.notes && <MessageSquare className="w-3 h-3 text-yellow-500" />}
                                                      {isAdmin && <button onClick={(e) => handleDeleteAssignment(a.id, e)} className="opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"><X className="w-3 h-3" /></button>}
                                                  </div>
                                              </div>
                                            ))}
                                            {partnerAssignments.length > 0 && (
                                              <table className="w-full text-left mt-0.5 border-separate border-spacing-0">
                                                <tbody>
                                                  {partnerAssignments.map(pr => (
                                                    <tr 
                                                      key={pr.id} 
                                                      className={`group/ptr transition-colors ${isAdmin ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                                                      onClick={(e) => handlePartnerCountClick(pr.id, pr.count || 1, e)}
                                                    >
                                                      <td 
                                                        className={`text-[0.75em] text-purple-700 py-0.5 border-b border-slate-200 font-bold whitespace-nowrap pl-0.5 ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`} 
                                                        style={{ width: '40%'}}
                                                        draggable={canDragItem('worker', pr.id)}
                                                        onDragStart={(e) => handleDragStart(e, pr.worker_id as string, 'worker', p.id, dateStr, pr.id)}
                                                      >
                                                        協力: {pr.count||1}名
                                                      </td>
                                                      <td className="text-[0.75em] text-slate-600 py-0.5 border-b border-slate-200 truncate pl-1" style={{ width: '60%'}}>
                                                        {pr.worker_master?.name}
                                                        {isAdmin && <button onClick={(e) => { e.stopPropagation(); handleDeleteAssignment(pr.id, e); }} className="text-slate-300 hover:text-red-500 float-right mr-0.5 opacity-0 group-hover/ptr:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            )}
                                        </>
                                     )
                                  })()}
                                  {draggedItems.length > 0 && isAdmin && (
                                     <div className="w-full h-6 border-2 border-dashed border-blue-200 rounded-md opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center bg-blue-50/50">
                                         <span className="text-[0.85em] font-bold text-blue-400">配置</span>
                                     </div>
                                  )}
                               </div>
                            </td>
                          )
                        })}
                      </tr>
                    );
                    })}
                  </Fragment>
                );
              })}
              
            </tbody>
          </table>
          <div className="h-40"></div>
        </main>

        {/* 右サイドパネル (管理パネル) */}
        {showRightPanel && (
           <aside className={`inset-y-0 right-0 w-64 bg-white border-l flex flex-col shadow-inner shrink-0 text-[0.95em] z-50 transition-all`}>
             <div className="p-0.5 border-b bg-slate-50">
               <h2 className="font-bold text-slate-600 flex items-center gap-0.5 text-[0.85em]"><Info className="w-4 h-4 text-amber-500" /> 管理パネル</h2>
             </div>
             <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-20 custom-scrollbar">
               
               {/* 共有メモ */}
               <section>
                 <h3 className="text-[0.75em] font-bold text-slate-400 mb-0.5 uppercase tracking-widest flex items-center gap-0.5"><MessageSquare className="w-3.5 h-3.5"/> 共有メモ</h3>
                 <textarea 
                   value={globalMemo?.content || ''} 
                   onChange={handleMemoChange} 
                   readOnly={!isAdmin}
                   placeholder="全社で共有するメモを入力..." 
                   className={`w-full h-32 p-2 text-[0.85em] border rounded outline-none shadow-sm focus:ring-1 focus:ring-amber-300 resize-none leading-relaxed custom-scrollbar ${!isAdmin ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-700 border-amber-200'}`}
                 />
               </section>

               {/* TODO */}
               <section>
                 <div className="flex items-center justify-between mb-0.5">
                   <h3 className="text-[0.75em] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-0.5"><ListTodo className="w-3.5 h-3.5"/> TODO</h3>
                   <button onClick={() => setShowTodoHistory(!showTodoHistory)} className={`p-1 rounded transition-colors ${showTodoHistory ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`} title="完了履歴"><History className="w-4 h-4" /></button>
                 </div>
                 
                 {!showTodoHistory ? (
                   <>
                     {isAdmin && (
                       <div className="flex gap-0.5 mb-2">
                         <input 
                           type="text" 
                           value={newTodoText} 
                           onChange={(e) => setNewTodoText(e.target.value)} 
                           onKeyPress={(e) => e.key === 'Enter' && addTodo()} 
                           placeholder="タスク追加..." 
                           className="flex-1 text-[0.85em] border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400 shadow-sm"
                         />
                         <button onClick={addTodo} className="bg-blue-600 text-white px-1 py-0 rounded shadow-sm hover:bg-blue-700 flex items-center justify-center shrink-0"><Plus className="w-4 h-4"/></button>
                       </div>
                     )}
                     <div className="space-y-1">
                       {activeTodos.length === 0 ? (
                          <div className="text-center text-[0.85em] text-slate-400 py-4 bg-slate-50 rounded border border-dashed border-slate-200">
                             <ListTodo className="w-6 h-6 mx-auto mb-0.5 opacity-20" />
                             TODOはありません
                          </div>
                       ) : activeTodos.map(todo => (
                         <div key={todo.id} className="bg-white border border-slate-200 p-0.5 rounded flex items-start gap-0.5 shadow-sm group">
                           <input type="checkbox" checked={todo.completed} onChange={() => toggleTodo(todo.id, todo.completed)} disabled={!isAdmin} className="mt-0.5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"/>
                           <div className="flex-1">
                             <div className="text-[0.85em] leading-tight text-slate-700">{todo.text}</div>
                           </div>
                           {isAdmin && <button onClick={() => deleteTodo(todo.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3.5 h-3.5"/></button>}
                         </div>
                       ))}
                     </div>
                   </>
                 ) : (
                   <div className="space-y-1 opacity-70">
                     {completedTodos.length === 0 ? (
                        <div className="text-center text-[0.85em] text-slate-400 py-2">完了履歴はありません</div>
                     ) : completedTodos.map(todo => (
                       <div key={todo.id} className="bg-slate-50 border border-slate-100 p-0.5 rounded flex items-start gap-0.5 group">
                         <div className="flex-1">
                           <div className="text-[0.85em] leading-tight text-slate-500 line-through">{todo.text}</div>
                         </div>
                         {isAdmin && <button onClick={() => deleteTodo(todo.id)} className="text-slate-200 hover:text-red-400"><X className="w-3.5 h-3.5"/></button>}
                       </div>
                     ))}
                   </div>
                 )}
               </section>
             </div>
           </aside>
        )}
      </div>

      {/* フロートアクションボタン群 (FAB) */}
      <div className="absolute right-6 bottom-12 flex flex-col gap-4 z-50">
         <button className="w-12 h-12 bg-white border border-slate-200 shadow-lg rounded-full flex items-center justify-center text-slate-600 hover:text-blue-600 hover:shadow-xl hover:-translate-y-1 transition-all group">
            <List className="w-6 h-6 group-hover:scale-110 transition-transform" />
         </button>
         <button className="w-14 h-14 bg-white border border-slate-200 shadow-xl rounded-full flex items-center justify-center hover:scale-105 transition-all overflow-hidden relative group">
            <div className="absolute inset-0 bg-[#4285f4]"></div>
            <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-[#fbbc05]"></div>
            <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-[#ea4335]"></div>
            <div className="absolute w-5 h-5 bg-[#34a853] bottom-2 right-2 rounded-tl-full"></div>
            <div className="absolute inset-1 bg-white rounded-full flex items-center justify-center">
              <Plus className="w-7 h-7 text-slate-700 group-hover:rotate-90 transition-transform duration-300" />
            </div>
         </button>
      </div>

      {/* 凡例フッター */}
      <div className="bg-[#eef2f6] border-t border-slate-300 px-6 py-2 flex items-center gap-6 text-[0.85em] font-medium text-slate-600 z-50">
         <span>凡例:</span>
         <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>社長</span>
         <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>人員</span>
         <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>協力</span>
         <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>作業車</span>
         <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>建設機械</span>
         <span 
            className="ml-auto flex items-center gap-0.5 font-bold group px-2 py-1 rounded-md"
            title={isAdmin ? "管理権限あり" : "閲覧権限のみ"}
         >
            <div className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-purple-500 animate-pulse' : 'bg-slate-400'}`}></div>
            <span className={isAdmin ? 'text-purple-600' : 'text-slate-500'}>{isAdmin ? '管理モード' : '閲覧モード'}</span>
            <span className="text-slate-400 font-normal ml-2 pl-2 border-l">クラウド自動同期中</span>
         </span>
      </div>

      {/* グローバルCSS */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8; 
        }
      `}</style>
      
      {renderCellModals()}

      {/* Add Resource Modal */}
      {showAddResourceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700">新規リソース追加</h3>
              <button 
                onClick={() => setShowAddResourceModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-[0.95em] font-bold text-slate-700 mb-0.5">リソース種別</label>
                <select 
                  value={newResourceType}
                  onChange={(e) => setNewResourceType(e.target.value as any)}
                  className="w-full p-0.5 text-[0.95em] border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="president">社長</option>
                  <option value="employee">作業員</option>
                  <option value="partner">協力会社</option>
                  <option value="vehicle">作業車</option>
                  <option value="machine">建設機械</option>
                </select>
              </div>
              <div>
                <label className="block text-[0.95em] font-bold text-slate-700 mb-0.5">名称</label>
                <input 
                  type="text" 
                  placeholder="山田 太郎 等..."
                  value={newResourceName}
                  onChange={(e) => setNewResourceName(e.target.value)}
                  className="w-full p-0.5 text-[0.95em] border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddResource()
                  }}
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-0.5">
              <button 
                onClick={() => setShowAddResourceModal(false)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-700 text-[0.95em] font-bold bg-white hover:bg-slate-50 transition-colors"
              >
                キャンセル
              </button>
              <button 
                onClick={handleAddResource}
                disabled={!newResourceName.trim()}
                className="px-4 py-2 rounded text-white text-[0.95em] font-bold bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
