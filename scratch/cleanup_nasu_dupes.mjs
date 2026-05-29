import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("=== 請求重複お掃除スクリプト開始 ===");
  
  const isDryRun = process.argv.includes('--execute') ? false : true;
  if (isDryRun) {
    console.log("⚠️ 現在は【シミュレーション（Dry Run）モード】です。実際の削除は行いません。");
    console.log("実際に削除を実行するには、引数に `--execute` を指定して実行してください。");
  } else {
    console.log("🔥 現在は【本番実行（Execute）モード】です。データベースから該当データを物理削除します。");
  }

  // 1. すべての「おまとめ請求」（project_ids に2件以上のIDが含まれる、または project_ids が設定されている請求）を取得
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id, project_id, project_ids, billing_subject, billing_category, contract_amount');

  if (invError) {
    console.error("請求データの取得に失敗しました:", invError);
    return;
  }

  // おまとめ請求（project_ids に2件以上の要素があるもの）をフィルタリング
  const combinedInvoices = invoices.filter(inv => inv.project_ids && inv.project_ids.length >= 2);
  
  console.log(`\n📦 データベース全体でおまとめ請求は ${combinedInvoices.length} 件見つかりました。`);

  let totalDetailsDeleted = 0;
  let totalInvoicesDeleted = 0;

  for (const combInv of combinedInvoices) {
    console.log(`\n----------------------------------------`);
    console.log(`おまとめ請求: 「${combInv.billing_subject}」`);
    console.log(`  請求ID: ${combInv.id}`);
    console.log(`  金額: ${combInv.contract_amount} 円`);
    console.log(`  代表案件ID: ${combInv.project_id}`);
    console.log(`  合算されている全案件ID (${combInv.project_ids.length}件):`, combInv.project_ids);

    // 代表案件IDを除く、合算されたサブプロジェクト案件たちのID一覧
    const subProjectIds = combInv.project_ids.filter(id => id !== combInv.project_id);
    if (subProjectIds.length === 0) continue;

    // これらのサブプロジェクトIDを個別で持っている（かつおまとめ請求のIDではない）ゾンビ請求レコードを検索
    // ※ project_id が subProjectIds に含まれており、かつ ID が combInv.id ではないもの
    const { data: dupInvoices, error: dupError } = await supabase
      .from('invoices')
      .select('id, project_id, billing_subject, billing_category, contract_amount')
      .in('project_id', subProjectIds)
      .neq('id', combInv.id);

    if (dupError) {
      console.error(`  ⚠️ 重複請求の検索に失敗しました:`, dupError);
      continue;
    }

    // おまとめ請求自体も project_id は代表案件IDなので、 project_ids を持たない「単体」の請求、あるいは
    // 重複して作られてしまった古い請求に絞り込む（今回のバグによるゾンビデータは、合算された案件の project_id に紐づく単体請求）
    const zombieInvoices = dupInvoices.filter(inv => {
      // 念のため、他の無関係なおまとめ請求を誤って削除しないように、
      // 削除対象は project_ids を持たない、または project_ids が1件以下のものに限定
      const otherInv = invoices.find(allInv => allInv.id === inv.id);
      return !otherInv.project_ids || otherInv.project_ids.length <= 1;
    });

    if (zombieInvoices.length === 0) {
      console.log(`  ✅ このおまとめ請求に関連する重複ゾンビデータはありませんでした。`);
      continue;
    }

    console.log(`  🚨 削除対象となるゾンビ個別請求が ${zombieInvoices.length} 件見つかりました:`);
    for (const zombie of zombieInvoices) {
      console.log(`    - ゾンビ請求ID: ${zombie.id}`);
      console.log(`      件名: ${zombie.billing_subject} | 区分: ${zombie.billing_category} | 金額: ${zombie.contract_amount}`);
      console.log(`      対象案件ID: ${zombie.project_id}`);

      // 紐づく請求明細（invoice_details）を検索
      const { data: details, error: detError } = await supabase
        .from('invoice_details')
        .select('id, billing_month, amount')
        .eq('invoice_id', zombie.id);

      if (detError) {
        console.error(`      ⚠️ 明細の取得に失敗しました:`, detError);
        continue;
      }

      console.log(`      明細件数: ${details.length} 件`);
      details.forEach(d => {
        console.log(`        * 明細ID: ${d.id} | 対象月: ${d.billing_month} | 金額: ${d.amount}`);
      });

      if (!isDryRun) {
        // 実際の物理削除処理
        // 1. 明細の削除
        if (details.length > 0) {
          const detailIds = details.map(d => d.id);
          const { error: delDetError } = await supabase
            .from('invoice_details')
            .delete()
            .in('id', detailIds);
          if (delDetError) {
            console.error(`      ❌ 明細削除エラー:`, delDetError);
          } else {
            console.log(`      🧼 明細 ${details.length} 件を削除しました。`);
            totalDetailsDeleted += details.length;
          }
        }

        // 2. 請求本体の削除
        const { error: delInvError } = await supabase
          .from('invoices')
          .delete()
          .eq('id', zombie.id);
        if (delInvError) {
          console.error(`      ❌ 請求本体削除エラー:`, delInvError);
        } else {
          console.log(`      🧼 請求本体を削除しました。`);
          totalInvoicesDeleted++;
        }
      } else {
        totalDetailsDeleted += details.length;
        totalInvoicesDeleted++;
      }
    }
  }

  console.log(`\n================================--------`);
  if (isDryRun) {
    console.log(`シミュレーション結果:`);
    console.log(`  - 削除候補の個別請求: ${totalInvoicesDeleted} 件`);
    console.log(`  - 削除候補の請求明細: ${totalDetailsDeleted} 件`);
    console.log(`※ データベースは変更されていません。`);
  } else {
    console.log(`本番お掃除結果:`);
    console.log(`  - 実際に削除した個別請求: ${totalInvoicesDeleted} 件`);
    console.log(`  - 実際に削除した請求明細: ${totalDetailsDeleted} 件`);
    console.log(`✨ データベースのクリーンアップが正常に完了しました！`);
  }
  console.log("=== 請求重複お掃除スクリプト終了 ===");
}

run();
