import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data: invoices } = await supabase.from('invoices').select('*, invoice_details(*)')
  const { data: projects } = await supabase.from('projects').select('*')
  
  const getProjectBillingState = (proj) => {
    const relatedInvoices = invoices.filter(inv => inv.project_id === proj.id || (inv.project_ids && inv.project_ids.includes(proj.id)));
    const hasInvoices = relatedInvoices.length > 0;
    
    let isBillingExplicitlyFinalized = false;
    let hasUnpaidInvoice = false;
    let hasUnpaidProgressInvoice = false;

    for (const inv of relatedInvoices) {
      const details = inv.invoice_details || [];
      const hasDetails = details.length > 0;
      let invPaid = true;
      if (!hasDetails) {
        invPaid = false;
      } else {
        for (const d of details) {
          const ds = d.details_status;
          if (ds !== "入金済" && ds !== "完了") {
            invPaid = false;
            break;
          }
        }
      }

      if (!invPaid) {
        hasUnpaidInvoice = true;
        if (inv.billing_category === "出来高") {
          hasUnpaidProgressInvoice = true;
        }
      }

      if (hasDetails && (inv.billing_category === "完成" || inv.billing_category === "一括") && invPaid) {
        isBillingExplicitlyFinalized = true;
      }
    }

    const isProjectPhysicallyCompleted = proj.status_flag === "完工" || proj.status_flag === "完了";
    const isBillingFullyCompleted = hasInvoices && (isBillingExplicitlyFinalized || (isProjectPhysicallyCompleted && !hasUnpaidInvoice));

    if (isBillingFullyCompleted) return "請求済・完工";
    if (hasUnpaidProgressInvoice) return "出来高請求中";
    if (hasUnpaidInvoice) return "一括請求中";
    if (isProjectPhysicallyCompleted) return "完工 (未請求)";
    return "着工中 (未請求)";
  }

  const counts = {}
  projects.forEach(p => {
    const state = getProjectBillingState(p)
    counts[state] = (counts[state] || 0) + 1
  })
  console.log(counts)
}

test()

