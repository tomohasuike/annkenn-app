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

type Personnel = { worker_id: string; worker_name: string; group_id?: string; start_time?: string; end_time?: string; }
type TimeGroup = { id: string; start_time: string; end_time: string; }
type Vehicle = { vehicle_id: string; vehicle_name: string }
type Material = { material_name: string; quantity: string; pending_photos: File[]; pending_docs: File[]; existing_photos: string[]; existing_docs: string[] }
type Subcontractor = { company_name: string; headcount: string; group_id?: string; }

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
  const [timeGroups, setTimeGroups] = useState<TimeGroup[]>([])
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
            const { projectId, personnel: initPersonnel, vehicles: initVehicles, category, reportDate, passedSubcontractors: initSubcontractors } = location.state as any;

            const newGroups: { id: string, start_time: string, end_time: string }[] = [];
            const getGroupForTime = (st?: string | null, et?: string | null) => {
                if (!st && !et) return 'default';
                const s = st?.slice(0, 5) || '';
                const e = et?.slice(0, 5) || '';
                let g = newGroups.find(x => x.start_time === s && x.end_time === e);
                if (!g) {
                    g = { id: `group-${Math.random().toString(36).substr(2, 9)}`, start_time: s, end_time: e };
                    newGroups.push(g);
                }
                return g.id;
            };

            if (category) {
                setSelectedProjectCategory(category);
            }
            if (projectId) {
                setReport(prev => ({ ...prev, project_id: projectId }));
            }
            if (initPersonnel && Array.isArray(initPersonnel)) {
                setPersonnel(initPersonnel.map((p: any) => ({
                    ...p,
                    group_id: getGroupForTime(p.start_time, p.end_time)
                })));
            }
            if (initVehicles && Array.isArray(initVehicles)) {
                setVehicles(initVehicles);
            }
            if (initSubcontractors && Array.isArray(initSubcontractors) && initSubcontractors.length > 0) {
                setSubcontractors(initSubcontractors.map((s: any) => ({
                    company_name: s.subcontractor_name || '',
                    headcount: s.worker_count || '1',
                    group_id: getGroupForTime(s.start_time, s.end_time)
                })));
            } else {
                setSubcontractors([{ company_name: '', headcount: '1' }]);
            }
            
            if (newGroups.length > 0) {
                setTimeGroups(prev => {
                    const mergedGroups = [...prev];
                    newGroups.forEach(ng => {
                         if (!mergedGroups.some(eg => eg.start_time === ng.start_time && eg.end_time === ng.end_time)) {
                             mergedGroups.push(ng);
                         }
                    });
                    return mergedGroups;
                });
            }
            if (reportDate) {
                const parsedTarget = new Date(reportDate);
                const start = new Date(parsedTarget); start.setHours(8, 0, 0, 0);
                const end = new Date(parsedTarget); end.setHours(17, 0, 0, 0);
                
                let minStartMinutes: number | null = null;
                let maxEndMinutes: number | null = null;
                
                newGroups.forEach(g => {
                    if (g.start_time) {
                        const [h, m] = g.start_time.split(':').map(Number);
                        if (!isNaN(h) && !isNaN(m)) {
                            const total = h * 60 + m;
                            if (minStartMinutes === null || total < minStartMinutes) minStartMinutes = total;
                        }
                    }
                    if (g.end_time) {
                        const [h, m] = g.end_time.split(':').map(Number);
                        if (!isNaN(h) && !isNaN(m)) {
                            const total = h * 60 + m;
                            if (maxEndMinutes === null || total > maxEndMinutes) maxEndMinutes = total;
                        }
                    }
                });

                if (minStartMinutes !== null) {
                    start.setHours(Math.floor(minStartMinutes / 60), minStartMinutes % 60, 0, 0);
                }
                if (maxEndMinutes !== null) {
                    end.setHours(Math.floor(maxEndMinutes / 60), maxEndMinutes % 60, 0, 0);
                }

                setReport(prev => ({ 
                    ...prev, 
                    보고日時: reportDate,
                    作業開始時間: format(start, "yyyy-MM-dd'T'HH:mm"),
                    作業終了時間: format(end, "yyyy-MM-dd'T'HH:mm")
                }));
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
      
      const { data: wData } = await supabase.from('worker_master').select('id, name, type, display_order').neq('type', '事務員').neq('type', '協力会社')
      
      const sortedWData = (wData || []).slice().sort((a, b) => {
          const orderA = a.display_order ?? 999;
          const orderB = b.display_order ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '', 'ja');
      });
      
      const { data: vData } = await supabase.from('vehicle_master').select('id, vehicle_name, category').or('is_inspection_only.is.null,is_inspection_only.eq.false')
      
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

      const loadedGroups: TimeGroup[] = [];
      const resolveGroupId = (start_time: string | null, end_time: string | null) => {
          if (!start_time && !end_time) return undefined;
          const sTime = start_time ? start_time.substring(0, 5) : '';
          const eTime = end_time ? end_time.substring(0, 5) : '';
          let existingGroup = loadedGroups.find(g => g.start_time === sTime && g.end_time === eTime);
          if (!existingGroup) {
              existingGroup = { id: Math.random().toString(36).substring(7), start_time: sTime, end_time: eTime };
              loadedGroups.push(existingGroup);
          }
          return existingGroup.id;
      };

      const { data: pData } = await supabase.from('report_personnel').select('worker_id, worker_master(name), worker_name, start_time, end_time').eq('report_id', reportId)
      if (pData && pData.length > 0) {
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
              
              return { 
                  worker_id: wId, 
                  worker_name: wName,
                  group_id: resolveGroupId(p.start_time, p.end_time),
                  start_time: p.start_time,
                  end_time: p.end_time
              };
          }))
      } else if (location.state?.personnel && Array.isArray(location.state.personnel) && location.state.personnel.length > 0) {
          setPersonnel(location.state.personnel);
      }

      const { data: vData } = await supabase.from('report_vehicles').select('vehicle_id, vehicle_master(vehicle_name), vehicle_name').eq('report_id', reportId)
      if (vData && vData.length > 0) {
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
      } else if (location.state?.vehicles && Array.isArray(location.state.vehicles) && location.state.vehicles.length > 0) {
          setVehicles(location.state.vehicles);
      }

      const { data: mData } = await supabase.from('report_machinery').select('machinery_id, vehicle_master(vehicle_name), machinery_name').eq('report_id', reportId)
      if (mData && mData.length > 0) {
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

      const { data: subData } = await supabase.from('report_subcontractors').select('subcontractor_name, worker_count, start_time, end_time').eq('report_id', reportId)
      if (subData) setSubcontractors(subData.map((s: any) => ({ 
          company_name: s.subcontractor_name || '', 
          headcount: s.worker_count || '',
          group_id: resolveGroupId(s.start_time, s.end_time)
      })))

      if (loadedGroups.length > 0) setTimeGroups(loadedGroups);

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
        const sessionData = await supabase.auth.getSession();
        const token = sessionData.data.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        // --- Photo Upload Logic ---
        const uploadedUrls = [...existingPhotos];
        if (pendingPhotos.length > 0) {
            for (const file of pendingPhotos) {
                try {
                    const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1920 });
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                    
                    const finalFile = new File([compressed], fileName, { type: compressed.type });
                    const formData = new FormData();
                    formData.append('file', finalFile);

                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-drive-file`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                        body: formData
                    });
                    
                    if (!res.ok) {
                        const errText = await res.text();
                        console.error('Photo Upload error:', res.status, errText);
                        alert(`写真アップロードに失敗しました (Error ${res.status}): ${errText}`);
                        continue;
                    }

                    const uploadData = await res.json();
                    
                    if (!uploadData?.success) {
                        console.error('Photo Upload error:', uploadData?.error);
                        alert(`写真アップロードに失敗しました: ${uploadData?.error}`);
                    } else if (uploadData) {
                        const driveImgUrl = uploadData.directLink ? uploadData.directLink : uploadData.webViewLink;
                        uploadedUrls.push(driveImgUrl);
                    }
                } catch (err: any) {
                    console.error('Compression or upload failed:', err);
                    alert(`写真のアップロード中に予期せぬエラーが発生しました: ${err.message}`);
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
                const pPayload = personnel.filter(p => p.worker_id || p.worker_name).map(p => {
                    let sTime: string | null = null;
                    let eTime: string | null = null;
                    if (p.group_id) {
                        const tg = timeGroups.find(g => g.id === p.group_id);
                        if (tg) {
                            sTime = tg.start_time || null;
                            eTime = tg.end_time || null;
                        }
                    }
                    return { 
                        report_id: currentReportId, 
                        worker_id: p.worker_id?.startsWith('legacy-') ? null : (p.worker_id || null), 
                        worker_name: p.worker_id?.startsWith('legacy-') ? p.worker_name : null,
                        start_time: sTime,
                        end_time: eTime
                    }
                })
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
                                const fileName = `materials_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                                const finalFile = new File([compressed], fileName, { type: compressed.type });
                                const formData = new FormData();
                                formData.append('file', finalFile);

                                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-drive-file`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token}` },
                                    body: formData
                                });

                                if (!res.ok) {
                                    const errText = await res.text();
                                    console.error('Material photo upload error:', res.status, errText);
                                    continue;
                                }

                                const uploadData = await res.json();

                                if (uploadData?.success) {
                                    const driveImgUrl = uploadData.directLink ? uploadData.directLink : uploadData.webViewLink;
                                    uploadedPhotos.push(driveImgUrl);
                                }
                            } catch (err) { console.error('Material photo upload failed:', err); }
                        }
                    }

                    const uploadedDocs = [...m.existing_docs];
                    if (m.pending_docs.length > 0) {
                        for (const file of m.pending_docs) {
                            try {
                                const ext = file.name.split('.').pop();
                                const fileName = `materials_docs_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
                                const finalFile = new File([file], fileName, { type: file.type });
                                const formData = new FormData();
                                formData.append('file', finalFile);

                                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-drive-file`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token}` },
                                    body: formData
                                });

                                if (!res.ok) {
                                    const errText = await res.text();
                                    console.error('Material doc upload error:', res.status, errText);
                                    continue;
                                }
                                
                                const uploadData = await res.json();

                                if (uploadData?.success) {
                                    const driveDocUrl = uploadData.webViewLink;
                                    uploadedDocs.push(driveDocUrl);
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
                const subPayload = subcontractors.filter(s => s.company_name.trim() !== '').map(s => {
                    let sTime: string | null = null;
                    let eTime: string | null = null;
                    if (s.group_id) {
                        const tg = timeGroups.find(g => g.id === s.group_id);
                        if (tg) {
                            sTime = tg.start_time || null;
                            eTime = tg.end_time || null;
                        }
                    }
                    return { 
                        report_id: currentReportId, 
                        subcontractor_name: s.company_name, 
                        worker_count: s.headcount ? s.headcount.toString() : null,
                        start_time: sTime,
                        end_time: eTime
                    }
                })
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
                                return (
                                    <option key={p.id} value={p.id}>
                                        {p.project_number ? `${p.project_number}　` : ''}{p.name}{p.site_name ? `（${p.site_name}）` : (p.client_name ? `（${p.client_name}）` : '')} ({p.status})
                                    </option>
                                );
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
        <div className="space-y-6">
          <div className="pb-2 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-medium flex items-center gap-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  稼働時間ごとの人員・業者編成 <span className="text-red-500 text-sm">*</span>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">時間枠ごとに作業員と協力業者を追加してください。</p>
            </div>
            <button
                type="button"
                onClick={() => setTimeGroups([...timeGroups, { id: Math.random().toString(36).substring(7), start_time: '', end_time: '' }])}
                className="text-sm font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
                <Plus className="w-4 h-4" /> 別の時間枠を追加
            </button>
          </div>

          <div className="space-y-4">
          {[{ id: 'default', start_time: report.作業開始時間?.split('T')[1] || '', end_time: report.作業終了時間?.split('T')[1] || '', isDefault: true }, ...timeGroups].map((g, index) => {
              const groupMembers = personnel.filter(p => (p.group_id || 'default') === g.id);
              const groupSubs = subcontractors.filter(s => (s.group_id || 'default') === g.id);
              const isDefault = g.id === 'default';

              return (
                  <div key={g.id} className={`border rounded-xl p-4 sm:p-5 relative transition-all ${isDefault ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-muted/30 border-border'}`}>
                      {!isDefault && (
                          <button 
                              type="button" 
                              onClick={() => {
                                  setPersonnel(personnel.filter(p => p.group_id !== g.id));
                                  setSubcontractors(subcontractors.filter(s => s.group_id !== g.id));
                                  setTimeGroups(timeGroups.filter(t => t.id !== g.id));
                              }}
                              className="absolute top-4 right-4 text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                          >
                              <Trash2 className="w-4 h-4" />
                          </button>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border/60 pb-3 mb-4">
                          <span className={`font-bold text-sm px-2.5 py-1 rounded inline-flex shrink-0 w-fit ${isDefault ? 'bg-primary text-primary-foreground' : 'bg-slate-200 text-slate-700'}`}>
                              {isDefault ? '基本時間' : `追加グループ ${index}`}
                          </span>
                          {isDefault ? (
                              <span className="font-bold text-base flex items-center gap-2">
                                  {g.start_time} <span className="text-muted-foreground font-normal">〜</span> {g.end_time}
                                  <span className="text-xs font-normal text-muted-foreground ml-2">※日報上部の作業時間と連動します</span>
                              </span>
                          ) : (
                              <div className="flex items-center gap-2">
                                  <input 
                                      type="time" 
                                      value={g.start_time || ''}
                                      onChange={e => setTimeGroups(timeGroups.map(t => t.id === g.id ? { ...t, start_time: e.target.value } : t))}
                                      className="border border-input rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none w-28 bg-background"
                                  />
                                  <span className="text-muted-foreground font-medium">〜</span>
                                  <input 
                                      type="time" 
                                      value={g.end_time || ''}
                                      onChange={e => setTimeGroups(timeGroups.map(t => t.id === g.id ? { ...t, end_time: e.target.value } : t))}
                                      className="border border-input rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none w-28 bg-background"
                                  />
                              </div>
                          )}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                          {/* 作業員エリア */}
                          <div className="space-y-3">
                              <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> 作業員 (自社)</label>
                              <div className="flex flex-col gap-2">
                                  <div className="flex flex-wrap gap-2">
                                      {groupMembers.map(m => (
                                          <div key={m.worker_id} className="flex items-center gap-1.5 bg-background border shadow-sm pl-3 pr-1.5 py-1.5 rounded-full text-sm font-medium">
                                              {m.worker_name}
                                              <button type="button" onClick={() => setPersonnel(personnel.filter(p => p !== m))} className="text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-full p-1 transition-colors">
                                                  <X className="w-3.5 h-3.5" />
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                                  <div className="relative max-w-xs mt-1">
                                      <select 
                                          className="appearance-none w-full bg-secondary/50 hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold px-4 py-2 rounded-lg border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer pr-10"
                                          value=""
                                          onChange={(e) => {
                                              if(!e.target.value) return;
                                              const w = workersList.find(w => w.id === e.target.value);
                                              if(w) {
                                                  setPersonnel([...personnel, { worker_id: w.id, worker_name: w.name, group_id: isDefault ? undefined : g.id }]);
                                              }
                                              e.target.value = "";
                                          }}
                                      >
                                          <option value="" disabled>＋ 作業員を追加する</option>
                                          {workersList.filter(w => !personnel.some(p => p.worker_id === w.id)).map(w => (
                                              <option key={w.id} value={w.id}>{w.name}</option>
                                          ))}
                                      </select>
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center bg-white rounded-md shadow-sm p-1">
                                         <Plus className="w-3 h-3 text-secondary-foreground" />
                                      </div>
                                  </div>
                              </div>
                          </div>

                          {/* 協力業者エリア */}
                          <div className="space-y-3">
                              <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Building className="w-3.5 h-3.5" /> 協力業者</label>
                              <div className="space-y-2.5">
                                  {groupSubs.map(s => {
                                      const trueIndex = subcontractors.findIndex(sub => sub === s);
                                      if (trueIndex === -1) return null;
                                      return (
                                          <div key={trueIndex} className="flex items-start sm:items-center gap-2 bg-background p-2 rounded-lg border shadow-sm">
                                              <div className="flex-1 min-w-[140px]">
                                                  <AutocompleteInput 
                                                      value={s.company_name}
                                                      onChange={(val) => { const n = [...subcontractors]; n[trueIndex].company_name = val; setSubcontractors(n); }}
                                                      tableName="report_subcontractors"
                                                      columnName="subcontractor_name"
                                                      projectId={report.project_id}
                                                      placeholder="業者名"
                                                      className="w-full h-9 text-sm border-input"
                                                  />
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <div className="w-20 relative">
                                                    <input 
                                                        type="number" placeholder="人数" value={s.headcount}
                                                        onChange={(e) => { const n = [...subcontractors]; n[trueIndex].headcount = e.target.value; setSubcontractors(n); }}
                                                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                                    />
                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">名</span>
                                                </div>
                                                <button type="button" onClick={() => setSubcontractors(subcontractors.filter((_, i) => i !== trueIndex))} className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-md transition-colors shrink-0">
                                                    <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  <button 
                                      type="button"
                                      onClick={() => setSubcontractors([...subcontractors, { company_name: '', headcount: '1', group_id: isDefault ? undefined : g.id }])}
                                      className="text-sm text-secondary-foreground bg-secondary/50 hover:bg-secondary/80 border border-transparent font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors w-full sm:max-w-xs justify-center sm:justify-start"
                                  >
                                      <Plus className="w-3.5 h-3.5 bg-white rounded-md shadow-sm p-0.5" /> 協力業者枠を追加する
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
              )
          })}
          </div>
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
