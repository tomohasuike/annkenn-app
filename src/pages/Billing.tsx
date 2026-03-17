import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { Plus, Search, FileText, Building2, Loader2, Edit, Trash2, ChevronDown, MapPin, RefreshCw } from "lucide-react"

type ProjectData = {
  id: string
  project_name: string
  project_number: string | null
  client_name?: string
  site_name?: string
  status_flag?: string
  legacy_id?: string
}

type InvoiceDetailData = {
  id: string
  invoice_id: string
  amount: number | null
  billing_month: string | null
  expected_deposit_date: string | null
  deposit_date: string | null
  details_status: string
  details_notes: string | null
}

type InvoiceData = {
  id: string
  created_at: string
  project_id: string
  project_ids?: string[] | null
  legacy_id: string | null
  project_number: string | null
  billing_category: string
  orderer_category: string
  billing_subject: string | null
  billing_destination: string | null
  contract_amount: number | null
  overall_notes: string | null
  projects: { project_name: string } | null
  invoice_details: InvoiceDetailData[]
}

export default function Billing() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceData[]>([])
  const [projects, setProjects] = useState<ProjectData[]>([]) // For Projects tab
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<"projects" | "pending" | "completed">("pending")
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const [projectStatusFilter, setProjectStatusFilter] = useState("着工中 (未請求)")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      // Fetch Invoices
      const { data: invData, error: invError } = await supabase
        .from('invoices')
        .select(`
          *,
          projects ( project_name ),
          invoice_details ( * )
        `)
        .order('created_at', { ascending: false })

      if (invError) throw invError
      setInvoices(invData || [])

      // Fetch Projects (for 案件一覧 tab)
      const { data: projData, error: projError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (projError) throw projError
      setProjects(projData || [])

    } catch (err) {
      console.error("Error fetching data:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm("この請求データを削除してもよろしいですか？紐付く明細もすべて削除されます。")) return

    try {
      // invoice_details are assumed to have ON DELETE CASCADE or we delete them manually.
      // To be safe, delete details first:
      await supabase.from('invoice_details').delete().eq('invoice_id', id)
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      
      if (error) throw error
      setInvoices(prev => prev.filter(inv => inv.id !== id))
    } catch (err) {
      console.error("Error deleting invoice:", err)
      alert("削除に失敗しました。")
    }
  }

  // Status definition matching legacy App logic
  const determineStatusForDetail = (d: InvoiceDetailData) => d.details_status
  // NOTE: determineStatusForInvoice and getStatusBadgeColor and calculateTotal are currently removed since UI renders without it, 
  // but kept commented out in case they are needed for future aggregation additions.
  /*
  const calculateTotal = (details: any[]) => {
    if (!details || details.length === 0) return 0
    return details.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
  }
  const determineStatusForInvoice = (details: InvoiceDetailData[]) => {
    if (!details || details.length === 0) return "未請求"
    const statuses = details.map(d => d.details_status)
    if (statuses.every(s => s === "完了" || s === "入金済")) return "完了"
    if (statuses.includes("入金済")) return "一部入金"
    if (statuses.includes("請求済")) return "請求済"
    return "未請求"
  }
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case '完了':
      case '入金済': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case '一部入金': return 'bg-blue-100 text-blue-800 border-blue-200'
      case '請求済': return 'bg-amber-100 text-amber-800 border-amber-200'
      case '未請求': return 'bg-slate-100 text-slate-800 border-slate-200'
      default: return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }
  */


  // Determine computed project state
  const getProjectBillingState = (proj: ProjectData) => {
    const projInvoices = invoices.filter(inv => inv.project_id === proj.id)
    if (projInvoices.length > 0) {
      const hasCompleted = projInvoices.some(inv => inv.billing_category === '完成')
      const hasPartial = projInvoices.some(inv => inv.billing_category === '出来高')
      if (hasCompleted) return "完工"
      if (hasPartial) return "出来高請求中"
    }
    return proj.status_flag === "完工" || proj.status_flag === "完了" ? "完工" : (proj.status_flag || "着工前")
  }


  // Action: toggle detail status (inline update)
  const toggleDetailStatus = async (detailId: string, currentStatus: string, e: React.MouseEvent) => {
    e.stopPropagation()
    // typical toggle: Paid <-> Unbilled
    const actualNewStatus = (currentStatus as string) === "完了" || (currentStatus as string) === "入金済" ? "未請求" : "入金済"

    try {
      const { error } = await supabase
        .from('invoice_details')
        .update({ details_status: actualNewStatus })
        .eq('id', detailId)
      
      if (error) throw error
      // Optimiztic update
      setInvoices(prev => prev.map(inv => ({
        ...inv,
        invoice_details: inv.invoice_details.map(d => d.id === detailId ? { ...d, details_status: actualNewStatus } : d)
      })))
    } catch (err) {
      console.error("Failed to update status:", err)
      alert("ステータスの更新に失敗しました。")
    }
  }

  // ================= Renders =================

  // Projects View (案件一覧)
  let filteredProjects = projects.filter(p => {
    return (p.project_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
           (p.project_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
           (p.client_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  })
  
  if (projectStatusFilter === "着工中 (未請求)") {
    filteredProjects = filteredProjects.filter(p => p.status_flag === "着工中" || p.status_flag === "着工前")
  } else if (projectStatusFilter === "完工 (未請求)") {
    filteredProjects = filteredProjects.filter(p => p.status_flag === "完工" || p.status_flag === "完了")
  } else if (projectStatusFilter === "出来高請求中") {
    filteredProjects = filteredProjects.filter(p => getProjectBillingState(p) === "出来高請求中")
  }

  // Invoices View (Grouped by Invoice, not Project)
  const enrichedInvoices = invoices.map(inv => {
    // 1. Find Primary Project
    const primaryProj = projects.find(p => p.id === inv.project_id) || {}
    
    // 2. Find Related Projects (from project_ids)
    let relatedProjects: any[] = []
    if (Array.isArray(inv.project_ids) && inv.project_ids.length > 0) {
      relatedProjects = projects.filter(p => inv.project_ids?.includes(p.id) && p.id !== inv.project_id)
    }

    // 3. Determine Status and Calculate Totals
    let hasDetails = false
    let allPaid = true
    let totalBilled = 0 // Only paid amount
    let allTotalBilled = 0 // All issued amount
    let hasOverdue = false
    const allDates: string[] = []

    const details = inv.invoice_details || []
    if (details.length > 0) hasDetails = true

    details.forEach(d => {
      const amt = Number(d.amount) || 0
      allTotalBilled += amt
      
      const ds = determineStatusForDetail(d)
      if (ds === "入金済" || ds === "完了") {
         totalBilled += amt
      } else {
         allPaid = false
         // Check Overdue
         if (d.expected_deposit_date) {
            const targetDate = new Date(d.expected_deposit_date)
            if (!isNaN(targetDate.getTime())) {
               const today = new Date()
               today.setHours(0, 0, 0, 0)
               targetDate.setHours(0, 0, 0, 0)
               if (targetDate.getTime() < today.getTime()) {
                  hasOverdue = true
               }
            }
         }
      }

      if (d.deposit_date) allDates.push(d.deposit_date)
      else if (d.expected_deposit_date) allDates.push(d.expected_deposit_date)
    })

    const isCompleted = hasDetails && inv.billing_category === "完成" && allPaid

    const lastDateStr = allDates.length > 0 ? allDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).reverse()[0] : null
    const lastDepositDateDate = lastDateStr ? new Date(lastDateStr) : new Date(0);
    const lastDepositDate = lastDateStr ? lastDepositDateDate.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", weekday: "short" }) : "-"

    return {
      ...inv,
      primaryProj,
      relatedProjects,
      isCompleted,
      contractAmount: Number(inv.contract_amount) || 0,
      totalBilled,
      allTotalBilled,
      balance: (Number(inv.contract_amount) || 0) - allTotalBilled,
      hasOverdue,
      lastDepositDateDate,
      lastDepositDate
    }
  })

  // Determine which invoices are pending vs completed
  const pendingInvoices = enrichedInvoices.filter(inv => !inv.isCompleted)
  const completedInvoices = enrichedInvoices.filter(inv => inv.isCompleted).sort((a, b) => b.lastDepositDateDate.getTime() - a.lastDepositDateDate.getTime())

  const applySearchToGroup = (inv: any) => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    const matchesProj = (inv.primaryProj.project_name || "").toLowerCase().includes(q) ||
                        (inv.primaryProj.project_number || "").toLowerCase().includes(q) ||
                        (inv.primaryProj.client_name || "").toLowerCase().includes(q)
    const matchesInv = (inv.billing_subject || "").toLowerCase().includes(q) ||
                       (inv.billing_destination || "").toLowerCase().includes(q)
    return matchesProj || matchesInv
  }

  const displayPending = pendingInvoices.filter(applySearchToGroup)
  const displayCompleted = completedInvoices.filter(applySearchToGroup)

  return (
    <div className="h-full flex flex-col min-h-0 bg-slate-50/50">
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-6 h-6 text-primary" />
                請求管理
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                作成済みの請求データの一覧・ステータス管理を行います
              </p>
            </div>
            <button
              onClick={() => navigate("/billing/new")}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 gap-2"
            >
              <Plus className="w-4 h-4" />
              新規請求作成
            </button>
          </div>

          {/* Tabs Area */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === "projects" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              案件一覧
            </button>
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === "pending" ? "border-amber-500 text-amber-600" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              請求中・入金待ち
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === "completed" ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              入金完了履歴
            </button>
          </div>

          {/* Filters Area */}
          <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder={activeTab === 'projects' ? "案件名、工事番号(リスト)、発注者で検索..." : "請求先、件名、案件名で検索..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 h-10 rounded-md border border-input bg-transparent px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* List Area */}
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : activeTab === "projects" ? (
             /* Projects Tab Content */
             filteredProjects.length === 0 ? (
              <div className="bg-white border text-center py-16 rounded-xl shadow-sm">
                <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">案件が見つかりません</p>
              </div>
             ) : (
              <div className="space-y-4">
                {/* Status Pills and Refresh Button */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {['着工中 (未請求)', '完工 (未請求)', '出来高請求中'].map(filter => (
                      <button
                        key={filter}
                        onClick={() => setProjectStatusFilter(filter)}
                        className={`px-4 py-1.5 text-sm font-bold rounded-full transition-colors border ${
                          projectStatusFilter === filter 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <button onClick={fetchData} className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded ripple hover:bg-slate-50 bg-white shadow-sm transition-colors">
                    <RefreshCw className="w-4 h-4 text-slate-400" />
                    最新に更新
                  </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b text-slate-500 font-semibold text-xs">
                      <tr>
                        <th className="px-5 py-4 w-28">工事番号</th>
                        <th className="px-5 py-4 w-1/3">案件名 / 現場</th>
                        <th className="px-5 py-4 w-1/5">発注者</th>
                        <th className="px-5 py-4 w-32">状態</th>
                        <th className="px-5 py-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProjects.map(proj => {
                        const compState = getProjectBillingState(proj)
                        return (
                        <tr key={proj.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4 align-top font-bold text-slate-500 font-mono text-xs">
                            {proj.project_number}
                          </td>
                          <td className="px-5 py-4 align-top">
                            <div className="font-bold text-slate-800 text-[15px]">{proj.project_name}</div>
                            {proj.site_name && (
                               <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">
                                 <MapPin className="w-3.5 h-3.5" />
                                 {proj.site_name}
                               </div>
                            )}
                          </td>
                          <td className="px-5 py-4 align-top text-slate-600 text-sm font-medium">
                            {proj.client_name || ""}
                          </td>
                          <td className="px-5 py-4 align-top">
                             <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                               compState === '完工' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                             }`}>
                               {compState}
                             </span>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <div className="flex items-center justify-end gap-2">
                              {/* 取消 Button */}
                              <button className="px-3 py-1.5 text-xs text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition-colors">
                                取消
                              </button>
                              {/* 追加 / 完了請求 Button */}
                              <button
                                onClick={() => navigate(`/billing/new?project_id=${proj.id}`)}
                                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded shadow hover:bg-blue-700 transition-colors"
                              >
                                {compState === '完工' ? '請求作成' : '追加 / 完了請求'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
             )
          ) : (activeTab === "pending" && displayPending.length === 0) || (activeTab === "completed" && displayCompleted.length === 0) ? (
            <div className="bg-white border text-center py-16 rounded-xl shadow-sm">
              <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">データが見つかりません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(activeTab === "pending" ? displayPending : displayCompleted).map((inv: any) => {
                const isExpanded = expandedInvoiceId === inv.id
                const pName = inv.primaryProj?.project_name || "案件名未設定"
                const pNum = inv.primaryProj?.project_number || "---"
                const cName = inv.billing_destination || inv.primaryProj?.client_name || "請求先未設定"

                return (
                  // Conditional Wrapper (Dark vs Light Card)
                  <div key={inv.id} className={activeTab === "pending" 
                    ? "bg-[#242b38] rounded-xl shadow-md border-t-4 border-slate-800 overflow-hidden transition-all duration-200 hover:shadow-lg mb-4"
                    : "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-200 hover:shadow-md mb-4"
                  }>
                    {/* Accordion Header */}
                    <div 
                      className={`p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 cursor-pointer select-none ${activeTab === 'pending' ? 'bg-slate-800 hover:bg-slate-700' : 'hover:bg-slate-50'}`}
                      onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                    >
                      <div className="flex-1 text-left">
                        {activeTab === "pending" ? (
                          // Dark Card specific Sub-Header
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">
                            <span>対象工事(ID):<span className="bg-slate-700 text-white px-1.5 py-0.5 rounded mx-1">{inv.primaryProj?.legacy_id || "---"}</span></span>
                            {pNum && <span>/ 工事番号:<span className="bg-slate-700 text-white px-1.5 py-0.5 rounded mx-1">{pNum}</span></span>}
                          </div>
                        ) : (
                          // Light Card specific Sub-Header
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1.5">
                            <span>対象工事(ID):<span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded mx-1">{inv.primaryProj?.legacy_id || "---"}</span></span>
                            {pNum && <span>/ 工事番号:<span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded mx-1">{pNum}</span></span>}
                          </div>
                        )}
                        
                        <h3 className={`text-xl font-black leading-tight flex items-center gap-2 mb-1.5 ${activeTab === 'pending' ? 'text-white' : 'text-slate-800'}`}>
                          {inv.billing_subject || pName}
                          {inv.hasOverdue && activeTab === "pending" && <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] rounded shadow-sm animate-pulse">⚠️ 入金遅延あり</span>}
                        </h3>
                        
                        <div className={`text-sm mb-3 font-medium ${activeTab === 'pending' ? 'text-slate-300' : 'text-slate-500'}`}>
                          {cName} <span className="text-xs">御中</span>
                        </div>
                        
                        <div className={`text-xs flex items-center gap-1.5 ${activeTab === 'pending' ? 'text-slate-400' : 'text-slate-500'}`}>
                           <span className={`font-mono text-[9px] px-1 py-0.5 rounded ${activeTab === 'pending' ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100'}`}>[{pNum}]</span>
                           <span className="truncate">{pName}</span>
                        </div>
                        
                        {/* ★ 関連案件（合算されている案件）の明細表示 */}
                        {inv.relatedProjects && inv.relatedProjects.length > 0 && (
                            <div className="mt-2 flex flex-col gap-1">
                                {inv.relatedProjects.map((rp: any) => (
                                    <div key={rp.id} className={`text-xs flex items-center gap-1.5 ${activeTab === 'pending' ? 'text-slate-400' : 'text-slate-500'}`}>
                                        <span className={`font-mono text-[9px] px-1 py-0.5 rounded ${activeTab === 'pending' ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100'}`}>[{rp.project_number}]</span>
                                        <span className="truncate">{rp.project_name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 md:gap-4 shrink-0 mt-2 xl:mt-0">
                        {activeTab === "pending" ? (
                          // Dark Card Metrics
                          <div className="flex items-center gap-4 sm:gap-6 bg-[#2a3441] px-4 py-3 rounded-xl border border-slate-700/50 shadow-inner">
                            <div className="hidden md:block text-center min-w-[60px]">
                              <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">請負総額</div>
                              <div className="font-bold text-base italic text-white font-mono">¥{(inv.contractAmount || 0).toLocaleString()}</div>
                            </div>
                            <div className="hidden md:block text-center min-w-[60px]">
                              <div className="text-[10px] text-blue-400 font-bold uppercase mb-0.5">請求計</div>
                              <div className="font-bold text-base text-blue-300 font-mono">¥{(inv.allTotalBilled || 0).toLocaleString()}</div>
                            </div>
                            <div className="text-center min-w-[60px]">
                              <div className="text-[10px] text-orange-400 font-bold uppercase mb-0.5">残額</div>
                              <div className="font-bold text-lg text-orange-400 font-mono">¥{(inv.balance || 0).toLocaleString()}</div>
                            </div>
                          </div>
                        ) : (
                          // Light Card Metrics
                          <div className="flex items-center gap-4 md:gap-8 px-4 py-3 text-right">
                            <div className="hidden md:block text-left md:text-right">
                              <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">最終入金日</div>
                              <div className="text-sm font-bold text-slate-600">{inv.lastDepositDate}</div>
                            </div>
                            <div className="text-left md:text-right">
                              <div className="text-[10px] text-emerald-600 font-bold uppercase mb-0.5">入金完了総額</div>
                              <div className="text-xl font-black text-emerald-700 font-mono">¥{(inv.totalBilled || 0).toLocaleString()}</div>
                            </div>
                          </div>
                        )}

                        <div className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shrink-0 shadow-sm ${isExpanded ? 'rotate-180' : ''} ${activeTab === 'pending' ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {/* Accordion Body */}
                    {isExpanded && (
                      <div className={`border-t p-4 md:p-6 animate-in slide-in-from-top-2 duration-200 ${activeTab === 'pending' ? 'border-slate-700/50 bg-slate-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                        <div className="mb-6 last:mb-0">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                            <h4 className="font-bold text-slate-700 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-blue-500" />
                              {inv.billing_subject || pName} ({(inv.invoice_details || []).length}件)
                              <span className="ml-2 text-[10px] px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full">{inv.billing_category}</span>
                            </h4>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/billing/${inv.id}`)
                                }}
                                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                編集
                              </button>
                              <button
                                onClick={(e) => handleDelete(inv.id, e)}
                                className="px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                削除
                              </button>
                            </div>
                          </div>
                          
                          {(!inv.invoice_details || inv.invoice_details.length === 0) ? (
                            <div className="text-sm text-slate-500 italic py-2">明細データがありません。</div>
                          ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
                              <table className="w-full text-left">
                               <thead className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-slate-200">
                                 <tr>
                                   <th className="p-4">{activeTab === 'pending' ? '月分 / 請求日' : '入金完了日'}</th>
                                   {activeTab === 'completed' && <th className="p-4">対象月</th>}
                                   <th className="p-4 text-right">{activeTab === 'pending' ? '今回金額' : '入金額 (税込)'}</th>
                                   {activeTab === 'pending' && <th className="p-4">入金予定</th>}
                                   {activeTab === 'pending' && <th className="p-4">状態</th>}
                                   <th className="p-4">備考メモ</th>
                                   <th className="p-4 text-right">操作</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-100">
                                {(activeTab === 'pending' ? inv.invoice_details : inv.invoice_details.filter((d: any) => determineStatusForDetail(d) === "入金済" || determineStatusForDetail(d) === "完了")).map((detail: any) => {
                                  const dStatus = determineStatusForDetail(detail)
                                  const isPaid = dStatus === "入金済" || dStatus === "完了"
                                  const isOverdue = !isPaid && activeTab === "pending" && detail.expected_deposit_date && new Date(detail.expected_deposit_date).getTime() < new Date().setHours(0,0,0,0)

                                  return (
                                   <tr key={detail.id} className={`hover:bg-slate-50 transition-all ${isPaid ? 'opacity-80 bg-slate-50/50' : ''}`}>
                                     {activeTab === 'pending' ? (
                                       <td className="p-4 whitespace-nowrap">
                                           <div className="text-base font-black text-slate-800">{detail.billing_month || "未定"}</div>
                                           <div className="text-xs font-bold text-slate-500 font-mono mt-1">{detail.billing_date || "-"}</div>
                                       </td>
                                     ) : (
                                       <>
                                         <td className="p-4 font-bold text-sm text-emerald-700 font-mono whitespace-nowrap">{detail.deposit_date || detail.billing_date || "-"}</td>
                                         <td className="p-4 text-sm font-bold text-slate-700 whitespace-nowrap">{detail.billing_month || "未定"}</td>
                                       </>
                                     )}
                                     
                                     <td className="p-4 text-right font-black text-lg text-slate-800 font-mono whitespace-nowrap">¥{(Number(detail.amount) || 0).toLocaleString()}</td>
                                     
                                     {activeTab === 'pending' && (
                                       <td className={`p-4 text-xs font-bold font-mono whitespace-nowrap ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                                         {detail.expected_deposit_date || "-"}
                                       </td>
                                     )}

                                     {activeTab === 'pending' && (
                                       <td className="p-4 whitespace-nowrap">
                                         {isPaid ? (
                                             <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg border border-green-200">入金済</span>
                                         ) : isOverdue ? (
                                             <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-black rounded-lg border border-red-300 shadow-sm animate-pulse">⚠️ 入金遅延</span>
                                         ) : (
                                             <span className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg border border-yellow-200">入金待ち</span>
                                         )}
                                       </td>
                                     )}
                                     
                                     <td className="p-4 text-sm text-slate-600">
                                       {detail.details_notes || "---"}
                                     </td>
                                     
                                     <td className="p-4 text-right space-x-2 whitespace-nowrap">
                                       {!isPaid ? (
                                           <button onClick={(e) => toggleDetailStatus(detail.id, dStatus, e)} className="px-3 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-sm text-xs transition-colors">入金済にする</button>
                                       ) : (
                                           <button onClick={(e) => toggleDetailStatus(detail.id, dStatus, e)} className="px-3 py-2 border border-orange-200 text-orange-600 font-bold rounded-lg hover:bg-orange-50 text-xs bg-white transition-colors">未入金に戻す</button>
                                       )}
                                     </td>
                                   </tr>
                                  )
                                })}
                               </tbody>
                              </table>
                            </div>
                          )}
                          
                          {/* Overall Notes display */}
                          {inv.overall_notes && (
                            <div className="mt-4 p-3 bg-yellow-50/50 rounded-lg border border-yellow-100 text-sm">
                              <div className="font-bold text-yellow-800 mb-1 text-xs">全体備考</div>
                              <div className="text-yellow-900 whitespace-pre-wrap">{inv.overall_notes}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
