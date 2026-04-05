import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message } = await req.json()
    
    // 1. Fetch materials from DB
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    // manufacturer(name) 等の JOIN 記法で関連テーブルも引く
    const { data: materials, error: dbError } = await supabaseClient
      .from('materials')
      .select('*, manufacturers(name), material_categories(name)')

    if (dbError) throw dbError

    // 2. 検索用のナレッジベース文脈を作成
    let knowledgeBase = "【自社でよく使用する材料カタログ（データベース）】\n\n"
    materials?.forEach(m => {
        let makerName = m.manufacturers ? m.manufacturers.name : '不明'
        const spec = JSON.stringify(m.specifications)
        knowledgeBase += `[型番: ${m.model_number}]\n`
        knowledgeBase += `- メーカー: ${makerName}\n`
        knowledgeBase += `- 製品名: ${m.name}\n`
        knowledgeBase += `- 用途: ${m.description}\n`
        knowledgeBase += `- 仕様詳細: ${spec}\n`
        if (m.standard_price) knowledgeBase += `- 参考定価: ${m.standard_price}円\n`
        knowledgeBase += `-----\n`
    })

    const systemPrompt = `あなたは建設現場・電気工事の職人さんからチャットで問い合わせを受ける、気の利く材料手配AIアシスタント「Ann(アン)」です。
以下の【自社でよく使用する材料カタログ（データベース）】の情報を**最優先の知識**として回答してください。

${knowledgeBase}

【ユーザーからの質問】
${message}

【出力のルール】
- カタログにある型番を提案する場合は、仕様や定価も教えてあげてください。
- フレンドリーな敬語（例: 「お疲れ様です！〇〇ですね、お任せください！」など）を使ってください。
- ユーザーに確認事項がある場合は、最後にスマートに質問してください。（例: 「この金具でよろしいですか？」など）
`

    // 3. Gemini API (gemini-2.5-flash)の呼び出し
    const geminiKey = Deno.env.get('VITE_GOOGLE_API_KEY')
    if (!geminiKey) throw new Error("Gemini API Key is not set")
    
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
            temperature: 0.3
        }
      })
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Gemini API Error: ${errorText}`)
    }

    const aiData = await res.json()
    const replyText = aiData.candidates[0].content.parts[0].text

    return new Response(
      JSON.stringify({ text: replyText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
