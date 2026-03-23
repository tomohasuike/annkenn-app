import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { ArrowLeft, Loader2, Save, CheckSquare, Calendar, User, Search, Camera, X, Plus } from "lucide-react"
import imageCompression from 'browser-image-compression';
import { format } from 'date-fns';
import { AutocompleteInput } from "../components/ui/AutocompleteInput"

type ProjectData = {
  id: string
  name: string
  category: string
  status: string
}

type CompletionReportData = {
  project_id: string
  completion_date: string
  reporter: string
  inspector: string
  inspection_date: string
  inspection_items: string
  inspection_content: string
  witness: string
  inspection_result: string
  notes: string
  approval_status: string
  approver_comment: string
  main_photo: string
}

export default function CompletionReportForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [projectsList, setProjectsList] = useState<ProjectData[]>([])
  
  const [report, setReport] = useState<CompletionReportData>({
    project_id: '',
    completion_date: format(new Date(), 'yyyy-MM-dd'),
    reporter: '',
    inspector: '',
    inspection_date: format(new Date(), 'yyyy-MM-dd'),
    inspection_items: '',
    inspection_content: '',
    witness: '',
    inspection_result: '',
    notes: '',
    approval_status: '未承認',
    approver_comment: '',
    main_photo: ''
  })

  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [existingPhotos, setExistingPhotos] = useState<string[]>([])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchProjects()

      if (id) {
        await fetchReportData(id)
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && user.email) {
            setReport(prev => ({ ...prev, reporter: user.email?.split('@')[0] || '' }))
        }
        setLoading(false)
      }
    }
    init()
  }, [id])

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_name, category, status_flag')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      if (data) {
        setProjectsList(data.map(p => ({
          id: p.id,
          name: p.project_name,
          category: p.category || '未分類',
          status: p.status_flag || '着工前'
        })))
      }
    } catch (e) {
      console.error("Error fetching projects:", e)
    }
  }

  async function fetchReportData(reportId: string) {
    try {
      const { data, error } = await supabase
        .from('completion_reports')
        .select('*')
        .eq('id', reportId)
        .single()
      
      if (error) throw error
      if (data) {
        setReport({
          project_id: data.project_id || '',
          completion_date: data.completion_date || '',
          reporter: data.reporter || '',
          inspector: data.inspector || '',
          inspection_date: data.inspection_date || '',
          inspection_items: data.inspection_items || '',
          inspection_content: data.inspection_content || '',
          witness: data.witness || '',
          inspection_result: data.inspection_result || '',
          notes: data.notes || '',
          approval_status: data.approval_status || '未承認',
          approver_comment: data.approver_comment || '',
          main_photo: data.main_photo || ''
        })

        // Handle legacy JSON or string photos
        let initialPhotos: string[] = [];
        try {
            if (data.main_photo) {
                const parsed = JSON.parse(data.main_photo);
                if (Array.isArray(parsed)) initialPhotos = parsed;
                else initialPhotos = [data.main_photo];
            }
        } catch(e) {
            initialPhotos = data.main_photo ? [data.main_photo] : [];
        }
        setExistingPhotos(initialPhotos);
      }
    } catch (e) {
      console.error("Error fetching report details:", e)
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        setPendingPhotos(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removePendingPhoto = (index: number) => {
      setPendingPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const removeExistingPhoto = (urlToRemove: string) => {
      setExistingPhotos(prev => prev.filter(url => url !== urlToRemove))
  }

  const handleSave = async () => {
    if (!report.project_id) {
      alert("案件を選択してください")
      return
    }

    try {
      setSaving(true)
      
      const uploadedUrls: string[] = [...existingPhotos];

      // Upload newly added photos
      if (pendingPhotos.length > 0) {
        for (const file of pendingPhotos) {
          const options = {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1920,
            useWebWorker: true
          }
          const compressedFile = await imageCompression(file, options);
          const fileExt = compressedFile.name.split('.').pop();
          const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
          
          const finalFile = new File([compressedFile], fileName, { type: compressedFile.type });
          const formData = new FormData();
          formData.append('file', finalFile);

          const { error: uploadError, data: uploadData } = await supabase.functions.invoke('upload-drive-file', {
              body: formData,
          });

          if (uploadError || !uploadData?.success) {
              console.error("Error uploading image:", uploadError || uploadData?.error);
              throw new Error("画像のアップロードに失敗しました");
          }

          if (uploadData) {
              const driveImgUrl = uploadData.thumbnailLink ? uploadData.thumbnailLink.replace('=s220', '=s800') : uploadData.webViewLink;
              uploadedUrls.push(driveImgUrl);
          }
        }
      }

      const finalPhotoUrlString = uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null;

      const payload = {
        project_id: report.project_id,
        completion_date: report.completion_date || null,
        reporter: report.reporter,
        inspector: report.inspector,
        inspection_date: report.inspection_date || null,
        inspection_items: report.inspection_items,
        inspection_content: report.inspection_content,
        witness: report.witness,
        inspection_result: report.inspection_result,
        notes: report.notes,
        approval_status: report.approval_status,
        approver_comment: report.approver_comment,
        main_photo: finalPhotoUrlString
      }

      if (id) {
        const { error } = await supabase.from('completion_reports').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('completion_reports').insert([payload])
        if (error) throw error
      }
      navigate('/completion-reports')
    } catch (e: any) {
      console.error("Error saving report:", e)
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
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 bg-background/80 backdrop-blur-sm py-4 z-10 border-b mb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/completion-reports')}
                className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {id ? '完了報告を編集' : '新規完了報告'}
                </h2>
              </div>
            </div>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2 gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存する
            </button>
          </div>

          <div className="space-y-8">
            {/* 基本情報 */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="border-b bg-muted/30 px-6 py-4 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">基本情報</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">対象案件 <span className="text-destructive">*</span></label>
                  <select 
                    value={report.project_id}
                    onChange={(e) => setReport({...report, project_id: e.target.value})}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                  >
                    <option value="">案件を選択してください</option>
                    {projectsList.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">完了日</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input 
                        type="date"
                        value={report.completion_date}
                        onChange={(e) => setReport({...report, completion_date: e.target.value})}
                        className="w-full h-10 rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">報告者</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                      <div className="pl-10">
                          <AutocompleteInput
                              tableName="worker_master"
                              columnName="name"
                              value={report.reporter}
                              onChange={(val) => setReport({...report, reporter: val})}
                              placeholder="氏名を入力"
                              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              filters={{ is_active: true }}
                              customFilter={(item) => item.type !== '事務員'}
                          />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 検査情報 */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="border-b bg-muted/30 px-6 py-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">検査情報</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">検査者（元請等）</label>
                    <AutocompleteInput
                      tableName="worker_master"
                      columnName="name"
                      value={report.inspector}
                      onChange={(val) => setReport({...report, inspector: val})}
                      placeholder="氏名を入力"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      filters={{ is_active: true }}
                      customFilter={(item) => item.type !== '事務員'}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">立会者</label>
                    <AutocompleteInput
                      tableName="worker_master"
                      columnName="name"
                      value={report.witness}
                      onChange={(val) => setReport({...report, witness: val})}
                      placeholder="氏名を入力"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      filters={{ is_active: true }}
                      customFilter={(item) => item.type !== '事務員'}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">検査日</label>
                    <input 
                      type="date"
                      value={report.inspection_date}
                      onChange={(e) => setReport({...report, inspection_date: e.target.value})}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">検査内容・項目</label>
                    <textarea 
                      value={report.inspection_content}
                      onChange={(e) => setReport({...report, inspection_content: e.target.value})}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">総合判定・結果</label>
                    <select 
                      value={report.inspection_result}
                      onChange={(e) => setReport({...report, inspection_result: e.target.value})}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">選択してください</option>
                      <option value="合格">合格</option>
                      <option value="指摘あり">指摘あり (是正が必要)</option>
                      <option value="保留">保留</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">指摘・特記事項</label>
                    <textarea 
                      value={report.notes}
                      onChange={(e) => setReport({...report, notes: e.target.value})}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 写真 */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Camera className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">完了写真・検査写真</h3>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex flex-wrap gap-4">
                        {existingPhotos.map((url, i) => (
                            <div key={`existing-${i}`} className="relative group">
                                <img src={url} alt="Uploaded" className="w-32 h-32 object-cover rounded-md border" />
                                <button
                                    onClick={() => removeExistingPhoto(url)}
                                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    title="写真を削除"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {pendingPhotos.map((file, i) => (
                            <div key={`pending-${i}`} className="relative group">
                                <img src={URL.createObjectURL(file)} alt="Preview" className="w-32 h-32 object-cover rounded-md border opacity-70" />
                                <div className="absolute inset-0 flex items-center justify-center bg-background/20 rounded-md">
                                    <span className="text-xs font-bold text-white bg-black/50 px-2 py-1 rounded">NEW</span>
                                </div>
                                <button
                                    onClick={() => removePendingPhoto(i)}
                                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    title="追加を取り消し"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        
                        <label className="w-32 h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-md hover:bg-muted/50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
                            <Plus className="w-6 h-6 mb-2" />
                            <span className="text-xs font-medium">写真を追加</span>
                            <input 
                                type="file" 
                                accept="image/*" 
                                multiple 
                                className="hidden" 
                                onChange={handlePhotoSelect}
                            />
                        </label>
                    </div>
                    <p className="text-xs text-muted-foreground">※写真は自動的に圧縮されてクラウドへ保存されます</p>
                </div>
            </section>

            {/* 承認ステータス (Admin or special role normally, but open here initially) */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4">
                    <h3 className="font-semibold">社内確認</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">承認ステータス</label>
                            <select 
                                value={report.approval_status}
                                onChange={(e) => setReport({...report, approval_status: e.target.value})}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <option value="未承認">未承認</option>
                                <option value="承認依頼中">承認依頼中</option>
                                <option value="承認済">承認済</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">確認コメント</label>
                        <textarea 
                            value={report.approver_comment}
                            onChange={(e) => setReport({...report, approver_comment: e.target.value})}
                            rows={2}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                            placeholder="管理者や確認者からのコメントを記録します"
                        />
                    </div>
                </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}
