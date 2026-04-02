import { useState, useEffect } from "react";
import { Zap, Lightbulb, Network, FolderOpen, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface Project {
  id: string;
  project_name: string;
  project_number: string | null;
  category: string | null;
  status_flag: string | null;
  client_name: string | null;
  site_name: string | null;
  parent_project_id: string | null;
  folder_url: string | null;
}

export default function ToolsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("進行中"); // デフォルトでは「着工前」「着工中」を表示
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    supabase.from('projects')
      .select('id, project_name, project_number, category, status_flag, client_name, site_name, parent_project_id, folder_url')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          // 条件：工事番号が「KD」「BS」から始まる6桁、または6桁のみの数字
          const targetRegex = /^(?:KD|BS)?\d{6}/i;
          
          // 一度条件に合致する親または子のIDを集める
          const validIds = new Set<string>();
          data.forEach(p => {
             if (p.project_number && targetRegex.test(p.project_number)) {
                validIds.add(p.id);
                if (p.parent_project_id) validIds.add(p.parent_project_id);
             }
          });
          
          // 親子関連もすべて含める（親が条件を満たせば子も表示する）
          const finalData = data.filter(p => 
             validIds.has(p.id) || (p.parent_project_id && validIds.has(p.parent_project_id))
          );
          
          setProjects(finalData);
        }
      });
  }, []);

  const getUrl = (path: string) => {
    return selectedProjectId ? `/tools/${selectedProjectId}/${path}` : '#';
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (!selectedProjectId) {
      e.preventDefault();
      alert('まずは作業対象の「件名（プロジェクト）」を選択してください。');
    }
  };

  const filteredProjects = projects.filter(p => {
    if (filterCategory && p.category !== filterCategory) return false;
    if (filterStatus === '進行中') {
      if (p.status_flag !== '着工前' && p.status_flag !== '着工中') return false;
    } else if (filterStatus && p.status_flag !== filterStatus) {
      return false;
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNumber = p.project_number?.toLowerCase().includes(q);
      const matchName = p.project_name?.toLowerCase().includes(q);
      const matchSite = p.site_name?.toLowerCase().includes(q);
      const matchClient = p.client_name?.toLowerCase().includes(q);
      if (!matchNumber && !matchName && !matchSite && !matchClient) {
        return false;
      }
    }
    
    return true;
  });

  const formatProjectName = (p: Project) => {
    const parts = [];
    if (p.project_number) parts.push(`[${p.project_number}]`);
    parts.push(p.project_name);
    if (p.site_name || p.client_name) {
      parts.push(`(${p.site_name || p.client_name})`);
    }
    return parts.join(' ');
  };

  const selectedProjectObj = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">現場用ツール ポータル</h1>
          <p className="text-muted-foreground mt-1">作業する案件を選んでから、各種計算ツールを起動します。</p>
        </div>

        {/* 案件セレクター */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm w-full md:w-[450px] relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1 bg-blue-500"></div>
          <label className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-3">
            <FolderOpen className="w-5 h-5 text-blue-500" />
            作業対象の案件（件名）を選択
          </label>

          {/* フィルター部分 */}
          <div className="flex gap-2 mb-3">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-1/2 text-xs rounded border-slate-300 dark:bg-slate-800 dark:border-slate-700"
            >
              <option value="">全ての区分</option>
              <option value="一般">一般</option>
              <option value="役所">役所</option>
              <option value="川北">川北</option>
              <option value="BPE">BPE</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-1/2 text-xs rounded border-slate-300 dark:bg-slate-800 dark:border-slate-700"
            >
              <option value="進行中">進行中（着工前/中）</option>
              <option value="完工">完工</option>
              <option value="保留">保留</option>
              <option value="失注">失注</option>
              <option value="">全て</option>
            </select>
          </div>
          
          <div className="mb-3">
            <input
              type="text"
              placeholder="案件名, 現場名, 工事番号, 発注者で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded border-slate-300 dark:bg-slate-800 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className={`w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-700 ${!selectedProjectId ? 'border-orange-300 bg-orange-50 text-orange-800 focus:ring-orange-500 dark:bg-orange-950/30' : 'font-bold'}`}
          >
            <option value="">== 案件を選択してください ==</option>
            {filteredProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {formatProjectName(p)}
              </option>
            ))}
          </select>
          <div className="flex flex-col gap-2 mt-3">
            <div className="flex justify-between items-center">
              {!selectedProjectId ? (
                 <p className="text-[11px] text-orange-600 font-bold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5"/> 案件を選ばないとツールは起動できません</p>
              ) : (
                 <p className="text-[11px] text-blue-600 font-bold flex items-center gap-1"><Zap className="w-3.5 h-3.5"/> 下記から利用するツールを選んでください</p>
              )}
              <p className="text-[10px] text-slate-400">{filteredProjects.length}件</p>
            </div>
            
            {/* フォルダを開くリンク */}
            {selectedProjectId && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                {selectedProjectObj?.folder_url ? (
                  <a 
                    href={selectedProjectObj.folder_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-md transition-colors w-full justify-center"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    この現場のフォルダを開く
                  </a>
                ) : (
                  <p className="text-[11px] text-slate-400 text-center py-1">フォルダのURLが登録されていません</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-300 ${!selectedProjectId ? 'opacity-50 grayscale select-none' : ''}`}>
        <Link to={getUrl('site-design')} onClick={handleCardClick} className="block group md:col-span-2 lg:col-span-3">
          <div className="p-6 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-center justify-between text-left space-y-4 sm:space-y-0 sm:space-x-6 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 dark:bg-indigo-400/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="p-4 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full group-hover:scale-110 transition-transform shrink-0 shadow-sm border border-indigo-200 dark:border-indigo-800">
              <Network className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-indigo-900 dark:text-indigo-300">現場総合設計ポータル <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full ml-2">Phase 1/3</span></h2>
              <p className="text-sm text-indigo-700/80 dark:text-indigo-400/80 mt-2 font-medium">複数の盤を組み合わせた「全体デマンド集計」や「低圧/高圧引込判定」を行います。複数の計算書を紐づける中心となるダッシュボードです。</p>
            </div>
            <div className="shrink-0">
              <span className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors">
                全体集計を開く
              </span>
            </div>
          </div>
        </Link>

        <Link to={getUrl('power-calc')} onClick={handleCardClick} className="block group">
          <div className="p-6 bg-white dark:bg-slate-900 border rounded-xl shadow-sm hover:shadow-md transition-all h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-full group-hover:scale-110 transition-transform">
              <Zap className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold">動力計算書</h2>
              <p className="text-sm text-muted-foreground mt-1">モーター負荷から電流、配線サイズを自動計算</p>
            </div>
          </div>
        </Link>

        <Link to={getUrl('lighting-calc')} onClick={handleCardClick} className="block group">
          <div className="p-6 bg-white dark:bg-slate-900 border rounded-xl shadow-sm hover:shadow-md transition-all h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 rounded-full group-hover:scale-110 transition-transform">
              <Lightbulb className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold">電灯計算書</h2>
              <p className="text-sm text-muted-foreground mt-1">照明・コンセント容量の計算とR/S相バランス調整</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
