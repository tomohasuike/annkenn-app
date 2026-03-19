import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { parse } from 'csv-parse/sync'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function migrate() {
  const csvFilePath = '/Users/hasuiketomoo/Downloads/車両の点検記録DB - 車両記録.csv'
  const fileContent = fs.readFileSync(csvFilePath, 'utf-8')
  
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  })
  
  console.log(`Found ${records.length} records in CSV.`)

  // Get mappings
  const { data: vehiclesData, error: ve } = await supabase.from('vehicle_master').select('id, vehicle_name')
  if (ve) { console.error(ve); process.exit(1) }
  const { data: workersData, error: we } = await supabase.from('worker_master').select('id, name')
  if (we) { console.error(we); process.exit(1) }

  const vehicleMap = new Map()
  vehiclesData.forEach(v => vehicleMap.set(v.vehicle_name.replace(/"/g, '').trim(), v.id))

  const workerMap = new Map()
  workersData.forEach(w => workerMap.set(w.name.replace(/"/g, '').trim().replace(/　/g, ' '), w.id))

  const mapStatus = (val) => {
    if (!val) return '異常なし'
    if (val === '良好' || val === '異常なし') return '異常なし'
    if (val.includes('交換')) return '要交換'
    if (val.includes('補充')) return '補充済'
    return 'その他'
  }

  const inserts = []

  for (const row of records) {
    const vNameRaw = row['車両名']?.trim()
    const vName = vNameRaw ? vNameRaw.split('-')[0] : null
    const action = row['アクション']?.trim() === 'オイル交換' ? 'オイル交換' : '点検'
    const workerName = row['利用者名']?.trim().replace(/　/g, ' ')
    
    // Fallback lookups
    let vehicleId = null
    if (vName) {
      if (vehicleMap.has(vName)) vehicleId = vehicleMap.get(vName)
      else if (vehicleMap.has(vNameRaw)) vehicleId = vehicleMap.get(vNameRaw)
      else {
        for (const [key, val] of vehicleMap.entries()) {
          if (vNameRaw && key.includes(vNameRaw) || vNameRaw.includes(key) || key.includes(vName)) {
            vehicleId = val
            break
          }
        }
      }
    }

    let workerId = null
    if (workerName) {
        if (workerMap.has(workerName)) {
            workerId = workerMap.get(workerName)
        } else {
            for (const [name, id] of workerMap.entries()) {
                if (name.replace(/\s+/g, '') === workerName.replace(/\s+/g, '')) {
                    workerId = id
                    break
                }
            }
        }
    }

    const currentMileage = row['今回の装甲距離'] ? parseInt(row['今回の装甲距離'].replace(/,/g, ''), 10) : null
    
    const payload = {
      vehicle_id: vehicleId,
      action_type: action,
      inspector_id: workerId,
      current_mileage: isNaN(currentMileage) ? null : currentMileage,
      notes: row['コメント'] || null,
      created_at: new Date(row['日時']).toISOString()
    }

    if (action === '点検') {
      payload.oil_status = mapStatus(row['エンジンオイル'])
      payload.coolant_status = mapStatus(row['クーラント'])
      payload.washer_status = mapStatus(row['ウォッシャー液'])
      payload.wiper_status = mapStatus(row['ワイパー'])
      payload.brake_status = mapStatus(row['ブレーキフルード'])
      payload.tire_status = mapStatus(row['タイヤ'])
      payload.underbody_status = mapStatus(row['車の下回り'])
      payload.lights_status = mapStatus(row['各ライトの点検'])
    }
    
    if (vehicleId) {
        inserts.push(payload)
    } else {
        console.warn(`Could not map vehicle: ${vNameRaw} from row ${row['日時']}`)
    }
  }

  console.log(`Prepared ${inserts.length} inserts.`)
  
  if (inserts.length > 0) {
      // Chunk inserts to avoid max request limits
      const chunkSize = 500
      for (let i = 0; i < inserts.length; i += chunkSize) {
          const chunk = inserts.slice(i, i + chunkSize)
          const { error } = await supabase.from('vehicle_inspections').insert(chunk)
          if (error) {
              console.error(`Insert error at chunk ${i}:`, error)
          }
      }
      console.log("Successfully inserted historical records.")
      
      // Update masters for last mileage
      for (const [vName, vId] of vehicleMap.entries()) {
          const vInserts = inserts.filter(i => i.vehicle_id === vId && i.current_mileage).sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
          if (vInserts.length > 0) {
              const lastI = vInserts.filter(i => i.action_type === '点検').pop()
              const lastO = vInserts.filter(i => i.action_type === 'オイル交換').pop()
              
              const updatePayload = {}
              if (lastI) updatePayload.last_inspected_mileage = lastI.current_mileage
              if (lastO) updatePayload.last_oil_change_mileage = lastO.current_mileage
              
              if (Object.keys(updatePayload).length > 0) {
                  await supabase.from('vehicle_master').update(updatePayload).eq('id', vId)
                  console.log(`Updated last mileage for vehicle ${vName}`)
              }
          }
      }
  }
}

migrate().catch(console.error)
