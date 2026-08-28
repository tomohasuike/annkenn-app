import { Fragment, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { Loader2, Search, Building2, ChevronDown, ChevronRight, Link2, Link2Off, TrendingUp, TrendingDown, Minus, Trophy, Users } from "lucide-react"
import { toast } from 'sonner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'

type Customer = {
  id: string
  legacy_codes: string[]
  category: string
  company_name: string
  contact_name: string | null
  department: string | null
  postal_code: string | null
  address1: string | null
  address2: string | null
  phone: string | null
  fax: string | null
  notes: string | null
  billing_destination_alias: string | null
}

type RevenueRow = {
  customer_id: string
  year_month: string
  amount: number | null
  source: 'manual_excel' | 'auto_invoice'
}

const CATEGORIES = ['役所関係', '会社関係', '工場関係', '建築関係', '一般顧客']
const CATEGORY_COLORS: Record<string, string> = {
  '役所関係': '#2563eb',
  '会社関係': '#7c3aed',
  '工場関係': '#059669',
  '建築関係': '#d97706',
  '一般顧客': '#64748b',
}

function yenFmt(n: number) {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

function yenCompact(n: number) {
  const abs = Math.abs(n)
  if (abs >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '億'
  if (abs >= 10000) return Math.round(n / 10000).toLocaleString('ja-JP') + '万'
  return n.toLocaleString('ja-JP')
}

// 会社の年度は5月始まり4月締め（例: R7年度 = 2025年5月〜2026年4月）
function fiscalYearOf(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number)
  const calendarYearAtStart = m >= 5 ? y : y - 1
  return calendarYearAtStart - 2018
}

function monthsOfFiscalYear(fy: number): string[] {
  const startYear = 2018 + fy
  const out: string[] = []
  for (let m = 5; m <= 12; m++) out.push(`${startYear}-${String(m).padStart(2, '0')}`)
  for (let m = 1; m <= 4; m++) out.push(`${startYear + 1}-${String(m).padStart(2, '0')}`)
  return out
}

function currentFiscalYear(): number {
  const now = new Date()
  return fiscalYearOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
}

export default function Customers() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [search, setSearch] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedFY, setSelectedFY] = useState<number>(() => currentFiscalYear())

  useEffect(() => {
    checkAccessAndFetchData()
  }, [])

  async function checkAccessAndFetchData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        navigate('/login')
        return
      }

      const { data: workerData, error: workerError } = await supabase
        .from('worker_master')
        .select('allowed_apps, is_admin')
        .eq('email', user.email)
        .single()

      if (workerError) {
        console.error("Failed to fetch worker data:", workerError)
        navigate('/')
        return
      }

      const permissions = workerData?.allowed_apps || []
      // 社内公開前のため、明示的に 'customers' 権限を持つアカウントのみアクセス可（billing権限だけでは不可）
      const hasAccess = permissions.includes('customers')

      if (!hasAccess) {
        toast.error("顧客管理にアクセスする権限がありません。")
        navigate('/')
        return
      }

      await fetchData()
    } catch (error) {
      console.error("Access check error:", error)
      navigate('/')
    }
  }

  async function fetchData() {
    try {
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .order('company_name', { ascending: true })

      if (customerError) throw customerError
      setCustomers(customerData || [])

      const { data: revenueData, error: revenueError } = await supabase
        .from('customer_revenue_by_month')
        .select('*')

      if (revenueError) throw revenueError
      setRevenue(revenueData || [])
    } catch (err) {
      console.error("Error fetching customers:", err)
      toast.error("顧客データの取得に失敗しました。")
    } finally {
      setLoading(false)
    }
  }

  const revenueByCustomer = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const r of revenue) {
      if (!r.amount) continue
      if (!map.has(r.customer_id)) map.set(r.customer_id, new Map())
      const monthMap = map.get(r.customer_id)!
      monthMap.set(r.year_month, (monthMap.get(r.year_month) || 0) + Number(r.amount))
    }
    return map
  }, [revenue])

  const fiscalYears = useMemo(() => {
    const set = new Set<number>()
    for (const r of revenue) set.add(fiscalYearOf(r.year_month))
    set.add(currentFiscalYear())
    return Array.from(set).sort((a, b) => a - b)
  }, [revenue])

  const selectedFYMonths = useMemo(() => monthsOfFiscalYear(selectedFY), [selectedFY])

  function fyTotal(customerId: string) {
    const monthMap = revenueByCustomer.get(customerId)
    if (!monthMap) return 0
    let total = 0
    for (const m of selectedFYMonths) total += monthMap.get(m) || 0
    return total
  }

  const searchLower = search.trim().toLowerCase()
  const filtered = customers.filter(c => {
    if (selectedCategories.length > 0 && !selectedCategories.includes(c.category)) return false
    if (!searchLower) return true
    return (
      c.company_name.toLowerCase().includes(searchLower) ||
      (c.contact_name || '').toLowerCase().includes(searchLower) ||
      (c.address1 || '').toLowerCase().includes(searchLower) ||
      c.legacy_codes.some(code => code.includes(searchLower))
    )
  })

  const sorted = [...filtered].sort((a, b) => fyTotal(b.id) - fyTotal(a.id))

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  // ダッシュボード集計（検索・区分の絞り込みを反映）
  const yearTotals = useMemo(() => {
    const map = new Map<number, number>()
    for (const fy of fiscalYears) map.set(fy, 0)
    for (const c of filtered) {
      const monthMap = revenueByCustomer.get(c.id)
      if (!monthMap) continue
      for (const [ym, amt] of monthMap) {
        const fy = fiscalYearOf(ym)
        if (map.has(fy)) map.set(fy, (map.get(fy) || 0) + amt)
      }
    }
    return map
  }, [filtered, revenueByCustomer, fiscalYears])

  const yearChartData = useMemo(() => fiscalYears.map(fy => ({
    fy,
    label: `R${fy}`,
    total: yearTotals.get(fy) || 0,
  })), [fiscalYears, yearTotals])

  const monthlyChartData = useMemo(() => selectedFYMonths.map(m => {
    let total = 0
    for (const c of filtered) {
      const monthMap = revenueByCustomer.get(c.id)
      if (monthMap) total += monthMap.get(m) || 0
    }
    return { month: m, label: `${Number(m.split('-')[1])}月`, total }
  }), [selectedFYMonths, filtered, revenueByCustomer])

  // 区分別の取引額割合（R{selectedFY}年度、検索・区分絞り込みを反映）
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const cat of CATEGORIES) map.set(cat, 0)
    for (const c of filtered) {
      const total = fyTotal(c.id)
      if (total <= 0) continue
      map.set(c.category, (map.get(c.category) || 0) + total)
    }
    return CATEGORIES
      .map(cat => ({ category: cat, total: map.get(cat) || 0 }))
      .filter(d => d.total > 0)
  }, [filtered, revenueByCustomer, selectedFY])

  const categoryBreakdownTotal = categoryBreakdown.reduce((sum, d) => sum + d.total, 0)

  const selectedYearTotal = yearTotals.get(selectedFY) || 0
  const prevYearTotal = yearTotals.has(selectedFY - 1) ? (yearTotals.get(selectedFY - 1) || 0) : null
  const yoyChangePct = prevYearTotal ? ((selectedYearTotal - prevYearTotal) / prevYearTotal) * 100 : null
  const activeCustomerCount = filtered.filter(c => fyTotal(c.id) > 0).length
  const topCustomerForFY = sorted[0]

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-6xl mx-auto">
      <div className="shrink-0 space-y-6 pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">顧客管理</h2>
          <p className="text-muted-foreground">取引先の連絡先と年度別取引額を管理します（5月始まり4月締め。R8年5月以降は請求データから自動集計）</p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
          {fiscalYears.map(fy => (
            <button
              key={fy}
              onClick={() => setSelectedFY(fy)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                selectedFY === fy
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              R{fy}年度
              {fy === currentFiscalYear() && <span className="ml-1 text-[10px] text-primary">●進行中</span>}
            </button>
          ))}
        </div>

        {/* ダッシュボード */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card shadow-sm p-4">
            <div className="text-xs text-muted-foreground font-semibold">R{selectedFY}年度 合計取引額</div>
            <div className="text-2xl font-black tracking-tight mt-1 font-mono">{yenFmt(selectedYearTotal)}</div>
          </div>
          <div className="rounded-xl border bg-card shadow-sm p-4">
            <div className="text-xs text-muted-foreground font-semibold">前年度比（R{selectedFY - 1}年度）</div>
            {yoyChangePct === null ? (
              <div className="text-2xl font-black tracking-tight mt-1 text-muted-foreground">—</div>
            ) : (
              <div className={`flex items-center gap-1.5 mt-1 ${yoyChangePct > 0 ? 'text-green-600' : yoyChangePct < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {yoyChangePct > 0 ? <TrendingUp className="w-5 h-5" /> : yoyChangePct < 0 ? <TrendingDown className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                <span className="text-2xl font-black tracking-tight font-mono">{yoyChangePct > 0 ? '+' : ''}{yoyChangePct.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-card shadow-sm p-4">
            <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1"><Users className="w-3.5 h-3.5" />取引のあった顧客数</div>
            <div className="text-2xl font-black tracking-tight mt-1 font-mono">{activeCustomerCount}<span className="text-sm font-medium text-muted-foreground ml-1">/ {filtered.length}社</span></div>
          </div>
          <div className="rounded-xl border bg-card shadow-sm p-4">
            <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />最大の取引先</div>
            {topCustomerForFY && fyTotal(topCustomerForFY.id) > 0 ? (
              <>
                <div className="text-sm font-bold truncate mt-1">{topCustomerForFY.company_name}</div>
                <div className="text-lg font-black font-mono">{yenFmt(fyTotal(topCustomerForFY.id))}</div>
              </>
            ) : (
              <div className="text-2xl font-black tracking-tight mt-1 text-muted-foreground">—</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card shadow-sm p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">年度別売上推移（クリックで年度切替）</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={yenCompact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                  <RechartsTooltip formatter={(v) => yenFmt(Number(v))} labelFormatter={(l) => `${l}年度`} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: any) => setSelectedFY(d.fy)}>
                    {yearChartData.map(d => (
                      <Cell key={d.fy} fill={d.fy === selectedFY ? '#2563eb' : '#93c5fd'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-sm p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">R{selectedFY}年度 月別推移（5月〜4月）</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={yenCompact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                  <RechartsTooltip formatter={(v) => yenFmt(Number(v))} />
                  <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-sm p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">R{selectedFY}年度 区分別割合</h3>
            {categoryBreakdown.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                この年度の取引データがありません
              </div>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="total"
                      nameKey="category"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {categoryBreakdown.map(d => (
                        <Cell key={d.category} fill={CATEGORY_COLORS[d.category] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: any, _name: any, item: any) => {
                        const v = Number(value)
                        return [
                          `${yenFmt(v)}（${((v / categoryBreakdownTotal) * 100).toFixed(1)}%）`,
                          item?.payload?.category,
                        ]
                      }}
                    />
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative shadow-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="会社名、担当者名、住所、顧客コードで検索..."
              className="flex h-10 w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 pl-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors hover:bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">区分</span>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                  selectedCategories.includes(cat)
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-input hover:bg-muted hover:border-muted-foreground/30'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border bg-card shadow-sm flex flex-col overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center p-12 flex-1">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/95 backdrop-blur-sm text-muted-foreground uppercase text-xs sticky top-0 z-10 shadow-sm border-b">
                <tr>
                  <th className="px-6 py-3 font-medium w-8"></th>
                  <th className="px-6 py-3 font-medium">会社名</th>
                  <th className="px-6 py-3 font-medium">連絡先</th>
                  <th className="px-6 py-3 font-medium">請求データ連携</th>
                  <th className="px-6 py-3 font-medium text-right">R{selectedFY}年度合計</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <Building2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      条件に一致する顧客が見つかりません
                    </td>
                  </tr>
                ) : (
                  sorted.map(c => {
                    const isExpanded = expandedId === c.id
                    const monthMap = revenueByCustomer.get(c.id)
                    return (
                      <Fragment key={c.id}>
                        <tr
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        >
                          <td className="px-6 py-4 text-muted-foreground">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-foreground">{c.company_name}</div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-medium">{c.category}</span>
                              <span className="font-mono text-muted-foreground/70">{c.legacy_codes.join(' / ')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            {c.contact_name && <div>{c.contact_name}</div>}
                            {c.phone && <div>{c.phone}</div>}
                            {c.address1 && <div className="truncate max-w-[220px]">{c.address1}</div>}
                          </td>
                          <td className="px-6 py-4">
                            {c.billing_destination_alias ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 text-green-700 border border-green-500/20 px-2.5 py-1 text-xs font-semibold">
                                <Link2 className="w-3 h-3" />
                                {c.billing_destination_alias}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-200/50 text-gray-500 border border-gray-300 px-2.5 py-1 text-xs font-semibold">
                                <Link2Off className="w-3 h-3" />
                                未連携
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-mono">
                            {yenFmt(fyTotal(c.id))}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={5} className="px-6 py-4">
                              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                                {selectedFYMonths.map(m => (
                                  <div key={m} className="rounded border bg-background px-2 py-1.5 text-center">
                                    <div className="text-[10px] text-muted-foreground">{m}</div>
                                    <div className="text-xs font-mono font-semibold">
                                      {monthMap?.get(m) ? yenFmt(monthMap.get(m)!) : '—'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {c.notes && (
                                <div className="mt-3 text-xs text-muted-foreground">備考: {c.notes}</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
