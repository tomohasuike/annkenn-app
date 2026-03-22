import { useState, useEffect } from 'react';
import type { ProjectSummary } from './useWorkSummary';
import { useWorkSummary } from './useWorkSummary';
import { PieChart, Hammer, Briefcase, FileSignature, List, Truck, Building2, UserCircle, Package, Camera, FileText, Info } from 'lucide-react';
import ReportDetailsModal from '../../components/reports/ReportDetailsModal';
import ProjectDetailsModal from '../../components/work-summary/ProjectDetailsModal';

export default function WorkSummary() {
  const { data, loading, error, fetchData, projectsList } = useWorkSummary();
  
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState('');
  const [kubunFilter, setKubunFilter] = useState('ALL');
  const [isAllTime, setIsAllTime] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedProjectForModal, setSelectedProjectForModal] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchData(startDate, endDate, projectId, isAllTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleSearch = () => {
    if (!startDate || !endDate) {
      alert('期間を設定してください');
      return;
    }
    fetchData(startDate, endDate, projectId, isAllTime);
  };

  const searchLower = searchQuery.toLowerCase();

  const filteredProjectsDropdown = projectsList
    .filter(p => kubunFilter === 'ALL' || p.kubun === kubunFilter)
    .filter(p => !searchLower || p.name.toLowerCase().includes(searchLower) || (p.no && p.no.toLowerCase().includes(searchLower)))
    .sort((a,b) => b.no.localeCompare(a.no, undefined, {numeric: true}));

  const projects = data ? Object.values(data.projects).sort((a, b) => b.totalHours - a.totalHours) : [];
  
  const displayedProjects = projects.filter(p => {
    const matchesSearch = !searchLower || p.name.toLowerCase().includes(searchLower) || (p.no && p.no.toLowerCase().includes(searchLower));
    
    // Normalize spaces for robust matching (e.g., matching "蓮池 智雄" with "蓮池智雄")
    const normalizedSelected = selectedStaff ? selectedStaff.replace(/[\s　]+/g, "") : null;
    const matchesStaff = !normalizedSelected || p.dailyLogs.some(log => {
      const staffNorm = log.staffs ? log.staffs.replace(/[\s　]+/g, "") : "";
      const partnersNorm = log.partners ? log.partners.replace(/[\s　]+/g, "") : "";
      return staffNorm.includes(normalizedSelected) || partnersNorm.includes(normalizedSelected);
    });

    return matchesSearch && matchesStaff;
  });

  const s = data?.summary;

  const materialsSet = new Set<string>();
  const photoLinksMap = new Map<string, { projectName: string, url: string, fileName: string }>();
  const docLinksMap = new Map<string, { projectName: string, url: string, fileName: string }>();

  if (data) {
    displayedProjects.forEach(p => {
      p.materials.forEach(m => { if (m) materialsSet.add(m.trim()); });
      p.photos.forEach(obj => { if (obj && obj.url && !photoLinksMap.has(obj.url)) photoLinksMap.set(obj.url, obj); });
      p.docs.forEach(obj => { if (obj && obj.url && !docLinksMap.has(obj.url)) docLinksMap.set(obj.url, obj); });
    });
  }

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
        
        <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-xl border shadow-sm">
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
            <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">案件検索</label>
            <input 
              type="text" 
              placeholder="案件名や番号を入力..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary font-bold outline-none h-9 w-[150px] md:w-[200px]"
            />
          </div>

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
          
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-muted-foreground mb-1 ml-1 uppercase tracking-wider">集計期間</label>
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
              <div className="text-xs font-medium mt-3 flex items-center gap-2">
                <span className="bg-muted px-2 py-0.5 rounded text-foreground">日中 {s.kubunDetails.kouji.normal.toFixed(1)}h</span>
                {s.kubunDetails.kouji.ot > 0 && <span className="bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded">残業 {s.kubunDetails.kouji.ot.toFixed(1)}h</span>}
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
              <div className="text-xs font-medium mt-3 flex items-center gap-2">
                <span className="bg-muted px-2 py-0.5 rounded text-foreground">日中 {s.kubunDetails.kanri.normal.toFixed(1)}h</span>
                {s.kubunDetails.kanri.ot > 0 && <span className="bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded">残業 {s.kubunDetails.kanri.ot.toFixed(1)}h</span>}
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
              <div className="text-xs font-medium mt-3 flex items-center gap-2">
                <span className="bg-muted px-2 py-0.5 rounded text-foreground">日中 {s.kubunDetails.mitsumori.normal.toFixed(1)}h</span>
                {s.kubunDetails.mitsumori.ot > 0 && <span className="bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded">残業 {s.kubunDetails.mitsumori.ot.toFixed(1)}h</span>}
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
                      {loading ? '集計データを取得中...' : selectedStaff ? `${selectedStaff} の稼働データは見つかりませんでした` : '指定条件の稼働データは見つかりませんでした'}
                    </td>
                  </tr>
                ) : (
                  displayedProjects.map(p => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-5 border-b">
                        <div className="text-[11px] text-primary font-bold mb-1 uppercase tracking-wider">{p.no || "-"}</div>
                        <div className="font-bold text-base leading-snug">{p.name}</div>
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
                                <span className="font-bold text-sm text-blue-900">{p.breakdown.kouji.toFixed(1)}h</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground text-right mt-1 flex flex-col gap-0.5">
                                <span>日中 {p.breakdownDetails.kouji.normal.toFixed(1)}h</span>
                                {p.breakdownDetails.kouji.ot > 0 && <span className="text-orange-500 font-bold">残業 {p.breakdownDetails.kouji.ot.toFixed(1)}h</span>}
                              </div>
                            </div>
                            <div className="flex flex-col w-36 sm:w-40 bg-purple-50/50 px-3 py-1.5 rounded-lg border border-purple-100">
                              <div className="flex items-center justify-between">
                                <span className="bg-purple-100 text-purple-800 border-purple-200 text-xs px-1.5 py-0.5 rounded-md font-bold">管理</span>
                                <span className="font-bold text-sm text-purple-900">{p.breakdown.kanri.toFixed(1)}h</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground text-right mt-1 flex flex-col gap-0.5">
                                <span>日中 {p.breakdownDetails.kanri.normal.toFixed(1)}h</span>
                                {p.breakdownDetails.kanri.ot > 0 && <span className="text-orange-500 font-bold">残業 {p.breakdownDetails.kanri.ot.toFixed(1)}h</span>}
                              </div>
                            </div>
                            <div className="flex flex-col w-36 sm:w-40 bg-amber-50/50 px-3 py-1.5 rounded-lg border border-amber-100">
                              <div className="flex items-center justify-between">
                                <span className="bg-amber-100 text-amber-800 border-amber-200 text-xs px-1.5 py-0.5 rounded-md font-bold">見積</span>
                                <span className="font-bold text-sm text-amber-900">{p.breakdown.mitsumori.toFixed(1)}h</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground text-right mt-1 flex flex-col gap-0.5">
                                <span>日中 {p.breakdownDetails.mitsumori.normal.toFixed(1)}h</span>
                                {p.breakdownDetails.mitsumori.ot > 0 && <span className="text-orange-500 font-bold">残業 {p.breakdownDetails.mitsumori.ot.toFixed(1)}h</span>}
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
                                 {p.totalHours.toFixed(1)}<span className="text-sm font-medium text-muted-foreground ml-1">h</span>
                               </div>
                               <div className="text-[10px] font-medium text-muted-foreground mt-1 flex gap-1">
                                 <span>日中 {p.normalHours.toFixed(1)}h</span>
                                 {p.overtimeHours > 0 && <span className="text-orange-500 font-bold">残業 {p.overtimeHours.toFixed(1)}h</span>}
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
                  ))
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
              {data && Object.keys(data.companies).length > 0 ? (
                 Object.entries(data.companies).sort((a,b) => b[1].total - a[1].total).map(([name, info]) => (
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
              {selectedStaff && (
                <button 
                  onClick={() => setSelectedStaff(null)}
                  className="text-xs text-muted-foreground hover:text-primary underline flex items-center gap-1"
                >
                  絞り込み解除
                </button>
              )}
            </div>
            <div className="space-y-3">
              {data && Object.keys(data.staff).length > 0 ? (
                Object.entries(data.staff).sort((a,b) => (b[1].kouji.normal + b[1].kanri.normal) - (a[1].kouji.normal + a[1].kanri.normal)).map(([key, d]) => {
                  const total = (d.kouji.normal+d.kouji.ot)+(d.kanri.normal+d.kanri.ot)+(d.mitsumori.normal+d.mitsumori.ot);
                  const totalOt = d.kouji.ot + d.kanri.ot + d.mitsumori.ot;
                  const isSelected = selectedStaff === d.displayName;
                  
                  return (
                    <div 
                      key={key} 
                      onClick={() => setSelectedStaff(selectedStaff === d.displayName ? null : d.displayName)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-primary/5 border-primary shadow-md ring-1 ring-primary' 
                          : 'bg-card shadow-sm hover:shadow-md hover:border-primary/50'
                      }`}
                    >
                      <div className="flex justify-between items-center font-bold border-b pb-3 border-border/50">
                        <span className={`tracking-tight flex items-center gap-2 text-base ${isSelected ? 'text-primary' : ''}`}>
                          <UserCircle className={`${isSelected ? 'text-primary' : 'text-muted-foreground'} w-5 h-5`} /> {d.displayName}
                        </span>
                        <div className="text-right">
                          <span className={`${isSelected ? 'text-primary' : 'text-primary'} font-bold text-2xl tracking-tight`}>{total.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">h</span></span>
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
             <h3 className="text-sm font-bold text-muted-foreground mb-4 border-b pb-2 uppercase tracking-wider flex items-center gap-2 shrink-0">
               <Package className="w-4 h-4" /> 使用材料
             </h3>
             <div className="space-y-2 text-sm overflow-y-auto pr-2 font-medium flex-1">
               {materialsSet.size > 0 
                 ? Array.from(materialsSet).sort().map((m, i) => (
                     <div key={i} className="py-2.5 border-b border-muted/50 px-2 flex items-center gap-3">
                       <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0"></span>
                       <span className="font-bold">{m}</span>
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
                     const isPdf = item.fileName.toLowerCase().includes('.pdf') || item.url.includes('drive.google.com') || item.url.toLowerCase().includes('.pdf');
                     return (
                       <a key={idx} href={item.url} target="_blank" rel="noreferrer" className="flex items-center p-3 rounded-lg border shadow-sm mb-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/30 group">
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
