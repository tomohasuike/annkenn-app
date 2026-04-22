// 蓮池美代子さんの4/18前後の状況を詳細に調べる
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const jst = (ts) => {
  if (!ts) return 'なし';
  const d = new Date(ts);
  const p = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(d);
  const v = {};
  p.forEach(x => { v[x.type] = x.value; });
  return `${v.year}/${v.month}/${v.day} ${v.hour}:${v.minute}:${v.second}`;
};

async function run() {
  console.log('=== 蓮池美代子 詳細診断 ===\n');

  // 蓮池美代子のauth情報
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const miyo = users?.find(u => u.email === 'miyo.hasuike@hitec-inc.co.jp');
  if (miyo) {
    console.log('【Supabase Authアカウント】');
    console.log('  email:', miyo.email);
    console.log('  last_sign_in_at:', jst(miyo.last_sign_in_at));
    console.log('  created_at:', jst(miyo.created_at));
    console.log('  confirmed:', miyo.email_confirmed_at ? 'YES' : 'NO');
    console.log('  user_id (auth):', miyo.id);
  }

  // worker_masterの美代子
  const { data: wm } = await supabase.from('worker_master')
    .select('id, name, email').ilike('name', '%美代子%').single();
  console.log('\n【worker_master】');
  console.log('  id:', wm?.id);
  console.log('  name:', JSON.stringify(wm?.name)); // 全角スペース等を確認
  console.log('  email:', wm?.email);

  // worker_masterのemailとauth emailが一致するか
  if (miyo && wm) {
    const match = wm.email?.toLowerCase() === miyo.email?.toLowerCase();
    console.log('\n  メール一致:', match ? '✅' : `❌ (wm:${wm.email} vs auth:${miyo.email})`);
  }

  // 全safety_reportsを時系列で（美代子のIDで）
  const { data: allReports } = await supabase
    .from('safety_reports')
    .select('id, worker_id, status, created_at')
    .eq('worker_id', wm?.id)
    .order('created_at', { ascending: false });

  console.log(`\n【美代子IDの全safety_reports (${allReports?.length}件)】`);
  allReports?.forEach(r => {
    console.log(`  ${jst(r.created_at)} | ${r.status}`);
  });

  // 4/18の全reports（誰でも）
  const start = new Date('2026-04-17T20:59:00Z').getTime(); // 4/18 05:59 JST = 4/17 20:59 UTC
  const { data: all } = await supabase
    .from('safety_reports')
    .select('id, worker_id, status, created_at')
    .order('created_at', { ascending: false });

  const { data: workers } = await supabase.from('worker_master').select('id, name');
  const wmap = {};
  workers?.forEach(w => { wmap[w.id] = w.name; });

  const apr18 = (all || []).filter(r => new Date(r.created_at).getTime() >= start);
  console.log(`\n【4/18通知以降の全回答 (${apr18.length}件) - 名前順】`);
  apr18.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(r => {
    const name = wmap[r.worker_id] || '❌ 不明';
    console.log(`  ${jst(r.created_at)} | ${name} | ${r.status}`);
  });
}

run().catch(console.error);
