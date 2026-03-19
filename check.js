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
    let dashTotal = 0;
    let allTotal = 0;
    let countDash = 0;

    data.forEach(r => {
      const amt = Number(r.amount) || 0;
      if (r.details_status !== '未請求') {
        allTotal += amt;
      }
      const isBilled = ['請求済', '入金済', '完了'].includes(r.details_status);
      if (isBilled && r.billing_date >= '2025-05-01' && r.billing_date <= '2026-04-30') {
        dashTotal += amt;
        countDash++;
      } else if (isBilled) {
        console.log(`EXCLUDED DATE: ID ${r.id}, amt: ${amt}, date: ${r.billing_date}, status: ${r.details_status}`);
      }
    });

    console.log(`Dashboard Calculated Total: ${dashTotal} (${countDash} items)`);
    console.log(`All Billed Total: ${allTotal}`);
  });
