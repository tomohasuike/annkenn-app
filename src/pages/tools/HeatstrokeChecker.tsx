import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"
import {
  Thermometer,
  ShieldCheck,
  Save,
  Download,
  Users,
  CloudSun,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Loader2,
  CheckCircle2,
  FileText,
  Clock,
  Heart,
  Smile,
  X,
  ShieldAlert,
  MapPin,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Edit3,
  Send,
  Eye,
} from "lucide-react"
import generatePDF, { Resolution, Margin } from "react-to-pdf"

// ============================================================
// ヘルパー関数
// ============================================================

// タイムゾーンを日本時間に明示してJST日付・時刻をフォーマットするヘルパー
const formatJST = (ts: string | Date, fmt: string): string => {
  if (!ts) return "-"
  const d = typeof ts === "string" ? new Date(ts) : ts
  if (isNaN(d.getTime())) return "-"
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d)
  const p: Record<string, string> = {}
  parts.forEach(x => { p[x.type] = x.value })
  if (fmt === "yyyy/MM/dd HH:mm") return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`
  if (fmt === "MM/dd HH:mm") return `${p.month}/${p.day} ${p.hour}:${p.minute}`
  if (fmt === "yyyy-MM-dd") return `${p.year}-${p.month}-${p.day}`
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`
}

// 栃木県那須塩原市（本社）代表の緯度・経度
const NASUSHIOBARA_LAT = 36.962
const NASUSHIOBARA_LON = 140.016

// 気温と湿度からWBGT（暑さ指数）を近似算出する関数（環境省近似式）
function calculateWBGT(temp: number, humidity: number): number {
  const e = (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (temp + 237.3))
  const wbgt = 0.567 * temp + 0.393 * e + 3.94
  return Math.round(wbgt * 10) / 10
}

// 作業環境タイプに応じたWBGT補正値を返す関数
function getEnvironmentWbgtOffset(envType: string): number {
  if (!envType) return 0.0
  if (envType.includes("屋外（直射日光）")) return 0.0
  if (envType.includes("屋外（日陰）")) return -1.5
  if (envType.includes("屋内（空調なし）")) return -2.0
  if (envType.includes("屋内（空調あり）")) return -4.0
  return 0.0
}

// 睡眠時間の値から表示テキストを返す
function getSleepLabel(sleepHours: number): string {
  if (sleepHours === 3) return "8時間以上 😊"
  if (sleepHours === 2) return "6〜7時間 😐"
  if (sleepHours === 1) return "6時間未満 ⚠️"
  return "未選択"
}

// 睡眠時間のリスク判定（3段階）
function getSleepRisk(sleepHours: number): 0 | 1 | 2 {
  if (sleepHours === 1) return 2  // 6時間未満 → 高リスク
  if (sleepHours === 2) return 1  // 6〜7時間 → 中リスク（最低ライン）
  return 0                         // 8時間以上 or 未選択 → 低リスク
}

// リスクスコアの自動算出ロジック（睡眠3段階対応）
function calcRiskScore(data: {
  sleep_hours: number
  breakfast: boolean | null
  hangover: boolean | null
  symptoms: string
}): "低" | "中" | "高" {
  let score = 0
  const sleepRisk = getSleepRisk(data.sleep_hours)
  score += sleepRisk  // 0, 1, 2
  if (data.breakfast === false) score += 1
  if (data.hangover === true) score += 2  // 二日酔いは重大リスク
  if (data.symptoms && data.symptoms !== "なし") score += 1
  if (score === 0) return "低"
  if (score <= 2) return "中"
  return "高"
}

// 暑さ指数（WBGT）に対応するリスクレベルと安全指針
interface RiskInfo {
  level: "ほぼ安全" | "注意" | "警戒" | "厳重警戒" | "危険"
  emoji: string
  colorClass: string
  bgClass: string
  borderClass: string
  textClass: string
  instruction: string
}

function getRiskLevel(wbgt: number): RiskInfo {
  if (wbgt < 21) return {
    level: "ほぼ安全", emoji: "🟢",
    colorClass: "bg-green-500 text-white",
    bgClass: "bg-green-50 dark:bg-green-950/20",
    borderClass: "border-green-200 dark:border-green-900/30",
    textClass: "text-green-700 dark:text-green-400",
    instruction: "熱中症の危険は小さいですが、適度な水分補給を心がけましょう。"
  }
  if (wbgt < 25) return {
    level: "注意", emoji: "🟡",
    colorClass: "bg-yellow-400 text-slate-800",
    bgClass: "bg-yellow-50 dark:bg-yellow-950/10",
    borderClass: "border-yellow-200 dark:border-yellow-900/20",
    textClass: "text-yellow-700 dark:text-yellow-400",
    instruction: "運動や重労働の際は、定期的な水分・塩分補給を行いましょう。"
  }
  if (wbgt < 28) return {
    level: "警戒", emoji: "🟠",
    colorClass: "bg-orange-500 text-white",
    bgClass: "bg-orange-50 dark:bg-orange-950/20",
    borderClass: "border-orange-200 dark:border-orange-900/30",
    textClass: "text-orange-700 dark:text-orange-400",
    instruction: "熱中症の危険度が高まります。1時間に1回以上の休憩と水分補給を徹底してください。"
  }
  if (wbgt < 31) return {
    level: "厳重警戒", emoji: "🔴",
    colorClass: "bg-red-500 text-white",
    bgClass: "bg-red-50 dark:bg-red-950/20",
    borderClass: "border-red-200 dark:border-red-900/30",
    textClass: "text-red-700 dark:text-red-400",
    instruction: "外出時は直射日光を避け、激しい作業は控えるか十分な休息を取ってください。"
  }
  return {
    level: "危険", emoji: "🔥",
    colorClass: "bg-purple-600 text-white animate-pulse",
    bgClass: "bg-purple-50 dark:bg-purple-950/20",
    borderClass: "border-purple-200 dark:border-purple-900/30",
    textClass: "text-purple-700 dark:text-purple-400",
    instruction: "極めて危険な状態です。作業の中止や冷房の効いた屋内への退避、積極的な水分・塩分補給を最優先してください！"
  }
}

// ============================================================
// 型定義
// ============================================================

interface Project {
  id: string
  project_name: string
  site_name: string
  project_number: string
  category: string
}

interface Assignment {
  id: string
  project_id: string
  worker_id: string
  worker_master: {
    id: string
    name: string
    type: string
    email: string
  }
}

// heatstroke_sessions テーブルの型
interface HeatstrokeSession {
  id: string
  project_id: string | null
  target_date: string
  check_time_type: string
  temperature: number
  humidity: number
  weather: string
  wbgt: number
  risk_level: string
  environment_type: string
  temp_offset: number
  wbgt_actual: number | null
  gps_latitude: number | null
  gps_longitude: number | null
  gps_captured_at: string | null
  created_by: string | null
  foreman_id: string | null    // まとめ役のユーザーID
  confirmed_by: string | null
  confirmed_at: string | null
  foreman_confirmation: Record<string, boolean> | null
  safety_checks: Record<string, boolean> | null
  overall_comment: string | null
  photo_url: string | null
  session_member_overrides: {  // 当日限りのメンバー調整
    added: string[]            // 当日追加メンバーIDの配列
    removed: string[]          // 当日除外メンバーIDの配列
  } | null
  created_at: string
  updated_at: string
}

// heatstroke_worker_checks テーブルの型
interface WorkerCheck {
  id?: string
  session_id?: string
  worker_id: string
  worker_name: string
  // sleep_hours: 0=未選択, 1=6時間未満, 2=6〜7時間, 3=8時間以上
  sleep_hours: number
  breakfast: boolean | null
  hangover: boolean | null
  symptoms: string
  risk_score: "低" | "中" | "高"
  water_checked: boolean
  urine_checked: boolean
  comment: string
  submitted_by: "self" | "foreman"
  submitted_at?: string
}

// セッション設定フォームの状態
interface SessionFormState {
  temperature: number
  humidity: number
  weather: string
  wbgt_actual: string  // 手入力実測値（文字列で保持）
  environment_type: string
  temp_offset: number
  overall_comment: string
  safety_checks: Record<string, boolean>
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function HeatstrokeChecker() {
  // ユーザー情報
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("")
  const [currentWorkerId, setCurrentWorkerId] = useState<string | null>(null)
  const [currentWorkerName, setCurrentWorkerName] = useState<string>("")

  // 選択状態
  const [targetDate, setTargetDate] = useState<string>(formatJST(new Date(), "yyyy-MM-dd"))
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [checkTimeType, setCheckTimeType] = useState<string>("朝")

  // マスタデータ
  const [projects, setProjects] = useState<Project[]>([])
  const [allValidProjects, setAllValidProjects] = useState<Project[]>([])  // 全稼働中の現場
  const [todayProjects, setTodayProjects] = useState<Project[]>([])        // 今日アサインがある現場
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [workerMasterList, setWorkerMasterList] = useState<any[]>([])

  // 気象データ（Open-Meteo）
  const [weatherForecast, setWeatherForecast] = useState<any>(null)
  const [baseTemperature, setBaseTemperature] = useState<number>(25.0)
  const [baseHumidity, setBaseHumidity] = useState<number>(60.0)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<string>("那須塩原本社基準")

  // セッションデータ（DBから取得）
  const [session, setSession] = useState<HeatstrokeSession | null>(null)
  const [allChecks, setAllChecks] = useState<WorkerCheck[]>([])
  const [myCheck, setMyCheck] = useState<WorkerCheck | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // セッション設定フォーム（WBGTパネル）
  const [sessionForm, setSessionForm] = useState<SessionFormState>({
    temperature: 25.0,
    humidity: 60.0,
    weather: "晴れ",
    wbgt_actual: "",
    environment_type: "屋外（日陰）",
    temp_offset: 0.0,
    overall_comment: "",
    safety_checks: { rest_time: false, hydration: false, shade: false, buddy_system: false, clothing: false }
  })

  // 自分の自己申告フォーム
  const [myForm, setMyForm] = useState<Omit<WorkerCheck, "worker_id" | "worker_name" | "risk_score" | "submitted_by">>({
    sleep_hours: 0,
    breakfast: null,
    hangover: null,
    symptoms: "なし",
    water_checked: false,
    urine_checked: false,
    comment: ""
  })
  const [myFormEditing, setMyFormEditing] = useState(false)  // 送信済みを再編集中か

  // まとめ役パネル
  const [foremanPanelOpen, setForemanPanelOpen] = useState(false)
  const [foremanConfirmation, setForemanConfirmation] = useState({
    visual_check: false,   // 全員の顔色・様子を目視で確認した
    risk_followup: false,  // リスクスコアが中・高のメンバーに声をかけた
    work_decision: false   // 今日の作業実施または中止の判断をした
  })
  // 代理入力モーダル
  const [proxyTarget, setProxyTarget] = useState<{ worker_id: string; worker_name: string } | null>(null)
  const [proxyForm, setProxyForm] = useState<Omit<WorkerCheck, "worker_id" | "worker_name" | "risk_score" | "submitted_by">>({
    sleep_hours: 0, breakfast: null, hangover: null,
    symptoms: "なし", water_checked: false, urine_checked: false, comment: ""
  })

  // 管理者ダッシュボード
  const [allSessionsForDate, setAllSessionsForDate] = useState<any[]>([])
  const [adminSelectedSession, setAdminSelectedSession] = useState<any | null>(null)

  // 保存中フラグ
  const [savingSession, setSavingSession] = useState(false)
  const [savingMyCheck, setSavingMyCheck] = useState(false)
  const [savingProxy, setSavingProxy] = useState(false)
  const [savingConfirm, setSavingConfirm] = useState(false)

  // UIモーダル
  const [modalMessage, setModalMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // 音声入力（コメント欄用）
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceSummarizing, setVoiceSummarizing] = useState(false)
  const [voicePreview, setVoicePreview] = useState("")   // リアルタイム認識テキストプレビュー
  const recognitionRef = useRef<any>(null)

  // PDFターゲット
  const pdfTargetRef = useRef<HTMLDivElement>(null)

  // ============================================================
  // 音声入力 → Gemini AI 要約
  // ============================================================

  /**
   * 音声入力を開始し、録音終了後にGeminiで要約してコールバックに渡す
   * @param onResult - 要約されたテキストを受け取るコールバック
   */
  const startVoiceInput = (onResult: (text: string) => void) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setModalMessage({ type: "error", text: "お使いのブラウザは音声入力に対応していません。Chrome をお試しください。" })
      return
    }

    setVoicePreview("") // プレビューリセット

    const recognition = new SpeechRecognition()
    recognition.lang = "ja-JP"
    recognition.continuous = true
    recognition.interimResults = true   // リアルタイムで認識中テキストも取得
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    let finalTranscript = ""  // 確定テキストだけ蓄積

    recognition.onstart = () => setVoiceListening(true)

    // onresult：確定分を蓄積しつつ、確定+中間をリアルタイム表示
    recognition.onresult = (event: any) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += t
        } else {
          interim += t
        }
      }
      // 入力欄にリアルタイムで表示（確定 + 認識中）
      setVoicePreview(finalTranscript + interim)
    }

    recognition.onerror = (event: any) => {
      console.error("SpeechRecognition error:", event.error)
      setVoiceListening(false)
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setModalMessage({ type: "error", text: "音声入力でエラーが発生しました。もう一度お試しください。" })
      }
    }

    // 停止後にGeminiへ送信
    recognition.onend = async () => {
      setVoiceListening(false)
      const transcript = finalTranscript.trim()
      if (!transcript) {
        setVoicePreview("")
        return
      }
      setVoiceSummarizing(true)
      try {
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
        if (!apiKey) throw new Error("Gemini API key not found")

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `あなたは音声テキストのクリーニングツールです。
以下のルールを厳守してください：

【絶対禁止】
・内容を要約する・短くする・言葉を省く
・意味を言い換える

【やること】
・「えー」「あのー」「そのー」「まあ」などのフィラーワードだけを削除する
・それ以外は一切変えない

音声内容：「${transcript}」

クリーニング後の文（文章のみ返答）：`
                }]
              }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 200 }
            })
          }
        )

        if (!res.ok) throw new Error(`Gemini API error: ${res.statusText}`)
        const data = await res.json()
        const cleaned = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || transcript
        setVoicePreview("")
        onResult(cleaned)
      } catch (err) {
        console.warn("Gemini cleaning failed, using raw transcript:", err)
        setVoicePreview("")
        onResult(transcript)
      } finally {
        setVoiceSummarizing(false)
      }
    }

    recognition.start()
  }

  /** 音声入力を停止（onendが発火してGemini処理が走る） */
  const stopVoiceInput = () => {
    recognitionRef.current?.stop()
  }

  // ============================================================
  // 初期化
  // ============================================================

  useEffect(() => {
    initialize()
  }, [])

  useEffect(() => {
    if (targetDate) {
      fetchProjectsAndAssignments()
      fetchWeatherAuto()
      if (isAdmin) fetchAllSessionsForDate()
    }
  }, [targetDate, isAdmin])

  useEffect(() => {
    if (weatherForecast) updateBaseWeather(weatherForecast)
  }, [checkTimeType])

  useEffect(() => {
    if (selectedProjectId && checkTimeType && targetDate) {
      fetchSessionAndChecks()
    } else {
      setSession(null)
      setAllChecks([])
      setMyCheck(null)
    }
  }, [selectedProjectId, checkTimeType, targetDate])

  // セッションが更新された時、フォームの初期値を設定
  useEffect(() => {
    if (session) {
      setSessionForm({
        temperature: session.temperature,
        humidity: session.humidity,
        weather: session.weather,
        wbgt_actual: session.wbgt_actual !== null ? String(session.wbgt_actual) : "",
        environment_type: session.environment_type,
        temp_offset: session.temp_offset,
        overall_comment: session.overall_comment || "",
        safety_checks: session.safety_checks || { rest_time: false, hydration: false, shade: false, buddy_system: false, clothing: false }
      })
      // まとめ役確認状態を復元
      if (session.foreman_confirmation) {
        setForemanConfirmation({
          visual_check: session.foreman_confirmation.visual_check || false,
          risk_followup: session.foreman_confirmation.risk_followup || false,
          work_decision: session.foreman_confirmation.work_decision || false,
        })
      } else {
        setForemanConfirmation({ visual_check: false, risk_followup: false, work_decision: false })
      }
    } else {
      // セッションなし → 気象データから初期値を設定
      setSessionForm(prev => ({
        ...prev,
        temperature: baseTemperature,
        humidity: baseHumidity,
        wbgt_actual: "",
      }))
    }
  }, [session])

  const initialize = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // メールアドレスを正確に取得（前後の空白・大小文字をクレンジング）
        const loginEmail = (user.email || user.user_metadata?.email || "").trim().toLowerCase()
        setCurrentUserEmail(loginEmail)

        // 全作業員マスタをロード（display_order 順）
        const { data: wm } = await supabase
          .from("worker_master")
          .select("id, name, type, is_admin, email")
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })

        const masterList = wm || []
        setWorkerMasterList(masterList)

        // ログインしているメールアドレスに合致する作業員レコードを特定
        if (loginEmail && masterList.length > 0) {
          const resolvedWorker = masterList.find(
            w => (w.email || "").trim().toLowerCase() === loginEmail
          )
          if (resolvedWorker) {
            setIsAdmin(resolvedWorker.is_admin || resolvedWorker.type === "社長" || resolvedWorker.type === "事務員")
            setCurrentWorkerId(resolvedWorker.id)
            setCurrentWorkerName(resolvedWorker.name)
          }
        }
      }
    } catch (e) {
      console.error("初期化エラー:", e)
    } finally {
      setLoading(false)
    }
  }

  // ============================================================
  // 気象データ取得
  // ============================================================

  const fetchWeatherAuto = () => {
    if (!navigator.geolocation) {
      fetchWeatherData()
      return
    }
    setGpsLoading(true)
    setGpsStatus("GPS現在地を測定中...")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: Math.round(position.coords.latitude * 1000) / 1000,
          longitude: Math.round(position.coords.longitude * 1000) / 1000
        }
        setGpsCoords(coords)
        setGpsStatus(`GPS特定済 (${coords.latitude}, ${coords.longitude})`)
        setGpsLoading(false)
        fetchWeatherData(coords)
      },
      () => {
        setGpsCoords(null)
        setGpsStatus("那須塩原本社基準")
        setGpsLoading(false)
        fetchWeatherData()
      },
      { enableHighAccuracy: true, timeout: 5000 }
    )
  }

  const acquireGPS = () => {
    if (!navigator.geolocation) {
      alert("お使いのブラウザはGPS位置情報取得に対応していません。")
      return
    }
    setGpsLoading(true)
    setGpsStatus("GPS現在地を測定中...")
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          latitude: Math.round(position.coords.latitude * 1000) / 1000,
          longitude: Math.round(position.coords.longitude * 1000) / 1000
        }
        setGpsCoords(coords)
        setGpsStatus(`GPS特定済 (${coords.latitude}, ${coords.longitude})`)
        setGpsLoading(false)
        await fetchWeatherData(coords)
      },
      (error) => {
        let errMsg = "位置情報の取得に失敗しました。"
        if (error.code === error.PERMISSION_DENIED) errMsg = "位置情報の利用許可が拒否されました。"
        alert(`${errMsg}\n那須塩原本社の気象基準を使用します。`)
        setGpsStatus("那須塩原本社基準")
        setGpsLoading(false)
        fetchWeatherData()
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  }

  const fetchWeatherData = async (coordsToUse?: { latitude: number; longitude: number }) => {
    try {
      const lat = coordsToUse?.latitude ?? gpsCoords?.latitude ?? NASUSHIOBARA_LAT
      const lon = coordsToUse?.longitude ?? gpsCoords?.longitude ?? NASUSHIOBARA_LON
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m&timezone=Asia%2FTokyo`
      )
      if (res.ok) {
        const data = await res.json()
        setWeatherForecast(data.hourly)
        updateBaseWeather(data.hourly)
      }
    } catch (e) {
      console.error("気象データ取得エラー:", e)
    }
  }

  const updateBaseWeather = (hourly: any) => {
    if (!hourly || !hourly.time) return
    let targetHourStr = "08:00"
    if (checkTimeType === "10時休憩") targetHourStr = "10:00"
    if (checkTimeType === "15時休憩") targetHourStr = "15:00"
    const targetTimeStr = `${targetDate}T${targetHourStr}`
    const index = hourly.time.findIndex((t: string) => t.startsWith(targetTimeStr))
    if (index !== -1) {
      setBaseTemperature(hourly.temperature_2m[index] || 25.0)
      setBaseHumidity(hourly.relative_humidity_2m[index] || 60.0)
    } else {
      setBaseTemperature(25.0)
      setBaseHumidity(60.0)
    }
  }

  // ============================================================
  // プロジェクト・アサイン取得
  // ============================================================

  const fetchProjectsAndAssignments = async () => {
    try {
      const { data: assignData } = await supabase
        .from("assignments")
        .select(`id, project_id, worker_id, worker_master!assignments_worker_id_fkey ( id, name, type, email )`)
        .eq("assignment_date", targetDate)

      const validAssignments = ((assignData || []).filter(a => a.worker_master && a.project_id)) as unknown as Assignment[]
      setAssignments(validAssignments)

      const { data: projData } = await supabase
        .from("projects")
        .select("id, project_name, site_name, project_number, category")
        .order("project_name")

      const validProjects = (projData || []).filter(p => {
        const isVacation = p.project_number === "VACATION" || p.category === "その他" ||
          (p.project_name && p.project_name.includes("休暇"))
        return !isVacation
      })

      const todayProjectIds = new Set(validAssignments.map(a => a.project_id))
      const todayProjects = validProjects.filter(p => todayProjectIds.has(p.id))

      const NO_PROJECT: Project = {
        id: "no-project",
        project_name: "（現場なし／アサインなし）",
        site_name: "現場なし",
        project_number: "NONE",
        category: "現場なし"
      }

      let finalProjects: Project[] = []
      if (todayProjects.length > 0) {
        finalProjects = [NO_PROJECT, ...todayProjects]
      } else {
        finalProjects = [NO_PROJECT, ...validProjects]
      }
      setProjects(finalProjects)
      setAllValidProjects(validProjects)  // 全稼働中の現場を保存
      setTodayProjects(todayProjects)     // 今日の配置現場を保存

      if (!selectedProjectId) {
        const myAssignment = validAssignments.find(a =>
          (a.worker_master?.email || "").trim().toLowerCase() === currentUserEmail
        )
        if (myAssignment) {
          setSelectedProjectId(myAssignment.project_id)
        } else {
          setSelectedProjectId(NO_PROJECT.id)
        }
      }
    } catch (e) {
      console.error("プロジェクト・アサイン取得エラー:", e)
    }
  }

  // ============================================================
  // セッション・個人チェックデータ取得
  // ============================================================

  const fetchSessionAndChecks = async () => {
    try {
      setRefreshing(true)

      // セッション取得
      let sessionQuery = supabase.from("heatstroke_sessions").select("*")
      if (selectedProjectId === "no-project") {
        sessionQuery = sessionQuery.is("project_id", null)
      } else {
        sessionQuery = sessionQuery.eq("project_id", selectedProjectId)
      }
      const { data: sessionData } = await sessionQuery
        .eq("target_date", targetDate)
        .eq("check_time_type", checkTimeType)
        .maybeSingle()

      setSession(sessionData || null)

      if (sessionData) {
        // セッションがある場合は個人チェックも取得
        const { data: checksData } = await supabase
          .from("heatstroke_worker_checks")
          .select("*")
          .eq("session_id", sessionData.id)
          .order("submitted_at", { ascending: true })

        const checks = (checksData || []) as WorkerCheck[]
        setAllChecks(checks)

        // 自分のチェックを検索
        if (currentWorkerId) {
          const mine = checks.find(c => c.worker_id === currentWorkerId)
          setMyCheck(mine || null)
          // 自分のチェックがあれば、フォームに展開
          if (mine) {
            setMyForm({
              sleep_hours: mine.sleep_hours,
              breakfast: mine.breakfast,
              hangover: mine.hangover,
              symptoms: mine.symptoms,
              water_checked: mine.water_checked,
              urine_checked: mine.urine_checked,
              comment: mine.comment || ""
            })
            setMyFormEditing(false)
          } else {
            // 自分のチェックがない場合はフォームを初期化
            setMyForm({
              sleep_hours: 0, breakfast: null, hangover: null,
              symptoms: "なし", water_checked: false, urine_checked: false, comment: ""
            })
            setMyFormEditing(false)
          }
        }
      } else {
        setAllChecks([])
        setMyCheck(null)
        setMyForm({
          sleep_hours: 0, breakfast: null, hangover: null,
          symptoms: "なし", water_checked: false, urine_checked: false, comment: ""
        })
        setMyFormEditing(false)
      }
    } catch (e) {
      console.error("セッション・チェックデータ取得エラー:", e)
    } finally {
      setRefreshing(false)
    }
  }

  // 管理者用：全現場のセッション取得
  const fetchAllSessionsForDate = async () => {
    try {
      const { data } = await supabase
        .from("heatstroke_sessions")
        .select(`
          id, project_id, check_time_type, wbgt, risk_level,
          confirmed_at, confirmed_by, overall_comment,
          weather, environment_type, temperature, humidity,
          safety_checks, foreman_confirmation, updated_at,
          foreman_id, created_by
        `)
        .eq("target_date", targetDate)
      setAllSessionsForDate(data || [])
    } catch (e) {
      console.error("管理者用セッション取得エラー:", e)
    }
  }

  // ============================================================
  // WBGT計算（リアルタイム表示用）
  // ============================================================

  const isActualPrioritized = sessionForm.wbgt_actual !== "" && !isNaN(parseFloat(sessionForm.wbgt_actual))
  const envOffset = getEnvironmentWbgtOffset(sessionForm.environment_type)
  const actualTemp = sessionForm.temperature + sessionForm.temp_offset
  const calculatedWbgt = Math.round((calculateWBGT(actualTemp, sessionForm.humidity) + envOffset) * 10) / 10
  const displayWbgt = isActualPrioritized ? parseFloat(sessionForm.wbgt_actual) : calculatedWbgt
  const currentRisk = getRiskLevel(displayWbgt)

  // セッションのWBGT（確定済みの値）
  const sessionWbgt = session
    ? (session.wbgt_actual !== null ? session.wbgt_actual : session.wbgt)
    : displayWbgt
  const sessionRisk = getRiskLevel(sessionWbgt)

  // ============================================================
  // セッション作成・更新（気象情報の設定）
  // ============================================================

  const handleSetupSession = async () => {
    if (!selectedProjectId) {
      alert("現場を選択してください。")
      return
    }
    setSavingSession(true)
    try {
      const finalWbgt = isActualPrioritized ? parseFloat(sessionForm.wbgt_actual) : calculatedWbgt
      const risk = getRiskLevel(finalWbgt)

      const payload = {
        project_id: selectedProjectId === "no-project" ? null : selectedProjectId,
        target_date: targetDate,
        check_time_type: checkTimeType,
        temperature: actualTemp,
        humidity: sessionForm.humidity,
        weather: sessionForm.weather,
        wbgt: finalWbgt,
        risk_level: risk.level,
        environment_type: sessionForm.environment_type,
        temp_offset: sessionForm.temp_offset,
        wbgt_actual: isActualPrioritized ? parseFloat(sessionForm.wbgt_actual) : null,
        gps_latitude: gpsCoords?.latitude || null,
        gps_longitude: gpsCoords?.longitude || null,
        gps_captured_at: gpsCoords ? new Date().toISOString() : null,
        created_by: session?.created_by || currentWorkerId,  // 初回作成者を保持
        overall_comment: sessionForm.overall_comment || null,
        safety_checks: finalWbgt >= 28 ? sessionForm.safety_checks : null,
        updated_at: new Date().toISOString()
      }

      if (session?.id) {
        // 既存セッションを更新
        const { error } = await supabase
          .from("heatstroke_sessions")
          .update(payload)
          .eq("id", session.id)
        if (error) throw error
      } else {
        // 新規セッション作成
        // 一人モード（誰もいない or 自分だけ）の場合は自動的にまとめ役を自分に設定
        const autoForemanId = isSoloMode ? currentWorkerId : null
        const { error } = await supabase
          .from("heatstroke_sessions")
          .insert([{ ...payload, created_by: currentWorkerId, foreman_id: autoForemanId }])
        if (error) throw error
      }

      setModalMessage({ type: "success", text: "現場の気象・WBGT情報を設定しました！" })
      await fetchSessionAndChecks()
      if (isAdmin) fetchAllSessionsForDate()
    } catch (e: any) {
      console.error("セッション設定エラー:", e)
      setModalMessage({ type: "error", text: "気象情報の設定中にエラーが発生しました: " + e.message })
    } finally {
      setSavingSession(false)
    }
  }

  // ============================================================
  // 自己申告の送信
  // ============================================================

  const handleSubmitMyCheck = async () => {
    if (!session?.id || !currentWorkerId) {
      alert("現場の気象情報が設定されていません。先に「現地の気象を設定する」を押してください。")
      return
    }
    // バリデーション
    if (checkTimeType === "朝") {
      if (myForm.sleep_hours === 0 || myForm.breakfast === null || myForm.hangover === null) {
        alert("睡眠時間・朝食・アルコールの確認が完了していません。すべて選択してから送信してください。")
        return
      }
    }
    if (!myForm.water_checked || !myForm.urine_checked) {
      alert("水分補給・尿色の確認が完了していません。確認してから送信してください。")
      return
    }

    setSavingMyCheck(true)
    try {
      const riskScore = calcRiskScore({
        sleep_hours: myForm.sleep_hours,
        breakfast: myForm.breakfast,
        hangover: myForm.hangover,
        symptoms: myForm.symptoms
      })

      const payload = {
        session_id: session.id,
        worker_id: currentWorkerId,
        worker_name: currentWorkerName,
        sleep_hours: myForm.sleep_hours,
        breakfast: myForm.breakfast,
        hangover: myForm.hangover,
        symptoms: myForm.symptoms,
        risk_score: riskScore,
        water_checked: myForm.water_checked,
        urine_checked: myForm.urine_checked,
        comment: myForm.comment || null,
        submitted_by: "self" as const,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (myCheck?.id) {
        // 既存レコードを更新
        const { error } = await supabase
          .from("heatstroke_worker_checks")
          .update(payload)
          .eq("id", myCheck.id)
        if (error) throw error
      } else {
        // 新規登録
        const { error } = await supabase
          .from("heatstroke_worker_checks")
          .insert([payload])
        if (error) throw error
      }

      setModalMessage({ type: "success", text: `${checkTimeType}の体調申告を送信しました！` })
      setMyFormEditing(false)
      await fetchSessionAndChecks()
    } catch (e: any) {
      console.error("自己申告送信エラー:", e)
      setModalMessage({ type: "error", text: "送信中にエラーが発生しました: " + e.message })
    } finally {
      setSavingMyCheck(false)
    }
  }

  // ============================================================
  // 代理入力（まとめ役）
  // ============================================================

  const openProxyForm = (worker: { worker_id: string; worker_name: string }) => {
    setProxyTarget(worker)
    // 既存のチェックがあれば展開
    const existing = allChecks.find(c => c.worker_id === worker.worker_id)
    if (existing) {
      setProxyForm({
        sleep_hours: existing.sleep_hours,
        breakfast: existing.breakfast,
        hangover: existing.hangover,
        symptoms: existing.symptoms,
        water_checked: existing.water_checked,
        urine_checked: existing.urine_checked,
        comment: existing.comment || ""
      })
    } else {
      setProxyForm({
        sleep_hours: 0, breakfast: null, hangover: null,
        symptoms: "なし", water_checked: false, urine_checked: false, comment: ""
      })
    }
  }

  const handleSubmitProxy = async () => {
    if (!session?.id || !proxyTarget) return
    if (checkTimeType === "朝") {
      if (proxyForm.sleep_hours === 0 || proxyForm.breakfast === null || proxyForm.hangover === null) {
        alert("睡眠時間・朝食・アルコールを確認して選択してください。")
        return
      }
    }
    if (!proxyForm.water_checked || !proxyForm.urine_checked) {
      alert("水分補給・尿色の確認を選択してください。")
      return
    }

    setSavingProxy(true)
    try {
      const riskScore = calcRiskScore({
        sleep_hours: proxyForm.sleep_hours,
        breakfast: proxyForm.breakfast,
        hangover: proxyForm.hangover,
        symptoms: proxyForm.symptoms
      })

      const existing = allChecks.find(c => c.worker_id === proxyTarget.worker_id)
      const payload = {
        session_id: session.id,
        worker_id: proxyTarget.worker_id,
        worker_name: proxyTarget.worker_name,
        sleep_hours: proxyForm.sleep_hours,
        breakfast: proxyForm.breakfast,
        hangover: proxyForm.hangover,
        symptoms: proxyForm.symptoms,
        risk_score: riskScore,
        water_checked: proxyForm.water_checked,
        urine_checked: proxyForm.urine_checked,
        comment: proxyForm.comment || null,
        submitted_by: "foreman" as const,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (existing?.id) {
        const { error } = await supabase
          .from("heatstroke_worker_checks")
          .update(payload)
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("heatstroke_worker_checks")
          .insert([payload])
        if (error) throw error
      }

      setProxyTarget(null)
      await fetchSessionAndChecks()
    } catch (e: any) {
      console.error("代理入力エラー:", e)
      alert("代理入力中にエラーが発生しました: " + e.message)
    } finally {
      setSavingProxy(false)
    }
  }

  // ============================================================
  // まとめ役 最終確認
  // ============================================================

  const handleForemanConfirm = async () => {
    if (!session?.id || !currentWorkerId) return

    // 危険領域では安全指針チェックも必須
    if (sessionWbgt >= 28) {
      const safetyChecks = session.safety_checks || sessionForm.safety_checks
      const incompleteSafety = !safetyChecks.rest_time || !safetyChecks.hydration ||
        !safetyChecks.shade || !safetyChecks.buddy_system || !safetyChecks.clothing
      if (incompleteSafety) {
        alert(`【🚨警告: 暑さ指数危険領域】\nWBGT ${sessionWbgt}℃は危険レベルです。\n安全管理指針（全5項目）を確認してから承認してください。`)
        return
      }
    }

    setSavingConfirm(true)
    try {
      const { error } = await supabase
        .from("heatstroke_sessions")
        .update({
          confirmed_by: currentWorkerId,
          confirmed_at: new Date().toISOString(),
          foreman_confirmation: foremanConfirmation,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id)
      if (error) throw error

      setModalMessage({ type: "success", text: "まとめ役として全員の確認を完了しました！ お疲れ様でした。" })
      await fetchSessionAndChecks()
      if (isAdmin) fetchAllSessionsForDate()
    } catch (e: any) {
      console.error("まとめ役確認エラー:", e)
      setModalMessage({ type: "error", text: "確認処理中にエラーが発生しました: " + e.message })
    } finally {
      setSavingConfirm(false)
    }
  }

  // ============================================================
  // まとめ役担当宣言
  // ============================================================

  const [savingForeman, setSavingForeman] = useState(false)

  const handleSetForeman = async () => {
    if (!session?.id || !currentWorkerId) return
    setSavingForeman(true)
    try {
      const { error } = await supabase
        .from("heatstroke_sessions")
        .update({
          foreman_id: currentWorkerId,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id)
      if (error) throw error
      // ローカルの session state を即時反映
      setSession(prev => prev ? { ...prev, foreman_id: currentWorkerId } : prev)
      setModalMessage({ type: "success", text: "まとめ役を担当します。チームをよろしくお願いします！" })
    } catch (e: any) {
      console.error("まとめ役設定エラー:", e)
      setModalMessage({ type: "error", text: "まとめ役の設定に失敗しました: " + e.message })
    } finally {
      setSavingForeman(false)
    }
  }

  // ============================================================
  // メンバー管理（当日限り追加・除外）
  // ============================================================

  const [savingMember, setSavingMember] = useState(false)

  // 共通: session_member_overrides を更新して state に反映する
  const updateMemberOverrides = async (
    newOverrides: { added: string[]; removed: string[] }
  ) => {
    if (!session?.id) return
    setSavingMember(true)
    try {
      const { error } = await supabase
        .from("heatstroke_sessions")
        .update({
          session_member_overrides: newOverrides,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id)
      if (error) throw error
      setSession(prev => prev ? { ...prev, session_member_overrides: newOverrides } : prev)
    } catch (e: any) {
      console.error("メンバー更新エラー:", e)
      setModalMessage({ type: "error", text: "メンバーの更新に失敗しました: " + e.message })
    } finally {
      setSavingMember(false)
    }
  }

  // 当日追加
  const handleAddMember = async (workerId: string) => {
    const cur = session?.session_member_overrides ?? { added: [], removed: [] }
    if (cur.added.includes(workerId)) return
    await updateMemberOverrides({
      added: [...cur.added, workerId],
      removed: cur.removed.filter(id => id !== workerId) // removedにあれば解除
    })
  }

  // 当日除外
  const handleRemoveMember = async (workerId: string) => {
    const cur = session?.session_member_overrides ?? { added: [], removed: [] }
    if (cur.removed.includes(workerId)) return
    await updateMemberOverrides({
      added: cur.added.filter(id => id !== workerId),  // addedにあれば解除
      removed: [...cur.removed, workerId]
    })
  }

  // 追加・除外を取り消す
  const handleResetMember = async (workerId: string) => {
    const cur = session?.session_member_overrides ?? { added: [], removed: [] }
    await updateMemberOverrides({
      added: cur.added.filter(id => id !== workerId),
      removed: cur.removed.filter(id => id !== workerId)
    })
  }

  // ============================================================
  // PDF出力
  // ============================================================

  const handleExportPDF = async () => {
    const target = pdfTargetRef.current
    if (!target) return
    const parents: { el: HTMLElement; overflow: string; height: string; position: string }[] = []
    let curr = target.parentElement
    while (curr && curr !== document.body) {
      parents.push({ el: curr, overflow: curr.style.overflow, height: curr.style.height, position: curr.style.position })
      curr.style.setProperty("overflow", "visible", "important")
      curr.style.setProperty("height", "auto", "important")
      curr.style.setProperty("position", "static", "important")
      curr = curr.parentElement
    }
    try {
      await new Promise(resolve => setTimeout(resolve, 100))
      const pName = projects.find(p => p.id === selectedProjectId)?.project_name || "現場"
      await generatePDF(() => target, {
        filename: `日常熱中症安否確認表_${pName}_${targetDate}_${checkTimeType}.pdf`,
        page: { format: "A4", margin: Margin.MEDIUM, orientation: "portrait" },
        resolution: Resolution.HIGH,
        canvas: { logging: false, useCORS: true },
        overrides: { canvas: { windowHeight: target.scrollHeight, scrollY: -window.scrollY } }
      })
    } catch (e) {
      setModalMessage({ type: "error", text: "PDF帳票の出力中にエラーが発生しました。" })
    } finally {
      parents.forEach(p => {
        p.el.style.overflow = p.overflow
        p.el.style.height = p.height
        p.el.style.position = p.position
      })
    }
  }

  // ============================================================
  // ユーティリティ
  // ============================================================

  const getProjectDisplayName = (pId: string) => {
    const p = projects.find(proj => proj.id === pId)
    if (!p) return "現場名未設定"
    const num = p.project_number ? `[${p.project_number}] ` : ""
    const suffix = p.site_name ? ` (${p.site_name})` : ""
    return `${num}${p.project_name}${suffix}`
  }

  // 今日のこの現場のアサインメンバー（まとめ役パネル用）
  const siteAssignedWorkers = assignments
    .filter(a => a.project_id === selectedProjectId)
    .map(a => a.worker_master)
    .filter(w => w && !["社長", "事務員", "協力会社"].includes(w.type))

  // まとめ役パネルに表示するメンバー一覧（アサイン + オーバーライド + 申告済み者のユニオン）
  const panelMembers = (() => {
    const overrides = session?.session_member_overrides
    const addedIds   = new Set<string>(overrides?.added   ?? [])
    const removedIds = new Set<string>(overrides?.removed ?? [])
    const assignedIds = new Set(siteAssignedWorkers.map(w => w.id))

    const members: { worker_id: string; worker_name: string; isAssigned: boolean; isAdded: boolean }[] = []

    // アサインメンバーを追加（当日除外対象はスキップ）
    siteAssignedWorkers.forEach(w => {
      if (!removedIds.has(w.id)) {
        members.push({ worker_id: w.id, worker_name: w.name, isAssigned: true, isAdded: false })
      }
    })

    // 当日追加メンバー（アサイン外の人）を追加
    addedIds.forEach(wid => {
      if (!assignedIds.has(wid) && !members.some(m => m.worker_id === wid)) {
        const master = workerMasterList.find(w => w.id === wid)
        if (master) {
          members.push({ worker_id: master.id, worker_name: master.name, isAssigned: false, isAdded: true })
        }
      }
    })

    // 申告済みだがアサインにいない人を追加
    allChecks.forEach(c => {
      if (!assignedIds.has(c.worker_id) && !members.some(m => m.worker_id === c.worker_id)) {
        members.push({ worker_id: c.worker_id, worker_name: c.worker_name, isAssigned: false, isAdded: false })
      }
    })

    // 現場なしの場合、自分を追加（すでに申告済みでない場合）
    if (selectedProjectId === "no-project" && currentWorkerId) {
      const alreadyInList = members.some(m => m.worker_id === currentWorkerId)
      if (!alreadyInList) {
        members.push({ worker_id: currentWorkerId, worker_name: currentWorkerName, isAssigned: false, isAdded: false })
      }
    }

    return members
  })()

  // まとめ役確認が有効かどうか（全員が申告済みかチェック）
  const allMembersChecked = panelMembers.length > 0 &&
    panelMembers.every(m => allChecks.some(c => c.worker_id === m.worker_id))

  // リスクスコアが中・高のメンバー（まとめ役確認の文言に使う）
  const riskMembers = allChecks.filter(c => c.risk_score === "中" || c.risk_score === "高")

  // セッション確認済みかどうか
  const isSessionConfirmed = !!(session?.confirmed_at)

  // まとめ役関連の判定
  const foremanId = session?.foreman_id ?? null
  const iAmForeman = !!currentWorkerId && foremanId === currentWorkerId
  const foremanName = workerMasterList.find(w => w.id === foremanId)?.name ?? null

  // 一人モード（現場なし or 自分以外誰もいない）
  const isSoloMode = selectedProjectId === "no-project" ||
    (siteAssignedWorkers.length <= 1 && siteAssignedWorkers.every(w => w.id === currentWorkerId))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm text-slate-500 font-bold">システムを初期化中...</p>
        </div>
      </div>
    )
  }

  // ============================================================
  // 体調チェックフォームUI（共通パーツ）
  // ============================================================

  // 睡眠時間3段階の選択UI
  const SleepSelector = ({
    value, onChange
  }: {
    value: number
    onChange: (v: number) => void
  }) => (
    <div className="space-y-1 bg-white dark:bg-slate-900 p-3 rounded-lg border shadow-sm border-slate-100">
      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
        昨夜の睡眠時間
      </label>
      <div className="grid grid-cols-3 gap-1.5 mt-1.5 text-xs font-bold">
        {[
          { val: 3, label: "8時間以上", sub: "推奨 😊", activeClass: "bg-green-100 border-green-300 text-green-700" },
          { val: 2, label: "6〜7時間", sub: "最低ライン 😐", activeClass: "bg-yellow-100 border-yellow-300 text-yellow-700" },
          { val: 1, label: "6時間未満", sub: "要注意 ⚠️", activeClass: "bg-red-100 border-red-300 text-red-700 animate-pulse" }
        ].map(item => (
          <button
            key={item.val}
            type="button"
            onClick={() => onChange(item.val)}
            className={`py-3.5 rounded border transition-all text-center ${
              value === item.val
                ? item.activeClass + " font-extrabold"
                : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
            }`}
          >
            <div>{item.label}</div>
            <div className="text-[10px] font-medium mt-0.5">{item.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )

  // 朝食・二日酔いのYes/No選択UI
  const YesNoSelector = ({
    label, value, onChange,
    yesLabel = "あり", noLabel = "なし",
    yesIsRisk = true
  }: {
    label: string
    value: boolean | null
    onChange: (v: boolean) => void
    yesLabel?: string
    noLabel?: string
    yesIsRisk?: boolean
  }) => (
    <div className="space-y-1 bg-white dark:bg-slate-900 p-3 rounded-lg border shadow-sm border-slate-100">
      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">{label}</label>
      <div className="grid grid-cols-2 gap-1.5 mt-1.5 text-xs font-bold">
        <button
          type="button"
          onClick={() => onChange(!yesIsRisk ? true : false)}
          className={`py-3 rounded border transition-all ${
            value === (!yesIsRisk ? true : false)
              ? "bg-blue-100 border-blue-200 text-blue-700 font-extrabold"
              : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
          }`}
        >
          {noLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(yesIsRisk ? true : false)}
          className={`py-3 rounded border transition-all ${
            value === (yesIsRisk ? true : false)
              ? "bg-red-100 border-red-200 text-red-700 font-extrabold animate-pulse"
              : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
          }`}
        >
          {yesLabel}⚠️
        </button>
      </div>
    </div>
  )

  // 体調フォームのフィールド群（自己申告・代理入力で共用）
  const CheckFormFields = ({
    data,
    onChange
  }: {
    data: typeof myForm
    onChange: (fields: Partial<typeof myForm>) => void
  }) => {
    const onUpdate = (fields: Partial<typeof myForm>) => {
      const updated = { ...data, ...fields }
      // リスクスコアの自動再計算（表示用）
      onChange(fields)
    }

    return (
      <div className="space-y-3">
        {/* 朝の項目 */}
        {checkTimeType === "朝" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SleepSelector value={data.sleep_hours} onChange={v => onUpdate({ sleep_hours: v })} />
            <YesNoSelector
              label="朝食の摂取"
              value={data.breakfast}
              onChange={v => onUpdate({ breakfast: v })}
              yesLabel="なし"
              noLabel="あり"
              yesIsRisk={false}
            />
            <YesNoSelector
              label="アルコール・二日酔い"
              value={data.hangover}
              onChange={v => onUpdate({ hangover: v })}
              yesLabel="あり"
              noLabel="なし"
            />
          </div>
        )}

        {/* 全時間帯共通 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 水分補給 */}
          <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">水分・塩分補給</label>
            <button
              type="button"
              onClick={() => onUpdate({ water_checked: !data.water_checked })}
              className={`w-full py-3.5 mt-1.5 rounded-md border font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
                data.water_checked
                  ? "bg-green-500 border-green-600 text-white shadow-sm"
                  : "bg-slate-50 border-slate-200 text-slate-400"
              }`}
            >
              <Smile className="w-4 h-4" />
              {data.water_checked ? "補給ヨシ！" : "未確認"}
            </button>
          </div>

          {/* 尿色 */}
          <div className="space-y-1 bg-white dark:bg-slate-900 p-3 rounded-lg border shadow-sm border-slate-100">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">尿色（水分充足確認）</label>
            <button
              type="button"
              onClick={() => onUpdate({ urine_checked: !data.urine_checked })}
              className={`w-full py-3.5 mt-1.5 rounded-md border font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
                data.urine_checked
                  ? "bg-green-500 border-green-600 text-white shadow-sm"
                  : "bg-slate-50 border-slate-200 text-slate-400"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              {data.urine_checked ? "尿色問題なし" : "未確認"}
            </button>
          </div>

          {/* 自覚症状 */}
          <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">自覚症状・体調不良</label>
            <select
              value={data.symptoms || "なし"}
              onChange={e => onUpdate({ symptoms: e.target.value })}
              className="w-full h-8 px-1.5 mt-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-bold text-[10px] outline-none cursor-pointer"
            >
              <option value="なし">異常なし</option>
              <option value="頭痛">頭痛あり⚠️</option>
              <option value="めまい">めまいあり⚠️</option>
              <option value="吐き気">吐き気あり⚠️</option>
              <option value="倦怠感">体がダルい⚠️</option>
            </select>
          </div>
        </div>

        {/* 個別メモ */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border shadow-sm border-slate-100">
          <label className="text-xs font-black text-slate-500 dark:text-slate-400 block flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-blue-500" />
            気になる点・個別メモ（任意）
          </label>
          <div className="flex gap-2 mt-1.5">
            <input
              type="text"
              value={voiceListening ? voicePreview : (data.comment || "")}
              onChange={e => { if (!voiceListening && !voiceSummarizing) onUpdate({ comment: e.target.value }) }}
              placeholder={voiceSummarizing ? "✨ AI整形中..." : "（例：昨日無理をした、少し頭が重い 等）"}
              className="flex-1 h-11 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 rounded-lg font-bold text-sm outline-none focus:border-blue-500 placeholder:text-slate-400 placeholder:font-normal text-slate-800 dark:text-slate-200"
              readOnly={voiceListening || voiceSummarizing}
            />
            <button
              type="button"
              onClick={() => {
                if (voiceListening) {
                  stopVoiceInput()
                } else {
                  startVoiceInput((text) => onUpdate({ comment: text }))
                }
              }}
              disabled={voiceSummarizing}
              title={voiceListening ? "タップして録音停止" : "音声でコメントを入力"}
              className={`h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg text-sm transition-all ${
                voiceListening
                  ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200"
                  : voiceSummarizing
                  ? "bg-purple-100 text-purple-400 cursor-wait"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-blue-50 hover:text-blue-500"
              }`}
            >
              {voiceSummarizing ? "✨" : voiceListening ? "⏹" : "🎤"}
            </button>
          </div>
          {(voiceListening || voiceSummarizing) && (
            <p className="text-xs mt-1.5 font-bold"
               style={{ color: voiceListening ? "#ef4444" : "#a855f7" }}>
              {voiceListening
                ? "🔴 録音中... 話してください。終わったら ⏹ を押してください"
                : "✨ Gemini AIが整形中..."}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ============================================================
  // レンダリング
  // ============================================================

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 pb-12 overflow-x-hidden bg-slate-50 dark:bg-slate-950/20 min-h-screen text-slate-800 dark:text-slate-200">

      {/* =====================================================
          ① ヘッダー：タイトル・日付・時間帯・現場選択
      ===================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-xl shrink-0">
              <Thermometer className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">日常・熱中症アラート</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                自己申告 + まとめ役確認モデル v2.0
              </p>
            </div>
          </div>

          {/* 日付・時間帯選択 */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200/50 dark:border-slate-700 w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-800 dark:text-slate-100 outline-none w-full"
              />
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/50 dark:border-slate-700 w-full sm:w-auto text-xs font-bold">
              {["朝", "10時休憩", "15時休憩"].map(type => (
                <button
                  key={type}
                  onClick={() => setCheckTimeType(type)}
                  className={`py-2.5 px-2 rounded-md transition-all text-center ${
                    checkTimeType === type
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm font-extrabold"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 現場選択 */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap shrink-0">
            対象現場:
          </label>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
          >
            <option value="" disabled>現場を選択してください</option>
            {/* 現場なし（アサインなし）は常に先頭 */}
            <option value="no-project">（現場なし／アサインなし）（現場なし）</option>
            {/* 今日アサインがある現場 */}
            {todayProjects.length > 0 && (
              <optgroup label="📅 今日の配置">
                {todayProjects.map(p => (
                  <option key={p.id} value={p.id}>{getProjectDisplayName(p.id)}</option>
                ))}
              </optgroup>
            )}
            {/* 今日の配置以外の稼働中現場（急遽変更・応援など） */}
            {(() => {
              const otherProjects = allValidProjects.filter(
                p => !todayProjects.some(tp => tp.id === p.id)
              )
              if (otherProjects.length === 0) return null
              return (
                <optgroup label="🔄 その他の現場（急遽変更・応援など）">
                  {otherProjects.map(p => (
                    <option key={p.id} value={p.id}>{getProjectDisplayName(p.id)}</option>
                  ))}
                </optgroup>
              )
            })()}
          </select>
          {refreshing && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
        </div>
      </div>

      {/* =====================================================
          ② 管理者監視ダッシュボード（管理者のみ）
      ===================================================== */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-start justify-between border-b pb-3 border-slate-100 dark:border-slate-800 gap-2 min-w-0">
            <h2 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100 flex items-start gap-2 min-w-0">
              <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <span className="leading-snug">管理者用：本日（{targetDate}）の全稼働現場安否監視一覧</span>
            </h2>
            <button
              onClick={() => { fetchProjectsAndAssignments(); fetchAllSessionsForDate() }}
              className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-50 rounded-lg transition-colors shrink-0"
              title="データを更新"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => {
              const siteSessions = allSessionsForDate.filter(s => {
                if (p.id === "no-project") return s.project_id === null
                return s.project_id === p.id
              })
              const siteAssignments = assignments.filter(a => a.project_id === p.id)
              const hasAssignments = siteAssignments.length > 0

              if (p.id === "no-project" && siteSessions.length === 0) return null
              if (p.id !== "no-project" && !hasAssignments && siteSessions.length === 0) return null

              return (
                <div key={p.id} className="border border-slate-100 dark:border-slate-800/80 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between space-y-3 shadow-sm hover:border-slate-200 transition-colors">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate" title={getProjectDisplayName(p.id)}>
                      {getProjectDisplayName(p.id)}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-bold mt-1">
                      アサイン: {siteAssignments.map(a => a.worker_master?.name).join(", ") || "なし"}
                    </p>
                    {/* まとめ役表示 */}
                    {(() => {
                      // この現場のいずれかのセッションから foreman_id を取得
                      const foremanId = siteSessions.find(s => s.foreman_id)?.foreman_id
                      const foremanName = foremanId
                        ? (workerMasterList.find(w => w.id === foremanId)?.name || '不明')
                        : null
                      return foremanName ? (
                        <p className="text-[11px] font-extrabold mt-0.5 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-blue-500 shrink-0" />
                          <span className="text-blue-600 dark:text-blue-400">まとめ役: {foremanName}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] font-bold mt-0.5 text-slate-300 dark:text-slate-600 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 shrink-0" />
                          <span>まとめ役: 未設定</span>
                        </p>
                      )
                    })()}
                  </div>

                  <div className="grid grid-cols-3 gap-1 bg-white dark:bg-slate-950 p-1.5 rounded-lg border text-center text-[10px] font-bold">
                    {["朝", "10時休憩", "15時休憩"].map(time => {
                      const s = siteSessions.find(ss => ss.check_time_type === time)
                      const isConfirmed = s?.confirmed_at
                      return (
                        <button
                          key={time}
                          disabled={!s}
                          onClick={() => {
                            if (s) setAdminSelectedSession({ projectName: getProjectDisplayName(p.id), timeType: time, ...s })
                          }}
                          className={`py-1.5 rounded transition-all ${
                            s
                              ? isConfirmed
                                ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 hover:bg-green-200 cursor-pointer shadow-sm"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 hover:bg-yellow-200 cursor-pointer shadow-sm"
                              : "bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400 opacity-60 cursor-not-allowed"
                          }`}
                        >
                          <div>{time}</div>
                          <div className="text-[10px] font-black mt-0.5">
                            {s ? (isConfirmed ? "確認済✅" : "申告中🟡") : "未登録"}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =====================================================
          ③ WBGTパネル（現場の気象情報設定）
      ===================================================== */}
      <div className={`rounded-xl border p-5 transition-all ${session ? sessionRisk.bgClass + " " + sessionRisk.borderClass : "bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800"} shadow-sm`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <CloudSun className="w-5 h-5 text-slate-600 dark:text-slate-400 shrink-0" />
            <h2 className="font-bold text-sm text-slate-700 dark:text-slate-300 min-w-0">
              📡 現場の気象情報 ＆ 暑さ指数（WBGT）設定
            </h2>
            {session && (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-black shrink-0">
                設定済
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={acquireGPS}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 hover:bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black rounded-lg border border-slate-200/50 shadow-sm transition-all disabled:opacity-60 cursor-pointer"
            >
              <MapPin className={`w-3.5 h-3.5 ${gpsLoading ? "animate-spin text-blue-500" : ""}`} />
              {gpsLoading ? "GPS測定中..." : "現在地の気象を取得"}
            </button>
          </div>
        </div>

        {/* GPS状態表示 */}
        {gpsStatus && (
          <div className="text-[11px] text-slate-400 font-bold mb-3 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {gpsStatus}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側：設定項目（モバイルでは下に） */}
          <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">

            {/* 🌡️ 現地測定器の実測WBGT入力（最優先） */}
            <div className="space-y-2 p-4 bg-white/90 dark:bg-slate-900/60 rounded-xl border border-slate-200/40 shadow-sm">
              <div className="flex justify-between items-center">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>🌡️ 現地WBGT測定器の実測値</span>
                  <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-black tracking-wider uppercase">推奨・最優先</span>
                </label>
                {isActualPrioritized && (
                  <span className="text-[10px] text-orange-600 font-extrabold bg-orange-50 px-2 py-0.5 rounded border border-orange-200/30">
                    実測値モード起動中
                  </span>
                )}
              </div>
              <div className="relative rounded-lg shadow-sm">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="45"
                  value={sessionForm.wbgt_actual}
                  onChange={e => setSessionForm(prev => ({ ...prev, wbgt_actual: e.target.value }))}
                  placeholder="測定値を入力（例: 28.5）"
                  className="w-full h-11 pl-3 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-orange-400 shadow-inner"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <span className="text-sm font-bold">℃</span>
                </div>
              </div>
              <span className="block text-[10px] text-slate-400 leading-relaxed">
                現場にWBGT測定器がある場合は、その数値を直接入力してください。GPS・気象データからの自動計算値を上書きして、最優先で使用します。
              </span>
            </div>

            {/* GPS気象データ（実測がない場合の代替） */}
            <div className={`space-y-3 p-4 bg-white/80 dark:bg-slate-900/50 rounded-xl border border-slate-200/40 shadow-sm ${isActualPrioritized ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 border-b pb-2 border-slate-200/40">
                <span>📡 GPS気象データから自動計算</span>
                {isActualPrioritized && <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">（実測値優先のため無効）</span>}
              </div>

              {/* 気温・湿度 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/80 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/30">
                  <span className="text-xs text-slate-400 font-bold block mb-1">
                    {isActualPrioritized ? "参考予測気温" : "予測気温"}
                  </span>
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                    {(sessionForm.temperature + sessionForm.temp_offset).toFixed(1)} <span className="text-sm font-medium">℃</span>
                  </span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/30">
                  <span className="text-xs text-slate-400 font-bold block mb-1">予測湿度</span>
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                    {sessionForm.humidity.toFixed(1)} <span className="text-sm font-medium">%</span>
                  </span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/30 relative overflow-hidden">
                  {isActualPrioritized && (
                    <div className="absolute top-0 right-0 bg-orange-500 text-[9px] text-white px-1.5 py-0.5 rounded-bl font-black">
                      参考値
                    </div>
                  )}
                  <span className="text-xs text-slate-400 font-bold block mb-1">算出WBGT</span>
                  <span className={`text-2xl font-black ${isActualPrioritized ? "text-slate-400" : sessionRisk.textClass}`}>
                    {calculatedWbgt.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* 天気・環境タイプ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">現地の天気</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs font-bold">
                    {["晴れ", "曇り", "雨", "屋内"].map(w => (
                      <button
                        key={w}
                        disabled={isActualPrioritized}
                        onClick={() => setSessionForm(prev => ({ ...prev, weather: w }))}
                        className={`py-2 rounded-lg border transition-all ${
                          sessionForm.weather === w
                            ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                            : "bg-slate-50 dark:bg-slate-950 border-slate-200 text-slate-600 hover:text-slate-800"
                        } disabled:opacity-40`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">作業・休憩環境</label>
                  <select
                    value={sessionForm.environment_type}
                    disabled={isActualPrioritized}
                    onChange={e => setSessionForm(prev => ({ ...prev, environment_type: e.target.value }))}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold outline-none focus:border-blue-500 cursor-pointer disabled:opacity-40"
                  >
                    <option value="屋外（直射日光）">屋外（直射日光）</option>
                    <option value="屋外（日陰）">屋外（日陰）</option>
                    <option value="屋内（空調なし）">屋内（空調なし）</option>
                    <option value="屋内（空調あり）">屋内（空調あり）</option>
                  </select>
                </div>
              </div>

              {/* 体感温度微調整スライダー */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className={`text-xs font-bold uppercase tracking-wide ${isActualPrioritized ? "text-slate-300" : "text-slate-500"}`}>
                    体感温度の微調整
                  </label>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-blue-100 text-blue-600">
                    {sessionForm.temp_offset > 0 ? `+${sessionForm.temp_offset}` : sessionForm.temp_offset} ℃
                  </span>
                </div>
                <input
                  type="range"
                  min="-3.0"
                  max="3.0"
                  step="0.5"
                  value={sessionForm.temp_offset}
                  disabled={isActualPrioritized}
                  onChange={e => setSessionForm(prev => ({ ...prev, temp_offset: parseFloat(e.target.value) }))}
                  className={`w-full h-2 rounded-lg appearance-none accent-blue-600 ${isActualPrioritized ? "bg-slate-100 cursor-not-allowed opacity-40" : "bg-slate-200 cursor-pointer"}`}
                />
              </div>
            </div>

            {/* 🚨 危険領域（WBGT 28℃以上）における安全管理指針チェック */}
            {displayWbgt >= 28 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 border-b border-red-200/40 pb-2">
                  <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse text-red-600" />
                  <span className="font-extrabold text-xs sm:text-sm tracking-wide">🚨 【危険領域】安全管理指針 実施確認（全項目必須）</span>
                </div>
                <div className="space-y-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  {[
                    { key: "rest_time", label: "⏱️ 適切な休憩の確保", desc: "1時間に1回以上の適切な休憩を指示・実施した" },
                    { key: "hydration", label: "💧 水分・塩分補給の徹底", desc: "作業前および休憩時の積極的な補給を確認した" },
                    { key: "shade", label: "⛱️ 遮光・冷却設備の設置", desc: "日よけや涼しい休憩場所を確保・整備した" },
                    { key: "buddy_system", label: "👥 バディシステムの実施", desc: "お互いの体調変化を監視し合う体制を組ませた" },
                    { key: "clothing", label: "👕 適切な装備・服装の確認", desc: "ファン付き作業服・適切な帽子などの着用を促した" }
                  ].map(item => (
                    <label
                      key={item.key}
                      className="flex items-start gap-2 p-2 bg-white/80 dark:bg-slate-900/40 hover:bg-white border border-slate-100 rounded-lg cursor-pointer transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={sessionForm.safety_checks[item.key as keyof typeof sessionForm.safety_checks] || false}
                        onChange={e => setSessionForm(prev => ({
                          ...prev,
                          safety_checks: { ...prev.safety_checks, [item.key]: e.target.checked }
                        }))}
                        className="w-4 h-4 mt-0.5 rounded text-blue-600 cursor-pointer accent-blue-600"
                      />
                      <div className="space-y-0.5 ml-1">
                        <span className="block font-black text-slate-800 dark:text-slate-200">{item.label}</span>
                        <span className="block text-[9px] text-slate-500 font-medium">{item.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 現場全体の特記事項 */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-500" />
                現場全体の指示事項・特記事項（任意）
              </label>
              <div className="relative">
                <textarea
                  rows={3}
                  value={sessionForm.overall_comment}
                  onChange={e => setSessionForm(prev => ({ ...prev, overall_comment: e.target.value }))}
                  placeholder={voiceListening ? "🎤 話してください..." : voiceSummarizing ? "✨ AI整形中..." : "本日の熱中症対策、作業指示、全体への伝達事項など"}
                  readOnly={voiceListening || voiceSummarizing}
                  className="w-full p-3 pr-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-blue-500 placeholder:text-slate-400 placeholder:font-normal"
                />
                {/* 🎤 音声入力ボタン（右下に絶対配置） */}
                <button
                  type="button"
                  onClick={() => {
                    if (voiceListening) {
                      stopVoiceInput()
                    } else {
                      startVoiceInput((text) =>
                        setSessionForm(prev => ({ ...prev, overall_comment: text }))
                      )
                    }
                  }}
                  disabled={voiceSummarizing}
                  title={voiceListening ? "タップして録音停止" : "音声で指示事項を入力"}
                  className={`absolute bottom-2 right-2 h-9 w-9 flex items-center justify-center rounded-lg text-sm transition-all ${
                    voiceListening
                      ? "bg-red-500 text-white animate-pulse shadow-md shadow-red-200"
                      : voiceSummarizing
                      ? "bg-purple-100 text-purple-400 cursor-wait"
                      : "bg-white dark:bg-slate-800 text-slate-400 hover:bg-blue-50 hover:text-blue-500 border border-slate-200"
                  }`}
                >
                  {voiceSummarizing ? "✨" : voiceListening ? "⏹" : "🎤"}
                </button>
              </div>
              {(voiceListening || voiceSummarizing) && (
                <p className="text-xs font-bold"
                   style={{ color: voiceListening ? "#ef4444" : "#a855f7" }}>
                  {voiceListening
                    ? "🔴 録音中... 話してください。終わったら ⏹ を押してください"
                    : "✨ Gemini AIが整形中..."}
                </p>
              )}
            </div>

          </div>

          {/* 右側：WBGTメーター（モバイルでは上に表示） */}
          <div className="flex flex-col items-center justify-center gap-4 order-1 lg:order-2">
            {/* 円形メーター */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="absolute w-full h-full transform -rotate-90">
                <circle cx="80" cy="80" r="66" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                <circle
                  cx="80" cy="80" r="66"
                  stroke="currentColor" strokeWidth="10" fill="transparent"
                  strokeDasharray="415"
                  strokeDashoffset={415 - (415 * Math.min(Math.max(displayWbgt, 15), 35)) / 40}
                  className={
                    displayWbgt < 21 ? "text-green-500" :
                    displayWbgt < 25 ? "text-yellow-400" :
                    displayWbgt < 28 ? "text-orange-500" :
                    displayWbgt < 31 ? "text-red-500" : "text-purple-600"
                  }
                />
              </svg>
              <div className="text-center z-10 space-y-1">
                <span className={`text-3xl font-black ${currentRisk.textClass}`}>
                  {displayWbgt.toFixed(1)}
                </span>
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  WBGT INDEX
                </span>
                {isActualPrioritized && (
                  <span className="block text-[9px] font-black text-orange-600 bg-orange-100 rounded px-1">
                    現地実測
                  </span>
                )}
              </div>
            </div>

            {/* リスクレベル表示 */}
            <div className={`px-4 py-2 rounded-full text-sm font-black ${currentRisk.colorClass}`}>
              {currentRisk.emoji} {currentRisk.level}
            </div>

            <p className={`text-xs font-bold text-center leading-relaxed ${currentRisk.textClass}`}>
              {currentRisk.instruction}
            </p>

            {/* 気象情報設定ボタン */}
            <button
              onClick={handleSetupSession}
              disabled={savingSession || !selectedProjectId}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {savingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {session ? "気象情報を更新する" : "現場の気象を設定する"}
            </button>
            <p className="text-[10px] text-slate-400 text-center font-medium">
              現地到着後に押してください（再取得・修正いつでも可能）
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          ④ 自己申告フォーム（本人の体調入力）
      ===================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex justify-between items-start gap-2 border-b pb-3 border-slate-100 dark:border-slate-800 min-w-0">
          <h2 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200 text-sm sm:text-base min-w-0">
            <Heart className="w-5 h-5 text-red-500 shrink-0" />
            <span className="leading-snug">自分の体調を自己申告する{currentWorkerName && <span className="text-sm text-slate-500 font-normal">（{currentWorkerName}）</span>}</span>
          </h2>

          {/* 申告済み・未申告バッジ */}
          {myCheck && !myFormEditing ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-black">
                <CheckCircle2 className="w-3.5 h-3.5" />
                申告済み {formatJST(myCheck.submitted_at || "", "MM/dd HH:mm")}
              </span>
              <button
                onClick={() => setMyFormEditing(true)}
                className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full font-black transition-all"
              >
                <Edit3 className="w-3 h-3" />
                修正する
              </button>
            </div>
          ) : (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-black">
              未申告
            </span>
          )}
        </div>

        {/* セッションがない場合の案内 */}
        {!session && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              まだ現場の気象情報が設定されていません
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              上の「現場の気象を設定する」ボタンを押してから体調を申告してください。<br />
              （まとめ役 or 最初に現地に着いた人が押します）
            </p>
          </div>
        )}

        {/* 申告済み表示（編集モードでない場合） */}
        {myCheck && !myFormEditing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {checkTimeType === "朝" && (
                <>
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    <span className="text-slate-400 font-bold block mb-1">睡眠時間</span>
                    <span className="font-extrabold text-slate-800">{getSleepLabel(myCheck.sleep_hours)}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    <span className="text-slate-400 font-bold block mb-1">朝食</span>
                    <span className={`font-extrabold ${myCheck.breakfast ? "text-green-600" : "text-red-500"}`}>
                      {myCheck.breakfast ? "あり ✅" : "なし ⚠️"}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    <span className="text-slate-400 font-bold block mb-1">二日酔い</span>
                    <span className={`font-extrabold ${myCheck.hangover ? "text-red-500" : "text-green-600"}`}>
                      {myCheck.hangover ? "あり ⚠️" : "なし ✅"}
                    </span>
                  </div>
                </>
              )}
              <div className="bg-slate-50 p-3 rounded-lg border">
                <span className="text-slate-400 font-bold block mb-1">健康リスク</span>
                <span className={`font-extrabold ${
                  myCheck.risk_score === "低" ? "text-green-600" :
                  myCheck.risk_score === "中" ? "text-yellow-600" : "text-red-600"
                }`}>
                  {myCheck.risk_score}リスク
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border">
                <span className="text-slate-400 font-bold block mb-1">水分補給</span>
                <span className={`font-extrabold ${myCheck.water_checked ? "text-green-600" : "text-red-500"}`}>
                  {myCheck.water_checked ? "確認済 ✅" : "未確認 ⚠️"}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border">
                <span className="text-slate-400 font-bold block mb-1">尿色確認</span>
                <span className={`font-extrabold ${myCheck.urine_checked ? "text-green-600" : "text-red-500"}`}>
                  {myCheck.urine_checked ? "問題なし ✅" : "未確認 ⚠️"}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border">
                <span className="text-slate-400 font-bold block mb-1">自覚症状</span>
                <span className={`font-extrabold ${myCheck.symptoms !== "なし" ? "text-red-600 animate-pulse" : "text-green-600"}`}>
                  {myCheck.symptoms !== "なし" ? myCheck.symptoms + " ⚠️" : "異常なし ✅"}
                </span>
              </div>
            </div>
            {myCheck.comment && (
              <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200/40 text-xs font-bold text-blue-800 dark:text-blue-300">
                📝 {myCheck.comment}
              </div>
            )}
            {myCheck.submitted_by === "foreman" && (
              <div className="text-[11px] text-slate-400 bg-slate-50 px-3 py-1 rounded-lg border inline-block">
                ※ まとめ役による代理入力
              </div>
            )}
          </div>
        )}

        {/* 申告フォーム（未申告 or 修正モード） */}
        {((!myCheck && session) || myFormEditing) && (
          <div className="space-y-4">
            <CheckFormFields
              data={myForm}
              onChange={fields => setMyForm(prev => ({ ...prev, ...fields }))}
            />

            {/* リスクスコアプレビュー */}
            {(() => {
              const preview = calcRiskScore({
                sleep_hours: myForm.sleep_hours,
                breakfast: myForm.breakfast,
                hangover: myForm.hangover,
                symptoms: myForm.symptoms
              })
              return (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold ${
                  preview === "低" ? "bg-green-50 text-green-700 border border-green-200" :
                  preview === "中" ? "bg-yellow-50 text-yellow-700 border border-yellow-200" :
                  "bg-red-50 text-red-700 border border-red-200 animate-pulse"
                }`}>
                  <ShieldCheck className="w-4 h-4" />
                  現在の健康リスク判定: <span className="font-extrabold ml-1">{preview}リスク</span>
                </div>
              )
            })()}

            <div className="flex gap-3">
              <button
                onClick={handleSubmitMyCheck}
                disabled={savingMyCheck || !session}
                className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {savingMyCheck ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                <span>{myCheck ? "体調申告を修正・更新する" : "体調を自己申告する"}</span>
              </button>
              {myFormEditing && (
                <button
                  onClick={() => setMyFormEditing(false)}
                  className="px-5 h-12 bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold rounded-xl transition-all"
                >
                  キャンセル
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================
          ⑤ まとめ役パネル（グループ確認・代理入力・最終承認）
          一人モードの場合は非表示
      ===================================================== */}
      {!isSoloMode && session && (
        <div className={`rounded-xl border shadow-sm ${
          isSessionConfirmed
            ? "bg-green-50 dark:bg-green-950/10 border-green-200 dark:border-green-900/30"
            : "bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800"
        }`}>
          {/* まとめ役パネルヘッダー（タップで展開） */}
          <button
            onClick={() => setForemanPanelOpen(!foremanPanelOpen)}
            className="w-full flex justify-between items-center p-5 text-left gap-2"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <UserCheck className={`w-5 h-5 shrink-0 ${isSessionConfirmed ? "text-green-600" : "text-blue-500"}`} />
              <h2 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-snug">
                👥 まとめ役パネル：チェック状況 ＆ 最終確認
              </h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black shrink-0 ${
                isSessionConfirmed
                  ? "bg-green-100 text-green-700"
                  : allMembersChecked
                  ? "bg-yellow-100 text-yellow-700 animate-pulse"
                  : "bg-red-100 text-red-600"
              }`}>
                {isSessionConfirmed ? "✅ 確認完了" :
                  allMembersChecked ? "承認待ち" :
                  `${allChecks.length}/${panelMembers.length}名 申告済み`
                }
              </span>
            </div>
            {foremanPanelOpen ? <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />}
          </button>

          {foremanPanelOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">

              {/* まとめ役未定・担当バナー */}
              {!isSessionConfirmed && (
                <>
                  {/* まとめ役が決まっていない場合 */}
                  {!foremanId && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                        <div>
                          <p className="font-extrabold text-amber-800 dark:text-amber-300 text-sm">
                            まとめ役がまだ決まっていません
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            「私がまとめ役になる」ボタンを押した方が代理入力・最終承認を操作できます
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleSetForeman}
                        disabled={savingForeman || !currentWorkerId || !session?.id}
                        title={!currentWorkerId ? "先に自分の名前を選択してください" : ""}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold rounded-xl shadow-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {savingForeman ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                        ✋ 私がまとめ役になる
                      </button>
                    </div>
                  )}

                  {/* 自分がまとめ役の場合 */}
                  {iAmForeman && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                      <p className="text-sm font-extrabold text-blue-700 dark:text-blue-300">
                        あなたがまとめ役です。代理入力・最終承認を操作できます。
                      </p>
                    </div>
                  )}

                  {/* 他の人がまとめ役の場合 */}
                  {foremanId && !iAmForeman && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                        まとめ役: <span className="font-extrabold text-slate-800 dark:text-slate-200">{foremanName}</span> さんが担当中です
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* 確認済みバナー */}
              {isSessionConfirmed && (
                <div className="bg-green-100 dark:bg-green-950/30 border border-green-300/50 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                  <div>
                    <p className="font-extrabold text-green-800 dark:text-green-300 text-sm">
                      まとめ役による確認が完了しています
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                      確認者: {workerMasterList.find(w => w.id === session.confirmed_by)?.name || "不明"} |
                      確認日時: {formatJST(session.confirmed_at || "", "MM/dd HH:mm")}
                    </p>
                  </div>
                </div>
              )}

              {/* メンバー申告状況一覧 */}
              <div className="space-y-2">
                {panelMembers.map(member => {
                  const check = allChecks.find(c => c.worker_id === member.worker_id)
                  const riskColor = check?.risk_score === "低" ? "text-green-600" :
                    check?.risk_score === "中" ? "text-yellow-600 animate-pulse" : "text-red-600 animate-pulse"

                  return (
                    <div
                      key={member.worker_id}
                      className={`flex flex-col gap-2 p-3 rounded-xl border text-sm transition-all ${
                        check
                          ? check.risk_score === "高"
                            ? "bg-red-50 border-red-200 dark:bg-red-950/10"
                            : check.risk_score === "中"
                            ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/10"
                            : "bg-green-50/50 border-green-100 dark:bg-green-950/5"
                          : "bg-slate-50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-700"
                      }`}
                    >
                      {/* 上行：名前 + リスクスコア */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${check ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{member.worker_name}</span>
                            {member.isAdded && (
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                                当日追加
                              </span>
                            )}
                            {!member.isAssigned && !member.isAdded && (
                              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                当日参加
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {check ? (
                            <>
                              <span className={`text-xs font-extrabold ${riskColor}`}>
                                {check.risk_score}リスク
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {formatJST(check.submitted_at || "", "HH:mm")}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-red-500 font-extrabold">未提出</span>
                          )}
                        </div>
                      </div>
                      {/* 下行：ボタン群（まとめ役のみ表示） */}
                      {!isSessionConfirmed && iAmForeman && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-bold">
                            {check?.submitted_by === "foreman" ? "代理入力" : "本人申告"}
                          </span>
                          <button
                            onClick={() => openProxyForm(member)}
                            disabled={savingMember}
                            className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded-lg font-extrabold border border-blue-200/40 transition-all"
                          >
                            {check ? "修正" : "代理入力"}
                          </button>
                          {member.isAdded ? (
                            <button
                              onClick={() => handleResetMember(member.worker_id)}
                              disabled={savingMember}
                              className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-500 px-2 py-1 rounded-lg font-bold border border-slate-200 transition-all"
                            >
                              追加取消
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRemoveMember(member.worker_id)}
                              disabled={savingMember}
                              className="text-[10px] bg-red-50 hover:bg-red-100 text-red-500 px-2 py-1 rounded-lg font-bold border border-red-200/40 transition-all"
                            >
                              当日除外
                            </button>
                          )}
                        </div>
                      )}
                      {!isSessionConfirmed && !iAmForeman && !foremanId && (
                        <span className="text-[10px] text-slate-400 font-bold">まとめ役が必要</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 除外済みメンバーの表示 */}
              {iAmForeman && !isSessionConfirmed && (() => {
                const removedIds = session?.session_member_overrides?.removed ?? []
                const removedWorkers = siteAssignedWorkers.filter(w => removedIds.includes(w.id))
                if (removedWorkers.length === 0) return null
                return (
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">本日除外中</p>
                    {removedWorkers.map(w => (
                      <div key={w.id} className="flex items-center justify-between p-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 dark:bg-slate-900/20 opacity-60">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-300" />
                          <span className="text-sm font-bold text-slate-500 line-through">{w.name}</span>
                          <span className="text-[10px] bg-slate-200 text-slate-400 px-1.5 py-0.5 rounded font-bold">当日除外</span>
                        </div>
                        <button
                          onClick={() => handleResetMember(w.id)}
                          disabled={savingMember}
                          className="text-[10px] bg-white text-slate-500 hover:text-blue-600 px-2 py-1 rounded-lg font-bold border border-slate-200 transition-all"
                        >
                          復帰
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* まとめ役向け：当日メンバー追加セクション */}
              {iAmForeman && !isSessionConfirmed && (() => {
                const currentIds = new Set([
                  ...panelMembers.map(m => m.worker_id),
                  ...(session?.session_member_overrides?.removed ?? [])
                ])
                const addableWorkers = workerMasterList.filter(w =>
                  !currentIds.has(w.id) &&
                  !["社長", "事務員", "協力会社"].includes(w.type)
                )
                if (addableWorkers.length === 0) return null
                return (
                  <div className="border border-dashed border-blue-200 rounded-xl p-3 space-y-2 bg-blue-50/30 dark:bg-blue-950/10">
                    <p className="text-xs font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                      ➕ 当日メンバーを追加
                    </p>
                    <div className="flex gap-2">
                      <select
                        id="add-member-select"
                        defaultValue=""
                        className="flex-1 h-10 px-2 bg-white dark:bg-slate-900 border border-blue-200 rounded-lg text-sm font-bold outline-none cursor-pointer"
                        onChange={async e => {
                          const wid = e.target.value
                          if (!wid) return
                          await handleAddMember(wid)
                          e.target.value = ""
                        }}
                      >
                        <option value="">追加する人を選んでください</option>
                        {addableWorkers.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                      {savingMember && <Loader2 className="w-5 h-5 animate-spin text-blue-500 shrink-0 self-center" />}
                    </div>
                  </div>
                )
              })()}

              {/* まとめ役 最終確認セクション */}
              {!isSessionConfirmed && iAmForeman && (
                <div className={`border rounded-xl p-4 space-y-3 ${
                  allMembersChecked
                    ? "border-blue-200 bg-blue-50 dark:bg-blue-950/10"
                    : "border-slate-200 bg-slate-50/50 opacity-70"
                }`}>
                  <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-500" />
                    まとめ役 最終確認（3項目 必須）
                    {!allMembersChecked && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        ← 全員の申告が揃ってから確認できます
                      </span>
                    )}
                  </h3>

                  <div className="space-y-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {[
                      {
                        key: "visual_check" as const,
                        label: "👀 全員の顔色・様子を目視で確認した",
                        desc: "申告内容だけでなく、実際に顔を見て体調を確認しました"
                      },
                      {
                        key: "risk_followup" as const,
                        label: riskMembers.length > 0
                          ? `🗣️ リスクあり（${riskMembers.map(m => m.worker_name).join("・")}）に直接声をかけた`
                          : "🗣️ 全員の体調が良好であることを確認した",
                        desc: riskMembers.length > 0
                          ? "中・高リスクのメンバーに個別で体調を確認しました"
                          : "全員の顔色・元気さを確認しました"
                      },
                      {
                        key: "work_decision" as const,
                        label: "⚒️ 今日の作業実施 or 中止の判断をした",
                        desc: "チーム全体の状況を踏まえて、作業を進めるかどうかを決定しました"
                      }
                    ].map(item => (
                      <label
                        key={item.key}
                        className={`flex items-start gap-2 p-3 bg-white/80 dark:bg-slate-900/40 hover:bg-white border border-slate-100 rounded-xl cursor-pointer transition-all ${!allMembersChecked ? "pointer-events-none" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={foremanConfirmation[item.key]}
                          disabled={!allMembersChecked}
                          onChange={e => setForemanConfirmation(prev => ({ ...prev, [item.key]: e.target.checked }))}
                          className="w-4 h-4 mt-0.5 rounded text-blue-600 cursor-pointer accent-blue-600"
                        />
                        <div className="space-y-0.5 ml-1">
                          <span className="block font-extrabold text-slate-800 dark:text-slate-200">{item.label}</span>
                          <span className="block text-[9px] text-slate-500 font-medium leading-normal">{item.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <button
                    onClick={handleForemanConfirm}
                    disabled={
                      savingConfirm ||
                      !allMembersChecked ||
                      !foremanConfirmation.visual_check ||
                      !foremanConfirmation.risk_followup ||
                      !foremanConfirmation.work_decision
                    }
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingConfirm ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    全員の体調を確認しました（まとめ役として承認）
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 一人モード：申告完了メッセージ */}
      {isSoloMode && myCheck && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
          <div>
            <p className="font-extrabold text-green-800 dark:text-green-300">体調申告が完了しました！</p>
            <p className="text-xs text-green-600 mt-0.5">
              一人での申告のため、承認フローはありません。お疲れ様でした。
            </p>
          </div>
          <button
            onClick={handleExportPDF}
            className="ml-auto px-4 py-2 bg-white border border-green-300 text-green-700 font-extrabold text-xs rounded-lg hover:bg-green-50 transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            PDF出力
          </button>
        </div>
      )}

      {/* グループモードでセッション確認済みの場合のPDF出力ボタン */}
      {!isSoloMode && isSessionConfirmed && (
        <div className="flex justify-end">
          <button
            onClick={handleExportPDF}
            className="px-5 h-11 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-extrabold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <Download className="w-4 h-4" />
            帳票PDFを出力する
          </button>
        </div>
      )}

      {/* =====================================================
          ⑥ 代理入力モーダル
      ===================================================== */}
      {proxyTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 my-8">
            <div className="px-6 py-4 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/30 flex justify-between items-center">
              <div>
                <span className="text-[10px] bg-blue-100 dark:bg-blue-950/50 text-blue-700 px-2 py-0.5 rounded-full font-black">まとめ役 代理入力</span>
                <h3 className="font-extrabold text-base text-slate-800 dark:text-slate-100 mt-1">
                  {proxyTarget.worker_name} さんの体調チェック
                </h3>
              </div>
              <button onClick={() => setProxyTarget(null)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200/60 rounded-lg p-3 text-xs text-amber-700 font-bold">
                ⚠️ 直接本人から聞き取った上で入力してください。
                代理入力は「まとめ役による入力」として記録されます。
              </div>

              <CheckFormFields
                data={proxyForm}
                onChange={fields => setProxyForm(prev => ({ ...prev, ...fields }))}
              />

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmitProxy}
                  disabled={savingProxy}
                  className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {savingProxy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  代理入力を保存する
                </button>
                <button
                  onClick={() => setProxyTarget(null)}
                  className="px-5 h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold rounded-xl transition-all"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          ⑦ 管理者 詳細プレビューモーダル
      ===================================================== */}
      {adminSelectedSession && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 my-8">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-black">管理者用詳細プレビュー</span>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100 mt-1">
                  {adminSelectedSession.projectName} — {adminSelectedSession.timeType}
                </h3>
              </div>
              <button
                onClick={() => setAdminSelectedSession(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase">環境・天気</span>
                  <p className="text-slate-800 dark:text-slate-200 font-extrabold mt-1">
                    {adminSelectedSession.environment_type} / {adminSelectedSession.weather}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    気温: {(adminSelectedSession.temperature || 0).toFixed(1)}℃ |
                    湿度: {(adminSelectedSession.humidity || 0).toFixed(1)}%
                  </p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">WBGT ＆ 危険度</span>
                    <p className="text-slate-800 dark:text-slate-100 font-black text-lg mt-1">
                      🌡️ {(adminSelectedSession.wbgt || 0).toFixed(1)} ℃
                    </p>
                  </div>
                  {(() => {
                    const risk = getRiskLevel(adminSelectedSession.wbgt || 0)
                    return <span className={`inline-block px-3 py-1 rounded-full text-xs font-black ${risk.colorClass}`}>{risk.level}</span>
                  })()}
                </div>
              </div>

              {/* まとめ役確認状況 */}
              {(() => {
                // 一人作業かどうかの判定
                // 条件1: 現場なし（project_id === null）
                // 条件2: 実際の現場でもアサインが自分1人だけ
                const adminSessionAssignmentCount = adminSelectedSession.project_id === null
                  ? 0
                  : assignments.filter(a => a.project_id === adminSelectedSession.project_id).length
                const isAdminSessionSolo =
                  adminSelectedSession.project_id === null || adminSessionAssignmentCount <= 1

                if (adminSelectedSession.confirmed_at) {
                  return (
                    <div className="bg-green-50 border border-green-200/40 rounded-xl p-4">
                      <h4 className="text-xs font-black text-green-700 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        まとめ役確認完了
                      </h4>
                      <p className="text-xs text-green-600 font-bold">
                        確認者: {workerMasterList.find(w => w.id === adminSelectedSession.confirmed_by)?.name || "不明"} |
                        確認日時: {formatJST(adminSelectedSession.confirmed_at, "MM/dd HH:mm")}
                      </p>
                    </div>
                  )
                } else if (isAdminSessionSolo) {
                  return (
                    <div className="bg-slate-50 border border-slate-200/40 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-bold">✅ 一人作業のため、まとめ役確認は不要です</p>
                    </div>
                  )
                } else {
                  return (
                    <div className="bg-yellow-50 border border-yellow-200/40 rounded-xl p-3">
                      <p className="text-xs text-yellow-700 font-bold">⚠️ まだまとめ役の確認が完了していません</p>
                    </div>
                  )
                }
              })()}

              {/* 全体コメント */}
              {adminSelectedSession.overall_comment && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-500" />
                    現場全体の特記事項・指示事項
                  </h4>
                  <p className="text-xs text-slate-800 leading-relaxed font-bold whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200/50 shadow-inner">
                    {adminSelectedSession.overall_comment}
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setAdminSelectedSession(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs transition-all"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          ⑧ 成功・エラーモーダル
      ===================================================== */}
      {modalMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className={`p-4 flex items-center gap-3 border-b ${
              modalMessage.type === "success"
                ? "bg-green-50 border-green-100 text-green-800"
                : "bg-red-50 border-red-100 text-red-800"
            }`}>
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="font-extrabold text-lg">
                {modalMessage.type === "success" ? "完了" : "エラー"}
              </h3>
            </div>
            <div className="p-5 text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed">
              {modalMessage.text}
            </div>
            <div className="px-5 pb-5 flex justify-end">
              <button
                onClick={() => setModalMessage(null)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-lg shadow-sm active:scale-[0.98] transition-all text-xs"
              >
                確認 (OK)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          ⑨ PDF帳票（非表示・印刷専用）
      ===================================================== */}
      {(myCheck || allChecks.length > 0) && (
        <div className="hidden">
          <div
            ref={pdfTargetRef}
            className="w-[794px] min-h-[1123px] bg-white text-slate-900 p-[40px] space-y-6 flex flex-col justify-between font-sans leading-relaxed relative"
            style={{ boxSizing: "border-box" }}
          >
            <div className="space-y-6">
              {/* 帳票ヘッダー */}
              <div className="flex justify-between items-start border-b-[3px] border-blue-600 pb-3">
                <div>
                  <h1 className="text-2xl font-black tracking-wider text-blue-800">日常健康 ＆ 熱中症予防管理表</h1>
                  <p className="text-[11px] text-slate-500 font-bold mt-1">自己申告 + まとめ役確認モデル v2.0</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-slate-800">{formatJST(targetDate, "yyyy-MM-dd")}</div>
                  <div className="inline-block px-3 py-0.5 bg-blue-600 text-white text-xs font-extrabold rounded-full mt-1">
                    {checkTimeType}
                  </div>
                </div>
              </div>

              {/* 現場・WBGT情報 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50/50">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase">対象稼働現場</h3>
                  <p className="font-extrabold text-slate-800 text-sm">{getProjectDisplayName(selectedProjectId)}</p>
                  {session?.confirmed_by && (
                    <p className="text-xs text-slate-500 font-bold">
                      まとめ役確認者: {workerMasterList.find(w => w.id === session.confirmed_by)?.name || "不明"}
                    </p>
                  )}
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50/50">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase">現地気象 ＆ 安全レベル</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600">
                      WBGT: <span className="text-base font-black text-slate-800">{sessionWbgt.toFixed(1)}℃</span>
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-[11px] font-extrabold ${sessionRisk.colorClass}`}>
                      {sessionRisk.level}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">{sessionRisk.instruction}</p>
                </div>
              </div>

              {/* 作業員チェックリスト */}
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wide">
                  👷‍♂️ 参加作業員 自己申告チェックリスト
                </h3>
                <table className="w-full text-[10px] text-left border-collapse border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <th className="p-2 border-r border-slate-200">作業員名</th>
                      <th className="p-2 border-r border-slate-200">申告種別</th>
                      {checkTimeType === "朝" && (
                        <>
                          <th className="p-2 text-center border-r border-slate-200">睡眠</th>
                          <th className="p-2 text-center border-r border-slate-200">朝食</th>
                          <th className="p-2 text-center border-r border-slate-200">二日酔</th>
                        </>
                      )}
                      <th className="p-2 text-center border-r border-slate-200">症状</th>
                      <th className="p-2 text-center border-r border-slate-200">水分</th>
                      <th className="p-2 text-center border-r border-slate-200">尿色</th>
                      <th className="p-2 text-right">リスク</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                    {allChecks.map(w => (
                      <tr key={w.worker_id}>
                        <td className="p-2 font-bold text-slate-800 border-r border-slate-200">{w.worker_name}</td>
                        <td className="p-2 border-r border-slate-200 text-slate-500">
                          {w.submitted_by === "foreman" ? "代理" : "本人"}
                        </td>
                        {checkTimeType === "朝" && (
                          <>
                            <td className="p-2 text-center border-r border-slate-200">{getSleepLabel(w.sleep_hours)}</td>
                            <td className="p-2 text-center border-r border-slate-200">{w.breakfast ? "あり" : "なし"}</td>
                            <td className="p-2 text-center border-r border-slate-200">{w.hangover ? "あり⚠️" : "なし"}</td>
                          </>
                        )}
                        <td className="p-2 text-center border-r border-slate-200">{w.symptoms || "異常なし"}</td>
                        <td className="p-2 text-center border-r border-slate-200">{w.water_checked ? "済" : "未"}</td>
                        <td className="p-2 text-center border-r border-slate-200">{w.urine_checked ? "正常" : "未"}</td>
                        <td className="p-2 text-right font-bold">
                          <span className={w.risk_score === "低" ? "text-green-600" : w.risk_score === "中" ? "text-yellow-600" : "text-red-600"}>
                            {w.risk_score}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* まとめ役確認証跡 */}
              {session?.confirmed_at && session.foreman_confirmation && (
                <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/30">
                  <h4 className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    まとめ役 最終確認証跡
                  </h4>
                  <div className="space-y-1 text-[9px] font-bold text-slate-700">
                    {[
                      { key: "visual_check", label: "👀 全員の顔色・様子を目視で確認した" },
                      { key: "risk_followup", label: "🗣️ リスクあり者に個別で声をかけた" },
                      { key: "work_decision", label: "⚒️ 作業実施/中止の判断をした" }
                    ].map(item => {
                      const checked = (session.foreman_confirmation as any)?.[item.key]
                      return (
                        <div key={item.key} className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black ${checked ? "text-green-600" : "text-red-500"}`}>
                            {checked ? "☑" : "☐"}
                          </span>
                          <span>{item.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-[10px] text-slate-400 font-medium">
              <div>
                セッションID: {session?.id || "N/A"} | 出力日時: {formatJST(new Date(), "yyyy/MM/dd HH:mm")}
              </div>
              <div className="font-extrabold tracking-wide text-blue-800/80">
                HITEC 熱中症・安全管理アラート v2.0
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
