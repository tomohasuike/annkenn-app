import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { Users, Truck, ShieldCheck, Loader2, Save, Plus, Trash2, Edit2, AlertTriangle, Settings as SettingsIcon } from "lucide-react"

// Types
export interface WorkerMaster {
  id: string
  name: string
  employee_number?: string
  position?: string
  status?: string
  contract_type?: string
  worker_type?: string
  type?: string
  email?: string
  telephone?: string
  is_admin?: boolean
  allowed_apps?: string[]
}

export interface VehicleMaster {
  id: string
  vehicle_name: string
  category: string
  status?: string
}

export interface AppSettings {
  id?: string;
  safety_webhook_url: string;
  safety_app_url: string;
  enable_auto_test?: boolean;
  auto_test_schedule?: string;
  enable_earthquake_alert?: boolean;
  earthquake_threshold?: string;
  earthquake_target_region?: string;
}

const APPS = [
  { id: 'dashboard', name: 'ダッシュボード' },
  { id: 'projects', name: '案件管理' },
  { id: 'reports', name: '日報管理' },
  { id: 'completion-reports', name: '完了報告' },
  { id: 'tomorrow-schedules', name: '翌日予定' },
  { id: 'schedule-management', name: '工程管理' },
  { id: 'work-summary', name: '作業集計管理' },
  { id: 'billing', name: '請求管理' },
  { id: 'safety-dashboard', name: '安否確認管理' }
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'users' | 'workers' | 'vehicles' | 'app-settings'>('users')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Data State
  const [workers, setWorkers] = useState<WorkerMaster[]>([])
  const [vehicles, setVehicles] = useState<VehicleMaster[]>([])
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [currentUser, setCurrentUser] = useState<WorkerMaster | null>(null)

  // Worker CRUD State
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState<Partial<WorkerMaster> | null>(null)
  const [workerSaving, setWorkerSaving] = useState(false)

  // Vehicle CRUD State
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Partial<VehicleMaster> | null>(null)
  const [vehicleSaving, setVehicleSaving] = useState(false)

  // Fetch Data
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Get current logged-in user info
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: workerData, error: workerErr } = await supabase
        .from('worker_master')
        .select('*')
        .order('id', { ascending: true })
        
      if (workerErr) throw workerErr
      
      // Map JSON defaults if null
      const processedWorkers = (workerData || []).map(w => ({
          ...w,
          is_admin: Boolean(w.is_admin),
          allowed_apps: w.allowed_apps || APPS.map(a => a.id) // Default all if null for legacy
      }))
      
      setWorkers(processedWorkers)

      // Find current user mapping
      if (user && user.email) {
          const current = processedWorkers.find(w => w.email === user.email)
          if (current) setCurrentUser(current as WorkerMaster)
      }

      const { data: vehicleData, error: vehicleErr } = await supabase
        .from('vehicle_master')
        .select('*')
        .order('id', { ascending: true })
        
      if (vehicleErr) throw vehicleErr
      setVehicles(vehicleData || [])

      const { data: appSettingData, error: appSettingErr } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .single()
      
      if (!appSettingErr && appSettingData) {
        setAppSettings(appSettingData)
      } else if (appSettingErr?.code === 'PGRST116') {
        // No rows, initialized empty
        setAppSettings({ 
            safety_webhook_url: '', 
            safety_app_url: '',
            enable_auto_test: false,
            auto_test_schedule: '1 9 * * *',
            enable_earthquake_alert: false,
            earthquake_threshold: '6-',
            earthquake_target_region: '本社周辺'
        })
      } else if (appSettingErr) {
        throw appSettingErr;
      }

    } catch (e) {
      console.error("Error fetching admin data:", e)
      alert("データの取得に失敗しました。SQLマイグレーションが完了しているか確認してください。")
    } finally {
      setLoading(false)
    }
  }

  // Handle Permission Changes
  const toggleAppAccess = (workerId: string, appId: string) => {
    setWorkers(prev => prev.map(w => {
      if (w.id === workerId) {
        const apps = w.allowed_apps || []
        const newApps = apps.includes(appId) 
          ? apps.filter(id => id !== appId)
          : [...apps, appId]
        return { ...w, allowed_apps: newApps }
      }
      return w
    }))
  }

  const toggleAdmin = (workerId: string) => {
    setWorkers(prev => prev.map(w => {
        if (w.id === workerId) return { ...w, is_admin: !w.is_admin }
        return w
    }))
  }

  const savePermissions = async () => {
    setSaving(true)
    try {
      // Loop through and update. For a robust app, use an upsert or bulk update
      for (const w of workers) {
          await supabase.from('worker_master')
            .update({
                is_admin: w.is_admin,
                allowed_apps: w.allowed_apps
            })
            .eq('id', w.id)
      }
      alert('権限を保存しました。')
    } catch (e) {
      console.error(e)
      alert('権限の保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  const saveAppSettings = async () => {
    if (!appSettings) return;
    setSaving(true);
    try {
      if (appSettings.id) {
        await supabase.from('app_settings').update({
          safety_webhook_url: appSettings.safety_webhook_url,
          safety_app_url: appSettings.safety_app_url,
          enable_auto_test: appSettings.enable_auto_test,
          auto_test_schedule: appSettings.auto_test_schedule,
          enable_earthquake_alert: appSettings.enable_earthquake_alert,
          earthquake_threshold: appSettings.earthquake_threshold,
          earthquake_target_region: appSettings.earthquake_target_region
        }).eq('id', appSettings.id);
      } else {
        const { data } = await supabase.from('app_settings').insert({
          safety_webhook_url: appSettings.safety_webhook_url,
          safety_app_url: appSettings.safety_app_url,
          enable_auto_test: appSettings.enable_auto_test,
          auto_test_schedule: appSettings.auto_test_schedule,
          enable_earthquake_alert: appSettings.enable_earthquake_alert,
          earthquake_threshold: appSettings.earthquake_threshold,
          earthquake_target_region: appSettings.earthquake_target_region
        }).select().single();
        if (data) setAppSettings(data);
      }
      alert('アプリ設定を保存しました。');
    } catch (e) {
      console.error(e);
      alert('設定の保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  // --- Worker Master CRUD ---
  const handleOpenWorkerModal = (worker?: WorkerMaster) => {
      if (worker) {
          setEditingWorker({ ...worker })
      } else {
          setEditingWorker({ name: '', email: '', type: '作業員', is_admin: false })
      }
      setIsWorkerModalOpen(true)
  }

  const handleSaveWorker = async () => {
      if (!editingWorker || !editingWorker.name) return
      setWorkerSaving(true)
      try {
          if (editingWorker.id) {
              // Update
              const { error } = await supabase.from('worker_master').update({
                  name: editingWorker.name,
                  email: editingWorker.email,
                  type: editingWorker.type,
              }).eq('id', editingWorker.id)
              if (error) throw error
          } else {
              // Insert
              const { error } = await supabase.from('worker_master').insert({
                  name: editingWorker.name,
                  email: editingWorker.email,
                  type: editingWorker.type,
                  is_active: true
              })
              if (error) throw error
          }
          setIsWorkerModalOpen(false)
          fetchData() // Refresh
      } catch(e: any) {
          console.error(e)
          alert("保存に失敗しました: " + e.message)
      } finally {
          setWorkerSaving(false)
      }
  }

  const handleDeleteWorker = async (id: string, name: string) => {
      if (!confirm(`本当に「${name}」を削除しますか？`)) return
      try {
          const { error } = await supabase.from('worker_master').delete().eq('id', id)
          if (error) throw error
          fetchData() // Refresh
      } catch (e: any) {
          console.error(e)
          alert("削除に失敗しました: " + e.message)
      }
  }

  // --- Vehicle Master CRUD ---
  const handleOpenVehicleModal = (vehicle?: VehicleMaster) => {
      if (vehicle) {
          setEditingVehicle({ ...vehicle })
      } else {
          setEditingVehicle({ vehicle_name: '', category: '一般' })
      }
      setIsVehicleModalOpen(true)
  }

  const handleSaveVehicle = async () => {
      if (!editingVehicle || !editingVehicle.vehicle_name) return
      setVehicleSaving(true)
      try {
          if (editingVehicle.id) {
              // Update
              const { error } = await supabase.from('vehicle_master').update({
                  vehicle_name: editingVehicle.vehicle_name,
                  category: editingVehicle.category,
              }).eq('id', editingVehicle.id)
              if (error) throw error
          } else {
              // Insert
              const { error } = await supabase.from('vehicle_master').insert({
                  vehicle_name: editingVehicle.vehicle_name,
                  category: editingVehicle.category,
                  is_active: true
              })
              if (error) throw error
          }
          setIsVehicleModalOpen(false)
          fetchData() // Refresh
      } catch(e: any) {
          console.error(e)
          alert("保存に失敗しました: " + e.message)
      } finally {
          setVehicleSaving(false)
      }
  }

  const handleDeleteVehicle = async (id: string, name: string) => {
      if (!confirm(`本当に「${name}」を削除しますか？`)) return
      try {
          const { error } = await supabase.from('vehicle_master').delete().eq('id', id)
          if (error) throw error
          fetchData() // Refresh
      } catch (e: any) {
          console.error(e)
          alert("削除に失敗しました: " + e.message)
      }
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>

  // If not admin and we have loaded user data, strictly speaking we should block them.
  // We'll add UI blocking here. In real world, RLS is also required.
  if (currentUser && !currentUser.is_admin && currentUser.email !== 'hasuike@hitec-inc.co.jp' && currentUser.email !== 'test@hitec-inc.co.jp') {
      return (
          <div className="p-8 flex flex-col items-center justify-center text-center h-[50vh]">
              <ShieldCheck className="w-16 h-16 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">アクセス権限がありません</h2>
              <p className="text-muted-foreground">設定・管理ボードを利用するには管理者機能が必要です。</p>
          </div>
      )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">設定・管理ボード</h1>
          <p className="text-muted-foreground mt-1 text-sm">システム全体のマスターデータとユーザー権限を管理します</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm">
        <div className="border-b bg-muted/30 px-4 flex gap-4 overflow-x-auto">
          <button 
            className={`py-4 px-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'users' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'}`}
            onClick={() => setActiveTab('users')}
          >
            <ShieldCheck className="w-4 h-4" />
            ユーザー＆アプリ権限管理
          </button>
          <button 
            className={`py-4 px-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'workers' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'}`}
            onClick={() => setActiveTab('workers')}
          >
            <Users className="w-4 h-4" />
            作業員マスター管理
          </button>
          <button 
            className={`py-4 px-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'vehicles' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'}`}
            onClick={() => setActiveTab('vehicles')}
          >
            <Truck className="w-4 h-4" />
            車両・建機マスター管理
          </button>
          <button 
            className={`py-4 px-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'app-settings' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'}`}
            onClick={() => setActiveTab('app-settings')}
          >
            <SettingsIcon className="w-4 h-4" />
            システム設定
          </button>
        </div>

        <div className="p-6">
          {/* USER PERMISSIONS TAB */}
          {activeTab === 'users' && (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">アプリ利用権限設定</h3>
                        <p className="text-sm text-muted-foreground">各ユーザーがサイドバーに表示・利用できるアプリを指定します。</p>
                    </div>
                    <button 
                        onClick={savePermissions}
                        disabled={saving}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        一括保存
                    </button>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                            <tr>
                                <th className="px-4 py-3 font-medium sticky left-0 bg-muted/50 z-20 shadow-[1px_0_0_0_theme(colors.border)]">作業員名</th>
                                <th className="px-4 py-3 font-medium text-center sticky left-[120px] bg-muted/50 z-20 shadow-[1px_0_0_0_theme(colors.border)]">管理者</th>
                                {APPS.map(app => (
                                    <th key={app.id} className="px-4 py-3 font-medium text-center writing-mode-vertical sm:writing-mode-horizontal whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-1">
                                            <span className="truncate max-w-[80px]" title={app.name}>{app.name}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {workers.filter(w => w.status !== '離職').map(worker => (
                                <tr key={worker.id} className="hover:bg-muted/10">
                                    <td className="px-4 py-3 font-medium sticky left-0 bg-white z-10 shadow-[1px_0_0_0_theme(colors.border)] min-w-[120px]">
                                        {worker.name}
                                        {worker.email && <div className="text-xs text-muted-foreground font-normal">{worker.email}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-center sticky left-[120px] bg-white z-10 shadow-[1px_0_0_0_theme(colors.border)]">
                                         <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={worker.is_admin} onChange={() => toggleAdmin(worker.id)} />
                                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </td>
                                    {APPS.map(app => {
                                        const hasAccess = (worker.allowed_apps || []).includes(app.id);
                                        return (
                                            <td key={app.id} className="px-4 py-3 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={hasAccess}
                                                    onChange={() => toggleAppAccess(worker.id, app.id)}
                                                    className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                                                />
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="text-sm text-yellow-600 bg-yellow-50 p-4 rounded-lg flex gap-3 items-start border border-yellow-200 mt-4">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p>管理者は「設定」以外のすべてのアプリのアクセス権をここで設定できます。<br />※新しいアプリを追加した場合は、デフォルトでアクセスできないのでここにチェックを入れてください。</p>
                </div>
            </div>
          )}

          {/* WORKERS TAB */}
          {activeTab === 'workers' && (
              <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">作業員マスター</h3>
                    <button 
                         onClick={() => handleOpenWorkerModal()}
                         className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm">
                        <Plus className="w-4 h-4" />
                        新規追加
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm text-left">
                          <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                              <tr>
                                  <th className="px-4 py-3 font-medium">名前</th>
                                  <th className="px-4 py-3 font-medium">区分</th>
                                  <th className="px-4 py-3 font-medium">メールアドレス</th>
                                  <th className="px-4 py-3 font-medium text-right">操作</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {workers.map(worker => (
                                  <tr key={worker.id} className="hover:bg-muted/10">
                                      <td className="px-4 py-3 font-medium">{worker.name}</td>
                                      <td className="px-4 py-3">
                                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                                              worker.type === '事務員' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                              worker.type === '協力会社' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                              'bg-blue-50 text-blue-700 border-blue-200'
                                          }`}>
                                              {worker.type || '作業員'}
                                          </span>
                                      </td>
                                      <td className="px-4 py-3 text-muted-foreground">{worker.email || '-'}</td>
                                      <td className="px-4 py-3 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                              <button 
                                                  onClick={() => handleOpenWorkerModal(worker)}
                                                  className="p-1.5 min-w-[32px] rounded-md hover:bg-muted text-muted-foreground transition-colors" title="編集">
                                                  <Edit2 className="w-4 h-4 mx-auto" />
                                              </button>
                                              <button 
                                                  onClick={() => handleDeleteWorker(worker.id, worker.name)}
                                                  className="p-1.5 min-w-[32px] rounded-md hover:bg-red-50 hover:text-red-500 text-muted-foreground transition-colors" title="削除">
                                                  <Trash2 className="w-4 h-4 mx-auto" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* VEHICLES TAB */}
          {activeTab === 'vehicles' && (
              <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">車両・建機マスター</h3>
                    <button 
                         onClick={() => handleOpenVehicleModal()}
                         className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm">
                        <Plus className="w-4 h-4" />
                        新規追加
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm text-left">
                          <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
                              <tr>
                                  <th className="px-4 py-3 font-medium">車両・建機名</th>
                                  <th className="px-4 py-3 font-medium">区分</th>
                                  <th className="px-4 py-3 font-medium text-right">操作</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {vehicles.map(vehicle => (
                                  <tr key={vehicle.id} className="hover:bg-muted/10">
                                      <td className="px-4 py-3 font-medium">{vehicle.vehicle_name}</td>
                                      <td className="px-4 py-3">
                                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                                              vehicle.category === '作業車' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                              vehicle.category === '建設機械' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                              vehicle.category === 'その他' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                                              'bg-blue-50 text-blue-700 border-blue-200'
                                          }`}>
                                              {vehicle.category || '一般'}
                                          </span>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                              <button 
                                                  onClick={() => handleOpenVehicleModal(vehicle)}
                                                  className="p-1.5 min-w-[32px] rounded-md hover:bg-muted text-muted-foreground transition-colors" title="編集">
                                                  <Edit2 className="w-4 h-4 mx-auto" />
                                              </button>
                                              <button 
                                                  onClick={() => handleDeleteVehicle(vehicle.id, vehicle.vehicle_name)}
                                                  className="p-1.5 min-w-[32px] rounded-md hover:bg-red-50 hover:text-red-500 text-muted-foreground transition-colors" title="削除">
                                                  <Trash2 className="w-4 h-4 mx-auto" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* APP SETTINGS TAB */}
          {activeTab === 'app-settings' && (
              <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">システム設定</h3>
                        <p className="text-sm text-muted-foreground">システム全体に関わる外部連携設定等を行います。</p>
                    </div>
                    <button 
                        onClick={saveAppSettings}
                        disabled={saving}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        設定を保存
                    </button>
                </div>

                {appSettings && (
                  <div className="max-w-xl space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <div className="space-y-2">
                       <label className="block text-sm font-bold text-slate-700">安否報告アプリ ホームURL</label>
                       <input 
                         type="text" 
                         value={appSettings.safety_app_url || ''} 
                         onChange={e => setAppSettings({...appSettings, safety_app_url: e.target.value})}
                         className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                         placeholder="https://yourapp.example.com"
                       />
                       <p className="text-xs text-muted-foreground">緊急通知のメッセージ内に記載されるURLとして利用されます。</p>
                    </div>

                    <div className="space-y-2">
                       <label className="block text-sm font-bold text-slate-700">Google Chat Webhook URL (安否確認用)</label>
                       <input 
                         type="url" 
                         value={appSettings.safety_webhook_url || ''} 
                         onChange={e => setAppSettings({...appSettings, safety_webhook_url: e.target.value})}
                         className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                         placeholder="https://chat.googleapis.com/v1/spaces/..."
                       />
                       <p className="text-xs text-muted-foreground">Google ChatスペースのWebhook URLを設定すると、管理画面からの一斉通知が届きます。</p>
                    </div>

                    {/* 自動テスト送信設定 */}
                    <div className="pt-6 border-t border-slate-200 space-y-4">
                       <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          定期テスト送信設定
                       </h4>
                       <p className="text-xs text-muted-foreground mt-1 mb-4">
                          年に8回、あらかじめ指定された日時（1月、4月、7月、10月の各2回）にテスト送信を行えます。
                       </p>
                       
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={appSettings.enable_auto_test || false} 
                              onChange={e => setAppSettings({...appSettings, enable_auto_test: e.target.checked})} 
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                          <span className="ml-3 text-sm font-medium text-slate-700">自動テスト送信を有効にする</span>
                       </label>

                       {appSettings.enable_auto_test && (
                           <div className="pl-14 space-y-4 pt-2">
                               <p className="text-sm font-bold text-slate-700 mb-2">送信スケジュール</p>
                               <div className="bg-slate-50 border rounded-md p-4 space-y-6">
                                   {['1', '4', '7', '10'].map(month => {
                                       // Parse JSON from text field, fallback to user's requested defaults
                                       let scheduleData: Record<string, {date: string, time: string}[]> = {
                                           "1": [{date: "9", time: "12:00"}, {date: "18", time: "20:00"}],
                                           "4": [{date: "10", time: "12:00"}, {date: "17", time: "20:00"}],
                                           "7": [{date: "17", time: "12:00"}, {date: "26", time: "20:00"}],
                                           "10": [{date: "7", time: "12:00"}, {date: "15", time: "20:00"}]
                                       };
                                       
                                       try {
                                           if (appSettings.auto_test_schedule && appSettings.auto_test_schedule.startsWith('{')) {
                                               scheduleData = JSON.parse(appSettings.auto_test_schedule);
                                           }
                                       } catch(e) {}
                                       
                                       // Ensure there's an array for this month
                                       const currentMonthData = scheduleData[month] || [{date: "", time: "12:00"}, {date: "", time: "20:00"}];

                                       const updateSchedule = (index: number, field: 'date' | 'time', val: string) => {
                                           const newMonthData = [...currentMonthData];
                                           if (!newMonthData[index]) {
                                               newMonthData[index] = {date: "", time: ""};
                                           }
                                           newMonthData[index] = { ...newMonthData[index], [field]: val };
                                           const newSchedule = { ...scheduleData, [month]: newMonthData };
                                           setAppSettings({ ...appSettings, auto_test_schedule: JSON.stringify(newSchedule) });
                                       }

                                       return (
                                           <div key={month} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center border-b border-slate-200 pb-4 last:border-0 last:pb-0">
                                               <div className="md:col-span-2">
                                                   <span className="text-md font-bold text-slate-800">{month}月</span>
                                               </div>
                                               
                                               <div className="md:col-span-10 flex flex-col xl:flex-row gap-4">
                                                   {/* 1st time slot */}
                                                   <div className="flex flex-1 items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                                                       <span className="text-xs font-black text-slate-500 whitespace-nowrap shrink-0 w-10 text-center">1回目</span>
                                                       <input 
                                                           type="number"
                                                           min="1"
                                                           max="31"
                                                           value={currentMonthData[0]?.date || ''}
                                                           onChange={(e) => updateSchedule(0, 'date', e.target.value)}
                                                           className="w-16 shrink-0 border border-slate-300 rounded-md px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
                                                           placeholder="日"
                                                       />
                                                       <span className="text-sm font-bold text-slate-600 shrink-0">日</span>
                                                       <input 
                                                           type="time"
                                                           value={currentMonthData[0]?.time || ''}
                                                           onChange={(e) => updateSchedule(0, 'time', e.target.value)}
                                                           className="w-full min-w-[110px] border border-slate-300 rounded-md px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                       />
                                                   </div>

                                                   {/* 2nd time slot */}
                                                   <div className="flex flex-1 items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                                                       <span className="text-xs font-black text-slate-500 whitespace-nowrap shrink-0 w-10 text-center">2回目</span>
                                                       <input 
                                                           type="number"
                                                           min="1"
                                                           max="31"
                                                           value={currentMonthData[1]?.date || ''}
                                                           onChange={(e) => updateSchedule(1, 'date', e.target.value)}
                                                           className="w-16 shrink-0 border border-slate-300 rounded-md px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
                                                           placeholder="日"
                                                       />
                                                       <span className="text-sm font-bold text-slate-600 shrink-0">日</span>
                                                       <input 
                                                           type="time"
                                                           value={currentMonthData[1]?.time || ''}
                                                           onChange={(e) => updateSchedule(1, 'time', e.target.value)}
                                                           className="w-full min-w-[110px] border border-slate-300 rounded-md px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                       />
                                                   </div>
                                               </div>
                                           </div>
                                       )
                                   })}
                               </div>
                               <p className="text-xs text-muted-foreground pt-1">※実際に指定時刻に自動送信を行うには、バックエンド（Edge Functions等）の開発が必要です。</p>
                           </div>
                       )}
                    </div>

                    {/* 地震速報連携設定 */}
                    <div className="pt-6 border-t border-slate-200 space-y-4">
                       <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          地震連動アラート設定
                       </h4>
                       
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={appSettings.enable_earthquake_alert || false} 
                              onChange={e => setAppSettings({...appSettings, enable_earthquake_alert: e.target.checked})} 
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                          <span className="ml-3 text-sm font-medium text-slate-700">地震検知による自動一斉送信を有効にする</span>
                       </label>

                       {appSettings.enable_earthquake_alert && (
                           <div className="pl-14 grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div className="space-y-2">
                                   <label className="block text-sm font-bold text-slate-700">発動する震度の閾値</label>
                                   <select
                                       value={appSettings.earthquake_threshold || '6-'}
                                       onChange={e => setAppSettings({...appSettings, earthquake_threshold: e.target.value})}
                                       className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                                   >
                                       <option value="5-">震度5弱以上</option>
                                       <option value="5+">震度5強以上</option>
                                       <option value="6-">震度6弱以上</option>
                                       <option value="6+">震度6強以上</option>
                                       <option value="7">震度7</option>
                                   </select>
                               </div>
                               <div className="space-y-2">
                                   <label className="block text-sm font-bold text-slate-700">対象地域</label>
                                   <input 
                                       type="text" 
                                       value={appSettings.earthquake_target_region || ''} 
                                       onChange={e => setAppSettings({...appSettings, earthquake_target_region: e.target.value})}
                                       className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                                       placeholder="例: 本社周辺、東京都 など"
                                   />
                               </div>
                           </div>
                       )}
                       {appSettings.enable_earthquake_alert && (
                          <p className="text-xs text-muted-foreground pl-14 pt-2">※実際に気象庁データ等と連動して自動送信を行うには、バックエンド（Edge Functions等）の別途開発・設定が必要です。</p>
                       )}
                    </div>
                  </div>
                )}
              </div>
          )}

        </div>
      </div>

      {/* WORKER MODAL */}
      {isWorkerModalOpen && editingWorker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-card w-full max-w-md rounded-xl shadow-lg border animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/20 rounded-t-xl">
                      <h3 className="font-semibold text-lg">{editingWorker.id ? '作業員情報の編集' : '新規作業員の追加'}</h3>
                  </div>
                  <div className="p-6 space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-muted-foreground mb-1">名前 <span className="text-red-500">*</span></label>
                           <input 
                               type="text" 
                               value={editingWorker.name || ''} 
                               onChange={e => setEditingWorker({...editingWorker, name: e.target.value})}
                               className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                               placeholder="山田 太郎"
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-muted-foreground mb-1">区分</label>
                           <select 
                               value={editingWorker.type || '作業員'} 
                               onChange={e => setEditingWorker({...editingWorker, type: e.target.value})}
                               className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                           >
                               <option value="作業員">作業員</option>
                               <option value="協力会社">協力会社</option>
                               <option value="事務員">事務員</option>
                           </select>
                           {editingWorker.type === '事務員' && (
                               <p className="text-xs text-muted-foreground mt-1 px-1">※事務員は現場の日報や予定入力の作業員リストから除外されます。</p>
                           )}
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-muted-foreground mb-1">メールアドレス（ログイン用）</label>
                           <input 
                               type="email" 
                               value={editingWorker.email || ''} 
                               onChange={e => setEditingWorker({...editingWorker, email: e.target.value})}
                               className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                               placeholder="user@example.com"
                           />
                           <p className="text-xs text-muted-foreground mt-1 px-1">※ここに指定したメールアドレスでログインすると自動で権限が適用されます。</p>
                       </div>
                  </div>
                  <div className="px-6 py-4 border-t flex justify-end gap-3 bg-muted/10 rounded-b-xl">
                      <button 
                          onClick={() => setIsWorkerModalOpen(false)}
                          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-md transition-colors"
                      >
                          キャンセル
                      </button>
                      <button 
                          onClick={handleSaveWorker}
                          disabled={workerSaving || !editingWorker.name}
                          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                          {workerSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          保存する
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* VEHICLE MODAL */}
      {isVehicleModalOpen && editingVehicle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-card w-full max-w-md rounded-xl shadow-lg border animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/20 rounded-t-xl">
                      <h3 className="font-semibold text-lg">{editingVehicle.id ? '車両・建機情報の編集' : '新規車両・建機の追加'}</h3>
                  </div>
                  <div className="p-6 space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-muted-foreground mb-1">車両・建機名 <span className="text-red-500">*</span></label>
                           <input 
                               type="text" 
                               value={editingVehicle.vehicle_name || ''} 
                               onChange={e => setEditingVehicle({...editingVehicle, vehicle_name: e.target.value})}
                               className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                               placeholder="ハイエース1号"
                           />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-muted-foreground mb-1">区分</label>
                           <select 
                               value={editingVehicle.category || '一般'} 
                               onChange={e => setEditingVehicle({...editingVehicle, category: e.target.value})}
                               className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary bg-white"
                           >
                               <option value="一般">一般</option>
                               <option value="作業車">作業車</option>
                               <option value="建設機械">建設機械</option>
                               <option value="その他">その他</option>
                           </select>
                       </div>
                  </div>
                  <div className="px-6 py-4 border-t flex justify-end gap-3 bg-muted/10 rounded-b-xl">
                      <button 
                          onClick={() => setIsVehicleModalOpen(false)}
                          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-md transition-colors"
                      >
                          キャンセル
                      </button>
                      <button 
                          onClick={handleSaveVehicle}
                          disabled={vehicleSaving || !editingVehicle.vehicle_name}
                          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                          {vehicleSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          保存する
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  )
}
