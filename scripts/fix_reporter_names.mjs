import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing SUPABASE credentials in environment.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function backfillReporterNames() {
  console.log("Fetching reports without reporter_name...")
  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('id, reporter_id, reporter_name')
    .or('reporter_name.is.null,reporter_name.eq.,reporter_name.eq.未設定')

  if (error) {
    console.error("Error fetching reports:", error)
    return
  }

  console.log(`Found ${reports.length} reports needing update.`)

  const userMap = new Map()

  for (const report of reports) {
    if (!report.reporter_id) continue

    let rName = userMap.get(report.reporter_id)

    if (!rName) {
      // Look up user name via worker_master or a stored logic somewhere.
      // Easiest is to fall back to the auth data if available, but admin API is required.
      // For now, if reporter_name is broken, we won't fix it if we can't reliably guess without the email.
    }
  }
}

backfillReporterNames()
