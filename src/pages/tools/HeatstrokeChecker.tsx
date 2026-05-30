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
  Search,
  Calendar,
  Loader2,
  CheckCircle2,
  FileText,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Heart,
  Smile,
  X,
  Info,
  ShieldAlert
} from "lucide-react"
import { format } from "date-fns"
import generatePDF, { Resolution, Margin } from "react-to-pdf"

// タイムゾーンを日本時間に明示してJST日付・時刻を美しくフォーマットするヘルパー
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
  parts.forEach(x => {
    p[x.type] = x.value
  })
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
  // 水蒸気圧 e (hPa) の算出
  const e = (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (temp + 237.3))
  // WBGT近似式
  const wbgt = 0.567 * temp + 0.393 * e + 3.94
  return Math.round(wbgt * 10) / 10
}

// 作業環境タイプに応じたWBGT（暑さ指数）の補正値を返す関数
function getEnvironmentWbgtOffset(envType: string): number {
  if (!envType) return 0.0
  if (envType.includes("屋外（直射日光）")) return 0.0
  if (envType.includes("屋外（日陰）")) return -1.5
  if (envType.includes("屋内（空調なし）")) return -2.0
  if (envType.includes("屋内（空調あり）")) return -4.0
  return 0.0
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
  if (wbgt < 21) {
    return {
      level: "ほぼ安全",
      emoji: "🟢",
      colorClass: "bg-green-500 text-white",
      bgClass: "bg-green-50 dark:bg-green-950/20",
      borderClass: "border-green-200 dark:border-green-900/30",
      textClass: "text-green-700 dark:text-green-400",
      instruction: "熱中症の危険は小さいですが、適度な水分補給を心がけましょう。"
    }
  } else if (wbgt < 25) {
    return {
      level: "注意",
      emoji: "🟡",
      colorClass: "bg-yellow-400 text-slate-800",
      bgClass: "bg-yellow-50 dark:bg-yellow-950/10",
      borderClass: "border-yellow-200 dark:border-yellow-900/20",
      textClass: "text-yellow-700 dark:text-yellow-400",
      instruction: "運動や重労働の際は、定期的な水分・塩分補給を行いましょう。"
    }
  } else if (wbgt < 28) {
    return {
      level: "警戒",
      emoji: "🟠",
      colorClass: "bg-orange-500 text-white",
      bgClass: "bg-orange-50 dark:bg-orange-950/20",
      borderClass: "border-orange-200 dark:border-orange-900/30",
      textClass: "text-orange-700 dark:text-orange-400",
      instruction: "熱中症の危険度が高まります。1時間に1回以上の休憩と水分補給を徹底してください。"
    }
  } else if (wbgt < 31) {
    return {
      level: "厳重警戒",
      emoji: "🔴",
      colorClass: "bg-red-500 text-white",
      bgClass: "bg-red-50 dark:bg-red-950/20",
      borderClass: "border-red-200 dark:border-red-900/30",
      textClass: "text-red-700 dark:text-red-400",
      instruction: "外出時は直射日光を避け、激しい作業は控えるか十分な休息を取ってください。"
    }
  } else {
    return {
      level: "危険",
      emoji: "🔥",
      colorClass: "bg-purple-600 text-white animate-pulse",
      bgClass: "bg-purple-50 dark:bg-purple-950/20",
      borderClass: "border-purple-200 dark:border-purple-900/30",
      textClass: "text-purple-700 dark:text-purple-400",
      instruction: "極めて危険な状態です。作業の中止や冷房の効いた屋内への退避、積極的な水分・塩分補給を最優先してください！"
    }
  }
}

interface WorkerCheck {
  worker_id: string
  worker_name: string
  sleep_hours: number
  breakfast: boolean
  hangover: boolean
  symptoms: string
  risk_score: "低" | "中" | "高"
  water_checked: boolean
  urine_checked: boolean
  comment?: string // 個別作業員の気になる点・メモ
}

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

interface HeatstrokeCheckRecord {
  id?: string
  project_id: string
  target_date: string
  checked_at: string
  foreman_id: string | null
  check_time_type: string // '朝', '10時休憩', '15時休憩'
  temperature: number
  humidity: number
  weather: string // '晴れ', '曇り', '雨', '屋内'
  wbgt: number
  risk_level: string
  environment_type: string // '屋外（直射日光）', '屋外（日陰）', '屋内（空調なし）', '屋内（空調あり）'
  temp_offset: number
  worker_checks: WorkerCheck[]
  photo_url: string | null
  comment?: string | null // 現場全体の特記事項
  safety_checks?: Record<string, boolean> | null // 危険領域における職長指針確認
}

export default function HeatstrokeChecker() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("")
  const [currentWorkerId, setCurrentWorkerId] = useState<string | null>(null)

  // 選択系ステータス
  const [targetDate, setTargetDate] = useState<string>(formatJST(new Date(), "yyyy-MM-dd"))
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [checkTimeType, setCheckTimeType] = useState<string>("朝") // '朝', '10時休憩', '15時休憩'

  // 気象データ（那須塩原市基準）
  const [baseTemperature, setBaseTemperature] = useState<number>(25.0)
  const [baseHumidity, setBaseHumidity] = useState<number>(60.0)
  const [weatherForecast, setWeatherForecast] = useState<any>(null)

  // GPS特定 & 実測値
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<string>("那須塩原本社基準")
  const [wbgtActual, setWbgtActual] = useState<string>("")

  // 画面用データ
  const [projects, setProjects] = useState<Project[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [workerMasterList, setWorkerMasterList] = useState<any[]>([])
  const [existingRecord, setExistingRecord] = useState<HeatstrokeCheckRecord | null>(null)

  // フォームステータス
  const [formWeather, setFormWeather] = useState<string>("晴れ")
  const [formEnvironment, setFormEnvironment] = useState<string>("屋外（日陰）")
  const [tempOffset, setTempOffset] = useState<number>(0.0)
  const [formWorkers, setFormWorkers] = useState<WorkerCheck[]>([])
  const [foremanId, setForemanId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  
  // 新規追加：全体コメント ＆ 安全指針チェックステート
  const [formComment, setFormComment] = useState<string>("")
  const [formSafetyChecks, setFormSafetyChecks] = useState<Record<string, boolean>>({
    rest_time: false,
    hydration: false,
    shade: false,
    buddy_system: false,
    clothing: false
  })

  // 管理者詳細プレビュー用ステート
  const [adminSelectedCheck, setAdminSelectedCheck] = useState<any | null>(null)

  // 管理者用サマリーデータ
  const [allChecksForDate, setAllChecksForDate] = useState<any[]>([])

  // UI用
  const [modalMessage, setModalMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const pdfTargetRef = useRef<HTMLDivElement>(null)


  useEffect(() => {
    initialize()
  }, [])

  useEffect(() => {
    if (targetDate) {
      // 画面ロード時に自動でGPS取得を試みる（サイレントフォールバック）
      if (navigator.geolocation) {
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
            // サイレントに那須塩原基準ロード
            setGpsCoords(null)
            setGpsStatus("那須塩原本社基準")
            setGpsLoading(false)
            fetchWeatherData()
          },
          { enableHighAccuracy: true, timeout: 5000 }
        )
      } else {
        fetchWeatherData()
      }

      fetchProjectsAndAssignments()
      if (isAdmin) {
        fetchAllChecksForDate()
      }
    }
  }, [targetDate, isAdmin])

  useEffect(() => {
    if (selectedProjectId && checkTimeType && targetDate) {
      fetchExistingRecord()
    } else {
      setExistingRecord(null)
      setFormWorkers([])
    }
  }, [selectedProjectId, checkTimeType, targetDate])

  // 作業指揮者（職長）が変更された際、安否チェックリスト（formWorkers）に強制追加する同期制御
  useEffect(() => {
    if (foremanId && workerMasterList.length > 0) {
      const exists = formWorkers.some(w => w.worker_id === foremanId)
      if (!exists) {
        const master = workerMasterList.find(w => w.id === foremanId)
        if (master) {
          const newWorker: WorkerCheck = {
            worker_id: master.id,
            worker_name: master.name,
            sleep_hours: 0,
            breakfast: null as any,
            hangover: null as any,
            symptoms: "なし",
            risk_score: "低",
            water_checked: false,
            urine_checked: false,
            comment: ""
          }
          setFormWorkers(prev => {
            // 状態更新の競合による重複追加を防ぐ
            if (prev.some(w => w.worker_id === foremanId)) return prev
            return [...prev, newWorker]
          })
        }
      }
    }
  }, [foremanId, workerMasterList])

  // ログイン中の本人（自分自身）がチェックリストに存在しない場合、強制的に追加する同期制御
  useEffect(() => {
    if (currentWorkerId && workerMasterList.length > 0) {
      const exists = formWorkers.some(w => w.worker_id === currentWorkerId)
      if (!exists) {
        const master = workerMasterList.find(w => w.id === currentWorkerId)
        if (master) {
          const newWorker: WorkerCheck = {
            worker_id: master.id,
            worker_name: master.name,
            sleep_hours: 0,
            breakfast: null as any,
            hangover: null as any,
            symptoms: "なし",
            risk_score: "低",
            water_checked: false,
            urine_checked: false,
            comment: ""
          }
          setFormWorkers(prev => {
            if (prev.some(w => w.worker_id === currentWorkerId)) return prev
            return [...prev, newWorker]
          })
        }
      }
    }
  }, [currentWorkerId, workerMasterList])

  // 日本時間基準の Open-Meteo 予報データをフェッチ（GPS座標優先）
  const fetchWeatherData = async (coordsToUse?: { latitude: number; longitude: number }) => {
    try {
      const lat = coordsToUse ? coordsToUse.latitude : (gpsCoords ? gpsCoords.latitude : NASUSHIOBARA_LAT)
      const lon = coordsToUse ? coordsToUse.longitude : (gpsCoords ? gpsCoords.longitude : NASUSHIOBARA_LON)

      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m&timezone=Asia%2FTokyo`
      )
      if (res.ok) {
        const data = await res.json()
        setWeatherForecast(data.hourly)
        updateBaseWeather(data.hourly)
      }
    } catch (e) {
      console.error("Failed to fetch weather forecast:", e)
    }
  }

  // 手動でGPS現在地気象データを取得
  const acquireGPS = () => {
    if (!navigator.geolocation) {
      alert("お使いのブラウザ・端末はGPS位置情報取得に対応していません。")
      setGpsStatus("那須塩原本社基準（GPS非対応）")
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
        console.error("GPS error:", error)
        let errMsg = "位置情報の取得に失敗しました。"
        if (error.code === error.PERMISSION_DENIED) {
          errMsg = "位置情報の利用許可が拒否されました。ブラウザの設定をご確認ください。"
        }
        alert(`${errMsg}\n那須塩原本社の気象基準を使用します。`)
        setGpsCoords(null)
        setGpsStatus("那須塩原本社基準")
        setGpsLoading(false)
        fetchWeatherData()
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  }

  // 時間帯に応じて基準気温・湿度を更新
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
      // 本日の時間枠が見つからない（古い日付や遠い未来）場合のデフォルト
      setBaseTemperature(25.0)
      setBaseHumidity(60.0)
    }
  }

  useEffect(() => {
    if (weatherForecast) {
      updateBaseWeather(weatherForecast)
    }
  }, [checkTimeType])

  const initialize = async () => {
    try {
      setLoading(true)
      const {
        data: { user }
      } = await supabase.auth.getUser()
      
      if (user) {
        // ログイン情報からメールアドレスを正確に取得（前後の不要な空白をトリムし、大文字小文字をすべて小文字にクレンジング）
        const loginEmail = (user.email || user.user_metadata?.email || "").trim().toLowerCase()
        setCurrentUserEmail(loginEmail)

        // 全作業員マスタのロード（表示順 display_order が保存されていればそれを基準に、なければID順で美しくロード）
        const { data: wm } = await supabase
          .from("worker_master")
          .select("id, name, type, is_admin, email")
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
        
        const masterList = wm || []
        setWorkerMasterList(masterList)

        // ログインしているメールアドレスに合致する作業員レコードをマスタから確実に特定して返す
        if (loginEmail && masterList.length > 0) {
          const resolvedWorker = masterList.find(
            w => (w.email || "").trim().toLowerCase() === loginEmail
          )

          if (resolvedWorker) {
            setIsAdmin(resolvedWorker.is_admin || resolvedWorker.type === "社長" || resolvedWorker.type === "事務員")
            setCurrentWorkerId(resolvedWorker.id)
          }
        }
      }
    } catch (e) {
      console.error("Initialization error:", e)
    } finally {
      setLoading(false)
    }
  }

  // 本日のアサインおよびプロジェクトのフェッチ
  const fetchProjectsAndAssignments = async () => {
    try {
      // アサインのフェッチ
      const { data: assignData, error: assignErr } = await supabase
        .from("assignments")
        .select(`
          id,
          project_id,
          worker_id,
          worker_master!assignments_worker_id_fkey ( id, name, type, email )
        `)
        .eq("assignment_date", targetDate)

      if (assignErr) throw assignErr

      const validAssignments = (assignData || []).filter(a => a.worker_master && a.project_id) as unknown as Assignment[]
      setAssignments(validAssignments)

      // プロジェクト一覧を取得（アサインされた現場、および全現場）
      const { data: projData, error: projErr } = await supabase
        .from("projects")
        .select("id, project_name, site_name, project_number, category")
        .order("project_name")

      if (projErr) throw projErr

      const validProjects = (projData || []).filter(p => {
        // 休暇、その他、VACATION などのプロジェクトは日常熱中症チェックから除外
        const isVacation =
          p.project_number === "VACATION" ||
          p.category === "その他" ||
          (p.project_name && p.project_name.includes("休暇"))
        return !isVacation
      })

      // 本日の工程表（本日のアサイン）に登録されているプロジェクトIDのみに絞り込む
      const todayProjectIds = new Set(validAssignments.map(a => a.project_id))
      const todayProjects = validProjects.filter(p => todayProjectIds.has(p.id))

      // 仮想の「該当現場なし（アサインなし）」プロジェクトを定義
      const NO_PROJECT: Project = {
        id: "no-project",
        project_name: "（現場なし／アサインなし）",
        site_name: "現場なし",
        project_number: "NONE",
        category: "現場なし"
      }

      // 表示用のプロジェクトリスト。本日の現場＋「現場なし」を常にドロップダウンの選択肢に含める
      // アサインがない（休日などの）場合は、「現場なし」＋念のための全現場をドロップダウンの予備としてセット
      let finalProjects: Project[] = []
      if (todayProjects.length > 0) {
        finalProjects = [NO_PROJECT, ...todayProjects]
      } else {
        finalProjects = [NO_PROJECT, ...validProjects]
      }
      setProjects(finalProjects)

      // 初期値 (selectedProjectId) の自動判定
      if (!selectedProjectId) {
        // 自分がアサインされている現場があるかを調べる
        const myAssignment = validAssignments.find(a => a.worker_master?.email === currentUserEmail)
        if (myAssignment) {
          // 自分がアサインされている現場を自動選択
          setSelectedProjectId(myAssignment.project_id)
        } else {
          // 自分自身がアサインされていない、または本日アサインが0件なら、自動的に「現場なし」を初期選択
          setSelectedProjectId(NO_PROJECT.id)
        }
      }
    } catch (e) {
      console.error("Error fetching projects and assignments:", e)
    }
  }

  // 選択日における全現場の熱中症安否登録状況をフェッチ（管理者用）
  const fetchAllChecksForDate = async () => {
    try {
      const { data, error } = await supabase
        .from("heatstroke_checks")
        .select(`
          id,
          project_id,
          check_time_type,
          wbgt,
          risk_level,
          foreman:worker_master ( name ),
          worker_checks,
          photo_url,
          checked_at,
          temperature,
          humidity,
          weather,
          environment_type
        `)
        .eq("target_date", targetDate)

      if (error) throw error
      setAllChecksForDate(data || [])
    } catch (e) {
      console.error("Error fetching all checks:", e)
    }
  }

  // 既存レコードの取得とフォーム展開
  const fetchExistingRecord = async () => {
    try {
      setRefreshing(true)
      
      let query = supabase.from("heatstroke_checks").select("*")
      if (selectedProjectId === "no-project") {
        query = query.is("project_id", null)
      } else {
        query = query.eq("project_id", selectedProjectId)
      }

      const { data, error } = await query
        .eq("target_date", targetDate)
        .eq("check_time_type", checkTimeType)
        .maybeSingle()

      if (error) throw error

      if (data) {
        // 既存データがある場合は展開
        const record = data as HeatstrokeCheckRecord
        setExistingRecord(record)
        setFormWeather(record.weather)

        // 実測値優先フラグの判定と展開
        const hasActual = record.environment_type && record.environment_type.includes("(現地実測)")
        if (hasActual) {
          setWbgtActual(record.wbgt.toString())
          // "(現地実測)" の文字を除去して表示用に復元
          setFormEnvironment(record.environment_type.replace(" (現地実測)", ""))
        } else {
          setWbgtActual("")
          setFormEnvironment(record.environment_type)
        }

        setTempOffset(record.temp_offset || 0.0)
        setForemanId(record.foreman_id || "")
        setFormWorkers(record.worker_checks || [])
        // コメントと指針チェックを復元
        setFormComment(record.comment || "")
        setFormSafetyChecks(record.safety_checks || {
          rest_time: false,
          hydration: false,
          shade: false,
          buddy_system: false,
          clothing: false
        })
      } else {
        // 既存データがない場合は初期化
        setExistingRecord(null)
        setFormWeather("晴れ")
        setFormEnvironment("屋外（日陰）")
        setWbgtActual("") // 実測値をクリア
        setTempOffset(0.0)
        // コメントと指針チェックを初期化
        setFormComment("")
        setFormSafetyChecks({
          rest_time: false,
          hydration: false,
          shade: false,
          buddy_system: false,
          clothing: false
        })

        // 該当現場の本日のアサインメンバーを抽出
        const siteAssignments = assignments.filter(a => a.project_id === selectedProjectId)
        
        // 通常の熱中症安全チェック対象メンバーに限定（社長、事務員、協力会社は除外）
        const filteredWorkers = siteAssignments
          .map(a => a.worker_master)
          .filter(w => w && !["社長", "事務員", "協力会社"].includes(w.type))

        // ログイン中の本人（自分）が対象メンバーに入っていなければ強制的にマージ追加
        const hasMe = filteredWorkers.some(w => w.id === currentWorkerId)
        if (currentWorkerId && !hasMe) {
          const meMaster = workerMasterList.find(w => w.id === currentWorkerId)
          if (meMaster) {
            filteredWorkers.push(meMaster)
          }
        }

        const initialWorkers: WorkerCheck[] = filteredWorkers.map(w => ({
          worker_id: w.id,
          worker_name: w.name,
          sleep_hours: 0, // 0 = 未選択
          breakfast: null as any, // null = 未選択
          hangover: null as any, // null = 未選択
          symptoms: "なし",
          risk_score: "低",
          water_checked: false, // 初期は未選択
          urine_checked: false, // 初期は未選択
          comment: "" // 個別コメント初期値
        }))

        setFormWorkers(initialWorkers)


        // 自分がこの現場のアサイン（工程）に入っているか確認
        const isMeAssigned = siteAssignments.some(a => a.worker_id === currentWorkerId)

        // 職長の初期アサイン（ログイン中のユーザーがアサインされていれば最優先、いなければアサインされた正社員などを優先）
        if (currentWorkerId && isMeAssigned) {
          setForemanId(currentWorkerId)
        } else if (filteredWorkers.length > 0) {
          const sorted = [...filteredWorkers].sort((a, b) => {
            const order: Record<string, number> = { "正社員": 1, "契約社員": 2, "外注": 3 }
            const typeDiff = (order[a.type] || 99) - (order[b.type] || 99)
            if (typeDiff !== 0) return typeDiff

            // 同じ区分の場合は、workerMasterList における表示順（display_order）が若い人を最優先にする
            const aIndex = workerMasterList.findIndex(m => m.id === a.id)
            const bIndex = workerMasterList.findIndex(m => m.id === b.id)
            const aVal = aIndex !== -1 ? aIndex : 9999
            const bVal = bIndex !== -1 ? bIndex : 9999
            return aVal - bVal
          })
          setForemanId(sorted[0].id)
        } else {
          setForemanId("")
        }
      }
    } catch (e) {
      console.error("Error fetching existing record:", e)
    } finally {
      setRefreshing(false)
    }
  }

  // 職長専用「一括全員OK」ボタン
  const handleBulkCheckOK = () => {
    const updated = formWorkers.map(w => {
      if (checkTimeType === "朝") {
        return {
          ...w,
          sleep_hours: 7,
          breakfast: true,
          hangover: false,
          symptoms: "なし",
          risk_score: "低" as const,
          water_checked: true,
          urine_checked: true,
          comment: w.comment || "" // 個別コメントを引き継ぐ
        }
      } else {
        // 10時・15時は、朝の基本体調データ（睡眠、朝食、二日酔い）は書き換えずにそのまま保持し、
        // 水分補給、尿色をOKにし、自覚症状を異常なし、リスクスコアを再評価
        const baseItem = {
          ...w,
          symptoms: "なし",
          water_checked: true,
          urine_checked: true,
          comment: w.comment || "" // 個別コメントを引き継ぐ
        }
        
        // リスクスコアの自動再計算
        let riskCount = 0
        if (baseItem.sleep_hours > 0 && baseItem.sleep_hours < 6) riskCount++
        if (baseItem.breakfast === false) riskCount++
        if (baseItem.hangover === true) riskCount++
        // symptomsは "なし" にしているのでカウントしない
        baseItem.risk_score = riskCount === 0 ? "低" : riskCount <= 2 ? "中" : "高"
        
        return baseItem
      }
    })
    setFormWorkers(updated)
  }


  // データの登録・更新保存
  const handleSaveRecord = async () => {
    if (!selectedProjectId) {
      alert("現場プロジェクトを選択してください。")
      return
    }

    setSaving(true)
    try {
      // 未確認項目のチェック（形骸化防止バリデーション）
      const incompleteWorker = formWorkers.find(w => {
        if (checkTimeType === "朝") {
          return (
            w.sleep_hours === 0 || 
            w.breakfast === null || 
            w.hangover === null || 
            !w.water_checked || 
            !w.urine_checked
          )
        } else {
          // 10時・15時は、水分と尿色のチェックのみを必須とする（睡眠、朝食、二日酔いは非表示・スキップ）
          return !w.water_checked || !w.urine_checked
        }
      })

      if (incompleteWorker) {
        const msg = checkTimeType === "朝"
          ? `${incompleteWorker.worker_name}さんの確認項目（睡眠時間、朝食、二日酔い、水分、尿色）の中に、まだチェックされていない未完了の項目があります。本人に聞いて確認してから登録してください。`
          : `${incompleteWorker.worker_name}さんの水分補給または尿色のチェックが完了していません。確認してから登録してください。`
        alert(msg)
        setSaving(false)
        return
      }

      // WBGT の決定（実測値入力があれば最優先、なければGPS予報から計算 ＋ 環境補正）
      const actualTemp = baseTemperature + tempOffset
      const envOffset = getEnvironmentWbgtOffset(formEnvironment)
      const calculatedWbgt = Math.round((calculateWBGT(actualTemp, baseHumidity) + envOffset) * 10) / 10
      
      const isActualPrioritized = wbgtActual !== "" && !isNaN(parseFloat(wbgtActual))
      const finalWbgt = isActualPrioritized ? parseFloat(wbgtActual) : calculatedWbgt
      const risk = getRiskLevel(finalWbgt)

      // 【新規追加】危険領域（WBGT 28℃以上）における職長安全指針チェックの必須バリデーション
      if (finalWbgt >= 28) {
        const incompleteSafety = 
          !formSafetyChecks.rest_time ||
          !formSafetyChecks.hydration ||
          !formSafetyChecks.shade ||
          !formSafetyChecks.buddy_system ||
          !formSafetyChecks.clothing

        if (incompleteSafety) {
          alert(`【🚨警告: 暑さ指数危険領域】\n本日のWBGT暑さ指数（${finalWbgt}℃）は「厳重警戒」または「危険」レベルに達しています。\n\n職長が実施した現場安全指針チェック（全5項目）がすべて完了していません。安全対策を実施のうえ、すべての項目にチェックを入れてから保存してください。`);
          setSaving(false)
          return
        }
      }

      // 実測値優先の場合は environment_type に (現地実測) フラグを付与
      let finalEnvironment = formEnvironment
      if (isActualPrioritized) {
        if (!finalEnvironment.includes("(現地実測)")) {
          finalEnvironment = `${finalEnvironment} (現地実測)`
        }
      }

      const payload = {
        project_id: selectedProjectId === "no-project" ? null : selectedProjectId,
        target_date: targetDate,
        foreman_id: foremanId || null,
        check_time_type: checkTimeType,
        temperature: isActualPrioritized ? 0.0 : actualTemp, // 実測優先時は気温・湿度は0.0（参考値）
        humidity: isActualPrioritized ? 0.0 : baseHumidity,
        weather: formWeather,
        wbgt: finalWbgt,
        risk_level: risk.level,
        environment_type: finalEnvironment,
        temp_offset: tempOffset,
        worker_checks: formWorkers,
        photo_url: null,
        checked_at: new Date().toISOString(),
        comment: formComment || null, // 現場全体コメントを保存
        safety_checks: finalWbgt >= 28 ? formSafetyChecks : null // 28℃以上の時のみ指針チェック状態を保存（それ以外はnull）
      }

      if (existingRecord?.id) {
        // 更新
        const { error } = await supabase
          .from("heatstroke_checks")
          .update(payload)
          .eq("id", existingRecord.id)

        if (error) throw error
        setModalMessage({ type: "success", text: `${checkTimeType}の安否確認データを更新保存しました！` })
      } else {
        // 新規登録
        const { error } = await supabase
          .from("heatstroke_checks")
          .insert([payload])

        if (error) throw error
        setModalMessage({ type: "success", text: `${checkTimeType}の安否確認データを新規登録しました！` })
      }


      // データ再読込
      fetchExistingRecord()
      if (isAdmin) {
        fetchAllChecksForDate()
      }
    } catch (e: any) {
      console.error("Save error:", e)
      setModalMessage({ type: "error", text: "保存中にエラーが発生しました: " + e.message })
    } finally {
      setSaving(false)
    }
  }

  // PDF帳票の出力（react-to-pdf を使用）
  const handleExportPDF = async () => {
    const target = pdfTargetRef.current
    if (!target) return

    // レイアウトの崩れやクリップを防ぐための一時的スタイル適用
    const parents: { el: HTMLElement; overflow: string; height: string; position: string }[] = []
    let curr = target.parentElement
    while (curr && curr !== document.body) {
      parents.push({
        el: curr,
        overflow: curr.style.overflow,
        height: curr.style.height,
        position: curr.style.position
      })
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
        overrides: {
          canvas: {
            windowHeight: target.scrollHeight,
            scrollY: -window.scrollY
          }
        }
      })
    } catch (error) {
      console.error("PDF generation failed:", error)
      setModalMessage({ type: "error", text: "PDF帳票の出力中にエラーが発生しました。" })
    } finally {
      parents.forEach(p => {
        p.el.style.overflow = p.overflow
        p.el.style.height = p.height
        p.el.style.position = p.position
      })
    }
  }

  // 個別の作業員ステータス変更
  const updateWorkerStatus = (index: number, fields: Partial<WorkerCheck>) => {
    const updated = [...formWorkers]
    updated[index] = { ...updated[index], ...fields }
    
    // リスクスコアの簡易自動判定ロジック
    const item = updated[index]
    let riskCount = 0
    if (item.sleep_hours < 6) riskCount++
    if (!item.breakfast) riskCount++
    if (item.hangover) riskCount++
    if (item.symptoms !== "なし") riskCount++

    item.risk_score = riskCount === 0 ? "低" : riskCount <= 2 ? "中" : "高"

    setFormWorkers(updated)
  }

  // 応援等、作業員をリストに動的に追加
  const handleAddWorker = (workerId: string) => {
    const master = workerMasterList.find(w => w.id === workerId)
    if (!master) return
    
    // すでにリストにある場合はスキップ
    if (formWorkers.some(w => w.worker_id === workerId)) return
    
    const newWorker: WorkerCheck = {
      worker_id: master.id,
      worker_name: master.name,
      sleep_hours: 0,       // 0 = 未選択
      breakfast: null as any, // null = 未選択
      hangover: null as any,  // null = 未選択
      symptoms: "なし",
      risk_score: "低",
      water_checked: false,   // 未チェック
      urine_checked: false,   // 未チェック
      comment: ""
    }
    setFormWorkers(prev => [...prev, newWorker])
  }

  // 欠勤等、作業員をリストから削除（除外）
  const handleRemoveWorker = (workerId: string) => {
    // ガード1：作業指揮者（職長）に選ばれている人は削除を拒否
    if (workerId === foremanId) {
      alert("🚨 本日の作業指揮者（職長）に指定されているメンバーは、健康チェックリストから除外できません。\n別の人を指揮者に指定するか、現場指揮者を変更してから除外してください。")
      return
    }
    
    const target = formWorkers.find(w => w.worker_id === workerId)
    const name = target ? target.worker_name : "この作業員"
    
    // ガード2：誤タップ防止の確認
    if (window.confirm(`⚠️ ${name}さんを本日の健康チェックリストから除外（削除）しますか？\n入力済みの健康状態チェックデータは失われます。`)) {
      setFormWorkers(prev => prev.filter(w => w.worker_id !== workerId))
    }
  }

  // 現場プロ名と現場名の連結表示
  const getProjectDisplayName = (pId: string) => {
    const p = projects.find(proj => proj.id === pId)
    if (!p) return "現場名未設定"
    const num = p.project_number ? `[${p.project_number}] ` : ""
    const suffix = p.site_name ? ` (${p.site_name})` : ""
    return `${num}${p.project_name}${suffix}`
  }

  // 実測値があれば最優先（オーバーライド）、なければ気象データから計算 ＋ 環境補正
  const isActualPrioritized = wbgtActual !== "" && !isNaN(parseFloat(wbgtActual))
  const envOffset = getEnvironmentWbgtOffset(formEnvironment)
  const baseWbgt = calculateWBGT(baseTemperature + tempOffset, baseHumidity)
  const actualWBGT = isActualPrioritized ? parseFloat(wbgtActual) : Math.round((baseWbgt + envOffset) * 10) / 10
  const currentRisk = getRiskLevel(actualWBGT)

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-12 bg-slate-50 dark:bg-slate-950/20 min-h-screen text-slate-800 dark:text-slate-200">
      
      {/* 1. タイトル＆基本情報 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/60 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-xl">
            <Thermometer className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">日常・熱中症アラート</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              朝・10時・15時の休憩連動体調登録、および稼働現場の熱中症安全監視
            </p>
          </div>
        </div>
        
        {/* 日付・時間帯・現場選択エリア */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-slate-500" />
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
                className={`py-1.5 px-3 rounded-md transition-all ${
                  checkTimeType === type
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. 熱中症 WBGT 基準メーター（那須塩原市本社基準 または GPS現在地基準） */}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 rounded-xl border p-5 transition-all ${currentRisk.bgClass} ${currentRisk.borderClass}`}>
        <div className="md:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/20 pb-2">
            <div className="flex items-center gap-2">
              <CloudSun className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <h2 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                気象状況 ＆ 熱中症危険度予測（{gpsStatus}）
              </h2>
            </div>

            {/* GPS再特定ボタン */}
            <button
              onClick={acquireGPS}
              disabled={gpsLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-1 bg-white/90 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black rounded-lg border border-slate-200/50 dark:border-slate-700 shadow-sm transition-all disabled:opacity-60 cursor-pointer w-full sm:w-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gpsLoading ? "animate-spin text-blue-500" : ""}`} />
              {gpsLoading ? "GPS測定中..." : "📍 現在地の気象を取得"}
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm rounded-lg p-3 border border-slate-200/30">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-bold block mb-1">
                {isActualPrioritized ? "参考予測気温" : "予測気温"}
              </span>
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {baseTemperature.toFixed(1)} <span className="text-sm font-medium">℃</span>
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm rounded-lg p-3 border border-slate-200/30">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-bold block mb-1">
                {isActualPrioritized ? "参考予測湿度" : "予測湿度"}
              </span>
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {baseHumidity.toFixed(1)} <span className="text-sm font-medium">%</span>
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm rounded-lg p-3 border border-slate-200/30 relative overflow-hidden">
              {isActualPrioritized && (
                <div className="absolute top-0 right-0 bg-red-600 text-[9px] text-white px-1.5 py-0.5 rounded-bl font-black tracking-wide animate-pulse">
                  現地実測
                </div>
              )}
              <span className="text-xs text-slate-400 dark:text-slate-500 font-bold block mb-1">暑さ指数 (WBGT)</span>
              <span className={`text-2xl font-black flex items-center gap-1 ${currentRisk.textClass}`}>
                {actualWBGT.toFixed(1)}
                {isActualPrioritized && <span className="text-sm" title="測定器の実測値を優先しています">🌡️</span>}
              </span>
            </div>
          </div>

          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-sm p-4 rounded-lg border border-slate-200/40">
            <div className="flex items-center gap-2 font-black mb-1.5 text-slate-800 dark:text-slate-100 text-sm sm:text-base">
              <span>{currentRisk.emoji} 安全指針: </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${currentRisk.colorClass}`}>
                {currentRisk.level}
              </span>
              {isActualPrioritized ? (
                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-black border border-red-200/30">
                  測定器実測値優先
                </span>
              ) : (
                envOffset !== 0 && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded font-black border border-blue-200/30">
                    環境補正: {envOffset > 0 ? `+${envOffset}` : envOffset}℃ ({formEnvironment})
                  </span>
                )
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              {currentRisk.instruction}
            </p>
          </div>
        </div>

        {/* 視覚的ビジュアルメーター */}
        <div className="flex flex-col justify-center items-center bg-white/70 dark:bg-slate-900/40 backdrop-blur-sm rounded-xl p-4 border border-slate-200/30">
          <div className="relative w-36 h-36 flex items-center justify-center">
            {/* 動的円形メーターゲージ */}
            <svg className="absolute w-full h-full transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="60"
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                className="text-slate-100 dark:text-slate-800"
              />
              <circle
                cx="72"
                cy="72"
                r="60"
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray="377"
                strokeDashoffset={377 - (377 * Math.min(Math.max(actualWBGT, 15), 35)) / 40}
                className={
                  actualWBGT < 21 ? "text-green-500" :
                  actualWBGT < 25 ? "text-yellow-400" :
                  actualWBGT < 28 ? "text-orange-500" :
                  actualWBGT < 31 ? "text-red-500" : "text-purple-600"
                }
              />
            </svg>
            <div className="text-center z-10 space-y-1">
              <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
                {actualWBGT.toFixed(1)}
              </span>
              <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                WBGT INDEX
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 管理者監視ダッシュボード（管理者権限時のみ） */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
            <h2 className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              管理者用：本日（{targetDate}）の全稼働現場安否監視一覧
            </h2>
            <button
              onClick={() => {
                fetchProjectsAndAssignments()
                fetchAllChecksForDate()
              }}
              className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-50 rounded-lg transition-colors"
              title="データを更新"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => {
              const siteChecks = allChecksForDate.filter(c => {
                if (p.id === "no-project") {
                  return c.project_id === null
                }
                return c.project_id === p.id
              })
              const siteAssignments = assignments.filter(a => a.project_id === p.id)
              const hasAssignments = siteAssignments.length > 0

              // 現場なしの場合、アサインは常に0件だが、登録データがある場合はダッシュボードに美しく表示する
              if (p.id === "no-project" && siteChecks.length === 0) return null
              if (p.id !== "no-project" && !hasAssignments && siteChecks.length === 0) return null

              return (
                <div key={p.id} className="border border-slate-100 dark:border-slate-800/80 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between space-y-3 shadow-sm hover:border-slate-200 transition-colors">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate" title={getProjectDisplayName(p.id)}>
                      {getProjectDisplayName(p.id)}
                    </h3>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold mt-1">
                      本日のアサイン: {siteAssignments.map(a => a.worker_master?.name).join(", ") || "なし"}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1 bg-white dark:bg-slate-950 p-1.5 rounded-lg border text-center text-[10px] font-bold">
                    {["朝", "10時休憩", "15時休憩"].map(time => {
                      const check = siteChecks.find(c => c.check_time_type === time)
                      const isActual = check && check.environment_type && check.environment_type.includes("(現地実測)")
                      return (
                        <button
                          key={time}
                          disabled={!check}
                          onClick={() => {
                            if (check) {
                              setAdminSelectedCheck({
                                projectName: getProjectDisplayName(p.id),
                                timeType: time,
                                ...check
                              })
                            }
                          }}
                          className={`py-1.5 rounded relative text-center w-full transition-all ${
                            check
                              ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40 cursor-pointer shadow-sm"
                              : "bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400 opacity-60 cursor-not-allowed"
                          }`}
                        >
                          <div>{time}</div>
                          <div className="text-[10px] font-black mt-0.5 flex items-center justify-center gap-0.5">
                            {check ? "登録済 👁️" : "未登録"}
                            {isActual && <span title="現地実測値優先">🌡️</span>}
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

      {/* 4. メイン安全・安否入力フォーム */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側：現場選択 ＆ 基本条件設定 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <h3 className="font-bold border-b pb-2 flex items-center gap-2 text-slate-800 dark:text-slate-200 text-base">
              <Clock className="w-5 h-5 text-blue-500" />
              現場 ＆ 基本設定
            </h3>

            {/* 現場の選択 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                1. 対象現場の選択
              </label>
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
              >
                <option value="" disabled>現場を選択してください</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {getProjectDisplayName(p.id)}
                  </option>
                ))}
              </select>
            </div>

            {/* 本日の職長・指揮者の選択 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                2. 本日の作業指揮者（職長）
              </label>
              <select
                value={foremanId}
                onChange={e => setForemanId(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
              >
                <option value="">（選択なし）</option>
                {workerMasterList.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))}
              </select>
            </div>

            {/* 天気の選択 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                3. 現地の天気
              </label>
              <div className="grid grid-cols-4 gap-2 text-xs font-bold">
                {["晴れ", "曇り", "雨", "屋内"].map(w => (
                  <button
                    key={w}
                    onClick={() => setFormWeather(w)}
                    className={`py-2.5 rounded-lg border transition-all ${
                      formWeather === w
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* 作業環境タイプの選択 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                4. 作業・休憩環境タイプ
              </label>
              <select
                value={formEnvironment}
                onChange={e => setFormEnvironment(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
              >
                <option value="屋外（直射日光）">屋外（直射日光）</option>
                <option value="屋外（日陰）">屋外（日陰）</option>
                <option value="屋内（空調なし）">屋内（空調なし）</option>
                <option value="屋内（空調あり）">屋内（空調あり）</option>
              </select>
            </div>

            {/* 体感温度微調整スライダー */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center">
                <label className={`text-xs font-bold uppercase tracking-wide ${isActualPrioritized ? "text-slate-300 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"}`}>
                  5. 体感温度の微調整 (現地補正) {isActualPrioritized && <span className="text-[10px] text-red-500 font-bold">（実測値優先のため無効）</span>}
                </label>
                <span className={`text-xs font-extrabold px-2 py-0.5 rounded ${isActualPrioritized ? "bg-slate-100 text-slate-400 dark:bg-slate-800/40 dark:text-slate-600" : "bg-blue-100 text-blue-600"}`}>
                  {tempOffset > 0 ? `+${tempOffset}` : tempOffset} ℃
                </span>
              </div>
              <input
                type="range"
                min="-3.0"
                max="3.0"
                step="0.5"
                value={tempOffset}
                disabled={isActualPrioritized}
                onChange={e => setTempOffset(parseFloat(e.target.value))}
                className={`w-full h-2 rounded-lg appearance-none accent-blue-600 ${isActualPrioritized ? "bg-slate-100 dark:bg-slate-900 cursor-not-allowed opacity-40" : "bg-slate-200 dark:bg-slate-800 cursor-pointer"}`}
              />
              <span className="block text-[10px] text-slate-400">
                直射日光が強く極端に暑い場合はスライダーを右に、冷風が吹き快適な場合は左にスライドしてください。
              </span>
            </div>

            {/* 🌡️ 現地測定器の実測WBGT入力エリア */}
            <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800/50">
              <div className="flex justify-between items-center">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>🌡️ 現地測定器の実測WBGT</span>
                  <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-black tracking-wider uppercase animate-pulse">優先</span>
                </label>
                {isActualPrioritized && (
                  <span className="text-[10px] text-red-600 font-extrabold bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded border border-red-200/30">
                    実測値優先モード起動中
                  </span>
                )}
              </div>
              <div className="relative rounded-lg shadow-sm">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="45"
                  value={wbgtActual}
                  onChange={e => setWbgtActual(e.target.value)}
                  placeholder="現場のWBGT測定器の数値を入力（例: 28.5）"
                  className="w-full h-11 pl-3 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-red-500 shadow-inner"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <span className="text-sm font-bold">℃</span>
                </div>
              </div>
              <span className="block text-[10px] text-slate-400 leading-relaxed">
                現場にWBGT測定機器がある場合は、その数値を入力してください。気象予報データからの自動計算値を完全にオーバーライド（上書き優先）して、現場全体の危険度判定と安全指針に即座に反映します。
              </span>
            </div>

            {/* 🚨 危険領域における職長安全指針チェック（WBGT >= 28℃ の場合のみ表示） */}
            {actualWBGT >= 28 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-4 space-y-3 mt-4 animate-in slide-in-from-top-4 duration-200 shadow-sm">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 border-b border-red-200/40 pb-2">
                  <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse text-red-600 dark:text-red-400" />
                  <span className="font-extrabold text-xs sm:text-sm tracking-wide">🚨 【危険領域】職長安全管理指針 実施確認</span>
                </div>
                
                <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 leading-relaxed font-bold">
                  暑さ指数が危険レベルに達しています。現場の安全を守るため、以下の安全管理対策を実施し、チェックを入れてから保存してください（全項目必須）。
                </p>

                <div className="space-y-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  {[
                    { key: "rest_time", label: "⏱️ 適切な休憩の確保", desc: "1時間に1回以上の適切な休憩を指示・実施した" },
                    { key: "hydration", label: "💧 水分・塩分補給の徹底", desc: "作業前および休憩時の積極的な補給を指示・確認した" },
                    { key: "shade", label: "⛱️ 遮光・冷却設備の設置", desc: "日よけや涼しい休憩場所を確保・整備した" },
                    { key: "buddy_system", label: "👥 バディシステムの実施", desc: "お互いの体調変化を監視し合う体制（二人一組等）を組ませた" },
                    { key: "clothing", label: "👕 適切な装備・服装の確認", desc: "ファン付き作業服、適切な帽子などの着用を促した" }
                  ].map(item => (
                    <label
                      key={item.key}
                      className="flex items-start gap-2 p-2 bg-white/80 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg cursor-pointer transition-all active:scale-[0.99]"
                    >
                      <input
                        type="checkbox"
                        checked={formSafetyChecks[item.key as keyof typeof formSafetyChecks] || false}
                        onChange={e => setFormSafetyChecks(prev => ({ ...prev, [item.key]: e.target.checked }))}
                        className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                      />
                      <div className="space-y-0.5 ml-1">
                        <span className="block font-black text-slate-800 dark:text-slate-200">{item.label}</span>
                        <span className="block text-[9px] text-slate-500 dark:text-slate-400 font-medium leading-normal">{item.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右側：現場メンバー個別健康チェック表 */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200 text-base">
                <Users className="w-5 h-5 text-blue-500" />
                安全アサインメンバー健康状態チェック表
              </h3>
              
              <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
                {/* メンバー動的追加ドロップダウン */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-extrabold text-slate-400">応援追加:</span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddWorker(e.target.value)
                        e.target.value = "" // 選択完了後にクリア
                      }
                    }}
                    className="bg-transparent border-none text-xs font-black text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-0 max-w-[130px]"
                  >
                    <option value="">-- 作業員選択 --</option>
                    {workerMasterList
                      .filter(w => !formWorkers.some(fw => fw.worker_id === w.id)) // すでにリストにある人を除外
                      .map(w => (
                        <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                      ))
                    }
                  </select>
                </div>

                {formWorkers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkCheckOK}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg text-xs font-extrabold transition-all shadow-sm shadow-green-500/20 active:scale-[0.98]"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    全員一括健康OK
                  </button>
                )}
              </div>
            </div>

            {formWorkers.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 dark:bg-slate-950/20 border border-dashed rounded-xl border-slate-200 space-y-3">
                <Users className="w-10 h-10 text-slate-300 mx-auto opacity-50 animate-pulse" />
                <p className="text-sm text-slate-400 font-bold">本日のこの現場への作業員アサインはありません</p>
                <p className="text-xs text-slate-400">（管理者権限で過去のデータを選択、またはアサインマスタを修正してください）</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                {formWorkers.map((worker, index) => (
                  <div
                    key={worker.worker_id}
                    className="border border-slate-100 dark:border-slate-800/80 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col gap-3 hover:border-slate-200 transition-colors shadow-sm"
                  >
                    <div className="flex justify-between items-center border-b pb-2 border-slate-200/40">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-xs border border-blue-500/20 shadow-sm">
                          {worker.worker_name.charAt(0)}
                        </div>
                        <span className="font-extrabold text-sm sm:text-base tracking-wide text-slate-800 dark:text-slate-200">
                          {worker.worker_name}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* 総合自己診断アラート */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide border shadow-sm ${
                          worker.risk_score === "低"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : worker.risk_score === "中"
                            ? "bg-yellow-100 text-yellow-800 border-yellow-200 animate-pulse"
                            : "bg-red-100 text-red-700 border-red-200 animate-pulse"
                        }`}>
                          健康リスク: {worker.risk_score}
                        </span>

                        {/* 除外ボタン */}
                        <button
                          type="button"
                          onClick={() => handleRemoveWorker(worker.worker_id)}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors border border-transparent hover:border-red-200/40"
                          title="この作業員を今回のチェックから除外"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 各種安全項目 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
                      {/* 睡眠時間 */}
                      {checkTimeType === "朝" && (
                        <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">睡眠時間</label>
                          <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => updateWorkerStatus(index, { sleep_hours: 7 })}
                              className={`py-1 rounded border transition-all ${
                                worker.sleep_hours >= 6
                                  ? "bg-blue-100 border-blue-200 text-blue-700 font-extrabold"
                                  : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              6時間以上
                            </button>
                            <button
                              type="button"
                              onClick={() => updateWorkerStatus(index, { sleep_hours: 5 })}
                              className={`py-1 rounded border transition-all ${
                                worker.sleep_hours > 0 && worker.sleep_hours < 6
                                  ? "bg-red-100 border-red-200 text-red-700 font-extrabold animate-pulse"
                                  : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              6時間未満⚠️
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 朝食有無 */}
                      {checkTimeType === "朝" && (
                        <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">朝食の摂取</label>
                          <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => updateWorkerStatus(index, { breakfast: true })}
                              className={`py-1 rounded border transition-all ${
                                worker.breakfast === true
                                  ? "bg-blue-100 border-blue-200 text-blue-700 font-extrabold"
                                  : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              あり
                            </button>
                            <button
                              type="button"
                              onClick={() => updateWorkerStatus(index, { breakfast: false })}
                              className={`py-1 rounded border transition-all ${
                                worker.breakfast === false
                                  ? "bg-red-100 border-red-200 text-red-700 font-extrabold"
                                  : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              なし
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 二日酔い */}
                      {checkTimeType === "朝" && (
                        <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">アルコール・二日酔い</label>
                          <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => updateWorkerStatus(index, { hangover: false })}
                              className={`py-1 rounded border transition-all ${
                                worker.hangover === false
                                  ? "bg-blue-100 border-blue-200 text-blue-700 font-extrabold"
                                  : "bg-slate-50 border-slate-200 text-slate-400"
                              }`}
                            >
                              なし
                            </button>
                            <button
                              type="button"
                              onClick={() => updateWorkerStatus(index, { hangover: true })}
                              className={`py-1 rounded border transition-all ${
                                worker.hangover === true
                                  ? "bg-red-100 border-red-200 text-red-700 font-extrabold animate-pulse"
                                  : "bg-slate-50 border-slate-200 text-slate-400"
                              }`}
                            >
                              あり⚠️
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 水分補給チェック */}
                      <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">水分・塩分補給</label>
                        <button
                          type="button"
                          onClick={() => updateWorkerStatus(index, { water_checked: !worker.water_checked })}
                          className={`w-full py-1.5 mt-1 rounded-md border font-black text-[10px] transition-all flex items-center justify-center gap-1 ${
                            worker.water_checked
                              ? "bg-green-500 border-green-600 text-white shadow-sm"
                              : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          <Smile className="w-3.5 h-3.5" />
                          {worker.water_checked ? "補給ヨシ！" : "未補給"}
                        </button>
                      </div>

                      {/* 尿色（水分状況）チェック */}
                      <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">尿色（水分充足判定）</label>
                        <button
                          type="button"
                          onClick={() => updateWorkerStatus(index, { urine_checked: !worker.urine_checked })}
                          className={`w-full py-1.5 mt-1 rounded-md border font-black text-[10px] transition-all flex items-center justify-center gap-1 ${
                            worker.urine_checked
                              ? "bg-green-500 border-green-600 text-white shadow-sm"
                              : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {worker.urine_checked ? "尿色問題なし" : "未確認"}
                        </button>
                      </div>

                      {/* 自覚症状（その他） */}
                      <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">自覚症状・体調不良</label>
                        <select
                          value={worker.symptoms || "なし"}
                          onChange={e => updateWorkerStatus(index, { symptoms: e.target.value })}
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

                    {/* 個別メモ・気になる点 */}
                    <div className="border-t border-slate-200/40 dark:border-slate-800/40 pt-3">
                      <div className="space-y-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border shadow-sm border-slate-100 dark:border-slate-800/60">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 block flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          <span>気になる点・個別メモ（体調の変化や特記事項）</span>
                        </label>
                        <input
                          type="text"
                          value={worker.comment || ""}
                          onChange={e => updateWorkerStatus(index, { comment: e.target.value })}
                          placeholder="（例：少し顔色が悪い、昨日寝不足と言っていた等、気付いた点を自由に入力）"
                          className="w-full h-8 px-2.5 mt-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-bold text-xs outline-none focus:border-blue-500 dark:focus:border-blue-400 placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-medium text-slate-800 dark:text-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 📝 現場全体の特記事項・指示事項 */}
          {formWorkers.length > 0 && (
            <div className="space-y-2 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 shadow-sm">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-500" />
                <span>📝 現場全体の特記事項・指揮官指示事項</span>
                <span className="text-[10px] font-medium text-slate-400">（任意）</span>
              </label>
              <textarea
                rows={2}
                value={formComment}
                onChange={e => setFormComment(e.target.value)}
                placeholder="本日の作業における熱中症対策、その他全体への指示や特記事項を記入してください（例：1時間ごとに15分の日陰休憩、冷却スプレーの使用指示など）。"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 shadow-inner placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-medium leading-relaxed"
              />
            </div>
          )}

          {/* フォーム保存ボタン ＆ PDF出力 */}
          {formWorkers.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={handleSaveRecord}
                disabled={saving || refreshing}
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/10 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>{existingRecord ? "安全安否データを更新する" : "安全安否データを登録する"}</span>
              </button>

              {existingRecord && (
                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="px-5 h-12 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-extrabold rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <Download className="w-5 h-5" />
                  <span>帳票PDF</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. 美しい印刷専用・隠し A4 帳票レイアウト（react-to-pdfターゲット） */}
      {existingRecord && (
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
                  <p className="text-[11px] text-slate-500 font-bold mt-1">
                    安全管理基準: HITECポータル安全管理ガイドライン
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-slate-800">{formatJST(targetDate, "yyyy年MM月dd日")}</div>
                  <div className="inline-block px-3 py-0.5 bg-blue-600 text-white text-xs font-extrabold rounded-full mt-1">
                    休憩連動: {checkTimeType}
                  </div>
                </div>
              </div>

              {/* 現場・WBGT情報 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50/50">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase">対象稼働現場</h3>
                  <p className="font-extrabold text-slate-800 text-sm">
                    {getProjectDisplayName(selectedProjectId)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-bold">
                    作業指揮者: {workerMasterList.find(w => w.id === foremanId)?.name || "指定なし"}
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50/50 relative">
                  {isActualPrioritized && (
                    <div className="absolute top-2 right-2 bg-red-600 text-[8px] text-white px-1.5 py-0.5 rounded font-black tracking-wide">
                      現地実測優先
                    </div>
                  )}
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase">現地気象 ＆ 安全レベル</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                      現地WBGT: <span className="text-base font-black text-slate-800">{actualWBGT.toFixed(1)}</span>
                      {isActualPrioritized && <span title="現地実測値優先">🌡️</span>}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-[11px] font-extrabold ${currentRisk.colorClass}`}>
                      {currentRisk.level}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">
                    {isActualPrioritized ? (
                      <span className="text-red-600 font-bold">現地測定器による直接測定値（気象予測計算値をオーバーライド）</span>
                    ) : (
                      `気温: ${(baseTemperature + tempOffset).toFixed(1)}℃ | 湿度: {baseHumidity.toFixed(1)}% | 天気: {formWeather}`
                    )}
                  </p>
                </div>
              </div>

              {/* 指針 */}
              <div className="border-l-4 border-blue-500 bg-blue-50/30 p-3 rounded-r-lg">
                <span className="text-xs font-bold text-blue-800 block mb-1">📢 安全・予防指針</span>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  {currentRisk.instruction}
                </p>
              </div>

              {/* メンバーチェック状況 */}
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wide">
                  👷‍♂️ 参加作業員チェックリスト
                </h3>
                <table className="w-full text-[10px] text-left border-collapse border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <th className="p-2 border-r border-slate-200">作業員名</th>
                      {checkTimeType === "朝" && (
                        <>
                          <th className="p-2 text-center border-r border-slate-200">睡眠</th>
                          <th className="p-2 text-center border-r border-slate-200">朝食</th>
                          <th className="p-2 text-center border-r border-slate-200">二日酔い</th>
                        </>
                      )}
                      <th className="p-2 text-center border-r border-slate-200">症状</th>
                      <th className="p-2 border-r border-slate-200">個別メモ・気になる点</th>
                      <th className="p-2 text-center border-r border-slate-200">水分</th>
                      <th className="p-2 text-center border-r border-slate-200">尿色</th>
                      <th className="p-2 text-right">リスク</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                    {formWorkers.map(w => (
                      <tr key={w.worker_id}>
                        <td className="p-2 font-bold text-slate-800 border-r border-slate-200">{w.worker_name}</td>
                        {checkTimeType === "朝" && (
                          <>
                            <td className="p-2 text-center border-r border-slate-200">{w.sleep_hours || 0}時間</td>
                            <td className="p-2 text-center border-r border-slate-200">{w.breakfast ? "あり" : "なし"}</td>
                            <td className="p-2 text-center border-r border-slate-200">{w.hangover ? "あり⚠️" : "なし"}</td>
                          </>
                        )}
                        <td className="p-2 text-center border-r border-slate-200">{w.symptoms || "異常なし"}</td>
                        <td className="p-2 border-r border-slate-200 text-slate-500 max-w-[150px] truncate" title={w.comment || ""}>
                          {w.comment || "—"}
                        </td>
                        <td className="p-2 text-center border-r border-slate-200">{w.water_checked ? "補給済" : "未確認"}</td>
                        <td className="p-2 text-center border-r border-slate-200">{w.urine_checked ? "正常" : "未確認"}</td>
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

              {/* 【新規追加】現場全体の特記事項 ＆ 安全指針実施確認証跡（PDF用） */}
              {(formComment || (actualWBGT >= 28)) && (
                <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                  {/* 全体コメント */}
                  {formComment ? (
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-blue-500" />
                        <span>📝 現場全体特記事項・指示事項</span>
                      </h4>
                      <p className="text-[11px] text-slate-700 leading-relaxed font-semibold whitespace-pre-wrap">
                        {formComment}
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/30 flex items-center justify-center">
                      <p className="text-[10px] text-slate-400 font-bold">現場全体特記事項なし</p>
                    </div>
                  )}

                  {/* 安全管理指針 実施証跡（28℃以上のみ） */}
                  {actualWBGT >= 28 ? (
                    <div className="border border-red-200 rounded-lg p-3 bg-red-50/20">
                      <h4 className="text-[10px] font-extrabold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>🚨 暑さ指数危険領域における職長指針実施確認証跡</span>
                      </h4>
                      <div className="space-y-1 text-[9px] font-bold text-slate-700">
                        {[
                          { key: "rest_time", label: "⏱️ 適切な休憩の確保" },
                          { key: "hydration", label: "💧 水分・塩分補給の徹底" },
                          { key: "shade", label: "⛱️ 遮光・冷却設備の設置" },
                          { key: "buddy_system", label: "👥 バディシステムの実施" },
                          { key: "clothing", label: "👕 適切な装備・服装の確認" }
                        ].map(item => {
                          const checked = formSafetyChecks[item.key as keyof typeof formSafetyChecks] || false
                          return (
                            <div key={item.key} className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-black ${checked ? "text-green-600" : "text-red-500"}`}>
                                {checked ? "☑" : "☐"}
                              </span>
                              <span className={checked ? "text-slate-700" : "text-slate-400 line-through"}>
                                {item.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/30 flex items-center justify-center">
                      <p className="text-[10px] text-slate-400 font-bold">安全管理指針（WBGT 28℃未満につき対象外）</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-[10px] text-slate-400 font-medium">
              <div>
                報告書ID: {existingRecord?.id || "N/A"} | 作成日時: {formatJST(existingRecord?.checked_at || new Date(), "yyyy/MM/dd HH:mm")}
              </div>
              <div className="font-extrabold tracking-wide text-blue-800/80">
                HITEC 熱中症・安全管理アラート
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. モーダルダイアログ */}
      {modalMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-4 flex items-center gap-3 border-b ${
              modalMessage.type === "success"
                ? "bg-green-50 border-green-100 text-green-800 dark:bg-green-950/20 dark:border-green-900/30 dark:text-green-400"
                : "bg-red-50 border-red-100 text-red-800 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-400"
            }`}>
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="font-extrabold text-lg">
                {modalMessage.type === "success" ? "保存成功" : "エラー"}
              </h3>
            </div>
            <div className="p-5 text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed">
              {modalMessage.text}
            </div>
            <div className="px-5 pb-5 flex justify-end">
              <button
                type="button"
                onClick={() => setModalMessage(null)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-lg shadow-sm shadow-blue-500/10 active:scale-[0.98] transition-all text-xs"
              >
                確認 (OK)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. 管理者詳細プレビュー用ポップアップモーダル（新規追加） */}
      {adminSelectedCheck && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 my-8">
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 px-2.5 py-0.5 rounded-full font-black tracking-wider uppercase">
                  管理者用詳細プレビュー
                </span>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100 mt-1">
                  {adminSelectedCheck.projectName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAdminSelectedCheck(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer border-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* モーダルコンテンツ */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
              
              {/* 基本＆WBGT情報 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100 dark:border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block uppercase">登録日時 ＆ 時間帯</span>
                  <p className="text-slate-800 dark:text-slate-200 font-extrabold mt-1">
                    {formatJST(adminSelectedCheck.checked_at, "yyyy/MM/dd HH:mm")} （{adminSelectedCheck.timeType}）
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">
                    作業指揮者: {workerMasterList.find(w => w.id === adminSelectedCheck.foreman_id)?.name || "指定なし"}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">測定WBGT ＆ 危険度</span>
                    <p className="text-slate-800 dark:text-slate-100 font-black text-base sm:text-lg mt-1 flex items-center gap-1">
                      🌡️ {(adminSelectedCheck.wbgt || 0).toFixed(1)} <span className="text-xs text-slate-400 font-medium">℃</span>
                    </p>
                  </div>
                  <div>
                    {(() => {
                      const risk = getRiskLevel(adminSelectedCheck.wbgt || 0)
                      return (
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-black ${risk.colorClass}`}>
                          {risk.level}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* 環境と気象 */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-2">
                <div>環境: <span className="text-slate-800 dark:text-slate-200 font-bold">{adminSelectedCheck.environment_type || "未設定"}</span></div>
                <div>天気: <span className="text-slate-800 dark:text-slate-200 font-bold">{adminSelectedCheck.weather || "未設定"}</span></div>
                {!(adminSelectedCheck.environment_type || "").includes("(現地実測)") && (
                  <>
                    <div>設定気温補正: <span className="text-slate-800 dark:text-slate-200 font-bold">{(adminSelectedCheck.temp_offset || 0).toFixed(1)}℃</span></div>
                    <div>基準気温: <span className="text-slate-800 dark:text-slate-200 font-bold">{(adminSelectedCheck.temperature || 0).toFixed(1)}℃</span></div>
                    <div>基準湿度: <span className="text-slate-800 dark:text-slate-200 font-bold">{(adminSelectedCheck.humidity || 0).toFixed(1)}%</span></div>
                  </>
                )}
              </div>

              {/* 🚨 【危険領域】安全指針チェック状況 */}
              {(adminSelectedCheck.wbgt || 0) >= 28 && (
                <div className="p-4 bg-red-50/40 dark:bg-red-950/10 rounded-xl border border-red-200/40 dark:border-red-900/20">
                  <h4 className="text-xs font-black text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5 border-b border-red-100 dark:border-red-900/30 pb-2">
                    <ShieldAlert className="w-4 h-4 animate-pulse text-red-500" />
                    <span>🚨 【危険領域】職長安全管理指針 実施証跡</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {[
                      { key: "rest_time", label: "⏱️ 適切な休憩の確保" },
                      { key: "hydration", label: "💧 水分・塩分補給の徹底" },
                      { key: "shade", label: "⛱️ 遮光・冷却設備の設置" },
                      { key: "buddy_system", label: "👥 バディシステムの実施" },
                      { key: "clothing", label: "👕 適切な装備・服装の確認" }
                    ].map(item => {
                      const checked = (adminSelectedCheck.safety_checks && adminSelectedCheck.safety_checks[item.key]) || false
                      return (
                        <div
                          key={item.key}
                          className={`flex items-center gap-2 p-2 rounded-lg border ${
                            checked
                              ? "bg-green-500/10 border-green-200/30 dark:border-green-900/20 text-slate-800 dark:text-slate-200"
                              : "bg-red-500/10 border-red-200/30 dark:border-red-900/20 text-slate-400 line-through"
                          }`}
                        >
                          <span className={`text-base font-black ${checked ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                            {checked ? "☑" : "☐"}
                          </span>
                          <span>{item.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 現場全体の特記事項 */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>📝 現場全体の特記事項・指示事項</span>
                </h4>
                {adminSelectedCheck.comment ? (
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-bold whitespace-pre-wrap bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200/50 dark:border-slate-800 shadow-inner">
                    {adminSelectedCheck.comment}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">記述なし</p>
                )}
              </div>

              {/* 作業員チェックリスト一覧 */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-500" />
                  <span>👷‍♂️ 作業員安否・健康チェック一覧</span>
                </h4>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-950">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-bold text-slate-600 dark:text-slate-400">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <th className="p-3 border-r border-slate-200 dark:border-slate-800">作業員</th>
                          {adminSelectedCheck.check_time_type === "朝" && (
                            <>
                              <th className="p-3 text-center border-r border-slate-200 dark:border-slate-800 font-bold">睡眠</th>
                              <th className="p-3 text-center border-r border-slate-200 dark:border-slate-800 font-bold">朝食</th>
                              <th className="p-3 text-center border-r border-slate-200 dark:border-slate-800 font-bold">酒</th>
                            </>
                          )}
                          <th className="p-3 text-center border-r border-slate-200 dark:border-slate-800 font-bold">自覚症状</th>
                          <th className="p-3 border-r border-slate-200 dark:border-slate-800 font-bold">気になる点・個別メモ</th>
                          <th className="p-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold">水分</th>
                          <th className="p-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold">尿色</th>
                          <th className="p-3 text-right font-bold">リスク</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
                        {((adminSelectedCheck.worker_checks as any[]) || []).map((w, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-all">
                            <td className="p-3 font-extrabold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">
                              {w.worker_name}
                            </td>
                            {adminSelectedCheck.check_time_type === "朝" && (
                              <>
                                <td className="p-3 text-center border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                  {w.sleep_hours || 0}h
                                </td>
                                <td className="p-3 text-center border-r border-slate-200 dark:border-slate-800">
                                  {w.breakfast ? (
                                    <span className="text-green-600 dark:text-green-400">あり</span>
                                  ) : (
                                    <span className="text-red-500 font-extrabold">なし⚠️</span>
                                  )}
                                </td>
                                <td className="p-3 text-center border-r border-slate-200 dark:border-slate-800">
                                  {w.hangover ? (
                                    <span className="text-red-500 font-extrabold bg-red-100 dark:bg-red-950/30 px-1.5 py-0.5 rounded animate-pulse">
                                      あり⚠️
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">なし</span>
                                  )}
                                </td>
                              </>
                            )}
                            <td className="p-3 text-center border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                              {w.symptoms && w.symptoms !== "なし" ? (
                                <span className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded">
                                  {w.symptoms}⚠️
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">異常なし</span>
                              )}
                            </td>
                            <td className="p-3 border-r border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 max-w-[150px] truncate" title={w.comment || ""}>
                              {w.comment || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                            </td>
                            <td className="p-2 text-center border-r border-slate-200 dark:border-slate-800">
                              {w.water_checked ? (
                                <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-black">ヨシ</span>
                              ) : (
                                <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-black">未確認</span>
                              )}
                            </td>
                            <td className="p-2 text-center border-r border-slate-200 dark:border-slate-800">
                              {w.urine_checked ? (
                                <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-black">正常</span>
                              ) : (
                                <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-black">未確認</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-black">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  w.risk_score === "低"
                                    ? "bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400"
                                    : w.risk_score === "中"
                                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400"
                                    : "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400"
                                }`}
                              >
                                {w.risk_score}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>

            {/* モーダルフッター */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setAdminSelectedCheck(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold rounded-xl text-xs transition-all active:scale-[0.98] border-none cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
