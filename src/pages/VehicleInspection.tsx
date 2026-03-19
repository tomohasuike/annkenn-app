import React, { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { Truck, Wrench, ShieldCheck, Camera, History, Loader2, Save, AlertTriangle, AlertCircle, X, CheckCircle2, ChevronRight, UploadCloud } from "lucide-react"
import { format, isThisMonth } from "date-fns"
import imageCompression from 'browser-image-compression'

interface Vehicle {
  id: string
  vehicle_name: string
  category: string
  is_inspection_only: boolean
  last_inspected_mileage: number
  last_oil_change_mileage: number
  inspections: any[] // to determine if inspected this month
}

type StatusValue = '異常なし' | '要交換' | '補充済' | 'その他' | ''

interface InspectionFormData {
  current_mileage: string
  oil_status: StatusValue
  coolant_status: StatusValue
  washer_status: StatusValue
  wiper_status: StatusValue
  brake_status: StatusValue
  tire_status: StatusValue
  underbody_status: StatusValue
  lights_status: StatusValue
  notes: string
}

const ITEMS = [
    { key: 'oil_status', label: 'エンジンオイル' },
    { key: 'coolant_status', label: '冷却水' },
    { key: 'washer_status', label: 'ウォッシャー液' },
    { key: 'wiper_status', label: 'ワイパー' },
    { key: 'brake_status', label: 'ブレーキ・クラッチ液' },
    { key: 'tire_status', label: 'タイヤ山・空気圧' },
    { key: 'underbody_status', label: '下回り（損傷等）' },
    { key: 'lights_status', label: 'ライト類' }
] as const

const STATUS_OPTIONS: StatusValue[] = ['異常なし', '要交換', '補充済', 'その他']

export default function VehicleInspection() {
  const [loading, setLoading] = useState(true)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  
  // Modals
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [activeModal, setActiveModal] = useState<'inspection' | 'oil_change' | 'history' | null>(null)
  
  // Forms
  const [formData, setFormData] = useState<InspectionFormData>({
      current_mileage: '',
      oil_status: '異常なし',
      coolant_status: '異常なし',
      washer_status: '異常なし',
      wiper_status: '異常なし',
      brake_status: '異常なし',
      tire_status: '異常なし',
      underbody_status: '異常なし',
      lights_status: '異常なし',
      notes: ''
  })
  const [oilChangeMileage, setOilChangeMileage] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  
  // User info
  const [inspectorId, setInspectorId] = useState<string | null>(null)
  
  // History
  const [historyRecords, setHistoryRecords] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && user.email) {
            const { data: workerMatch } = await supabase.from('worker_master').select('id').ilike('email', user.email).single()
            if (workerMatch) setInspectorId(workerMatch.id)
        }

        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0,0,0,0)

        // Get vehicles (both active and inspection only)
        const { data: vData, error: vErr } = await supabase
            .from('vehicle_master')
            .select('*')
            .eq('is_active', true)
            .neq('category', '建設機械')
            .order('created_at')

        if (vErr) throw vErr

        // Get inspections from this month to figure out inspection status
        const { data: iData } = await supabase
            .from('vehicle_inspections')
            .select('id, vehicle_id, created_at, action_type')
            .gte('created_at', startOfMonth.toISOString())

        const mappedVehicles = (vData || []).map(v => {
            const vehicleInspections = (iData || []).filter(i => i.vehicle_id === v.id)
            return {
                ...v,
                inspections: vehicleInspections
            }
        })

        setVehicles(mappedVehicles)

    } catch (err) {
        console.error("Error fetching vehicles:", err)
    } finally {
        setLoading(false)
    }
  }

  const handleOpenInspection = (vehicle: Vehicle) => {
      setSelectedVehicle(vehicle)
      setFormData({
          current_mileage: vehicle.last_inspected_mileage ? vehicle.last_inspected_mileage.toString() : '',
          oil_status: '異常なし',
          coolant_status: '異常なし',
          washer_status: '異常なし',
          wiper_status: '異常なし',
          brake_status: '異常なし',
          tire_status: '異常なし',
          underbody_status: '異常なし',
          lights_status: '異常なし',
          notes: ''
      })
      setPhotoFile(null)
      setActiveModal('inspection')
  }

  const handleOpenOilChange = (vehicle: Vehicle) => {
      setSelectedVehicle(vehicle)
      setOilChangeMileage(vehicle.last_oil_change_mileage ? vehicle.last_oil_change_mileage.toString() : '')
      setActiveModal('oil_change')
  }

  const handleOpenHistory = async (vehicle: Vehicle) => {
      setSelectedVehicle(vehicle)
      setActiveModal('history')
      setHistoryLoading(true)
      try {
          const { data, error } = await supabase
              .from('vehicle_inspections')
              .select(`
                  id, created_at, action_type, current_mileage, notes, photo_url,
                  inspector:worker_master(name)
              `)
              .eq('vehicle_id', vehicle.id)
              .order('created_at', { ascending: false })
              .limit(15)
          if (!error && data) {
              setHistoryRecords(data)
          }
      } catch (err) {
          console.error(err)
      } finally {
          setHistoryLoading(false)
      }
  }

  const uploadPhoto = async (file: File) => {
      try {
          const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1280 })
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`
          const { data, error } = await supabase.storage.from('inspection_photos').upload(fileName, compressed)
          if (error) throw error
          if (data) {
              const { data: { publicUrl } } = supabase.storage.from('inspection_photos').getPublicUrl(fileName)
              return publicUrl
          }
      } catch (e) {
          console.error("Upload error", e)
          return null
      }
  }

  const saveInspection = async () => {
      if (!selectedVehicle) return
      if (!formData.current_mileage) {
          alert("現在の走行距離を入力してください")
          return
      }

      setSaving(true)
      try {
          let photoUrl = null
          if (photoFile) {
              photoUrl = await uploadPhoto(photoFile)
          }

          const mileageInt = parseInt(formData.current_mileage, 10)

          const payload = {
              vehicle_id: selectedVehicle.id,
              action_type: '点検',
              inspector_id: inspectorId,
              current_mileage: mileageInt,
              ...ITEMS.reduce((acc, item) => ({ ...acc, [item.key]: formData[item.key as keyof InspectionFormData] }), {}),
              notes: formData.notes,
              photo_url: photoUrl
          }

          const { error: insertErr } = await supabase.from('vehicle_inspections').insert([payload])
          if (insertErr) throw insertErr

          const { error: updateErr } = await supabase.from('vehicle_master').update({
              last_inspected_mileage: mileageInt
          }).eq('id', selectedVehicle.id)
          
          if (updateErr) throw updateErr

          alert("点検を記録しました。")
          setActiveModal(null)
          fetchData()
      } catch (err: any) {
          console.error(err)
          alert("エラーが発生しました: " + err.message)
      } finally {
          setSaving(false)
      }
  }

  const saveOilChange = async () => {
      if (!selectedVehicle) return
      if (!oilChangeMileage) {
          alert("現在の走行距離を入力してください")
          return
      }

      setSaving(true)
      try {
          const mileageInt = parseInt(oilChangeMileage, 10)

          const payload = {
              vehicle_id: selectedVehicle.id,
              action_type: 'オイル交換',
              inspector_id: inspectorId,
              current_mileage: mileageInt,
              notes: 'オイル交換（記録のみ）'
          }

          const { error: insertErr } = await supabase.from('vehicle_inspections').insert([payload])
          if (insertErr) throw insertErr

          const { error: updateErr } = await supabase.from('vehicle_master').update({
              last_oil_change_mileage: mileageInt
          }).eq('id', selectedVehicle.id)
          
          if (updateErr) throw updateErr

          alert("オイル交換を記録しました。")
          setActiveModal(null)
          fetchData()
      } catch (err: any) {
          console.error(err)
          alert("エラーが発生しました: " + err.message)
      } finally {
          setSaving(false)
      }
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>

  const uninspectedVehicles = vehicles.filter(v => v.inspections.filter(i => i.action_type === '点検').length === 0)
  const inspectedVehicles = vehicles.filter(v => v.inspections.filter(i => i.action_type === '点検').length > 0)

  const getOilChangeInfo = (v: Vehicle) => {
      const current = Math.max(v.last_inspected_mileage || 0, v.last_oil_change_mileage || 0);
      if (!v.last_oil_change_mileage) return null;
      
      const diff = current - v.last_oil_change_mileage;
      const remaining = 8000 - diff;
      
      return {
          diff,
          remaining,
          isExceeded: diff >= 8000,
          isNear: diff >= 7000 && diff < 8000
      };
  }

  const renderVehicleCard = (v: Vehicle, isInspected: boolean) => {
      const oilInfo = getOilChangeInfo(v);
      
      return (
      <div key={v.id} className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className={`p-4 border-b flex items-start justify-between ${isInspected ? 'bg-muted/30' : 'bg-blue-50/50'}`}>
              <div>
                  <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                          {v.category === '建設機械' ? <Wrench className="w-5 h-5 text-purple-600" /> : <Truck className="w-5 h-5 text-blue-600" />}
                          <h3 className="font-bold text-lg text-foreground">{v.vehicle_name}</h3>
                      </div>
                  </div>
                  
                  {oilInfo && !oilInfo.isExceeded && !oilInfo.isNear && (
                      <p className="text-xs text-muted-foreground font-medium mb-2 opacity-80 mt-1">
                          交換目安まで あと {oilInfo.remaining.toLocaleString()} km
                      </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2">
                       {oilInfo?.isExceeded && (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm border border-red-200">
                             <AlertTriangle className="w-3 h-3" />
                             オイル交換時期 (前回より8000km超過)
                          </span>
                       )}
                       {oilInfo?.isNear && (
                          <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm border border-yellow-300">
                             <AlertTriangle className="w-3 h-3" />
                             まもなく交換時期 (あと {oilInfo.remaining.toLocaleString()}km)
                          </span>
                       )}
                       {isInspected && (
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm border border-green-200">
                             <CheckCircle2 className="w-3 h-3" />
                             今月点検済み
                          </span>
                       )}
                  </div>
              </div>
          </div>
          <div className="p-4 grid grid-cols-2 gap-4 text-sm flex-1">
              <div>
                  <p className="text-muted-foreground text-xs mb-1">前回点検時の距離</p>
                  <p className="font-medium text-foreground">{v.last_inspected_mileage ? `${v.last_inspected_mileage.toLocaleString()} km` : '未記録'}</p>
              </div>
              <div>
                  <p className="text-muted-foreground text-xs mb-1">前回オイル交換時</p>
                  <p className="font-medium text-foreground">{v.last_oil_change_mileage ? `${v.last_oil_change_mileage.toLocaleString()} km` : '未記録'}</p>
              </div>
          </div>
          <div className="p-3 bg-muted/20 border-t grid grid-cols-3 gap-2">
              <button 
                  onClick={() => handleOpenInspection(v)}
                  className={`py-2 px-1 text-center rounded-lg text-sm font-medium transition-colors border shadow-sm ${
                      isInspected ? 'bg-background hover:bg-muted text-foreground' : 'bg-primary hover:bg-primary/90 text-primary-foreground border-primary'
                  }`}
              >
                  {isInspected ? '再点検' : '点検する'}
              </button>
              <button 
                  onClick={() => handleOpenOilChange(v)}
                  className="bg-background hover:bg-muted text-foreground border shadow-sm py-2 px-1 text-center rounded-lg text-sm font-medium transition-colors"
              >
                  オイル交換
              </button>
              <button 
                  onClick={() => handleOpenHistory(v)}
                  className="bg-background hover:bg-muted text-foreground border shadow-sm py-2 px-1 text-center rounded-lg text-sm font-medium transition-colors"
              >
                  履歴
              </button>
          </div>
      </div>
  ); }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <ShieldCheck className="w-7 h-7 text-primary" />
                車両・建機 点検記録
            </h1>
            <p className="text-muted-foreground text-sm mt-1">毎月の定期点検とオイル交換の記録を行います</p>
        </div>
      </div>

      <div className="space-y-6">
          <div className="flex items-center gap-2 border-b pb-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-bold">今月 未点検 ({uninspectedVehicles.length}台)</h2>
          </div>
          {uninspectedVehicles.length === 0 ? (
              <div className="text-center p-8 bg-muted/20 rounded-xl border border-dashed">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">すべての車両の点検が完了しています</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {uninspectedVehicles.map(v => renderVehicleCard(v, false))}
              </div>
          )}

          <div className="flex items-center gap-2 border-b pb-2 mt-12">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-bold">今月 点検済 ({inspectedVehicles.length}台)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80">
              {inspectedVehicles.map(v => renderVehicleCard(v, true))}
          </div>
      </div>

      {/* Inspection Modal */}
      {activeModal === 'inspection' && selectedVehicle && (
          <div className="fixed inset-0 bg-black/60 z-50 flex flex-col md:items-center md:justify-center overflow-y-auto">
              {/* Mobile overlay close area */}
              <div className="fixed inset-0 md:hidden" onClick={() => setActiveModal(null)} />
              
              <div className="bg-background md:rounded-2xl w-full md:w-full md:max-w-2xl flex flex-col min-h-[100dvh] md:min-h-0 md:max-h-[90vh] shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between p-4 border-b bg-card sticky top-0 z-20 md:rounded-t-2xl">
                      <div>
                          <h3 className="font-bold text-lg">{selectedVehicle.vehicle_name} 点検入力</h3>
                          <p className="text-xs text-muted-foreground">前回点検距離: {selectedVehicle.last_inspected_mileage} km</p>
                      </div>
                      <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-muted text-muted-foreground rounded-full transition-colors shrink-0">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 md:pb-6 pb-24">
                      {/* Mileage */}
                      <div className="space-y-2">
                          <label className="text-sm font-bold flex items-center gap-2 text-foreground">
                              現在の走行距離 <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                              <input 
                                  type="number" 
                                  value={formData.current_mileage}
                                  onChange={e => setFormData({...formData, current_mileage: e.target.value})}
                                  className="w-full h-12 rounded-lg border border-input bg-background pl-4 pr-12 text-lg font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                                  placeholder="0"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">km</span>
                          </div>
                      </div>

                      {/* Photo */}
                      <div className="space-y-2">
                          <label className="text-sm font-bold text-foreground">写真（気になる箇所等）</label>
                          <div className="border-2 border-dashed border-input rounded-xl p-4 bg-muted/10 hover:bg-muted/30 transition-colors text-center cursor-pointer relative">
                              <input 
                                  type="file" 
                                  accept="image/*" 
                                  capture="environment"
                                  onChange={e => setPhotoFile(e.target.files?.[0] || null)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              {photoFile ? (
                                  <div className="text-primary font-medium flex items-center justify-center gap-2">
                                      <CheckCircle2 className="w-5 h-5" />
                                      {photoFile.name}
                                  </div>
                              ) : (
                                  <div className="text-muted-foreground flex flex-col items-center gap-2 py-2">
                                      <Camera className="w-8 h-8 opacity-50" />
                                      <span className="text-sm">タップして撮影または画像を選択</span>
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* Status Checklist */}
                      <div className="space-y-4 pt-2">
                          <h4 className="font-bold border-b pb-2 flex items-center gap-2 text-slate-800">
                              <ShieldCheck className="w-5 h-5 text-primary" />
                              点検項目
                          </h4>
                          <div className="grid gap-6">
                              {ITEMS.map(item => (
                                  <div key={item.key} className="space-y-2">
                                      <label className="text-sm font-medium text-slate-700">{item.label}</label>
                                      <div className="flex flex-wrap gap-2">
                                          {STATUS_OPTIONS.map(opt => {
                                              const isSelected = formData[item.key as keyof InspectionFormData] === opt
                                              return (
                                                  <button
                                                      key={opt}
                                                      type="button"
                                                      onClick={() => setFormData({...formData, [item.key]: opt})}
                                                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all border shadow-sm flex-1 sm:flex-none ${
                                                          isSelected 
                                                          ? (opt === '異常なし' ? 'bg-green-600 border-green-700 text-white shadow-md' : 'bg-primary border-primary text-primary-foreground shadow-md') 
                                                          : 'bg-background hover:bg-muted/50 border-input text-slate-600 hover:text-slate-900'
                                                      }`}
                                                  >
                                                      {opt}
                                                  </button>
                                              )
                                          })}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>

                      {/* Notes */}
                      <div className="space-y-2 pt-2">
                          <label className="text-sm font-bold text-foreground">備考・特記事項</label>
                          <textarea 
                              value={formData.notes}
                              onChange={e => setFormData({...formData, notes: e.target.value})}
                              rows={3}
                              className="w-full rounded-lg border border-input bg-background p-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm resize-y"
                              placeholder="気になる点や修理が必要な箇所など"
                          />
                      </div>
                  </div>

                  <div className="p-4 border-t bg-card sticky bottom-0 z-20 md:rounded-b-2xl shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                      <button 
                          onClick={saveInspection}
                          disabled={saving}
                          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          点検を記録する
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Oil Change Modal */}
      {activeModal === 'oil_change' && selectedVehicle && (
           <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-background rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-5 border-b flex justify-between items-center bg-card">
                      <h3 className="font-bold flex items-center gap-2"><Wrench className="w-5 h-5 text-primary" />オイル交換報告</h3>
                      <button onClick={() => setActiveModal(null)} className="text-muted-foreground p-1 hover:bg-muted rounded-full">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">対象車両</p>
                          <p className="font-bold text-lg">{selectedVehicle.vehicle_name}</p>
                      </div>
                      <div className="space-y-2">
                          <label className="text-sm font-bold flex items-center gap-2 text-foreground">
                              交換時の走行距離 <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                              <input 
                                  type="number" 
                                  value={oilChangeMileage}
                                  onChange={e => setOilChangeMileage(e.target.value)}
                                  className="w-full h-12 rounded-lg border border-input bg-background pl-4 pr-12 text-lg font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                                  placeholder="0"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">km</span>
                          </div>
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                          ※入力した距離が「次回オイル交換アラート（8000km）」の基準になります。
                      </p>
                      
                      <button 
                          onClick={saveOilChange}
                          disabled={saving}
                          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-4"
                      >
                          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          オイル交換を記録
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* History Modal */}
      {activeModal === 'history' && selectedVehicle && (
           <div className="fixed inset-0 bg-black/60 z-50 flex flex-col md:items-center md:justify-center overflow-y-auto">
              <div className="fixed inset-0 md:hidden" onClick={() => setActiveModal(null)} />
              <div className="bg-background md:rounded-2xl w-full md:w-full md:max-w-2xl flex flex-col min-h-[100dvh] md:min-h-0 md:max-h-[85vh] shadow-2xl relative z-10 animate-in fade-in zoom-in-95 mt-auto md:mt-0">
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b bg-card sticky top-0 z-20 md:rounded-t-2xl">
                      <div className="flex items-center gap-3">
                          <History className="w-5 h-5 text-muted-foreground" />
                          <h3 className="font-bold text-lg">{selectedVehicle.vehicle_name} 履歴</h3>
                      </div>
                      <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-muted text-muted-foreground rounded-full">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  <div className="p-0 overflow-y-auto flex-1 bg-muted/10">
                      {historyLoading ? (
                           <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                      ) : historyRecords.length === 0 ? (
                           <div className="p-12 text-center text-muted-foreground">点検履歴がありません</div>
                      ) : (
                          <div className="divide-y divide-border/50">
                              {historyRecords.map(record => (
                                  <div key={record.id} className="p-4 sm:p-5 hover:bg-muted/30 transition-colors bg-card">
                                      <div className="flex justify-between items-start mb-2">
                                          <div className="flex items-center gap-2">
                                              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${record.action_type === '点検' ? 'border-primary text-primary bg-primary/5' : 'border-orange-500 text-orange-600 bg-orange-50'}`}>
                                                  {record.action_type}
                                              </span>
                                              <span className="font-bold text-slate-800">{format(new Date(record.created_at), 'yyyy/MM/dd HH:mm')}</span>
                                          </div>
                                          <div className="text-right">
                                              <span className="text-sm font-bold text-slate-700">{record.current_mileage?.toLocaleString() || '0'} km</span>
                                          </div>
                                      </div>
                                      
                                      <div className="text-sm text-slate-600 mt-2 space-y-2">
                                          {record.action_type === '点検' && record.notes && (
                                              <div className="bg-muted/30 p-2 rounded-md">
                                                  <span className="font-bold">特記事項:</span> {record.notes}
                                              </div>
                                          )}
                                          {record.photo_url && (
                                              <div className="mt-2">
                                                  <a href={record.photo_url} target="_blank" rel="noopener noreferrer" className="inline-block">
                                                    <img src={record.photo_url} alt="Record" className="h-20 w-auto rounded border object-cover shadow-sm hover:opacity-80 transition-opacity" />
                                                  </a>
                                              </div>
                                          )}
                                          <div className="text-xs text-muted-foreground text-right mt-2 flex items-center justify-end gap-1">
                                              報告者: {Array.isArray(record.inspector) ? record.inspector[0]?.name : record.inspector?.name || '不明'}
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  )
}
