import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { ArrowLeft, Save, Trash2, Loader2, FileText, PlusCircle } from "lucide-react"
import { AutocompleteInput } from "../components/ui/AutocompleteInput"

type ProjectData = { id: string; name: string; number: string | null }

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

export default function BillingForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [projectsList, setProjectsList] = useState<ProjectData[]>([])

  // Header State
  const [projectId, setProjectId] = useState("")
  const [projectNumber, setProjectNumber] = useState("")
  const [billingCategory, setBillingCategory] = useState("工事請求")
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
        .select('id, project_name, project_number')
        .order('created_at', { ascending: false })
      if (!error && data) {
        setProjectsList(data.map(p => ({ id: p.id, name: p.project_name, number: p.project_number })))
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
        setProjectNumber(data.project_number || "")
        setBillingCategory(data.billing_category || "工事請求")
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

  const handleRemoveDetail = (index: number) => {
    setDetails(details.filter((_, i) => i !== index))
  }

  const handleDetailChange = (index: number, field: keyof InvoiceDetailData, value: string | number) => {
    const updated = [...details]
    updated[index] = { ...updated[index], [field]: value }
    setDetails(updated)
  }

  const handleProjectChange = (selId: string) => {
    setProjectId(selId)
    const proj = projectsList.find(p => p.id === selId)
    if (proj && proj.number) {
      setProjectNumber(proj.number)
    }
  }

  const handleSave = async () => {
    if (!projectId) {
      alert("案件を選択してください。")
      return
    }

    setSaving(true)
    try {
      const headerPayload = {
        project_id: projectId,
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
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0 pr-4 -mr-4">
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
          
          <div className="flex items-center gap-4 sticky top-0 bg-background/80 backdrop-blur-sm py-4 z-10 border-b">
            <button
              onClick={() => navigate("/billing")}
              className="p-2 hover:bg-muted rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold flex-1">
              {isEditing ? "請求データの編集" : "新規請求データの作成"}
            </h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2 gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存
            </button>
          </div>

          <div className="bg-card border rounded-xl shadow-sm p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4">
            
            {/* Header Form */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b pb-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-lg">基本情報</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">関連案件 <span className="text-destructive">*</span></label>
                  <select
                    value={projectId}
                    onChange={(e) => handleProjectChange(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                  >
                    <option value="">選択してください</option>
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">工事番号</label>
                  <input
                    type="text"
                    value={projectNumber}
                    onChange={(e) => setProjectNumber(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">請負金額 (円)</label>
                  <input
                    type="number"
                    value={contractAmount}
                    onChange={(e) => setContractAmount(e.target.value ? Number(e.target.value) : '')}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 tabular-nums"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">請求先名称</label>
                  <AutocompleteInput
                    tableName="projects"
                    columnName="client_company_name"
                    value={billingDestination}
                    onChange={(val) => setBillingDestination(val)}
                    placeholder="請求先組織・会社名を入力"
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">請求件名</label>
                  <AutocompleteInput
                    tableName="projects"
                    columnName="project_name"
                    value={billingSubject}
                    onChange={(val) => setBillingSubject(val)}
                    placeholder="件名を入力"
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">請求区分</label>
                  <select
                    value={billingCategory}
                    onChange={(e) => setBillingCategory(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                  >
                    <option value="工事請求">工事請求</option>
                    <option value="単価請求">単価請求</option>
                    <option value="その他">その他</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">発注元区分</label>
                  <select
                    value={ordererCategory}
                    onChange={(e) => setOrdererCategory(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3"
                  >
                    <option value="元請">元請</option>
                    <option value="下請">下請</option>
                    <option value="孫請">孫請</option>
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">全体備考</label>
                  <textarea
                    value={overallNotes}
                    onChange={(e) => setOverallNotes(e.target.value)}
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Details Form (Multiple Lines) */}
            <div className="space-y-6 pt-4 border-t">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-lg">請求明細（分割・月別）</h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddDetail}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2 border shadow-sm"
                >
                  <PlusCircle className="w-4 h-4 text-primary" />
                  明細を追加
                </button>
              </div>

              {details.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20 text-muted-foreground">
                  <p>請求明細がありません。「明細を追加」ボタンから追加してください。</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {details.map((detail, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-card shadow-sm space-y-4 relative group">
                      <button
                        type="button"
                        onClick={() => handleRemoveDetail(index)}
                        className="absolute top-2 right-2 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="この明細を削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mr-8">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">対象月 (例: 2026年3月)</label>
                          <input
                            type="text"
                            value={detail.billing_month}
                            onChange={(e) => handleDetailChange(index, "billing_month", e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">金額 (円)</label>
                          <input
                            type="number"
                            value={detail.amount}
                            onChange={(e) => handleDetailChange(index, "amount", e.target.value ? Number(e.target.value) : "")}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm tabular-nums"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">ステータス</label>
                          <select
                            value={detail.details_status}
                            onChange={(e) => handleDetailChange(index, "details_status", e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="未請求">未請求</option>
                            <option value="請求済">請求済</option>
                            <option value="入金済">入金済</option>
                            <option value="完了">完了</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">請求日</label>
                          <input
                            type="date"
                            value={detail.billing_date}
                            onChange={(e) => handleDetailChange(index, "billing_date", e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">入金予定日</label>
                          <input
                            type="date"
                            value={detail.expected_deposit_date}
                            onChange={(e) => handleDetailChange(index, "expected_deposit_date", e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">入金日</label>
                          <input
                            type="date"
                            value={detail.deposit_date}
                            onChange={(e) => handleDetailChange(index, "deposit_date", e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>
                        <div className="space-y-2 lg:col-span-3">
                          <label className="text-xs font-medium text-muted-foreground">明細備考</label>
                          <input
                            type="text"
                            value={detail.details_notes}
                            onChange={(e) => handleDetailChange(index, "details_notes", e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
