export type ResourceItem = { id: string; name: string; category?: string }

export type ReportData = {
  project_id: string
  보고日時: string
  作業区分: string
  作業開始時間: string
  作業終了時間: string
  工事進捗: string
  工事内容: string
  備考: string
  reporter_name?: string
  site_photos?: string
}

export type Personnel = { worker_id: string; worker_name: string; group_id?: string; start_time?: string; end_time?: string; }
export type TimeGroup = { id: string; start_time: string; end_time: string; }
export type Vehicle = { vehicle_id: string; vehicle_name: string }
export type Material = { material_name: string; quantity: string; pending_photos: File[]; pending_docs: File[]; existing_photos: string[]; existing_docs: string[] }
export type Subcontractor = { company_name: string; headcount: string; group_id?: string; }
