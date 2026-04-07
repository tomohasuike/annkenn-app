import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.VITE_GOOGLE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
  console.error("❌ 環境変数が不足しています。");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const BATCH_SIZE = 100;

async function run() {
  console.log(`🚀 既存のDBデータに意味（ベクトル）を強制付与します...`);

  let totalProcessed = 0;

  while (true) {
    // APIの1回あたりの取得上限(デフォルト1000件)を考慮し、未処理のものを1000件ずつ取ってくる
    const { data: materials, error: fetchErr } = await supabase
      .from('materials')
      .select(`id, model_number, name, description, width_mm, height_mm, depth_mm, manufacturers(name)`)
      .is('embedding', null)
      .limit(1000);

    if (fetchErr) {
      console.error("❌ データ取得エラー:", fetchErr);
      break;
    }

    if (!materials || materials.length === 0) {
      console.log("🟢 全データのベクトル化が完全に完了しました！");
      break;
    }

    console.log(`📦 ${materials.length} 件の未処理データを取得。バッチ処理を開始...`);

    for (let i = 0; i < materials.length; i += BATCH_SIZE) {
      const batch = materials.slice(i, i + BATCH_SIZE);
      process.stdout.write(`🔄 バッチ処理中: ${totalProcessed + 1} 〜 ${totalProcessed + batch.length} 件目 ... `);

      const requests = batch.map(item => {
        const mfgName = item.manufacturers?.name || '不明なメーカー';
        const textToEmbed = `
          メーカー: ${mfgName}
          型番: ${item.model_number || '不明'}
          品名: ${item.name || ''}
          説明: ${item.description || ''}
          寸法: 幅${item.width_mm || '-'}mm, 高さ${item.height_mm || '-'}mm, 奥行${item.depth_mm || '-'}mm
        `.trim();
        return { content: { parts: [{ text: textToEmbed }] } };
      });

      try {
        const result = await model.batchEmbedContents({ requests });
        
        // SupabaseのAPIでUPSERTを使うとNOT NULL制約に引っかかるため、個別に並列UPDATEする
        const updatePromises = batch.map((item, index) => 
          supabase
            .from('materials')
            .update({ embedding: result.embeddings[index].values })
            .eq('id', item.id)
        );

        await Promise.all(updatePromises);
        console.log("✅ 完了");
        totalProcessed += batch.length;

      } catch (err) {
        console.log("❌ エラー", err?.message?.substring(0, 50));
      }

      // 無料枠：15 リクエスト/分 (60/15=4秒) に従うため、4.5秒の待機を挟む
      await new Promise(r => setTimeout(r, 4500));
    }
  }

  console.log(`🎉 スクリプト終了。今回 ${totalProcessed} 件の材料が「AI意味検索」に対応しました！`);
}

run();
