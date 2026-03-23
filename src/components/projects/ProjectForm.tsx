import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2, ArrowLeft, Save, Trash2 } from "lucide-react"
import { SearchableInput } from "../ui/SearchableInput"

export default function ProjectForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [initialLoading, setInitialLoading] = useState(isEditing)
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false)

  const [formData, setFormData] = useState<any>({
    project_number: "",
    project_name: "",
    category: "一般",
    status_flag: "着工前",
    client_name: "",
    site_name: "",
    client_company_name: "",
    folder_url: "",
    parent_project_id: null
  })
  
  const [suggestions, setSuggestions] = useState<{clientNames: string[], siteNames: string[], contactNames: string[]}>({
    clientNames: [],
    siteNames: [],
    contactNames: []
  })

  // Fetch project for editing
  useEffect(() => {
    if (isEditing) {
      async function fetchProject() {
        try {
          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single()
            
          if (error) throw error
         if (data) {
            // 工程管理用の特別な案件（VACATIONなど）の場合は編集をブロックする
            if (data.project_number === 'VACATION' || data.project_name === '■ 休暇') {
              alert("この案件は工程管理専用のため、案件管理画面から編集・削除することはできません。")
              navigate("/projects")
              return
            }
            setFormData(data)
        }
        } catch (err) {
          console.error("Error fetching project:", err)
          alert("データの取得に失敗しました")
        } finally {
          setInitialLoading(false)
        }
      }
      fetchProject()
    }
  }, [id, isEditing])

  // Auto-generate project number for new projects
  useEffect(() => {
    if (isEditing) return;

    async function generateProjectNumber() {
      setIsGeneratingNumber(true);
      try {
        const now = new Date();
        const yy = now.getFullYear().toString().slice(-2);
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const yymm = `${yy}${mm}`;

        let prefix = '';
        if (formData.category === '川北') prefix = 'KD';
        if (formData.category === 'BPE') prefix = 'BS';

        const searchPrefix = `${prefix}${yymm}`;
        
        const { data: latestProjects, error } = await supabase
          .from('projects')
          .select('project_number')
          .ilike('project_number', `${searchPrefix}%`)
          .not('project_number', 'like', '%-%') // ignore branches
          .order('project_number', { ascending: false })
          .limit(1);

        if (error) throw error;

        let nextSequence = 1;
        if (latestProjects && latestProjects.length > 0 && latestProjects[0].project_number) {
          const highestNum = latestProjects[0].project_number;
          const seqStr = highestNum.slice(searchPrefix.length);
          const seq = parseInt(seqStr, 10);
          if (!isNaN(seq)) {
            nextSequence = seq + 1;
          }
        }

        const newNum = `${searchPrefix}${nextSequence.toString().padStart(2, '0')}`;
        setFormData((prev: any) => ({ ...prev, project_number: newNum }));
      } catch (err) {
        console.error("Number generation error:", err);
      } finally {
        setIsGeneratingNumber(false);
      }
    }

    // Only run normal auto-generation if project isn't a pre-populated branch
    if (!formData.parent_project_id) {
      generateProjectNumber();
    }
  }, [formData.category, isEditing]);

  // Fetch unique client names and site names based on category for autocomplete
  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('client_name, site_name, client_company_name')
          .eq('category', formData.category)

        if (error) throw error

        if (data) {
          const uniqueClients = Array.from(new Set(data.map(d => d.client_name).filter(Boolean))) as string[]
          const uniqueSites = Array.from(new Set(data.map(d => d.site_name).filter(Boolean))) as string[]
          
          // Filter contacts based on what is typed in the client_name or site_name
          let contactsData = data;
          if (formData.category === '一般' || formData.category === '役所') {
            if (formData.client_name) {
              contactsData = contactsData.filter(d => d.client_name === formData.client_name)
            }
          } else {
            if (formData.site_name) {
              contactsData = contactsData.filter(d => d.site_name === formData.site_name)
            }
          }
          const uniqueContacts = Array.from(new Set(contactsData.map(d => d.client_company_name).filter(Boolean))) as string[]

          setSuggestions({ 
            clientNames: uniqueClients, 
            siteNames: uniqueSites,
            contactNames: uniqueContacts
          })
        }
      } catch (err) {
        console.error("Error fetching suggestions:", err)
      }
    }
    fetchSuggestions()
  }, [formData.category, formData.client_name, formData.site_name])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev: any) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isEditing) {
        const { error } = await supabase
          .from('projects')
          .update(formData)
          .eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('projects')
          .insert([formData])
        if (error) throw error
      }
      
      navigate("/projects")
    } catch (err: any) {
      console.error("Error saving project:", err)
      alert("保存に失敗しました: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      
      alert("案件を削除しました。")
      navigate("/projects")
    } catch (err: any) {
      console.error("Error deleting project:", err)
      alert("削除に失敗しました: " + (err.message || "不明なエラー"))
    } finally {
      setDeleting(false)
    }
  }

  const createBranchProject = async (bType: "k" | "t", label: string) => {
    if (!id || !formData.project_number) return;
    try {
      setLoading(true);
      const prefix = `${formData.project_number}-${bType}0`;
      const { data: latestSub, error: subErr } = await supabase
        .from('projects')
        .select('project_number')
        .ilike('project_number', `${prefix}%`)
        .order('project_number', { ascending: false })
        .limit(1);
      
      if (subErr) throw subErr;

      let nextSequence = 1;
      if (latestSub && latestSub.length > 0 && latestSub[0].project_number) {
        const highestNum = latestSub[0].project_number;
        const match = highestNum.split('-')[1]?.match(/^[kt](\d+)$/);
        if (match && match[1]) {
          const seq = parseInt(match[1], 10);
          if (!isNaN(seq)) nextSequence = seq + 1;
        }
      }
      const newNum = `${formData.project_number}-${bType}${nextSequence.toString().padStart(2, '0')}`;
      
      const newProject = {
        project_number: newNum,
        project_name: `${formData.project_name}（${label}）`,
        category: formData.category,
        status_flag: "着工前",
        client_name: formData.client_name,
        site_name: formData.site_name,
        client_company_name: formData.client_company_name,
        folder_url: "",
        parent_project_id: id
      };

      const { data: inserted, error } = await supabase
        .from('projects')
        .insert([newProject])
        .select('id')
        .single();
        
      if (error) throw error;
      
      alert(`「${label}」の枝番案件（${newNum}）を作成しました！`);
      navigate(`/projects/${inserted.id}`);
      window.scrollTo(0, 0);
    } catch (err: any) {
      console.error(err);
      alert("枝番案件の作成に失敗しました: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate("/projects")}
          className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {isEditing ? "案件の編集" : "新規案件登録"}
          </h2>
          <p className="text-muted-foreground">
            工事案件の基本情報を入力してください
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-200 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="space-y-2 relative">
              <label className="text-sm font-bold text-slate-700">工事番号 (自動採番)</label>
              <div className="relative">
                <input 
                  name="project_number" 
                  value={formData.project_number || ''} 
                  onChange={handleChange}
                  readOnly
                  className="flex h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-500 cursor-not-allowed font-mono font-medium focus:outline-none" 
                  placeholder="登録時に自動生成されます"
                />
                {isGeneratingNumber && (
                   <div className="absolute right-3 top-1/2 -translate-y-1/2">
                     <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                   </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">ステータス <span className="text-red-500">*</span></label>
              <select 
                name="status_flag" 
                value={formData.status_flag} 
                onChange={handleChange}
                className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                required
              >
                <option value="着工前">着工前</option>
                <option value="着工中">着工中</option>
                {isEditing && (
                  <>
                    <option value="完工">完工</option>
                    <option value="保留">保留</option>
                    <option value="失注">失注</option>
                  </>
                )}
              </select>
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="text-sm font-bold text-slate-700">区分 <span className="text-red-500">*</span></label>
              <div className="flex bg-slate-100/80 p-1.5 rounded-lg border border-slate-200 shadow-sm">
                {["一般", "役所", "川北", "BPE"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                        setFormData((prev: any) => {
                            if (prev.category === cat) return prev;
                            return { 
                                ...prev, 
                                category: cat,
                                client_name: '',
                                site_name: '',
                                client_company_name: '' 
                            };
                        });
                    }}
                    className={`flex-1 text-sm font-bold py-2.5 rounded-md transition-all ${
                      formData.category === cat 
                        ? 'bg-white shadow text-blue-700 outline outline-1 outline-blue-200' 
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-slate-700">案件名 / 工事名称 <span className="text-red-500">*</span></label>
              <input 
                name="project_name" 
                value={formData.project_name} 
                onChange={handleChange}
                className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base ring-offset-background placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                placeholder="〇〇ビル改修工事"
                required
              />
            </div>

            {/* Unified Client / Site Field */}
            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-bold text-slate-700">
                {(formData.category === "一般" || formData.category === "役所") ? "発注者" : "現場名"} <span className="text-red-500">*</span>
              </label>
              <SearchableInput 
                name={(formData.category === "一般" || formData.category === "役所") ? "client_name" : "site_name"} 
                value={(formData.category === "一般" || formData.category === "役所") ? (formData.client_name || '') : (formData.site_name || '')} 
                onChange={(val) => {
                  const field = (formData.category === "一般" || formData.category === "役所") ? 'client_name' : 'site_name'
                  setFormData((prev: any) => ({ ...prev, [field]: val }))
                }}
                suggestions={(formData.category === "一般" || formData.category === "役所") ? suggestions.clientNames : suggestions.siteNames}
                placeholder={(formData.category === "一般" || formData.category === "役所") ? "例: 山田太郎" : "東京都新宿区..."}
                required
              />
            </div>

            {/* 発注先担当者 Field (Repurposing client_company_name column) */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">発注先担当者</label>
              <SearchableInput 
                name="client_company_name" 
                value={(formData as any).client_company_name || ''} 
                onChange={(val) => setFormData((prev: any) => ({ ...prev, client_company_name: val }))}
                suggestions={suggestions.contactNames}
                placeholder="例: 佐藤一郎"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-slate-700">Google Drive フォルダURL</label>
              <input 
                name="folder_url" 
                value={formData.folder_url || ''} 
                onChange={handleChange}
                className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base ring-offset-background placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                placeholder="https://drive.google.com/drive/folders/..."
              />
              <p className="text-xs text-slate-500">※将来的には自動生成されるようになります</p>
            </div>
            
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div>
              {isEditing && (
                <div className="flex gap-2 mr-auto">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleting || loading}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors text-red-600 hover:bg-red-50 hover:text-red-700 h-10 px-4 py-2 gap-2 disabled:opacity-50 border border-transparent hover:border-red-200"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    削除する
                  </button>
                  
                  {/* 分岐用ボタン */}
                  {!formData.parent_project_id && (
                    <>
                      <button
                        type="button"
                        onClick={() => createBranchProject("k", "仮設")}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-md text-sm font-bold transition-colors text-indigo-700 bg-indigo-50 hover:bg-indigo-100 h-10 px-4 py-2 border border-indigo-200"
                      >
                        + 仮設を追加
                      </button>
                      <button
                        type="button"
                        onClick={() => createBranchProject("t", "追加")}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-md text-sm font-bold transition-colors text-teal-700 bg-teal-50 hover:bg-teal-100 h-10 px-4 py-2 border border-teal-200"
                      >
                        + 追加工事
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => navigate("/projects")}
                className="inline-flex items-center justify-center rounded-lg text-sm font-bold transition-all border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 h-11 px-5 py-2 shadow-sm"
              >
                キャンセル
              </button>
              <button 
                type="submit"
                disabled={loading || deleting}
                className="inline-flex items-center justify-center rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm h-11 px-6 py-2 gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isEditing ? "更新する" : "登録する"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 transition-opacity">
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-foreground">案件の削除</h3>
            <p className="text-sm text-muted-foreground">
              この案件を本当に削除しますか？<br/>この操作は取り消せません。
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium transition-colors"
              >
                キャンセル
              </button>
              <button 
                onClick={confirmDelete} 
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 text-sm font-medium transition-colors"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
