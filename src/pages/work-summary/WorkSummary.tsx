import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { ProjectSummary, MaterialEntry } from './useWorkSummary';
import { useWorkSummary } from './useWorkSummary';
import { PieChart, Hammer, Briefcase, FileSignature, List, Truck, Building2, UserCircle, Package, Camera, FileText, Info } from 'lucide-react';
import ReportDetailsModal from '../../components/reports/ReportDetailsModal';
import ProjectDetailsModal from '../../components/work-summary/ProjectDetailsModal';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

// Google Driveの画像用直接リンク(lh3.googleusercontent.com/d/ID)を、正規プレビューURL(drive.google.com/file/d/ID/view)へ自動コンバートする
function fixDriveDocUrl(url: string): string {
  if (!url) return '';
  if (url.includes('lh3.googleusercontent.com/d/')) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/view?usp=drivesdk`;
    }
  }
  return url;
}

export default function WorkSummary() {
  const { data, loading, error, fetchData, projectsList } = useWorkSummary();
  
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState('');
  const [kubunFilter, setKubunFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isAllTime, setIsAllTime] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedProjectForModal, setSelectedProjectForModal] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchData(startDate, endDate, projectId, isAllTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleSearch = () => {
    if (!startDate || !endDate) {
      toast.warning('期間を設定してください');
      return;
    }
    fetchData(startDate, endDate, projectId, isAllTime);
  };

  const exportMaterialsToExcel = (groups: { projectName: string; items: MaterialEntry[] }[]) => {
    if (groups.length === 0) {
      toast.warning('出力できる材料データがありません');
      return;
    }
    const rows: (string | number)[][] = [['案件名', '品名', '数量', '日付', '発注/在庫等', '確認状態']];
    groups.forEach(group => {
      group.items.forEach(m => {
        rows.push([group.projectName, m.name, m.quantity, m.date, m.note || '', m.checked ? '確認済み' : '未確認']);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '使用材料');
    const todayStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `使用材料一覧_${todayStr}.xlsx`);
  };

  const searchLower = searchQuery.toLowerCase();

  const filteredProjectsDropdown = projectsList
    .filter(p => kubunFilter === 'ALL' || p.kubun === kubunFilter)
    .filter(p => statusFilter === 'ALL' || p.status === statusFilter)
    .filter(p => !searchLower || p.name.toLowerCase().includes(searchLower) || (p.no && p.no.toLowerCase().includes(searchLower)))
    .sort((a,b) => b.no.localeCompare(a.no, undefined, {numeric: true}));

  const projects = data ? Object.values(data.projects).sort((a, b) => b.totalHours - a.totalHours) : [];

  const statusById = new Map(projectsList.map(p => [p.id, p.status]));

  const displayedProjects = projects.filter(p => {
    const matchesSearch = !searchLower || p.name.toLowerCase().includes(searchLower) || (p.no && p.no.toLowerCase().includes(searchLower));
    const matchesKubun = kubunFilter === 'ALL' || p.kubun === kubunFilter;
    const matchesStatus = statusFilter === 'ALL' || statusById.get(p.id) === statusFilter;

    return matchesSearch && matchesKubun && matchesStatus;
  });

  // 区分・ステータス・検索の各フィルタを反映した集計を、表示中の案件(displayedProjects)から都度計算する
  const kubunDetails = {
    kouji: { normal: 0, ot: 0, nightOt: 0 },
    kanri: { normal: 0, ot: 0, nightOt: 0 },
    mitsumori: { normal: 0, ot: 0, nightOt: 0 },
  };
  const equipment: Record<string, number> = {};

  displayedProjects.forEach(p => {
    (['kouji', 'kanri', 'mitsumori'] as const).forEach(cat => {
      kubunDetails[cat].normal += p.breakdownDetails[cat].normal;
      kubunDetails[cat].ot += p.breakdownDetails[cat].ot;
      kubunDetails[cat].nightOt += p.breakdownDetails[cat].nightOt;
    });
    Object.entries(p.equipment).forEach(([name, count]) => {
      equipment[name] = (equipment[name] || 0) + count;
    });
  });

  const s = data ? {
    kubunTotals: {
      kouji: kubunDetails.kouji.normal + kubunDetails.kouji.ot + kubunDetails.kouji.nightOt,
      kanri: kubunDetails.kanri.normal + kubunDetails.kanri.ot + kubunDetails.kanri.nightOt,
      mitsumori: kubunDetails.mitsumori.normal + kubunDetails.mitsumori.ot + kubunDetails.mitsumori.nightOt,
    },
    kubunDetails,
    totalHours: 0, totalOT: 0, totalNightOT: 0,
    totalPeople: 0, equipment,
  } : undefined;

  // 協力会社別・作業員別も、区分/ステータス/検索/作業員フィルタを反映したdisplayedProjectsから再集計する
  const displayedProjectNames = new Set(displayedProjects.map(p => p.name));

  const filteredCompanies: Record<string, { total: number; projects: { date: string; projectName: string; count: number }[] }> = {};
  if (data) {
    Object.entries(data.companies).forEach(([name, info]) => {
      const projectsInScope = info.projects.filter(proj => displayedProjectNames.has(proj.projectName));
      if (projectsInScope.length > 0) {
        filteredCompanies[name] = {
          total: projectsInScope.reduce((sum, p) => sum + p.count, 0),
          projects: projectsInScope,
        };
      }
    });
  }

  const filteredStaff: Record<string, { displayName: string } & Record<'kouji' | 'kanri' | 'mitsumori', { normal: number; ot: number; nightOt: number }>> = {};
  displayedProjects.forEach(p => {
    Object.entries(p.staffBreakdown).forEach(([key, sd]) => {
      if (!filteredStaff[key]) {
        filteredStaff[key] = {
          displayName: sd.displayName,
          kouji: { normal: 0, ot: 0, nightOt: 0 },
          kanri: { normal: 0, ot: 0, nightOt: 0 },
          mitsumori: { normal: 0, ot: 0, nightOt: 0 },
        };
      }
      (['kouji', 'kanri', 'mitsumori'] as const).forEach(cat => {
        filteredStaff[key][cat].normal += sd[cat].normal;
        filteredStaff[key][cat].ot += sd[cat].ot;
        filteredStaff[key][cat].nightOt += sd[cat].nightOt;
      });
    });
  });

  const materialsList: MaterialEntry[] = [];
  const photoLinksMap = new Map<string, { projectName: string, url: string, fileName: string }>();
  const docLinksMap = new Map<string, { projectName: string, url: string, fileName: string }>();

  displayedProjects.forEach(p => {
    p.materials.forEach(m => materialsList.push(m));
    p.photos.forEach(obj => { if (obj && obj.url && !photoLinksMap.has(obj.url)) photoLinksMap.set(obj.url, obj); });
    p.docs.forEach(obj => { if (obj && obj.url && !docLinksMap.has(obj.url)) docLinksMap.set(obj.url, obj); });
  });
  materialsList.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.name.localeCompare(b.name));

  const materialsByProject: { projectName: string; items: MaterialEntry[] }[] = [];
  materialsList.forEach(m => {
    const lastGroup = materialsByProject[materialsByProject.length - 1];
    if (lastGroup && lastGroup.projectName === m.projectName) {
      lastGroup.items.push(m);
    } else {
      materialsByProject.push({ projectName: m.projectName, items: [m] });
    }
  });

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <header className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PieChart className="w-6 h-6 text-primary" /> 作業集計管理
          </h1>
          <p className="text-muted-foreground text-sm font-medium">完工案件・名寄せ・実働時間・建機/日別リスト対応</p>
        </div>

        <Link
          to="/work-summary/material-check"
          className="inline-flex items-center gap-2 bg-card border rounded-lg px-4 h-11 font-bold text-sm shadow-sm hover:bg-muted/50 transition-colors self-start"
        >
          <ClipboardCheck className="w-4 h-4 text-primary" /> 材料チェック
        </Link>

        <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border shadow-sm">
          {/* 1行目: 区分フィルタ / ステータス / 案件検索 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">区分フィルタ</label>
              <select
                value={kubunFilter}
                onChange={(e) => {
                  setKubunFilter(e.target.value);
                  setProjectId('');
                }}
                className="border rounded-md px-3 py-1.5 text-sm bg-muted/50 focus:ring-2 focus:ring-primary font-bold outline-none h-9"
              >
                <option value="ALL">全ての区分</option>
                <option value="役所">役所</option>
                <option value="一般">一般</option>
                <option value="川北">川北</option>
                <option value="BPE">BPE</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">ステータス</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary font-bold outline-none h-9"
              >
                <option value="ALL">全てのステータス</option>
                <option value="着工前">着工前</option>
                <option value="着工中">着工中</option>
                <option value="完工">完工</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">案件検索</label>
              <input
                type="text"
                placeholder="案件名や番号を入力..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary font-bold outline-none h-9 w-[150px] md:w-[200px]"
              />
            </div>
          </div>

          {/* 2行目: 案件選択 / 作業員選択 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">案件選択</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background min-w-[150px] md:min-w-[200px] focus:ring-2 focus:ring-primary font-bold outline-none h-9"
              >
                <option value="">全ての案件を表示</option>
                {filteredProjectsDropdown.map(p => (
                  <option key={p.id} value={p.id}>[{p.no || '未設定'}] {p.name} ({p.status})</option>
                ))}
              </select>
            </div>
          </div>

          {/* 3行目: 月で選択 / 集計期間 / 全体集計 / 集計実行 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">月で選択 <span className="normal-case font-medium text-muted-foreground/70">(→右の期間に反映)</span></label>
              <input
                type="month"
                value={startDate.slice(0, 7)}
                onChange={e => {
                  if (!e.target.value) return;
                  const [y, m] = e.target.value.split('-').map(Number);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  // toISOString()はUTC変換を挟むため日本時間だと日付が1日ずれる。
                  // ローカルのDateから年月日を直接文字列化することでズレを防ぐ。
                  const lastDay = new Date(y, m, 0).getDate();
                  setStartDate(`${y}-${pad(m)}-01`);
                  setEndDate(`${y}-${pad(m)}-${pad(lastDay)}`);
                }}
                className="border rounded-md px-2 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary font-bold outline-none h-9"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">集計期間 (実際に使われる範囲)</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="border rounded-md px-2 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary font-bold outline-none h-9"
                />
                <span className="text-muted-foreground font-bold">~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="border rounded-md px-2 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary font-bold outline-none h-9"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 self-end mb-1 bg-background px-3 h-9 rounded-md border">
              <input
                type="checkbox"
                id="allTimeCheck"
                checked={isAllTime}
                onChange={e => setIsAllTime(e.target.checked)}
                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
              />
              <label htmlFor="allTimeCheck" className="text-xs font-bold text-foreground cursor-pointer select-none">全体集計 (全期間)</label>
            </div>

            <div className="flex flex-col self-end">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 h-9 rounded-md text-sm font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? '集計中...' : '集計実行'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8 border border-red-200 font-medium text-sm">
          {error}
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border rounded-xl px-6 py-6 flex items-center justify-between border-t-4 border-t-blue-500 shadow-sm">
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">区分：工事 合計</p>
            <p className="text-4xl md:text-5xl font-bold tracking-tight">
              {s ? s.kubunTotals.kouji.toFixed(1) : '0.0'} <span className="text-xl font-normal text-muted-foreground">h</span>
            </p>
            {s && (
              <div className="text-xs font-medium mt-3 flex flex-wrap gap-2">
                <span className="bg-muted px-2 py-0.5 rounded text-foreground">日中 {s.kubunDetails.kouji.normal.toFixed(1)}h</span>
                {s.kubunDetails.kouji.ot > 0 && <span className="bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded font-bold">残業 {s.kubunDetails.kouji.ot.toFixed(1)}h</span>}
                {s.kubunDetails.kouji.nightOt > 0 && <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded font-bold">深夜 {s.kubunDetails.kouji.nightOt.toFixed(1)}h</span>}
              </div>
            )}
          </div>
          <div className="bg-blue-100 p-4 shrink-0 rounded-full"><Hammer className="text-blue-600 w-8 h-8" /></div>
        </div>
        <div className="bg-card border rounded-xl px-6 py-6 flex items-center justify-between border-t-4 border-t-purple-500 shadow-sm">
          <div>
            <p className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-2">区分：管理 合計</p>
            <p className="text-4xl md:text-5xl font-bold tracking-tight">
              {s ? s.kubunTotals.kanri.toFixed(1) : '0.0'} <span className="text-xl font-normal text-muted-foreground">h</span>
            </p>
            {s && (
              <div className="text-xs font-medium mt-3 flex flex-wrap gap-2">
                <span className="bg-muted px-2 py-0.5 rounded text-foreground">日中 {s.kubunDetails.kanri.normal.toFixed(1)}h</span>
                {s.kubunDetails.kanri.ot > 0 && <span className="bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded font-bold">残業 {s.kubunDetails.kanri.ot.toFixed(1)}h</span>}
                {s.kubunDetails.kanri.nightOt > 0 && <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded font-bold">深夜 {s.kubunDetails.kanri.nightOt.toFixed(1)}h</span>}
              </div>
            )}
          </div>
          <div className="bg-purple-100 p-4 shrink-0 rounded-full"><Briefcase className="text-purple-600 w-8 h-8" /></div>
        </div>
        <div className="bg-card border rounded-xl px-6 py-6 flex items-center justify-between border-t-4 border-t-amber-500 shadow-sm">
          <div>
            <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">区分：見積・現調 合計</p>
            <p className="text-4xl md:text-5xl font-bold tracking-tight">
              {s ? s.kubunTotals.mitsumori.toFixed(1) : '0.0'} <span className="text-xl font-normal text-muted-foreground">h</span>
            </p>
            {s && (
              <div className="text-xs font-medium mt-3 flex flex-wrap gap-2">
                <span className="bg-muted px-2 py-0.5 rounded text-foreground">日中 {s.kubunDetails.mitsumori.normal.toFixed(1)}h</span>
                {s.kubunDetails.mitsumori.ot > 0 && <span className="bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded font-bold">残業 {s.kubunDetails.mitsumori.ot.toFixed(1)}h</span>}
                {s.kubunDetails.mitsumori.nightOt > 0 && <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded font-bold">深夜 {s.kubunDetails.mitsumori.nightOt.toFixed(1)}h</span>}
              </div>
            )}
          </div>
          <div className="bg-amber-100 p-4 shrink-0 rounded-full"><FileSignature className="text-amber-600 w-8 h-8" /></div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Project Detail */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 px-1">
            <List className="text-blue-500 w-5 h-5" /> 案件別集計詳細
          </h2>
          <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto shadow-sm">
            <table className="w-full text-left text-sm border-collapse min-w-[600px]">
              <thead className="bg-muted/50 border-b uppercase font-bold text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 min-w-[250px]">工事番号 / 案件名称</th>
                  <th className="px-4 py-4 text-center">区分内訳 (h)</th>
                  <th className="px-3 py-4 text-center">自/協</th>
                  <th className="px-5 py-4 text-right">実働合計 (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y text-foreground font-medium">
                {displayedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-muted-foreground text-sm italic">
                      {loading ? '集計データを取得中...' : '指定条件の稼働データは見つかりませんでした'}
                    </td>
                  </tr>
                ) : (
                  displayedProjects.map(p => {
                    const bd = p.breakdown;
                    const bdd = p.breakdownDetails;
                    const totalH = p.totalHours;
                    const normalH = p.normalHours;
                    const otH = p.overtimeHours;
                    const nightH = p.nightOvertimeHours;
                    return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-5 border-b">
                        <div className="text-[11px] text-primary font-bold mb-1 uppercase tracking-wider">{p.no || "-"}</div>
                        <div className="font-bold text-base leading-snug">
                          {/* 工事件名（project_name）を常に主表示 */}
                          {p.name}
                        </div>
                        {/* 発注者名・現場名をサブテキストとして表示 */}
                        {(p.clientName || p.siteName) && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {(p.kubun === '川北' || p.kubun === 'BPE') && p.siteName
                              ? `📍 ${p.siteName}`
                              : p.clientName
                                ? `🏢 ${p.clientName}`
                                : null}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                           <span className="text-[10px] bg-muted px-2 py-0.5 rounded border font-bold uppercase">{p.kubun}</span>
                           {p.dailyLogs.length > 0 && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">{p.dailyLogs.length} 日の記録</span>}
                        </div>
                      </td>
                      <td className="px-4 py-5 text-center border-b">
                          <div className="flex flex-col gap-2 items-center">
                            <div className="flex flex-col w-36 sm:w-40 bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100">
                              <div className="flex items-center justify-between">
                                <span className="bg-blue-100 text-blue-800 border-blue-200 text-xs px-1.5 py-0.5 rounded-md font-bold">工事</span>
                                <span className="font-bold text-sm text-blue-900">{bd.kouji.toFixed(1)}h</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground text-right mt-1 flex flex-col gap-0.5">
                                <span>日中 {bdd.kouji.normal.toFixed(1)}h</span>
                                {bdd.kouji.ot > 0 && <span className="text-orange-500 font-bold">残業 {bdd.kouji.ot.toFixed(1)}h</span>}
                                {bdd.kouji.nightOt > 0 && <span className="text-indigo-500 font-bold">深夜 {bdd.kouji.nightOt.toFixed(1)}h</span>}
                              </div>
                            </div>
                            <div className="flex flex-col w-36 sm:w-40 bg-purple-50/50 px-3 py-1.5 rounded-lg border border-purple-100">
                              <div className="flex items-center justify-between">
                                <span className="bg-purple-100 text-purple-800 border-purple-200 text-xs px-1.5 py-0.5 rounded-md font-bold">管理</span>
                                <span className="font-bold text-sm text-purple-900">{bd.kanri.toFixed(1)}h</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground text-right mt-1 flex flex-col gap-0.5">
                                <span>日中 {bdd.kanri.normal.toFixed(1)}h</span>
                                {bdd.kanri.ot > 0 && <span className="text-orange-500 font-bold">残業 {bdd.kanri.ot.toFixed(1)}h</span>}
                                {bdd.kanri.nightOt > 0 && <span className="text-indigo-500 font-bold">深夜 {bdd.kanri.nightOt.toFixed(1)}h</span>}
                              </div>
                            </div>
                            <div className="flex flex-col w-36 sm:w-40 bg-amber-50/50 px-3 py-1.5 rounded-lg border border-amber-100">
                              <div className="flex items-center justify-between">
                                <span className="bg-amber-100 text-amber-800 border-amber-200 text-xs px-1.5 py-0.5 rounded-md font-bold">見積</span>
                                <span className="font-bold text-sm text-amber-900">{bd.mitsumori.toFixed(1)}h</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground text-right mt-1 flex flex-col gap-0.5">
                                <span>日中 {bdd.mitsumori.normal.toFixed(1)}h</span>
                                {bdd.mitsumori.ot > 0 && <span className="text-orange-500 font-bold">残業 {bdd.mitsumori.ot.toFixed(1)}h</span>}
                                {bdd.mitsumori.nightOt > 0 && <span className="text-indigo-500 font-bold">深夜 {bdd.mitsumori.nightOt.toFixed(1)}h</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-5 text-center border-b">
                          <div className="text-lg font-bold">{p.staffCount} <span className="text-xs font-normal text-muted-foreground mx-1">/</span> {p.partnerCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase font-bold mt-1 tracking-wider">自社 / 協力</div>
                        </td>
                        <td className="px-5 py-5 text-right border-b">
                          <div className="flex items-center justify-end gap-4">
                            <div className="flex flex-col items-end w-32">
                               <div className="text-3xl font-black text-primary tracking-tighter">
                                 {totalH.toFixed(1)}<span className="text-sm font-medium text-muted-foreground ml-1">h</span>
                               </div>
                               <div className="text-[10px] font-medium text-muted-foreground mt-1 flex flex-wrap justify-end gap-1">
                                 <span>日中 {normalH.toFixed(1)}h</span>
                                 {otH > 0 && <span className="text-orange-500 font-bold">残業 {otH.toFixed(1)}h</span>}
                                 {nightH > 0 && <span className="text-indigo-500 font-bold">深夜 {nightH.toFixed(1)}h</span>}
                               </div>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProjectForModal(p);
                              }}
                              className="p-2 sm:p-3 bg-secondary/80 hover:bg-secondary text-secondary-foreground rounded-full transition-colors flex shrink-0 items-center gap-2 group border shadow-sm"
                              title="案件詳細・日報一覧を開く"
                            >
                              <span className="hidden sm:inline text-xs font-bold transition-transform group-hover:-translate-x-0.5">案件詳細</span>
                              <Info className="w-4 h-4 text-primary transition-transform group-hover:scale-110" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Panels */}
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold mb-4 px-1 flex items-center gap-2"><Truck className="text-teal-500 w-5 h-5" /> 作業車・建機</h2>
            <div className="space-y-2">
              {s && Object.keys(s.equipment).length > 0 ? (
                Object.entries(s.equipment).sort((a,b) => b[1] - a[1]).map(([name, count]) => (
                  <div key={name} className="flex justify-between items-center bg-card p-3 rounded-lg border shadow-sm hover:bg-muted/30 transition-colors">
                    <span className="text-sm font-bold truncate mr-2"><Truck className="text-muted-foreground w-4 h-4 inline mr-2 align-text-bottom" />{name}</span>
                    <span className="bg-teal-500 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0">{count} 台(日)</span>
                  </div>
                ))
              ) : <p className="text-muted-foreground italic text-sm px-1">利用実績がありません</p>}
            </div>
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-4 px-1 flex items-center gap-2"><Building2 className="text-orange-500 w-5 h-5" /> 協力会社別</h2>
            <div className="space-y-2">
              {Object.keys(filteredCompanies).length > 0 ? (
                 Object.entries(filteredCompanies).sort((a,b) => b[1].total - a[1].total).map(([name, info]) => (
                  <div key={name} className="bg-card rounded-lg border shadow-sm hover:border-orange-500/50 transition-colors overflow-hidden">
                    <details className="group">
                      <summary className="flex justify-between items-center p-3 cursor-pointer select-none list-none marker:hidden [&::-webkit-details-marker]:hidden border-b border-transparent group-open:border-border group-open:bg-muted/10 font-bold overflow-hidden">
                        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-3">
                           <div className="w-5 h-5 bg-orange-100 rounded flex items-center justify-center shrink-0">
                             <Building2 className="w-3 h-3 text-orange-600" />
                           </div>
                           <span className="text-sm truncate">{name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                           <span className="bg-orange-500 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold">{info.total} 名</span>
                        </div>
                      </summary>
                      <div className="bg-muted/5 p-3 space-y-1.5 max-h-[300px] overflow-y-auto">
                        {info.projects.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.date.localeCompare(b.date)).map((proj, idx) => (
                           <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/50 last:border-0">
                             <div className="flex flex-col flex-1 min-w-0 pr-3">
                                <span className="text-[10px] bg-muted w-fit px-1 rounded text-muted-foreground font-medium mb-0.5">{proj.date}</span>
                                <span className="truncate font-medium">{proj.projectName}</span>
                             </div>
                             <span className="shrink-0 text-[11px] bg-background border px-1.5 py-0.5 rounded shadow-sm text-foreground font-bold">{proj.count}名</span>
                           </div>
                        ))}
                      </div>
                    </details>
                  </div>
                 ))
              ) : <p className="text-muted-foreground italic text-sm px-1">利用実績がありません</p>}
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <UserCircle className="text-green-500 w-5 h-5" /> 作業員別
              </h2>
            </div>
            <div className="space-y-3">
              {Object.keys(filteredStaff).length > 0 ? (
                Object.entries(filteredStaff).sort((a,b) => (b[1].kouji.normal + b[1].kanri.normal) - (a[1].kouji.normal + a[1].kanri.normal)).map(([key, d]) => {
                  const total = (d.kouji.normal+d.kouji.ot)+(d.kanri.normal+d.kanri.ot)+(d.mitsumori.normal+d.mitsumori.ot);
                  const totalOt = d.kouji.ot + d.kanri.ot + d.mitsumori.ot;

                  return (
                    <div
                      key={key}
                      className="p-4 rounded-xl border transition-all bg-card shadow-sm"
                    >
                      <div className="flex justify-between items-center font-bold border-b pb-3 border-border/50">
                        <span className="tracking-tight flex items-center gap-2 text-base">
                          <UserCircle className="text-muted-foreground w-5 h-5" /> {d.displayName}
                        </span>
                        <div className="text-right">
                          <span className="text-primary font-bold text-2xl tracking-tight">{total.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">h</span></span>
                          <div className="text-[10px] text-muted-foreground flex justify-end gap-1 mt-1">
                            <span className="bg-muted px-1.5 py-0.5 rounded font-medium">日中 {(total - totalOt).toFixed(1)}h</span>
                            {totalOt > 0 && <span className="bg-orange-50 text-orange-600 border border-orange-100 px-1.5 py-0.5 rounded font-bold">残業 {totalOt.toFixed(1)}h</span>}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                         <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-100 shadow-sm">
                           <p className="text-[10px] text-blue-700 font-bold mb-1.5 border-b border-blue-200 pb-1">工事 合計</p>
                           <p className="text-lg font-bold text-blue-900">{(d.kouji.normal+d.kouji.ot).toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">h</span></p>
                           <div className="text-[9px] font-medium text-muted-foreground mt-1 flex flex-col gap-0.5">
                             <span>日中 {d.kouji.normal.toFixed(1)}h</span>
                             {d.kouji.ot > 0 ? <span className="text-orange-600 font-bold">残業 {d.kouji.ot.toFixed(1)}h</span> : <span className="text-transparent select-none">残業 0.0h</span>}
                           </div>
                         </div>
                         <div className="bg-purple-50/50 p-2 rounded-lg border border-purple-100 shadow-sm">
                           <p className="text-[10px] text-purple-700 font-bold mb-1.5 border-b border-purple-200 pb-1">管理 合計</p>
                           <p className="text-lg font-bold text-purple-900">{(d.kanri.normal+d.kanri.ot).toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">h</span></p>
                           <div className="text-[9px] font-medium text-muted-foreground mt-1 flex flex-col gap-0.5">
                             <span>日中 {d.kanri.normal.toFixed(1)}h</span>
                             {d.kanri.ot > 0 ? <span className="text-orange-600 font-bold">残業 {d.kanri.ot.toFixed(1)}h</span> : <span className="text-transparent select-none">残業 0.0h</span>}
                           </div>
                         </div>
                         <div className="bg-amber-50/50 p-2 rounded-lg border border-amber-100 shadow-sm">
                           <p className="text-[10px] text-amber-700 font-bold mb-1.5 border-b border-amber-200 pb-1">見積 合計</p>
                           <p className="text-lg font-bold text-amber-900">{(d.mitsumori.normal+d.mitsumori.ot).toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">h</span></p>
                           <div className="text-[9px] font-medium text-muted-foreground mt-1 flex flex-col gap-0.5">
                             <span>日中 {d.mitsumori.normal.toFixed(1)}h</span>
                             {d.mitsumori.ot > 0 ? <span className="text-orange-600 font-bold">残業 {d.mitsumori.ot.toFixed(1)}h</span> : <span className="text-transparent select-none">残業 0.0h</span>}
                           </div>
                         </div>
                      </div>
                    </div>
                  );
                })
              ) : <p className="text-muted-foreground italic text-sm px-1">利用実績がありません</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Media Section */}
      <div className="mt-8 space-y-4">
         <h2 className="text-xl font-bold flex items-center gap-2 px-1"><Package className="text-indigo-500 w-5 h-5" /> 材料・資料一覧</h2>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-card p-5 rounded-xl border shadow-sm flex flex-col h-[400px]">
             <h3 className="text-sm font-bold text-muted-foreground mb-4 border-b pb-2 uppercase tracking-wider flex items-center justify-between gap-2 shrink-0">
               <span className="flex items-center gap-2"><Package className="w-4 h-4" /> 使用材料</span>
               <button
                 onClick={() => exportMaterialsToExcel(materialsByProject)}
                 className="normal-case text-[11px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 shrink-0"
                 title="Excelで出力"
               >
                 <Download className="w-3.5 h-3.5" /> Excel出力
               </button>
             </h3>
             <div className="overflow-y-auto pr-2 flex-1">
               {materialsByProject.length > 0
                 ? materialsByProject.map((group, gi) => (
                     <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
                       <div className="sticky top-0 bg-card/95 backdrop-blur-sm py-1.5 px-2 rounded-md border-b-2 border-primary/30 mb-1">
                         <span className="text-xs font-bold text-primary truncate block">{group.projectName}</span>
                       </div>
                       <div className="space-y-2 text-sm font-medium">
                         {group.items.map((m, i) => (
                           <div key={i} className="py-2 border-b border-muted/50 px-2 flex items-start gap-3">
                             <span
                               title={m.checked ? '確認済み' : '未確認'}
                               className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${m.checked ? 'bg-green-500' : 'bg-amber-400'}`}
                             ></span>
                             <div className="min-w-0 flex-1">
                               <div className="flex items-baseline justify-between gap-2">
                                 <span className="font-bold truncate">{m.name}</span>
                                 {m.quantity && <span className="text-xs text-muted-foreground shrink-0">{m.quantity}</span>}
                               </div>
                               <div className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                                 <span>{m.date}</span>
                                 {m.note && (
                                   <span className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                     m.note.includes('発注')
                                       ? 'bg-red-100 text-red-700'
                                       : m.note.includes('会社在庫') || m.note.includes('在庫')
                                         ? 'bg-blue-100 text-blue-700'
                                         : 'bg-muted text-muted-foreground'
                                   }`}>
                                     {m.note}
                                   </span>
                                 )}
                               </div>
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   ))
                 : <p className="text-muted-foreground italic text-xs px-2">材料データはありません</p>}
             </div>
           </div>
           
           <div className="bg-card p-5 rounded-xl border shadow-sm flex flex-col h-[400px]">
             <h3 className="text-sm font-bold text-muted-foreground mb-4 border-b pb-2 uppercase tracking-wider flex items-center gap-2 shrink-0">
               <Camera className="w-4 h-4 text-primary" /> 写真リスト
             </h3>
             <div className="space-y-3 overflow-y-auto pr-2 flex-1">
               {photoLinksMap.size > 0 
                 ? Array.from(photoLinksMap.values()).map((item, idx) => (
                     <a key={idx} href={item.url} target="_blank" rel="noreferrer" className="flex items-center p-3 rounded-lg border shadow-sm mb-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 group">
                       <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center shrink-0 mr-4">
                         <Camera className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className="text-[10px] text-muted-foreground truncate mb-0.5 font-bold">{item.projectName}</p>
                         <p className="text-xs font-bold truncate group-hover:text-primary transition-colors">{item.fileName || `写真 #${idx + 1}`}</p>
                       </div>
                     </a>
                   ))
                 : <p className="text-muted-foreground italic text-xs px-2">写真データはありません</p>}
             </div>
           </div>

           <div className="bg-card p-5 rounded-xl border shadow-sm flex flex-col h-[400px]">
             <h3 className="text-sm font-bold text-muted-foreground mb-4 border-b pb-2 uppercase tracking-wider flex items-center gap-2 shrink-0">
               <FileText className="w-4 h-4 text-indigo-500" /> 資料・図面リスト
             </h3>
             <div className="space-y-3 overflow-y-auto pr-2 flex-1">
               {docLinksMap.size > 0 
                 ? Array.from(docLinksMap.values()).map((item, idx) => {
                     const fixedUrl = fixDriveDocUrl(item.url);
                     const isPdf = item.fileName.toLowerCase().includes('.pdf') || fixedUrl.includes('drive.google.com') || fixedUrl.toLowerCase().includes('.pdf');
                     return (
                       <a key={idx} href={fixedUrl} target="_blank" rel="noreferrer" className="flex items-center p-3 rounded-lg border shadow-sm mb-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/30 group">
                         <div className={`w-12 h-12 ${isPdf ? 'bg-red-50' : 'bg-indigo-50'} rounded flex items-center justify-center shrink-0 mr-4`}>
                           <FileText className={`w-6 h-6 ${isPdf ? 'text-red-400' : 'text-indigo-400'} group-hover:scale-110 transition-transform`} />
                         </div>
                         <div className="min-w-0 flex-1">
                           <p className="text-[10px] text-muted-foreground truncate mb-0.5 font-bold">{item.projectName}</p>
                           <p className="text-xs font-bold truncate group-hover:text-indigo-600 transition-colors">{item.fileName || `資料 #${idx + 1}`}</p>
                         </div>
                       </a>
                     );
                   })
                 : <p className="text-muted-foreground italic text-xs px-2">資料データはありません</p>}
             </div>
           </div>
         </div>
      </div>
      
      {selectedReportId && (
        <ReportDetailsModal 
          reportId={selectedReportId} 
          onClose={() => setSelectedReportId(null)} 
        />
      )}

      {selectedProjectForModal && (
        <ProjectDetailsModal
          project={selectedProjectForModal}
          onClose={() => setSelectedProjectForModal(null)}
        />
      )}
    </div>
  );
}
