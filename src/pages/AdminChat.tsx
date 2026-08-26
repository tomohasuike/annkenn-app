import { useEffect, useRef, useState } from "react"
import { Bot, Send, Loader2, ShieldAlert, Sparkles, ChevronDown, ChevronUp, HelpCircle } from "lucide-react"
import { supabase } from "../lib/supabase"

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

// 4種類のテンプレートそれぞれについて、言い回しが変わっても拾えることが伝わるよう
// 複数の言い方の例を載せている
const EXAMPLE_GROUPS: { label: string; questions: string[] }[] = [
  {
    label: "① 着工中の案件数",
    questions: ["今月の着工中案件は何件？", "今、動いてる現場って何件ある？"],
  },
  {
    label: "② 完工した案件の一覧",
    questions: ["先月完工した案件の一覧を出して", "2026年7月に完工した現場を教えて"],
  },
  {
    label: "③ 案件の投入人工",
    questions: ["カゴメ案件の今月の投入人工は？", "〇〇現場に先月何人工入った？"],
  },
  {
    label: "④ 未請求の完工案件",
    questions: ["請求書がまだの完工案件を教えて", "完工したのに請求してない案件ある？"],
  },
]

export default function AdminChat() {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showExamples, setShowExamples] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        setChecking(false)
        return
      }
      const { data } = await supabase.from("worker_master").select("is_admin").eq("email", user.email).single()
      setIsAdmin(!!data?.is_admin)
      setChecking(false)
    }
    checkAdmin()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  const sendQuestion = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: q }]
    setMessages(nextMessages)
    setInput("")
    if (messages.length === 0) setShowExamples(false)
    setLoading(true)

    try {
      // トークン消費を抑えるため、直近の会話は最小限だけをサーバーに渡す
      const history = messages.slice(-2)
      const { data, error } = await supabase.functions.invoke("admin-chat", {
        body: { question: q, history },
      })

      if (error) {
        let detail = error.message
        try {
          const ctxText = await (error as any).context?.text?.()
          if (ctxText) detail += `\n${ctxText}`
        } catch { /* noop */ }
        throw new Error(detail)
      }
      if (data?.error) throw new Error(data.error)

      setMessages(prev => [...prev, { role: "assistant", content: data?.reply || "回答を取得できませんでした。" }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `エラーが発生しました: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendQuestion(input)
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 確認中...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <ShieldAlert className="w-10 h-10 text-destructive" />
        <p className="font-bold text-lg">この機能は管理者のみ利用できます</p>
        <p className="text-sm text-muted-foreground">アクセスが必要な場合は管理者にお問い合わせください。</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-140px)]">
      <div className="mb-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bot className="w-6 h-6 text-primary" /> AIチャット（管理者用）
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          案件データについて自然な言葉で質問できます。多少言い回しが違っても大丈夫ですが、対応しているのは下の4種類の質問のみです。
        </p>
      </div>

      <div className="mb-3 rounded-xl border bg-card shadow-sm overflow-hidden">
        <button
          onClick={() => setShowExamples(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" /> 対応している質問の例
          </span>
          {showExamples ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showExamples && (
          <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXAMPLE_GROUPS.map(group => (
              <div key={group.label} className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground">{group.label}</span>
                <div className="flex flex-col gap-1.5">
                  {group.questions.map(q => (
                    <button
                      key={q}
                      onClick={() => sendQuestion(q)}
                      disabled={loading}
                      className="text-xs text-left px-3 py-2 rounded-lg border bg-background hover:bg-muted/60 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border bg-card p-4 space-y-4 shadow-sm"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
            <Sparkles className="w-8 h-8 text-primary/60" />
            <p className="text-sm text-muted-foreground">上の質問例をタップするか、自由に質問を入力してください</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted text-foreground px-4 py-2.5 text-sm flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 集計中...
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="質問を入力してください"
          disabled={loading}
          className="flex-1 h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground h-11 w-11 shrink-0 shadow-sm disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
