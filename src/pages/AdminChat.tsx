import { useEffect, useRef, useState } from "react"
import { Bot, Send, Loader2, ShieldAlert, Sparkles } from "lucide-react"
import { supabase } from "../lib/supabase"

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

const EXAMPLE_QUESTIONS = [
  "今月の着工中案件は何件？",
  "先月完工した案件の一覧を出して",
  "カゴメ案件の今月の投入人工は？",
  "請求書がまだの完工案件を教えて",
]

export default function AdminChat() {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
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
      <div className="mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bot className="w-6 h-6 text-primary" /> AIチャット（管理者用）
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          案件データについて自然な言葉で質問できます。（例: 今月の着工中案件は何件？）
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border bg-card p-4 space-y-4 shadow-sm"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
            <Sparkles className="w-8 h-8 text-primary/60" />
            <p className="text-sm text-muted-foreground">こんな質問ができます</p>
            <div className="flex flex-col gap-2 w-full max-w-md">
              {EXAMPLE_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendQuestion(q)}
                  className="text-sm text-left px-4 py-2.5 rounded-lg border bg-background hover:bg-muted/60 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
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
