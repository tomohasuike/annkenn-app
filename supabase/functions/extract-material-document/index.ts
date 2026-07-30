import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const EXTRACTION_PROMPT = `あなたは建設・電気工事の材料注文書/資料を解析するアシスタントです。
この画像に写っている材料表・注文書から、行ごとの品目情報を抽出してください。

以下の厳密なJSON配列のみを出力してください。それ以外のテキストは一切出力しないこと。
[
  { "name": "品名", "manufacturer": "メーカー名(空欄なら空文字)", "quantity": "数量(数字のみ、不明なら空文字)", "unit": "単位(個・巻・m・箱など、不明なら空文字)", "note": "備考(空欄なら空文字)" }
]

品名や数量が読み取れない行、空白行は無視してください。表以外の情報(宛先・日付・会社名等)は抽出しないでください。`

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { report_material_id } = await req.json()
    if (!report_material_id) {
      return new Response(JSON.stringify({ error: "report_material_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: record, error: fetchError } = await supabase
      .from("report_materials")
      .select("id, documentation")
      .eq("id", report_material_id)
      .single()

    if (fetchError || !record) {
      return new Response(JSON.stringify({ error: "record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    let urls: string[] = []
    try {
      const parsed = JSON.parse(record.documentation)
      urls = Array.isArray(parsed) ? parsed : [record.documentation]
    } catch {
      urls = record.documentation ? [record.documentation] : []
    }
    urls = urls.filter(Boolean)

    if (urls.length === 0) {
      return new Response(JSON.stringify({ success: true, extracted: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const geminiKey = Deno.env.get("VITE_GOOGLE_API_KEY")
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "Gemini API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // drive.google.com/file/d/{id}/view 形式はHTMLビューアページを返すため、
    // 画像バイナリを直接返す lh3.googleusercontent.com/d/{id} 形式に統一する
    const toDirectImageUrl = (url: string): string => {
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
      if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`
      }
      return url
    }

    // 大きなバイト列をスプレッド演算子で一度にString.fromCharCodeへ渡すとスタックオーバーフローするため、
    // チャンクに分けて安全にBase64エンコードする
    const toBase64 = (bytes: Uint8Array): string => {
      const chunkSize = 8192
      let binary = ""
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      return btoa(binary)
    }

    const allItems: any[] = []

    for (const rawUrl of urls) {
      const url = toDirectImageUrl(rawUrl)
      try {
        const imgRes = await fetch(url)
        if (!imgRes.ok) continue
        const contentType = imgRes.headers.get("content-type") || "image/png"
        const buffer = await imgRes.arrayBuffer()
        const base64 = toBase64(new Uint8Array(buffer))

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: EXTRACTION_PROMPT },
                  { inlineData: { mimeType: contentType, data: base64 } },
                ],
              }],
              generationConfig: { temperature: 0.1 },
            }),
          }
        )

        if (!geminiRes.ok) continue
        const geminiData = await geminiRes.json()
        let text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]"
        text = text.replace(/```json/g, "").replace(/```/g, "").trim()
        const match = text.match(/\[[\s\S]*\]/)
        if (!match) continue
        const items = JSON.parse(match[0])
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            allItems.push({ ...item, id: crypto.randomUUID(), checked: false, deleted: false })
          })
        }
      } catch (err) {
        console.error(`Failed to process ${url}:`, err)
      }
    }

    const { error: updateError } = await supabase
      .from("report_materials")
      .update({ extracted_materials: allItems })
      .eq("id", report_material_id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true, extracted: allItems }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
