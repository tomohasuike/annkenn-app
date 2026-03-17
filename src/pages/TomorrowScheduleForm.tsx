import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { ArrowLeft, Loader2, Save, CalendarClock, User, Users, Search, Target, Plus, Trash2, Truck, Wrench } from "lucide-react"
import { format, addDays } from 'date-fns';
import { AutocompleteInput } from '../components/ui/AutocompleteInput';

type ProjectData = {
  id: string
  name: string
  category: string
  status: string
}

type TomorrowScheduleData = {
  project_id: string
  schedule_date: string
  category: string
  reporter: string
  work_content: string
  one_point_ky: string
  workers: string
  notes: string
  send_flag: string
  arrival_time: string
}

type Subcontractor = {
  id?: string
  subcontractor_name: string
  worker_count: string
}

export default function TomorrowScheduleForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [projectsList, setProjectsList] = useState<ProjectData[]>([])
  
  const [schedule, setSchedule] = useState<TomorrowScheduleData>({
    project_id: '',
    schedule_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    category: '一般',
    reporter: '',
    work_content: '',
    one_point_ky: '',
    workers: '',
    notes: '',
    send_flag: '未定',
    arrival_time: '08:00'
  })

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  
  type ResourceItem = { id: string, name: string }
  const [workersList, setWorkersList] = useState<ResourceItem[]>([])
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([])
  
  type VehicleItem = { id: string, name: string, category: string }
  const [vehiclesList, setVehiclesList] = useState<VehicleItem[]>([])
  const [vehicles, setVehicles] = useState<{ vehicle_id: string, vehicle_name: string }[]>([])
  const [machinery, setMachinery] = useState<{ vehicle_id: string, vehicle_name: string }[]>([])
  
  // 新しく追加: カテゴリー選択用のステート（デフォルトは一般）
  const [selectedCategory, setSelectedCategory] = useState<string>('一般')
  const [showCompletedProjects, setShowCompletedProjects] = useState<boolean>(false)

  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchProjects()

      if (id) {
        await fetchScheduleData(id)
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user;
        if (user && user.email) {
            // Attempt to map email to real name using worker_master
            const { data: workerMatch } = await supabase
              .from('worker_master')
              .select('name')
              .ilike('email', user.email)
              .single()

            if (workerMatch && workerMatch.name) {
                setSchedule(prev => ({ ...prev, reporter: workerMatch.name }))
            } else {
                const reporterName = user.email.split('@')[0];
                setSchedule(prev => ({ ...prev, reporter: reporterName }))
            }
        }
        // Add one empty row by default for a new form
        setSubcontractors([{ subcontractor_name: '', worker_count: '1' }])
        setLoading(false)
      }
    }
    init()
  }, [id])

  useEffect(() => {
    fetchProjects()
  }, [showCompletedProjects])

  async function fetchProjects() {
    try {
      let query = supabase
        .from('projects')
        .select('id, project_name, category, status_flag')
        .order('created_at', { ascending: false })
        
      if (!showCompletedProjects) {
        query = query.in('status_flag', ['着工前', '着工中'])
      }
      
      const { data, error } = await query
      
      const { data: wData } = await supabase
        .from('worker_master')
        .select('id, name')
        .neq('type', '事務員')
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        
      if (wData) setWorkersList(wData.map(w => ({ id: w.id, name: w.name })))

      const { data: vData } = await supabase.from('vehicle_master').select('id, vehicle_name, category')
      if (vData) setVehiclesList(vData.map(v => ({ id: v.id, name: v.vehicle_name, category: v.category })))

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

  async function fetchScheduleData(scheduleId: string) {
    try {
      const { data, error } = await supabase
        .from('tomorrow_schedules')
        .select('*')
        .eq('id', scheduleId)
        .single()
      
      if (error) throw error
      
      if (data) {
        // Parse dates safely
        let formattedDate = '';
        if (data.schedule_date) {
            formattedDate = data.schedule_date.includes('T') || data.schedule_date.includes(' ') 
                ? format(new Date(data.schedule_date), 'yyyy-MM-dd') 
                : data.schedule_date.replace(/\//g, '-');
        }

        let formattedTime = data.arrival_time || '08:00';
        const timeParts = formattedTime.split(':');
        if (timeParts.length >= 2) {
            let hours = timeParts[0];
            let minutes = timeParts[1];
            if (hours.length === 1) hours = `0${hours}`;
            formattedTime = `${hours}:${minutes}`;
        }

        let loadedReporter = data.reporter || '';
        // If the loaded reporter name looks like an email prefix (contains english letters), find the real name
        if (loadedReporter && /^[a-zA-Z.]+$/.test(loadedReporter)) {
             const { data: workerMatch } = await supabase
              .from('worker_master')
              .select('name')
              .ilike('email', `${loadedReporter}%`)
              .limit(1)
              .single()
              
             if (workerMatch && workerMatch.name) {
                 loadedReporter = workerMatch.name;
             }
        }

        setSchedule({
          project_id: data.project_id || '',
          schedule_date: formattedDate || format(addDays(new Date(), 1), 'yyyy-MM-dd'),
          category: data.category || '一般',
          reporter: loadedReporter,
          work_content: data.work_content || '',
          one_point_ky: data.one_point_ky || '',
          workers: data.workers || '',
          notes: data.notes || '',
          send_flag: data.send_flag || '未定',
          arrival_time: formattedTime
        })
        
        // 既存の予定データがある場合、そのカテゴリーをボタンにも反映させる
        if (data.category) {
            setSelectedCategory(data.category);
        }
        
        if (data.workers) {
            // Split by comma, zenkaku comma, space, zenkaku space, or '、'
            const parsedWorkers = data.workers.split(/[,、\s　]+/).map((w: string) => w.trim()).filter((w: string) => w !== '');
            setSelectedWorkers(parsedWorkers);
        }
      }

      // Fetch Subcontractors
      const { data: subData, error: subError } = await supabase
        .from('tomorrow_subcontractors')
        .select('*')
        .eq('schedule_id', scheduleId)

      if (subError) throw subError
      
      if (subData && subData.length > 0) {
        setSubcontractors(subData.map(s => ({
            id: s.id,
            subcontractor_name: s.subcontractor_name || '',
            worker_count: s.worker_count || '1'
        })))
      } else {
        setSubcontractors([{ subcontractor_name: '', worker_count: '1' }])
      }

      // Fetch Vehicles
      const { data: vehData } = await supabase.from('tomorrow_vehicles').select('vehicle_id, vehicle_name').eq('schedule_id', scheduleId)
      if (vehData) {
          setVehicles(vehData.map((v: any) => ({ vehicle_id: v.vehicle_id || '', vehicle_name: v.vehicle_name || '' })))
      }

      // Fetch Machinery
      const { data: macData } = await supabase.from('tomorrow_machinery').select('machinery_id, machinery_name').eq('schedule_id', scheduleId)
      if (macData) {
          setMachinery(macData.map((m: any) => ({ vehicle_id: m.machinery_id || '', vehicle_name: m.machinery_name || '' })))
      }

    } catch (e) {
      console.error("Error fetching schedule details:", e)
    } finally {
      setLoading(false)
    }
  }

  const handleSubcontractorChange = (index: number, field: keyof Subcontractor, value: string) => {
    const newSubs = [...subcontractors]
    newSubs[index] = { ...newSubs[index], [field]: value }
    setSubcontractors(newSubs)
  }

  const addSubcontractorRow = () => {
    setSubcontractors([...subcontractors, { subcontractor_name: '', worker_count: '1' }])
  }

  const removeSubcontractorRow = (index: number) => {
    setSubcontractors(subcontractors.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!schedule.project_id) {
      alert("案件を選択してください")
      return
    }

    try {
      setSaving(true)

      const payload = {
        project_id: schedule.project_id,
        schedule_date: schedule.schedule_date || null,
        category: schedule.category,
        reporter: schedule.reporter,
        work_content: schedule.work_content,
        one_point_ky: schedule.one_point_ky,
        workers: selectedWorkers.join('、'),
        notes: schedule.notes,
        send_flag: schedule.send_flag,
        arrival_time: schedule.arrival_time + ":00" // Backend expects full time or handles it, but let's be safe
      }

      let savedScheduleId = id;

      if (id) {
        const { error } = await supabase.from('tomorrow_schedules').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('tomorrow_schedules').insert([payload]).select().single()
        if (error) throw error
        savedScheduleId = data.id
      }

      // Handle Subcontractors (Delete all existing, then insert valid ones)
      if (savedScheduleId) {
          await supabase.from('tomorrow_subcontractors').delete().eq('schedule_id', savedScheduleId);
          
          const validSubs = subcontractors.filter(s => s.subcontractor_name.trim() !== '');
          if (validSubs.length > 0) {
              const subPayload = validSubs.map(s => ({
                  schedule_id: savedScheduleId,
                  subcontractor_name: s.subcontractor_name,
                  worker_count: s.worker_count
              }));
              const { error: subInsertError } = await supabase.from('tomorrow_subcontractors').insert(subPayload);
              if (subInsertError) throw subInsertError;
          }

          // Handle Vehicles
          await supabase.from('tomorrow_vehicles').delete().eq('schedule_id', savedScheduleId);
          const validVehicles = vehicles.filter(v => v.vehicle_name.trim() !== '');
          if (validVehicles.length > 0) {
              const vehPayload = validVehicles.map(v => ({
                  schedule_id: savedScheduleId,
                  vehicle_id: v.vehicle_id || null,
                  vehicle_name: v.vehicle_name
              }));
              await supabase.from('tomorrow_vehicles').insert(vehPayload);
          }

          // Handle Machinery
          await supabase.from('tomorrow_machinery').delete().eq('schedule_id', savedScheduleId);
          const validMachinery = machinery.filter(m => m.vehicle_name.trim() !== '');
          if (validMachinery.length > 0) {
              const macPayload = validMachinery.map(m => ({
                  schedule_id: savedScheduleId,
                  machinery_id: m.vehicle_id || null,
                  machinery_name: m.vehicle_name
              }));
              await supabase.from('tomorrow_machinery').insert(macPayload);
          }
      }

      navigate('/tomorrow-schedules')
    } catch (e: any) {
      console.error("Error saving schedule:", e)
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
                onClick={() => navigate('/tomorrow-schedules')}
                className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {id ? '翌日予定を編集' : '新規翌日予定'}
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
                <CalendarClock className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">手配基本情報</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-foreground w-full flex justify-between items-center">
                            <span>区分</span>
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-normal text-muted-foreground hover:text-foreground transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={showCompletedProjects}
                                    onChange={(e) => setShowCompletedProjects(e.target.checked)}
                                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                />
                                完工した案件も探す
                            </label>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {['一般', '役所', '川北', 'BPE'].map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => {
                                        setSelectedCategory(cat);
                                        setSchedule({...schedule, category: cat, project_id: ''}); // リセット
                                    }}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                                        selectedCategory === cat 
                                        ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                                        : 'bg-background hover:bg-muted text-foreground'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-foreground">対象案件 <span className="text-destructive">*</span></label>
                        <select 
                            value={schedule.project_id}
                            onChange={(e) => setSchedule({...schedule, project_id: e.target.value})}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            required
                        >
                            <option value="">案件を選択してください</option>
                            {projectsList.filter(p => p.category === selectedCategory).map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                            ))}
                        </select>
                        {projectsList.filter(p => p.category === selectedCategory).length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">選択された区分の案件（着工前・着工中）はありません。</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">予定日</label>
                        <input 
                            type="date"
                            value={schedule.schedule_date}
                            onChange={(e) => setSchedule({...schedule, schedule_date: e.target.value})}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">出社時間</label>
                        <input 
                            type="time"
                            value={schedule.arrival_time}
                            onChange={(e) => setSchedule({...schedule, arrival_time: e.target.value})}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </div>
                    {/* 作業区分は上のボタンで設定するため、ドロップダウンメニューは削除 */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">手配・報告者</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input 
                                type="text"
                                value={schedule.reporter}
                                readOnly
                                className="w-full h-10 rounded-md border border-input bg-muted pl-10 pr-3 py-2 text-sm ring-offset-background cursor-not-allowed text-muted-foreground focus-visible:outline-none"
                            />
                        </div>
                    </div>
                </div>
              </div>
            </section>

            {/* 作業内容・人員 */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="border-b bg-muted/30 px-6 py-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">作業詳細</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">予定作業内容</label>
                    <textarea 
                        value={schedule.work_content}
                        onChange={(e) => setSchedule({...schedule, work_content: e.target.value})}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">自社人員</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {workersList.map(worker => {
                            const isSelected = selectedWorkers.includes(worker.name);
                            return (
                                <div key={worker.id} className={`border rounded-lg p-3 transition-all ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'bg-muted/20 hover:bg-muted/50 border-transparent hover:border-border'}`}>
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input 
                                            type="checkbox" 
                                            checked={isSelected}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedWorkers([...selectedWorkers, worker.name]);
                                                } else {
                                                    setSelectedWorkers(selectedWorkers.filter(name => name !== worker.name));
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
            </section>

            {/* 車両・重機 */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">車両・重機</h3>
                </div>
                <div className="p-6 space-y-6">
                    {/* 作業車 */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Truck className="w-4 h-4 text-muted-foreground" />
                            作業車
                        </label>
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
                    {/* 建設機械 */}
                    <div className="space-y-3 pt-4 border-t border-border/50">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-muted-foreground" />
                            建設機械
                        </label>
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
            </section>

            {/* 協力業者手配 */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">協力業者手配</h3>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {subcontractors.map((sub, index) => (
                        <div key={index} className="flex gap-2 items-start">
                            <div className="flex-1">
                                <AutocompleteInput 
                                    value={sub.subcontractor_name}
                                    onChange={(val) => handleSubcontractorChange(index, 'subcontractor_name', val)}
                                    tableName="tomorrow_subcontractors"
                                    columnName="subcontractor_name"
                                    projectId={schedule.project_id}
                                    placeholder="業者名"
                                    className="w-full border-slate-300"
                                />
                            </div>
                            <div className="w-24">
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        value={sub.worker_count}
                                        onChange={(e) => handleSubcontractorChange(index, 'worker_count', e.target.value)}
                                        min="1"
                                        className="w-full h-10 rounded-md border border-input bg-background pr-6 pl-3 py-2 text-sm text-right"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">人</span>
                                </div>
                            </div>
                            <button
                                onClick={() => removeSubcontractorRow(index)}
                                className="p-2 h-10 w-10 shrink-0 inline-flex justify-center items-center rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={addSubcontractorRow}
                        className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium mt-2"
                    >
                        <Plus className="w-4 h-4" />
                        業者を追加
                    </button>
                </div>
            </section>

            {/* KY活動・特記事項 */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="border-b bg-muted/30 px-6 py-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">KY（危険予知）活動・引継</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">ワンポイントKY</label>
                    <textarea 
                        value={schedule.one_point_ky}
                        onChange={(e) => setSchedule({...schedule, one_point_ky: e.target.value})}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                        placeholder="想定される危険と対策を記載"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">特記事項・引継事項</label>
                    <textarea 
                        value={schedule.notes}
                        onChange={(e) => setSchedule({...schedule, notes: e.target.value})}
                        rows={2}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                </div>
              </div>
            </section>

            {/* ステータス */}
            <section className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4">
                    <h3 className="font-semibold">手配・通達ステータス</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">確定状態</label>
                        <div className="flex flex-wrap gap-4">
                            {['未定', '確定', '変更待ち', 'キャンセル'].map((status) => (
                                <label key={status} className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="send_flag"
                                        value={status}
                                        checked={schedule.send_flag === status}
                                        onChange={(e) => setSchedule({...schedule, send_flag: e.target.value})}
                                        className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                                    />
                                    <span className="text-sm">{status}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}
