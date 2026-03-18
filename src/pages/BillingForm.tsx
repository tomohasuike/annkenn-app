import { useState, useEffect } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { ArrowLeft, Save, Trash2, Loader2, FileText, PlusCircle, Folder } from "lucide-react"
import { AutocompleteInput } from "../components/ui/AutocompleteInput"

type ProjectData = { 
  id: string; 
  name: string; 
  number: string | null; 
  clientName: string | null;
  clientCompanyName?: string | null;
  statusFlag: string | null;
  contractAmount?: number | null;
  category?: string | null;
  siteName?: string | null;
}

type InvoiceDetailData = {
  id?: string
  billing_month: string
  amount: number | ''
  billing_date: string
  expected_deposit_date: string
  deposit_date: string
  details_status: string
  details_notes: string
}

const toFormattedString = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '';
  const numText = val.toString().replace(/,/g, '');
  const num = Number(numText);
  if (isNaN(num)) return numText;
  return num.toLocaleString('ja-JP');
};

const parseFormattedString = (val: string): number | '' => {
  if (!val) return '';
  const numStr = val.replace(/,/g, '');
  const num = Number(numStr);
  return isNaN(num) ? '' : num;
};

export default function BillingForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isEditing = !!id && id !== 'new'

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [projectsList, setProjectsList] = useState<ProjectData[]>([])

  // Header State
  const [projectId, setProjectId] = useState("")
  const [projectIds, setProjectIds] = useState<string[]>([]) // For combined projects
  const [projectNumber, setProjectNumber] = useState("")
  const [billingCategory, setBillingCategory] = useState("出来高")
  const [ordererCategory, setOrdererCategory] = useState("元請")
  const [billingSubject, setBillingSubject] = useState("")
  const [billingDestination, setBillingDestination] = useState("")
  const [contractAmount, setContractAmount] = useState<number | ''>('')
  const [overallNotes, setOverallNotes] = useState("")

  // Details State
  const [details, setDetails] = useState<InvoiceDetailData[]>([])

  useEffect(() => {
    fetchProjects()
    if (isEditing) {
      fetchInvoice()
    }
  }, [id])

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_name, project_number, client_name, client_company_name, status_flag, category, site_name')
        .order('created_at', { ascending: false })
      if (!error && data) {
        const mappedProjects = data.map(p => ({ 
          id: p.id, 
          name: p.project_name, 
          number: p.project_number,
          clientName: p.client_name,
          clientCompanyName: p.client_company_name,
          statusFlag: p.status_flag,
          category: p.category,
          siteName: p.site_name
        }))
        setProjectsList(mappedProjects)
        
        // Auto-select project if project_id is in URL query params
        console.log("[Auto-Fill Debug] location.search:", location.search, "isEditing:", isEditing);
        if (!isEditing) {
          const searchParams = new URLSearchParams(location.search)
          const urlProjectId = searchParams.get('project_id')
          if (urlProjectId) {
            console.log("[Auto-Fill Debug] urlProjectId found:", urlProjectId, "Calling handleProjectSelection...");
            // Pass false for autoRedirect to prevent infinite loop on page load
            handleProjectSelection(urlProjectId, mappedProjects, false)
          } else {
            console.log("[Auto-Fill Debug] No project_id found in URL.");
          }
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  async function fetchInvoice() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_details(*)')
        .eq('id', id)
        .single()
      
      if (error) throw error
      if (data) {
        setProjectId(data.project_id || "")
        
        // Extract related project IDs, excluding the primary project
        const pIds = data.project_ids || []
        setProjectIds(pIds.filter((idx: string) => idx !== data.project_id))

        setProjectNumber(data.project_number || "")
        setBillingCategory(data.billing_category || "出来高")
        setOrdererCategory(data.orderer_category || "元請")
        setBillingSubject(data.billing_subject || "")
        setBillingDestination(data.billing_destination || "")
        setContractAmount(data.contract_amount || '')
        setOverallNotes(data.overall_notes || "")

        if (data.invoice_details) {
          setDetails(data.invoice_details.map((d: any) => ({
            id: d.id,
            billing_month: d.billing_month || "",
            amount: d.amount || '',
            billing_date: d.billing_date || "",
            expected_deposit_date: d.expected_deposit_date || "",
            deposit_date: d.deposit_date || "",
            details_status: d.details_status || "未請求",
            details_notes: d.details_notes || ""
          })))
        }
      }
    } catch (error) {
      console.error("Error fetching invoice:", error)
      alert("請求データの読み込みに失敗しました")
      navigate("/billing")
    } finally {
      setLoading(false)
    }
  }

  const handleAddDetail = () => {
    setDetails([
      ...details,
      {
        billing_month: "",
        amount: "",
        billing_date: "",
        expected_deposit_date: "",
        deposit_date: "",
        details_status: "未請求",
        details_notes: ""
      }
    ])
  }

  // Ensure there's at least one detail row for a new invoice
  useEffect(() => {
    if (!loading && !isEditing && details.length === 0) {
      handleAddDetail()
    }
  }, [loading, isEditing, details.length])

  const handleRemoveDetail = (index: number) => {
    setDetails(details.filter((_, i) => i !== index))
  }

  const handleDetailChange = (index: number, field: keyof InvoiceDetailData, value: string | number) => {
    const updated = [...details]
    updated[index] = { ...updated[index], [field]: value }
    setDetails(updated)
  }

  const handleProjectChange = async (selId: string) => {
    // User triggered via select, so autoRedirect = true
    await handleProjectSelection(selId, projectsList, true)
  }

  const handleProjectSelection = async (selId: string, currentProjectsList: ProjectData[], autoRedirect: boolean = true) => {
    console.log("[Auto-Fill Debug] handleProjectSelection called with ID:", selId);
    console.log("[Auto-Fill Debug] currentProjectsList length:", currentProjectsList.length);
    
    // Auto-fill logic for new invoices from '完工' or '完了' (completed) projects or if coming from the UI button
    if (!isEditing && autoRedirect) {
      // **CRITICAL FEATURE: Prevent creating multiple separate invoices for the same project**
      // If an invoice already exists for this project, redirect to editing that invoice to add more details
      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('project_id', selId)
        .limit(1);

      if (existingInvoices && existingInvoices.length > 0) {
        // Automatically redirect without asking
        navigate(`/billing/${existingInvoices[0].id}/edit`);
        return;
      }
    }

    setProjectId(selId)
    const proj = currentProjectsList.find(p => p.id === selId)
    console.log("[Auto-Fill Debug] Found project:", proj);
    
    if (proj) {
      setProjectNumber(proj.number || "")
      
      console.log("[Auto-Fill Debug] isEditing:", isEditing, "statusFlag:", proj.statusFlag, "proj:", proj);
      if (!isEditing) {
        console.log("[Auto-Fill Debug] Triggering Auto-Fill!");
        
        let destination = ""
        // 川北、BPEはそのまま区分が入り、他は発注者（clientName）が入る
        if (proj.category === '川北' || proj.category?.toUpperCase() === 'BPE') {
          destination = proj.category
        } else {
          destination = proj.clientName || ""
        }

        setBillingDestination(destination)
        setBillingSubject(proj.name || "")
        // Check if it's already billed partially, otherwise default to "完成"
        setBillingCategory("完成")
      }
    }
  }

  const handleSave = async () => {
    if (!projectId) {
      alert("案件を選択してください。")
      return
    }

    setSaving(true)
    try {
      const combinedProjectIds = [projectId, ...projectIds].filter(id => id)

      const headerPayload = {
        project_id: projectId,
        project_ids: combinedProjectIds,
        project_number: projectNumber,
        billing_category: billingCategory,
        orderer_category: ordererCategory,
        billing_subject: billingSubject,
        billing_destination: billingDestination,
        contract_amount: contractAmount === '' ? null : contractAmount,
        overall_notes: overallNotes
      }

      let currentInvoiceId = id

      if (isEditing && id) {
        const { error } = await supabase.from('invoices').update(headerPayload).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('invoices').insert([headerPayload]).select()
        if (error) throw error
        currentInvoiceId = data[0].id
      }

      // Handle Details (Delete old and insert new, this is simpler than diffing)
      if (isEditing && id) {
        const { error: delError } = await supabase.from('invoice_details').delete().eq('invoice_id', id)
        if (delError) throw delError
      }

      if (details.length > 0 && currentInvoiceId) {
        const detailsPayload = details.map(d => ({
          invoice_id: currentInvoiceId,
          billing_month: d.billing_month,
          amount: d.amount === '' ? null : d.amount,
          billing_date: d.billing_date,
          expected_deposit_date: d.expected_deposit_date,
          deposit_date: d.deposit_date,
          details_status: d.details_status,
          details_notes: d.details_notes
        }))
        const { error: insError } = await supabase.from('invoice_details').insert(detailsPayload)
        if (insError) throw insError
      }

      navigate("/billing")
    } catch (e: any) {
      console.error("Error saving invoice:", e)
      alert("保存中にエラーが発生しました: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-slate-50">
      <div className="flex-1 overflow-y-auto min-h-0 pr-4 -mr-4">
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
          
          <div className="flex items-center gap-4 sticky top-0 bg-slate-50/80 backdrop-blur-md py-4 z-10 border-b">
            <button
              onClick={() => navigate("/billing")}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-bold">
                {isEditing ? "請求データの編集" : "請求データの新規作成"}
              </h2>
              <p className="text-sm text-slate-500 mt-1">※すべての金額は税込で入力してください</p>
            </div>
            
            <button
              onClick={() => navigate("/billing")}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50 h-10 px-6 py-2"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none bg-blue-600 text-white shadow hover:bg-blue-700 h-10 px-6 py-2 gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              データを登録・保存
            </button>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              
              {/* Left Column: Header Form */}
              <div className="space-y-8">
                <div className="flex items-center gap-2 border-b pb-3 border-blue-100">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-lg text-blue-600">基本情報・宛先</h3>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    {projectId ? (
                      <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-blue-600">対象の工事案件</p>
                          <button 
                            onClick={() => setProjectId("")}
                            className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 whitespace-nowrap ml-4"
                          >変更</button>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3">
                            <span className="bg-white text-blue-700 font-mono text-sm px-2 py-1 rounded shadow-sm border border-blue-100 font-bold shrink-0">
                              [{projectsList.find(proj => proj.id === projectId)?.number || projectNumber || '番号なし'}]
                            </span>
                            <span className="font-bold text-slate-800 text-lg leading-tight">
                              {(() => {
                                const p = projectsList.find(proj => proj.id === projectId);
                                if (!p) return '名称未設定';
                                if ((p.category === '川北' || p.category === 'BPE') && p.siteName) {
                                  return `${p.name} / ${p.siteName}`;
                                }
                                return p.name;
                              })()}
                            </span>
                          </div>
                          {projectIds.map(id => {
                            const p = projectsList.find(proj => proj.id === id);
                            if (!p) return null;
                            return (
                              <div key={id} className="flex items-center gap-3">
                                <span className="bg-white text-blue-700 font-mono text-sm px-2 py-1 rounded shadow-sm border border-blue-100 font-bold shrink-0">
                                  [{p.number || '番号なし'}]
                                </span>
                                <span className="font-bold text-slate-800 text-lg leading-tight">
                                  {((p.category === '川北' || p.category === 'BPE') && p.siteName) ? `${p.name} / ${p.siteName}` : p.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <>
                        <label className="text-sm font-bold text-slate-700">対象の工事案件 <span className="text-red-500">*</span></label>
                        <select
                          value={projectId}
                          onChange={(e) => handleProjectChange(e.target.value)}
                          className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                        >
                          <option value="">選択してください</option>
                          {projectsList.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">請求先名称</label>
                    <AutocompleteInput
                      tableName="projects"
                      columnName="client_company_name"
                      value={billingDestination}
                      onChange={(val) => setBillingDestination(val)}
                      placeholder=""
                      className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">請求件名（請求書タイトル）</label>
                    <AutocompleteInput
                      tableName="projects"
                      columnName="project_name"
                      value={billingSubject}
                      onChange={(val) => setBillingSubject(val)}
                      placeholder=""
                      className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">請求区分</label>
                      <select
                        value={billingCategory}
                        onChange={(e) => setBillingCategory(e.target.value)}
                        className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                      >
                        <option value="出来高">出来高 (中間請求)</option>
                        <option value="完成">完成 (最終請求・一括)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">請負総額（税込）</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={toFormattedString(contractAmount)}
                        onChange={(e) => setContractAmount(parseFormattedString(e.target.value))}
                        className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base font-bold tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 hidden">
                    {/* Hidden but kept for backwards compatibility / data consistency if needed */}
                    <label className="text-sm font-bold text-slate-500">発注元区分</label>
                    <select
                      value={ordererCategory}
                      onChange={(e) => setOrdererCategory(e.target.value)}
                      className="w-full h-11 rounded-md border border-slate-300 bg-white px-3"
                    >
                      <option value="元請">元請</option>
                      <option value="下請">下請</option>
                      <option value="孫請">孫請</option>
                    </select>
                  </div>
                  
                  {/* Combined Billing Selection */}
                  <div className="space-y-4 pt-6">
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Folder className="w-5 h-5 text-slate-500" />
                        <h4 className="font-bold text-slate-700">関連する案件を追加（合算請求）</h4>
                      </div>
                      <p className="text-xs text-slate-500 mb-4 pl-7">※同じ発注者で「着工中」または「完工」の案件が表示されています。</p>
                      
                      {!projectId && (
                        <div className="text-sm text-slate-500 bg-white p-4 rounded-lg border border-dashed text-center">
                          対象の基本情報・宛先から「関連案件」を選択してください。
                        </div>
                      )}
                      
                      {projectId && (() => {
                        const primaryClient = projectsList.find(p => p.id === projectId)?.clientName;
                        const combinableProjects = projectsList.filter(p => 
                          p.id !== projectId && 
                          p.clientName === primaryClient && 
                          primaryClient && 
                          (p.statusFlag === '着工中' || p.statusFlag === '完工' || p.statusFlag === '完了')
                        );
                        
                        if (!primaryClient) {
                          return (
                            <div className="text-sm text-slate-500 bg-white p-4 rounded-lg border border-dashed text-center">
                              選択された案件に発注者が設定されていないため、関連案件を検索できません。
                            </div>
                          );
                        }

                        if (combinableProjects.length === 0) {
                          return (
                            <div className="text-sm text-slate-500 bg-white p-4 rounded-lg border border-dashed text-center">
                              合算可能な関連案件はありません。
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-2 mt-4">
                            {combinableProjects.map(p => (
                              <label key={p.id} className={`flex items-start gap-4 p-4 border rounded-xl cursor-pointer transition-all ${projectIds.includes(p.id) ? 'bg-white border-blue-400 shadow-sm ring-1 ring-blue-100' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                <input 
                                  type="checkbox"
                                  className="mt-1 flex-shrink-0 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  checked={projectIds.includes(p.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setProjectIds(prev => [...prev, p.id]);
                                    else setProjectIds(prev => prev.filter(id => id !== p.id));
                                  }}
                                />
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-[11px] font-bold text-slate-400 tracking-wider font-mono mb-0.5">{p.number || "番号未設定"}</span>
                                  <span className={`text-base font-bold ${projectIds.includes(p.id) ? 'text-slate-800' : 'text-slate-600'} line-clamp-2`}>
                                    {((p.category === '川北' || p.category === 'BPE') && p.siteName) ? `${p.name} / ${p.siteName}` : p.name}
                                  </span>
                                </div>
                              </label>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Details Form */}
              <div className="space-y-8">
                <div className="flex items-center justify-between border-b pb-3 border-orange-200">
                  <div className="flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-orange-500" />
                    <h3 className="font-bold text-lg text-orange-600">今回の請求・明細</h3>
                  </div>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleAddDetail}
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-slate-100 text-slate-600 h-8 px-3 gap-2 border border-slate-200 shadow-sm"
                    >
                      <PlusCircle className="w-4 h-4" />
                      明細を追加
                    </button>
                  )}
                </div>

                <div className="space-y-6">
                  {details.map((detail, index) => (
                    <div key={index} className={`relative isolate ${index > 0 ? 'pt-8 border-t border-dashed border-slate-200' : ''}`}>
                      {isEditing && details.length > 1 && (
                        <div className="absolute top-2 right-0 z-10">
                          <button
                            type="button"
                            onClick={() => handleRemoveDetail(index)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="この明細を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-slate-700">請求日 <span className="text-red-500">*</span></label>
                          <input
                            type="date"
                            value={detail.billing_date}
                            onChange={(e) => handleDetailChange(index, "billing_date", e.target.value)}
                            className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-slate-700">入金予定日</label>
                          <input
                            type="date"
                            value={detail.expected_deposit_date}
                            onChange={(e) => handleDetailChange(index, "expected_deposit_date", e.target.value)}
                            className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-slate-700">対象月</label>
                          <div className="relative">
                            <input
                              type="month"
                              value={detail.billing_month}
                              onChange={(e) => handleDetailChange(index, "billing_month", e.target.value)}
                              className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                            {/* Fallback pattern for browsers that don't support input type="month" well could be handled here or just expect user input in YYYY-MM format */}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-bold text-orange-600">今回請求額（税込） <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={toFormattedString(detail.amount)}
                            onChange={(e) => handleDetailChange(index, "amount", parseFormattedString(e.target.value))}
                            className="w-full h-11 rounded-lg border border-orange-300 bg-orange-50/50 px-3 text-lg font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 focus:bg-white transition-all shadow-sm"
                          />
                        </div>
                        
                        {isEditing && (
                          <>
                            <div className="space-y-2 hidden">
                               <label className="text-sm font-bold text-slate-500">入金日</label>
                               <input
                                 type="date"
                                 value={detail.deposit_date}
                                 onChange={(e) => handleDetailChange(index, "deposit_date", e.target.value)}
                                 className="w-full h-11 rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-800"
                               />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-slate-700">ステータス</label>
                              <select
                                value={detail.details_status}
                                onChange={(e) => handleDetailChange(index, "details_status", e.target.value)}
                                className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                              >
                                <option value="未請求">未請求</option>
                                <option value="請求済">請求済</option>
                                <option value="入金済">入金済</option>
                                <option value="完了">完了</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-slate-700">明細備考</label>
                              <input
                                type="text"
                                value={detail.details_notes}
                                onChange={(e) => handleDetailChange(index, "details_notes", e.target.value)}
                                className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="space-y-2 pt-6">
                    <label className="text-sm font-bold text-slate-700">事務用メモ（備考）</label>
                    <textarea
                      value={overallNotes}
                      onChange={(e) => setOverallNotes(e.target.value)}
                      placeholder="社内での管理用メモとして自由に入力してください"
                      className="w-full min-h-[120px] rounded-lg border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y"
                    />
                  </div>
                  
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
