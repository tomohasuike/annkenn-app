import { useState, useEffect } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { ArrowLeft, Loader2, Save, Users, Truck, Wrench, Package, Building, ClipboardList, Plus, Trash2, Camera, X } from "lucide-react"
import imageCompression from 'browser-image-compression';

import { format, parseISO } from 'date-fns';
import { AutocompleteInput } from '../../components/ui/AutocompleteInput';

// --- TYPES ---

type ResourceItem = { id: string; name: string; category?: string }

type ReportData = {
  project_id: string
  보고日時: string // 報告日時
  作業区分: string
  作業開始時間: string
  作業終了時間: string
  工事進捗: string
  工事内容: string
  備考: string
  reporter_name?: string
  site_photos?: string
}

type Personnel = { worker_id: string; worker_name: string }
type Vehicle = { vehicle_id: string; vehicle_name: string }
type Material = { material_name: string; quantity: string; pending_photos: File[]; pending_docs: File[]; existing_photos: string[]; existing_docs: string[] }
type Subcontractor = { company_name: string; headcount: string }

export default function ReportForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // Master Data
  const [projectsList, setProjectsList] = useState<{id: string, name: string, category: string, status: string, project_number?: string, client_name?: string, site_name?: string}[]>([])
  const [selectedProjectCategory, setSelectedProjectCategory] = useState<string>('all')
  const [showCompletedProjects, setShowCompletedProjects] = useState<boolean>(false)
  const [workersList, setWorkersList] = useState<ResourceItem[]>([])
  const [vehiclesList, setVehiclesList] = useState<ResourceItem[]>([])
  const [reporterName, setReporterName] = useState<string>('')
  
  // Form State
  const [report, setReport] = useState<ReportData>({
    project_id: '',
    보고日時: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    作業区分: '',
    作業開始時間: format(new Date().setHours(8, 0, 0, 0), "yyyy-MM-dd'T'HH:mm"),
    作業終了時間: format(new Date().setHours(17, 0, 0, 0), "yyyy-MM-dd'T'HH:mm"),
    工事進捗: '0',
    工事内容: '',
    備考: ''
  })

  // Relational Arrays
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [machinery, setMachinery] = useState<Vehicle[]>([]) // Stored as vehicles here for simplicity, distinguished by type in DB
  const [materials, setMaterials] = useState<Material[]>([])
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [existingPhotos, setExistingPhotos] = useState<string[]>([])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const masters = await fetchMasterData()
      if (id) {
        await fetchReportData(id, masters)
      } else {
        // Apply initial state from navigation if present
        if (location.state) {
            const { projectId, personnel: initPersonnel, vehicles: initVehicles, category } = location.state as any;
            if (category) {
                setSelectedProjectCategory(category);
            }
            if (projectId) {
                setReport(prev => ({ ...prev, project_id: projectId }));
            }
            if (initPersonnel && Array.isArray(initPersonnel)) {
                setPersonnel(initPersonnel);
            }
            if (initVehicles && Array.isArray(initVehicles)) {
                setVehicles(initVehicles);
            }
        }
        setLoading(false)
      }
    }
    init()
  }, [id])

  // ---- Fetch latest progress when project changes (for new reports) ----
  useEffect(() => {
     if (id) return; // Only apply to new reports
     if (!report.project_id) return;

     const fetchLatestProgress = async () => {
         try {
             // 過去の案件日報の最新進捗を取得
             const { data, error: _err } = await supabase
                 .from('daily_reports')
                 .select('progress')
                 .eq('project_id', report.project_id)
                 .lt('report_date', report.보고日時)
                 .order('report_date', { ascending: false })
                 .limit(1)
                 .single();

             if (data && data.progress) {
                 setReport(prev => ({ ...prev, 工事進捗: data.progress }));
             }
         } catch(err) {
             console.log("No previous progress found");
         }
     };

     fetchLatestProgress();
  }, [report.project_id, id]); 
  // ----------------------------------------------------------------------

  async function fetchMasterData() {
    try {
      const { data: pData, error: pErr } = await supabase.from('projects').select('id, project_name, category, status_flag, project_number, client_name, site_name').order('created_at', { ascending: false })
      if (pErr) console.error("Error fetching projects:", pErr)
      
      const { data: wData } = await supabase.from('worker_master').select('id, name, type, display_order').neq('type', '事務員')
      
      const sortedWData = (wData || []).slice().sort((a, b) => {
          const orderA = a.display_order ?? 999;
          const orderB = b.display_order ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '', 'ja');
      });
      
      const { data: vData } = await supabase.from('vehicle_master').select('id, vehicle_name, category')
      
      if (pData) {
        // 工程管理用の特別な案件（VACATIONなど）を除外
        const visibleProjects = pData.filter(p => p.project_number !== 'VACATION' && p.project_name !== '■ 休暇')
        setProjectsList(visibleProjects.map(p => ({ 
          id: p.id, 
          name: p.project_name, 
          category: p.category || '未分類', 
          status: p.status_flag || '着工前',
          project_number: p.project_number || '',
          client_name: p.client_name || '',
          site_name: p.site_name || ''
        })))
      }
      if (sortedWData) setWorkersList(sortedWData.map(w => ({ id: w.id, name: w.name })))
      if (vData) setVehiclesList(vData.map(v => ({ id: v.id, name: v.vehicle_name, category: v.category })))

      const { data: { user } } = await supabase.auth.getUser()
      if (user && user.email) {
          // Attempt to map email to real name using worker_master
          const { data: workerMatch } = await supabase
            .from('worker_master')
            .select('name')
            .ilike('email', user.email)
            .single()

          if (workerMatch && workerMatch.name) {
              setReporterName(workerMatch.name)
          } else {
              // Fallback to purely the name part before @hitec-inc.co.jp
              const namePart = user.email.split('@')[0]
              setReporterName(namePart)
          }
      }
      return { 
          workers: sortedWData ? sortedWData.map(w => ({ id: w.id, name: w.name })) : [],
          vehicles: vData ? vData.map(v => ({ id: v.id, name: v.vehicle_name, category: v.category })) : []
      }
    } catch (e) {
      console.error("Error fetching masters:", e)
      return { workers: [], vehicles: [] }
    }
  }

  async function fetchReportData(reportId: string, masters: { workers: ResourceItem[], vehicles: ResourceItem[] }) {
    // Only set loading if it's not already loading from the init() flow
    if (!loading) setLoading(true)
    try {
      // Fetch main report
      const { data: rData, error: rErr } = await supabase.from('daily_reports').select('*').eq('id', reportId).single()
      if (rErr) throw rErr
      
      if (rData) {
        const formatTime = (timeStr: string) => {
            if (!timeStr) return '';
            
            // Handle legacy "HH:mm"
            if (timeStr.length === 5 && timeStr.includes(':')) {
                const baseDate = rData.report_date ? rData.report_date.split('T')[0] : format(new Date(), 'yyyy-MM-dd');
                return `${baseDate}T${timeStr}`; 
            }
            
            try {
                let parsedDate;
                if (timeStr.includes('T')) {
                    parsedDate = parseISO(timeStr);
                } else {
                    // Falls back to native JS date parsing for legacy "2026/03/13 8:00:00" formats
                    parsedDate = new Date(timeStr);
                }
                
                // Ensure it's a valid date
                if (isNaN(parsedDate.getTime())) {
                    throw new Error("Invalid date");
                }
                
                return format(parsedDate, "yyyy-MM-dd'T'HH:mm");
            } catch (e) {
                console.warn("Could not parse time string:", timeStr);
                return '';
            }
        };

        let initialPhotos: string[] = [];
        try {
            if (rData.site_photos) {
                const parsed = JSON.parse(rData.site_photos);
                if (Array.isArray(parsed)) initialPhotos = parsed;
                else initialPhotos = [rData.site_photos];
            }
        } catch(e) {
            initialPhotos = rData.site_photos && typeof rData.site_photos === 'string' && rData.site_photos.includes(',') 
                ? rData.site_photos.split(',').map((s: string) => s.trim()) 
                : rData.site_photos ? [rData.site_photos] : [];
        }
        setExistingPhotos(initialPhotos);

        setReport({
          project_id: rData.project_id || '',
          보고日時: formatTime(rData.report_date) || format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          作業区分: rData.work_category || '',
          作業開始時間: formatTime(rData.start_time),
          作業終了時間: formatTime(rData.end_time),
          工事進捗: rData.progress || '0',
          工事内容: rData.work_content || '',
          備考: rData.notes || '',
          reporter_name: rData.reporter_name || '',
          site_photos: rData.site_photos || ''
        })
      }

      // Fetch related data
      let dynamicWorkersList = [...masters.workers];
      let dynamicVehiclesList = [...masters.vehicles];

      const { data: pData } = await supabase.from('report_personnel').select('worker_id, worker_master(name), worker_name').eq('report_id', reportId)
      if (pData) {
          setPersonnel(pData.map((p: any) => {
              let wId = p.worker_id || '';
              let wName = Array.isArray(p.worker_master) ? p.worker_master[0]?.name : p.worker_master?.name || p.worker_name || '';
              if (!wId && wName) {
                  const match = dynamicWorkersList.find(w => w.name === wName);
                  if (match) {
                      wId = match.id;
                  } else {
                      wId = `legacy-worker-${Math.random().toString(36).substr(2, 9)}`;
                      dynamicWorkersList.push({ id: wId, name: wName });
                  }
              }
              return { worker_id: wId, worker_name: wName };
          }))
      }

      const { data: vData } = await supabase.from('report_vehicles').select('vehicle_id, vehicle_master(vehicle_name), vehicle_name').eq('report_id', reportId)
      if (vData) {
          setVehicles(vData.map((v: any) => {
              let vId = v.vehicle_id || '';
              let vName = Array.isArray(v.vehicle_master) ? v.vehicle_master[0]?.vehicle_name : v.vehicle_master?.vehicle_name || v.vehicle_name || '';
              if (!vId && vName) {
                 const match = dynamicVehiclesList.find(dv => dv.name === vName && dv.category === '作業車');
                 if (match) {
                     vId = match.id;
                 } else {
                     vId = `legacy-vehicle-${Math.random().toString(36).substr(2, 9)}`;
                     dynamicVehiclesList.push({ id: vId, name: vName, category: '作業車' });
                 }
              }
              return { vehicle_id: vId, vehicle_name: vName };
          }))
      }

      const { data: mData } = await supabase.from('report_machinery').select('machinery_id, vehicle_master(vehicle_name), machinery_name').eq('report_id', reportId)
      if (mData) {
          setMachinery(mData.map((m: any) => {
              let mId = m.machinery_id || '';
              let mName = Array.isArray(m.vehicle_master) ? m.vehicle_master[0]?.vehicle_name : m.vehicle_master?.vehicle_name || m.machinery_name || '';
              if (!mId && mName) {
                 const match = dynamicVehiclesList.find(dv => dv.name === mName && dv.category === '建設機械');
                 if (match) {
                     mId = match.id;
                 } else {
                     mId = `legacy-machinery-${Math.random().toString(36).substr(2, 9)}`;
                     dynamicVehiclesList.push({ id: mId, name: mName, category: '建設機械' });
                 }
              }
              return { vehicle_id: mId, vehicle_name: mName };
          }))
      }
      
      setWorkersList(dynamicWorkersList);
      setVehiclesList(dynamicVehiclesList);

      const { data: matData } = await supabase.from('report_materials').select('material_name, quantity, photo, documentation').eq('report_id', reportId)
      if (matData) setMaterials(matData.map((m: any) => {
          let existingPhotos: string[] = [];
          if (m.photo) {
              try { existingPhotos = JSON.parse(m.photo); if (!Array.isArray(existingPhotos)) existingPhotos = [m.photo]; }
              catch(e) { existingPhotos = [m.photo]; }
          }
          let existingDocs: string[] = [];
          if (m.documentation) {
              try { existingDocs = JSON.parse(m.documentation); if (!Array.isArray(existingDocs)) existingDocs = [m.documentation]; }
              catch(e) { existingDocs = [m.documentation]; }
          }
          return {
              material_name: m.material_name || '', 
              quantity: m.quantity || '',
              pending_photos: [],
              pending_docs: [],
              existing_photos: existingPhotos,
              existing_docs: existingDocs
          }
      }))

      const { data: subData } = await supabase.from('report_subcontractors').select('subcontractor_name, worker_count').eq('report_id', reportId)
      if (subData) setSubcontractors(subData.map((s: any) => ({ company_name: s.subcontractor_name || '', headcount: s.worker_count || '' })))

    } catch (e) {
      console.error("Error fetching report details:", e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!report.project_id) {
        alert("対象案件を選択してください")
        return
    }
    if (!report.作業区分) {
        alert("作業区分を選択してください")
        return
    }
    if (!report.作業開始時間 || !report.作業終了時間) {
        alert("作業開始日時および作業終了日時を入力してください")
        return
    }
    if (!report.工事内容 || report.工事内容.trim() === '') {
        alert("作業内容を入力してください")
        return
    }
    if (!report.工事進捗 || report.工事進捗 === '') {
        alert("工事進捗を入力してください")
        return
    }

    const hasPersonnel = personnel.some(p => p.worker_id || (p.worker_name && p.worker_name.trim() !== ''));
    if (!hasPersonnel) {
        alert("作業員編成を1名以上入力してください")
        return
    }


    if (existingPhotos.length === 0 && pendingPhotos.length === 0) {
        alert("現場写真を1枚以上追加してください")
        return
    }

    setSaving(true)
    try {
        const { data: { user } } = await supabase.auth.getUser()
        
        // --- Photo Upload Logic ---
        const uploadedUrls = [...existingPhotos];
        if (pendingPhotos.length > 0) {
            for (const file of pendingPhotos) {
                try {
                    const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1920 });
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                    const filePath = `${fileName}`;
                    
                    const { data: uploadData, error: uploadError } = await supabase.storage.from('daily_report_photos').upload(filePath, compressed);
                    
                    if (uploadError) {
                        console.error('Photo Upload error:', uploadError);
                        // We tolerate single image failures rather than breaking the whole form
                    } else if (uploadData) {
                        const { data: { publicUrl } } = supabase.storage.from('daily_report_photos').getPublicUrl(filePath);
                        uploadedUrls.push(publicUrl);
                    }
                } catch (err) {
                    console.error('Compression or upload failed:', err);
                }
            }
        }
        
        const reportPayload = {
            project_id: report.project_id,
            report_date: new Date(report.보고日時).toISOString(),
            work_category: report.作業区分,
            start_time: report.作業開始時間,
            end_time: report.作業終了時間,
            progress: report.工事進捗,
            work_content: report.工事内容,
            notes: report.備考,
            reporter_id: user?.id || null,
            reporter_name: reporterName || user?.email?.split('@')[0] || '未設定',
            site_photos: JSON.stringify(uploadedUrls)
        }

        let currentReportId = id;

        if (id) {
            // Update existing
            const { error: updateErr } = await supabase.from('daily_reports').update(reportPayload).eq('id', id)
            if (updateErr) throw updateErr

            // Delete old relations
            await supabase.from('report_personnel').delete().eq('report_id', id)
            await supabase.from('report_vehicles').delete().eq('report_id', id)
            await supabase.from('report_machinery').delete().eq('report_id', id)
            await supabase.from('report_materials').delete().eq('report_id', id)
            await supabase.from('report_subcontractors').delete().eq('report_id', id)
        } else {
            // Insert new
            const { data: newReport, error: insertErr } = await supabase.from('daily_reports').insert([reportPayload]).select().single()
            if (insertErr) throw insertErr
            currentReportId = newReport.id
        }

        // Insert new relations
        if (currentReportId) {
            if (personnel.length > 0) {
                const pPayload = personnel.filter(p => p.worker_id || p.worker_name).map(p => ({ 
                    report_id: currentReportId, 
                    worker_id: p.worker_id?.startsWith('legacy-') ? null : (p.worker_id || null), 
                    worker_name: p.worker_id?.startsWith('legacy-') ? p.worker_name : null
                }))
                if (pPayload.length > 0) await supabase.from('report_personnel').insert(pPayload)
            }
            if (vehicles.length > 0) {
                const vPayload = vehicles.filter(v => v.vehicle_id || v.vehicle_name).map(v => ({ 
                    report_id: currentReportId, 
                    vehicle_id: v.vehicle_id?.startsWith('legacy-') ? null : (v.vehicle_id || null), 
                    vehicle_name: v.vehicle_id?.startsWith('legacy-') ? v.vehicle_name : null 
                }))
                if (vPayload.length > 0) await supabase.from('report_vehicles').insert(vPayload)
            }
            if (machinery.length > 0) {
                const mPayload = machinery.filter(m => m.vehicle_id || m.vehicle_name).map(m => ({ 
                    report_id: currentReportId, 
                    machinery_id: m.vehicle_id?.startsWith('legacy-') ? null : (m.vehicle_id || null), 
                    machinery_name: m.vehicle_id?.startsWith('legacy-') ? m.vehicle_name : null 
                }))
                if (mPayload.length > 0) await supabase.from('report_machinery').insert(mPayload)
            }
            if (materials.length > 0) {
                const matPayload = [];
                for (const m of materials) {
                    if (m.material_name.trim() === '') continue;
                    
                    const uploadedPhotos = [...m.existing_photos];
                    if (m.pending_photos.length > 0) {
                        for (const file of m.pending_photos) {
                            try {
                                const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1920 });
                                const fileName = `materials/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                                const { data: uploadData, error } = await supabase.storage.from('daily_report_photos').upload(fileName, compressed);
                                if (!error && uploadData) {
                                    const { data: { publicUrl } } = supabase.storage.from('daily_report_photos').getPublicUrl(fileName);
                                    uploadedPhotos.push(publicUrl);
                                }
                            } catch (err) { console.error('Material photo upload failed:', err); }
                        }
                    }

                    const uploadedDocs = [...m.existing_docs];
                    if (m.pending_docs.length > 0) {
                        for (const file of m.pending_docs) {
                            try {
                                const ext = file.name.split('.').pop();
                                const fileName = `materials_docs/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
                                const { data: uploadData, error } = await supabase.storage.from('daily_report_photos').upload(fileName, file, { contentType: file.type });
                                if (!error && uploadData) {
                                    const { data: { publicUrl } } = supabase.storage.from('daily_report_photos').getPublicUrl(fileName);
                                    uploadedDocs.push(publicUrl);
                                }
                            } catch (err) { console.error('Material doc upload failed:', err); }
                        }
                    }

                    matPayload.push({
                        report_id: currentReportId,
                        material_name: m.material_name,
                        quantity: m.quantity,
                        photo: uploadedPhotos.length > 0 ? JSON.stringify(uploadedPhotos) : null,
                        documentation: uploadedDocs.length > 0 ? JSON.stringify(uploadedDocs) : null
                    });
                }
                if (matPayload.length > 0) await supabase.from('report_materials').insert(matPayload)
            }
            if (subcontractors.length > 0) {
                const subPayload = subcontractors.filter(s => s.company_name.trim() !== '').map(s => ({ report_id: currentReportId, subcontractor_name: s.company_name, worker_count: s.headcount ? s.headcount.toString() : null }))
                if (subPayload.length > 0) await supabase.from('report_subcontractors').insert(subPayload)
            }
        } // <-- Added missing closing bracket here
        
        // --- Check for Completion Report trigger ---
        if (report.工事進捗 === '100') {
            const goToCompletion = window.confirm("工事進捗が100%になりました。続いて完了報告を作成しますか？");
            if (goToCompletion) {
                // Determine reporter name based on current user or input
                const reporterName = user?.user_metadata?.full_name || ''; 
                navigate('/completion-reports/new', { 
                    state: { 
                        projectId: report.project_id,
                        reporterName: reporterName
                    } 
                });
                return; // Stop here, don't navigate to /reports
            }
        }
        
        navigate('/reports')
    } catch (e: any) {
        console.error(e)
        alert("保存に失敗しました: " + e.message)
    } finally {
        setSaving(false)
    }
  }

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('daily_reports')
        .delete()
        .eq('id', id)
        
      if (error) {
        console.error("Delete error details:", error)
        throw error
      }
      
      navigate('/reports')
    } catch (e: any) {
      console.error("Delete outer error:", e)
      alert("削除に失敗しました: " + e.message)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const filesArray = Array.from(e.target.files);
          setPendingPhotos(prev => [...prev, ...filesArray]);
      }
  };

  const removePendingPhoto = (index: number) => {
      setPendingPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingPhoto = (index: number) => {
      setExistingPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleMaterialFileSelect = (index: number, type: 'photo' | 'doc', files: FileList) => {
      const newMaterials = [...materials];
      if (type === 'photo') {
          newMaterials[index].pending_photos.push(...Array.from(files));
      } else {
          newMaterials[index].pending_docs.push(...Array.from(files));
      }
      setMaterials(newMaterials);
  };

  const removeMaterialFile = (matIndex: number, type: 'photo' | 'doc', isExisting: boolean, fileIndex: number) => {
      const newMaterials = [...materials];
      if (type === 'photo') {
          if (isExisting) newMaterials[matIndex].existing_photos.splice(fileIndex, 1);
          else newMaterials[matIndex].pending_photos.splice(fileIndex, 1);
      } else {
          if (isExisting) newMaterials[matIndex].existing_docs.splice(fileIndex, 1);
          else newMaterials[matIndex].pending_docs.splice(fileIndex, 1);
      }
      setMaterials(newMaterials);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0 pr-4 -mr-4">
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
          <div className="flex items-center justify-between gap-4 sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-4 border-b mb-6">
        <div className="flex items-center gap-4">
            <button 
                onClick={() => navigate('/reports')}
                className="p-2 hover:bg-muted rounded-full transition-colors flex-shrink-0"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
                <h2 className="text-2xl font-bold tracking-tight">
                    {id ? "日報の編集" : "新規日報作成"}
                </h2>
                <p className="text-muted-foreground text-sm">
                    現場の作業状況と使用リソースを記録します
                </p>
            </div>
        </div>
        <div className="flex items-center gap-3">
            {id && (
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting || saving}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-destructive/20 text-destructive bg-transparent hover:bg-destructive/10 h-10 px-3 sm:px-4 py-2 gap-2 shadow-sm disabled:opacity-50"
                >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span className="hidden sm:inline">{deleting ? "削除中..." : "削除する"}</span>
                </button>
            )}
            <button
                onClick={handleSave}
                disabled={saving || deleting}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 shadow-sm disabled:opacity-50"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "保存中..." : "保存する"}
            </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b gap-4">
            <h3 className="text-lg font-medium flex items-center gap-2 m-0">
                <ClipboardList className="w-5 h-5 text-muted-foreground" />
                基本情報
            </h3>
            <div className="flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground bg-muted/30 px-4 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>報告者: <span className="font-medium text-foreground">{id ? (reporterName || report.reporter_name) : (reporterName || '取得中...')}</span></span>
                </div>
                <div className="hidden sm:block text-muted-foreground/30">|</div>
                <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{format(new Date(report.보고日時), 'yyyy年MM月dd日 HH:mm')}</span>
                </div>
            </div>
        </div>
        
        {/* Project Filters */}
        <div className={`flex flex-col gap-4 mb-4 mt-2 p-4 bg-muted/20 rounded-lg border border-border/50 ${id ? 'opacity-60 pointer-events-none' : ''}`}>
            <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">案件区分</label>
                {id ? (
                    <div className="font-medium text-sm px-3 py-1.5 bg-background border rounded-md inline-block">
                        {projectsList.find(p => p.id === report.project_id)?.category || '未設定'}
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedProjectCategory('all')}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${selectedProjectCategory === 'all' ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-foreground border-input hover:bg-muted'}`}
                        >
                            すべて
                        </button>
                        {["一般", "役所", "川北", "BPE"].filter(cat => projectsList.some(p => p.category === cat)).map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setSelectedProjectCategory(cat)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${selectedProjectCategory === cat ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-foreground border-input hover:bg-muted'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {!id && (
                <div className="flex items-center pt-3 mt-1 border-t border-border/50">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                        <input 
                            type="checkbox" 
                            checked={showCompletedProjects}
                            onChange={(e) => setShowCompletedProjects(e.target.checked)}
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                        />
                        完工した案件のみ表示
                    </label>
                </div>
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">対象案件 <span className="text-red-500">*</span></label>
                    <select 
                        className={`w-full h-10 rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${id ? 'bg-muted/50 text-muted-foreground cursor-not-allowed' : 'bg-background'}`}
                        value={report.project_id}
                        disabled={!!id}
                        onChange={(e) => setReport({...report, project_id: e.target.value})}
                    >
                        <option value="">案件を選択してください</option>
                        {projectsList
                            .filter(p => selectedProjectCategory === 'all' || p.category === selectedProjectCategory)
                            .filter(p => {
                                if (showCompletedProjects) return p.status === '完工' || p.id === report.project_id;
                                return p.status === '着工前' || p.status === '着工中' || p.id === report.project_id;
                            })
                            .map(p => {
                                const isGeneralOrGov = p.category === '一般' || p.category === '役所';
                                const locationOrClient = isGeneralOrGov ? p.client_name : p.site_name;
                                const labelStr = locationOrClient ? `${p.name} (${locationOrClient})` : p.name;
                                const fullLabel = p.project_number ? `${p.project_number}: ${labelStr}` : labelStr;
                                return <option key={p.id} value={p.id}>{fullLabel}</option>;
                            })}
                    </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">作業区分 <span className="text-red-500">*</span></label>
                    {id ? (
                        <div className="font-medium text-sm px-3 py-1.5 bg-background border rounded-md inline-block">
                            {report.作業区分 || '未設定'}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {["工事", "管理", "現調・見積"].map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setReport({...report, 作業区分: type})}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all border ${report.作業区分 === type ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-foreground border-input hover:bg-muted'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">作業開始日時 <span className="text-red-500">*</span></label>
                    <input 
                        type="datetime-local" 
                        value={report.作業開始時間}
                        onChange={(e) => setReport({...report, 作業開始時間: e.target.value})}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">作業終了日時 <span className="text-red-500">*</span></label>
                    <input 
                        type="datetime-local" 
                        value={report.作業終了時間}
                        onChange={(e) => setReport({...report, 作業終了時間: e.target.value})}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">作業内容 <span className="text-red-500">*</span></label>
                    <textarea 
                        rows={4}
                        value={report.工事内容}
                        onChange={(e) => setReport({...report, 工事内容: e.target.value})}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                        placeholder="本日の作業内容を詳細に記入してください..."
                    />
                </div>
                <div className="space-y-4 md:col-span-2 mt-2">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-foreground">工事進捗 <span className="text-red-500">*</span></label>
                        <span className="text-2xl font-bold text-primary">{report.工事進捗}%</span>
                    </div>
                    <div className="px-2">
                        <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="1" 
                            value={report.工事進捗}
                            onChange={(e) => setReport({...report, 工事進捗: e.target.value})}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
                            <span>0%</span>
                            <span>50%</span>
                            <span>100%</span>
                        </div>
                    </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">備考 / 申し送り事項</label>
                    <textarea 
                        rows={2}
                        value={report.備考}
                        onChange={(e) => setReport({...report, 備考: e.target.value})}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                    />
                </div>
            </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm mb-6">
        <div className="space-y-4">
                <div className="pb-2 border-b">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <Users className="w-5 h-5 text-muted-foreground" />
                        作業員編成 <span className="text-red-500 text-sm">*</span>
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">参加した作業員を選択してください。</p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {workersList.map(worker => {
                        const isSelected = personnel.some(p => p.worker_id === worker.id);
                        
                        return (
                            <div key={worker.id} className={`border rounded-lg p-3 transition-all ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'bg-muted/20 hover:bg-muted/50 border-transparent hover:border-border'}`}>
                                <label className="flex items-center gap-2 cursor-pointer mb-2">
                                    <input 
                                        type="checkbox" 
                                        checked={isSelected}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setPersonnel([...personnel, { worker_id: worker.id, worker_name: worker.name }]);
                                            } else {
                                                setPersonnel(personnel.filter(p => p.worker_id !== worker.id));
                                            }
                                        }}
                                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                    />
                                    <span className={`font-medium text-sm select-none ${isSelected ? 'text-primary' : 'text-foreground'}`}>{worker.name}</span>
                                </label>
                            </div>
                        );
                    })}
                </div>


            </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm mb-6">
        <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <Building className="w-5 h-5 text-muted-foreground" />
                        協力業者
                    </h3>
                    <button 
                        onClick={() => setSubcontractors([...subcontractors, { company_name: '', headcount: '' }])}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 py-1 gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        業者を追加
                    </button>
                </div>
                {subcontractors.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">協力業者が登録されていません</div>
                ) : (
                    <div className="space-y-3">
                        {subcontractors.map((s, index) => (
                            <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-muted/30 p-3 rounded-lg border">
                                <div className="flex-[2] w-full space-y-1">
                                    <label className="text-xs text-muted-foreground sm:hidden">業者名</label>
                                    <AutocompleteInput 
                                        value={s.company_name}
                                        onChange={(val) => { const n = [...subcontractors]; n[index].company_name = val; setSubcontractors(n); }}
                                        tableName="report_subcontractors"
                                        columnName="subcontractor_name"
                                        projectId={report.project_id}
                                        placeholder="協力業者名"
                                        className="w-full h-10 border-input"
                                    />
                                </div>
                                <div className="w-full sm:w-24 space-y-1">
                                    <label className="text-xs text-muted-foreground sm:hidden">人数</label>
                                    <input 
                                        type="number" placeholder="人数" value={s.headcount}
                                        onChange={(e) => { const n = [...subcontractors]; n[index].headcount = e.target.value; setSubcontractors(n); }}
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <button onClick={() => setSubcontractors(subcontractors.filter((_, i) => i !== index))} className="p-2 text-red-500 hover:bg-red-50 rounded-md transition-colors self-end sm:self-auto"><Trash2 className="w-5 h-5" /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm mb-6">
        <div className="space-y-8">
                {/* Vehicles Section */}
                <div className="space-y-4">
                    <div className="pb-2 border-b">
                        <h3 className="text-lg font-medium flex items-center gap-2">
                            <Truck className="w-5 h-5 text-muted-foreground" />
                            作業車
                        </h3>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        {vehiclesList.filter(v => v.category === '作業車').map(vehicle => {
                            const isSelected = vehicles.some(v => v.vehicle_id === vehicle.id);
                            return (
                                <button
                                    key={vehicle.id}
                                    type="button"
                                    onClick={() => {
                                        if (isSelected) {
                                            setVehicles(vehicles.filter(v => v.vehicle_id !== vehicle.id));
                                        } else {
                                            setVehicles([...vehicles, { vehicle_id: vehicle.id, vehicle_name: vehicle.name }]);
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${isSelected ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/40 text-foreground border-transparent hover:bg-muted select-none'}`}
                                >
                                    {vehicle.name}
                                </button>
                            );
                        })}
                    </div>


                </div>

                {/* Machinery Section */}
                <div className="space-y-4">
                    <div className="pb-2 border-b">
                        <h3 className="text-lg font-medium flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-muted-foreground" />
                            建設機械
                        </h3>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        {vehiclesList.filter(v => v.category === '建設機械').map(vehicle => {
                            const isSelected = machinery.some(m => m.vehicle_id === vehicle.id);
                            return (
                                <button
                                    key={vehicle.id}
                                    type="button"
                                    onClick={() => {
                                        if (isSelected) {
                                            setMachinery(machinery.filter(m => m.vehicle_id !== vehicle.id));
                                        } else {
                                            setMachinery([...machinery, { vehicle_id: vehicle.id, vehicle_name: vehicle.name }]);
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${isSelected ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/40 text-foreground border-transparent hover:bg-muted select-none'}`}
                                >
                                    {vehicle.name}
                                </button>
                            );
                        })}
                    </div>


                </div>
            </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm mb-6">
        <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <Package className="w-5 h-5 text-muted-foreground" />
                        使用材料
                    </h3>
                        <button 
                            onClick={() => setMaterials([...materials, { material_name: '', quantity: '', pending_photos: [], pending_docs: [], existing_photos: [], existing_docs: [] }])}
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 py-1 gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            材料を追加
                        </button>
                    </div>
                    {materials.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">使用材料が登録されていません</div>
                    ) : (
                        <div className="space-y-4">
                            {materials.map((m, index) => (
                                <div key={index} className="flex flex-col gap-3 bg-muted/20 p-4 rounded-lg border border-border/80 relative group">
                                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full pr-8">
                                        <div className="flex-1 w-full space-y-1">
                                            <label className="text-xs text-muted-foreground font-medium">材料名</label>
                                            <input 
                                                type="text" placeholder="例: 塩ビ管 VU100" value={m.material_name}
                                                onChange={(e) => { const n = [...materials]; n[index].material_name = e.target.value; setMaterials(n); }}
                                                className="w-full h-10 rounded-md border border-input bg-background/50 focus:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                                            />
                                        </div>
                                        <div className="w-full sm:w-32 space-y-1">
                                            <label className="text-xs text-muted-foreground font-medium">数量</label>
                                            <input 
                                                type="text" placeholder="例: 10m" value={m.quantity}
                                                onChange={(e) => { const n = [...materials]; n[index].quantity = e.target.value; setMaterials(n); }}
                                                className="w-full h-10 rounded-md border border-input bg-background/50 focus:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Material Attachments */}
                                    <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                                        <div className="flex items-center gap-4">
                                            <label className="cursor-pointer text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                                                <Camera className="w-4 h-4" />
                                                <span>写真を追加</span>
                                                <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && handleMaterialFileSelect(index, 'photo', e.target.files)} />
                                            </label>
                                            <label className="cursor-pointer text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                                                <ClipboardList className="w-4 h-4" />
                                                <span>資料/PDFを追加</span>
                                                <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" className="hidden" onChange={(e) => e.target.files && handleMaterialFileSelect(index, 'doc', e.target.files)} />
                                            </label>
                                        </div>
                                        
                                        {(m.existing_photos.length > 0 || m.pending_photos.length > 0 || m.existing_docs.length > 0 || m.pending_docs.length > 0) && (
                                            <div className="flex gap-3 flex-wrap mt-2">
                                                {/* Photos */}
                                                {m.existing_photos.map((url, i) => (
                                                    <div key={`ex-ph-${i}`} className="relative border border-border/50 rounded-md overflow-hidden bg-background h-16 w-16 group/img">
                                                        <img src={url} alt="Material photo" className="object-cover w-full h-full" />
                                                        <button type="button" onClick={() => removeMaterialFile(index, 'photo', true, i)} className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-md opacity-0 group-hover/img:opacity-100 hover:bg-red-500 transition-all"><X className="w-3 h-3" /></button>
                                                    </div>
                                                ))}
                                                {m.pending_photos.map((f, i) => (
                                                    <div key={`pd-ph-${i}`} className="relative border border-border/50 rounded-md overflow-hidden bg-background h-16 w-16 group/img">
                                                        <img src={URL.createObjectURL(f)} alt="New material photo" className="object-cover w-full h-full opacity-70" />
                                                        <span className="absolute bottom-0 w-full bg-black/60 text-white text-[8px] text-center font-bold">NEW</span>
                                                        <button type="button" onClick={() => removeMaterialFile(index, 'photo', false, i)} className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-bl-md hover:bg-red-600 transition-all"><X className="w-3 h-3" /></button>
                                                    </div>
                                                ))}
                                                {/* Docs */}
                                                {m.existing_docs.map((url, i) => {
                                                    const isPdf = url.toLowerCase().includes('.pdf');
                                                    return (
                                                        <div key={`ex-dc-${i}`} className="relative border border-border/50 rounded-md bg-background h-16 w-16 flex items-center justify-center group/img">
                                                            {isPdf ? <ClipboardList className="w-6 h-6 text-red-500/70" /> : <img src={url} className="object-cover w-full h-full" alt="doc" />}
                                                            <button type="button" onClick={() => removeMaterialFile(index, 'doc', true, i)} className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-md opacity-0 group-hover/img:opacity-100 hover:bg-red-500 transition-all"><X className="w-3 h-3" /></button>
                                                            {isPdf && <a href={url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" title="PDFを開く" />}
                                                        </div>
                                                    )
                                                })}
                                                {m.pending_docs.map((f, i) => {
                                                    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
                                                    return (
                                                        <div key={`pd-dc-${i}`} className="relative border border-border/50 rounded-md bg-background h-16 w-16 flex flex-col items-center justify-center p-1 group/img">
                                                            {isPdf ? <ClipboardList className="w-6 h-6 text-muted-foreground" /> : <span className="text-[10px] text-muted-foreground truncate w-full text-center">{f.name}</span>}
                                                            <span className="absolute bottom-0 left-0 w-full bg-black/60 text-white text-[8px] text-center font-bold truncate px-1">{isPdf ? 'PDF' : 'FILE'}</span>
                                                            <button type="button" onClick={() => removeMaterialFile(index, 'doc', false, i)} className="absolute top-0 right-0 p-0.5 bg-red-500 z-20 text-white rounded-bl-md hover:bg-red-600 transition-all"><X className="w-3 h-3" /></button>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        type="button"
                                        onClick={() => setMaterials(materials.filter((_, i) => i !== index))} 
                                        className="absolute top-3 right-3 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50/50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="材料を削除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
            </div>
      </div>



      <div className="rounded-xl border bg-card p-6 shadow-sm mb-6">
        <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <Camera className="w-5 h-5 text-muted-foreground" />
                        現場写真 <span className="text-red-500 text-sm">*</span>
                    </h3>
                </div>
                <div className="pt-2">
                    <div className="flex gap-3 flex-wrap mb-4">
                        {existingPhotos.map((url, i) => (
                            <div key={`exist-${i}`} className="relative inline-block border border-border/50 rounded-lg overflow-hidden bg-muted/30 shadow-sm group">
                                <img src={url} alt={`Existing photo ${i}`} className="h-28 w-28 object-cover" />
                                <button type="button" onClick={() => removeExistingPhoto(i)} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"><X className="w-4 h-4" /></button>
                            </div>
                        ))}
                        {pendingPhotos.map((f, i) => (
                            <div key={`pending-${i}`} className="relative inline-block border border-border/50 rounded-lg overflow-hidden bg-muted/30 shadow-sm group">
                                <img src={URL.createObjectURL(f)} alt={`Pending photo ${i}`} className="h-28 w-28 object-cover opacity-80" />
                                <span className="absolute bottom-0 w-full bg-black/60 text-white text-[10px] truncate px-1 py-0.5 text-center font-medium tracking-wide">NEW</span>
                                <button type="button" onClick={() => removePendingPhoto(i)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"><X className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                    
                    <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-primary/30 rounded-xl p-8 bg-primary/5 hover:bg-primary/10 transition-colors w-full group">
                        <div className="bg-primary/10 p-3 rounded-full mb-3 group-hover:scale-105 transition-transform">
                            <Camera className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-primary">クリックまたはタップして写真を追加</span>
                        <span className="text-xs text-muted-foreground mt-1">※ 自動で圧縮されるため容量を気にする必要はありません</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                    </label>
                </div>
            </div>
      </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              日報の削除
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              この日報を本当に削除しますか？<br/>
              削除すると、関連する作業員や車両、材料のデータもすべて削除され、元に戻すことはできません。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
