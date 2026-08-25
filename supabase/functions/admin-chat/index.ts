import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// トークン消費を抑えるため、よくある質問をテンプレート化し、
// AIには「どのテンプレートか」「パラメータは何か」の分類だけをさせる。
// 実際の集計SQLはこちら側で固定のクエリとして実行する。
const TEMPLATES_DESCRIPTION = `あなたは建設会社の案件管理システムに搭載された、質問を分類するアシスタントです。
ユーザーの質問を読み、以下の4種類のテンプレートのいずれかに分類してください。

1. in_progress_count — 現在「着工中」の案件数を数える
   params: { category?: "一般" | "役所" | "川北" | "BPE" (指定がなければ省略) }
2. completed_list — 指定した月に完工した案件の一覧を出す
   params: { period: "this_month" | "last_month" | "all" | "YYYY-MM" }
3. labor_days — 指定した案件・期間の投入人工(のべ人数)を集計する
   params: { project_keyword: string(案件名や現場名の一部), period: "this_month" | "last_month" | "all" | "YYYY-MM" }
4. unbilled_completed — 完工済みだがまだ請求が完了していない案件の一覧を出す
   params: {}

上記のどれにも当てはまらない質問、または情報が不足している質問の場合は template を "unsupported" とし、
clarify にどう聞き直せばよいかの案内を日本語で簡潔に書いてください。
`

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    template: {
      type: "STRING",
      enum: ["in_progress_count", "completed_list", "labor_days", "unbilled_completed", "unsupported"],
    },
    params: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING" },
        period: { type: "STRING" },
        project_keyword: { type: "STRING" },
      },
    },
    clarify: { type: "STRING" },
  },
  required: ["template"],
}

function resolvePeriod(period: string | undefined, now: Date): { year: number; month: number } | null {
  if (!period || period === "all") return null
  if (period === "this_month") return { year: now.getFullYear(), month: now.getMonth() + 1 }
  if (period === "last_month") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  }
  const m = period.match(/^(\d{4})-(\d{1,2})$/)
  if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) }
  return null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { question, history } = await req.json()
    if (!question || typeof question !== "string") {
      return json({ error: "question is required" }, 400)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // --- 呼び出し元が管理者か確認 ---
    const authHeader = req.headers.get("Authorization") ?? ""
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user?.email) {
      return json({ error: "認証情報が確認できませんでした" }, 401)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: worker } = await admin
      .from("worker_master")
      .select("is_admin")
      .eq("email", user.email)
      .single()
    if (!worker?.is_admin) {
      return json({ error: "この機能は管理者のみ利用できます" }, 403)
    }

    // --- Gemini で質問をテンプレートに分類（1質問につき1回のみ呼び出し） ---
    const geminiKey = Deno.env.get("VITE_GOOGLE_API_KEY")
    if (!geminiKey) return json({ error: "Gemini API key not configured" }, 500)

    const contextText =
      Array.isArray(history) && history.length > 0
        ? "直近のやり取り:\n" +
          history
            .slice(-2)
            .map((h: any) => `${h.role === "user" ? "質問" : "回答"}: ${String(h.content).slice(0, 300)}`)
            .join("\n") +
          "\n\n"
        : ""

    const prompt = `${TEMPLATES_DESCRIPTION}\n${contextText}今回の質問: ${question}\n\n指定のJSON形式のみで回答してください。`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    )
    if (!geminiRes.ok) {
      const t = await geminiRes.text()
      throw new Error(`Gemini API error: ${t}`)
    }
    const geminiData = await geminiRes.json()
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    let intent: any
    try {
      intent = JSON.parse(raw)
    } catch {
      intent = { template: "unsupported" }
    }

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }))
    const params = intent.params || {}
    const period = resolvePeriod(params.period, now)

    let reply = ""
    let rows: any[] | undefined

    switch (intent.template) {
      case "in_progress_count": {
        let q = admin.from("projects").select("id", { count: "exact", head: true }).eq("status_flag", "着工中")
        if (params.category) q = q.eq("category", params.category)
        const { count, error } = await q
        if (error) throw error
        reply = `${params.category ? `${params.category}区分の` : ""}現在「着工中」の案件は ${count ?? 0} 件です。`
        break
      }

      case "completed_list": {
        let q = admin
          .from("completion_reports")
          .select("completion_date, projects(project_number, project_name, client_name, site_name)")
          .order("completion_date", { ascending: false })
        if (period) {
          const start = `${period.year}-${String(period.month).padStart(2, "0")}-01`
          const endDate = new Date(period.year, period.month, 1)
          const end = endDate.toISOString().split("T")[0]
          q = q.gte("completion_date", start).lt("completion_date", end)
        }
        const { data, error } = await q.limit(50)
        if (error) throw error
        rows = data || []
        if (rows.length === 0) {
          reply = "該当する完工案件は見つかりませんでした。"
        } else {
          const lines = rows.map((r: any) => {
            const p = Array.isArray(r.projects) ? r.projects[0] : r.projects
            return `・${p?.project_number ?? ""} ${p?.project_name ?? "不明"}（${p?.site_name || p?.client_name || ""}）完工日: ${r.completion_date}`
          })
          reply = `該当する完工案件は ${rows.length} 件です。\n\n${lines.join("\n")}`
        }
        break
      }

      case "labor_days": {
        if (!params.project_keyword) {
          reply = "どの案件か、案件名や現場名の一部を教えてください。"
          break
        }
        let reportsQ = admin
          .from("daily_reports")
          .select("id, report_date, projects!inner(project_name)")
          .not("end_time", "is", null)
          .ilike("projects.project_name", `%${params.project_keyword}%`)
        if (period) {
          const start = `${period.year}-${String(period.month).padStart(2, "0")}-01T00:00:00+09:00`
          const endDate = new Date(period.year, period.month, 1)
          const end = `${endDate.toISOString().split("T")[0]}T00:00:00+09:00`
          reportsQ = reportsQ.gte("report_date", start).lt("report_date", end)
        }
        const { data: reports, error: repErr } = await reportsQ
        if (repErr) throw repErr
        const reportIds = (reports || []).map((r: any) => r.id)
        let laborCount = 0
        if (reportIds.length > 0) {
          const { count, error: countErr } = await admin
            .from("report_personnel")
            .select("id", { count: "exact", head: true })
            .in("report_id", reportIds)
          if (countErr) throw countErr
          laborCount = count || 0
        }
        const firstProj = reports && reports[0] ? (reports[0] as any).projects : null
        const projName = (Array.isArray(firstProj) ? firstProj[0]?.project_name : firstProj?.project_name) || params.project_keyword
        const periodLabel = period ? `${period.year}年${period.month}月` : "全期間"
        reply = `「${projName}」関連の${periodLabel}の投入人工は、延べ ${laborCount} 人工です（対象日報 ${reports?.length || 0} 件より集計）。`
        break
      }

      case "unbilled_completed": {
        const { data: completedProjects, error: cpErr } = await admin
          .from("projects")
          .select("id, project_number, project_name, client_name, site_name")
          .eq("status_flag", "完工")
        if (cpErr) throw cpErr
        const ids = (completedProjects || []).map((p: any) => p.id)
        const billedProjectIds = new Set<string>()
        if (ids.length > 0) {
          const { data: invs, error: invErr } = await admin.from("invoices").select("id, project_id").in("project_id", ids)
          if (invErr) throw invErr
          const invByProject = new Map<string, string[]>()
          ;(invs || []).forEach((i: any) => {
            const arr = invByProject.get(i.project_id) || []
            arr.push(i.id)
            invByProject.set(i.project_id, arr)
          })
          const invIds = (invs || []).map((i: any) => i.id)
          if (invIds.length > 0) {
            const { data: details, error: detErr } = await admin
              .from("invoice_details")
              .select("invoice_id, details_status")
              .in("invoice_id", invIds)
              .in("details_status", ["請求済", "完了", "入金済"])
            if (detErr) throw detErr
            const billedInvoiceIds = new Set((details || []).map((d: any) => d.invoice_id))
            invByProject.forEach((invIdsForProject, projectId) => {
              if (invIdsForProject.some((id) => billedInvoiceIds.has(id))) billedProjectIds.add(projectId)
            })
          }
        }
        rows = (completedProjects || []).filter((p: any) => !billedProjectIds.has(p.id))
        if (rows.length === 0) {
          reply = "完工済みで請求がまだの案件はありません。"
        } else {
          const lines = rows.map((p: any) => `・${p.project_number} ${p.project_name}（${p.site_name || p.client_name || ""}）`)
          reply = `完工済みで請求がまだの案件が ${rows.length} 件あります。\n\n${lines.join("\n")}`
        }
        break
      }

      default: {
        reply =
          intent.clarify ||
          "すみません、その質問にはまだ対応していません。「今月の着工中案件は何件？」「先月完工した案件の一覧」「〇〇案件の今月の投入人工」「請求書がまだの完工案件」のような聞き方をお試しください。"
      }
    }

    return json({ reply, template: intent.template, rows })
  } catch (error: any) {
    console.error("admin-chat error:", error)
    return json({ error: error.message || "unknown error" }, 500)
  }
})
