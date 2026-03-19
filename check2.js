import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) env[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '');
});

const url = env.VITE_SUPABASE_URL + '/rest/v1/invoice_details?select=*';
const options = {
  headers: {
    'apikey': env.VITE_SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + env.VITE_SUPABASE_ANON_KEY
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(data => {
    let dashboardTotal = 0;
    
    let billingPaidTab = 0;
    let billingUnpaidTab = 0;
    
    let unbilledCount = 0;
    let unbilledTotal = 0;

    data.forEach(r => {
      const amt = Number(r.amount) || 0;
      
      // Dashboard calculation
      if (['請求済', '入金済', '完了'].includes(r.details_status)) {
         if (r.billing_date >= '2025-05-01' && r.billing_date <= '2026-04-30') {
           dashboardTotal += amt;
         }
      }
      
      // Billing Paid Tab calculation
      if (['入金済', '完了'].includes(r.details_status)) {
        billingPaidTab += amt;
      }
      
      // Billing Unpaid Tab calculation (everything else)
      if (!['入金済', '完了'].includes(r.details_status)) {
        billingUnpaidTab += amt;
      }
      
      if (r.details_status === '未請求') {
         unbilledCount++;
         unbilledTotal += amt;
      }
    });

    console.log(`Dashboard Total: ${dashboardTotal}`);
    console.log(`Billing Paid Tab: ${billingPaidTab}`);
    console.log(`Billing Unpaid Tab: ${billingUnpaidTab}`);
    console.log(`Billing Paid + Unpaid: ${billingPaidTab + billingUnpaidTab}`);
    console.log(`Difference (Paid+Unpaid - Dashboard): ${(billingPaidTab + billingUnpaidTab) - dashboardTotal}`);
    console.log(`---`);
    console.log(`Unbilled Items: ${unbilledCount} items, Total: ${unbilledTotal}`);
  });
