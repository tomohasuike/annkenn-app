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

async function migrateMaster() {
  const csvFilePath = '/Users/hasuiketomoo/Downloads/車両の点検記録DB - 車両名簿.csv'
  const fileContent = fs.readFileSync(csvFilePath, 'utf-8')
  
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  })

  // Get mappings
  const { data: vehiclesData, error: ve } = await supabase.from('vehicle_master').select('id, vehicle_name')
  if (ve) { console.error(ve); process.exit(1) }

  const vehicleMap = new Map()
  vehiclesData.forEach(v => vehicleMap.set(v.vehicle_name.replace(/"/g, '').trim(), v.id))

  let updatedCount = 0

  for (const row of records) {
    const vNameRaw = row['名称']?.trim()
    const vName = vNameRaw ? vNameRaw.split('-')[0] : null
    
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

    if (vehicleId) {
      const oilMileage = row['前回オイル交換距離'] ? parseInt(row['前回オイル交換距離'].replace(/,/g, ''), 10) : null
      const inspectedMileage = row['前回の走行距離'] ? parseInt(row['前回の走行距離'].replace(/,/g, ''), 10) : null
      
      const updates = {}
      if (oilMileage && !isNaN(oilMileage)) updates.last_oil_change_mileage = oilMileage
      if (inspectedMileage && !isNaN(inspectedMileage)) updates.last_inspected_mileage = inspectedMileage
      
      if (Object.keys(updates).length > 0) {
        await supabase.from('vehicle_master').update(updates).eq('id', vehicleId)
        updatedCount++
      }
    }
  }

  console.log(`Updated ${updatedCount} vehicles with legacy master data.`)
}

migrateMaster().catch(console.error)
