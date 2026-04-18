import { useState, useEffect } from "react";
import { Zap, Lightbulb, Network, Clock, FolderOpen, User, X, ChevronDown, ChevronRight, Hash, Search, Filter, XCircle, Trash2, AlertTriangle } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface GroupedProject {
  project_id: string;
  project_name: string;
  project_number: string | null;
  tools: any[];
  last_activity: number;
}

export default function ToolsDashboard() {
  const [groupedProjects, setGroupedProjects] = useState<GroupedProject[]>([]);
  const [freeTools, setFreeTools] = useState<any[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; treeNodeId?: string | null; projectId?: string | null; isBulkProject?: boolean } | null>(null);
  const { setSelectedProjectId } = useOutletContext<{ setSelectedProjectId: (id: string) => void }>();
  const navigate = useNavigate();

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("すべて");
  const [categoryFilter, setCategoryFilter] = useState("すべて");

  // Modal States
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [pickerProjects, setPickerProjects] = useState<any[]>([]);
  const [pickerProjectId, setPickerProjectId] = useState<string>("");
  const [pickerSearchQuery, setPickerSearchQuery] = useState("");
  const [pickerStatusFilter, setPickerStatusFilter] = useState("すべて");
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState("すべて");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      const isFiltering = debouncedQuery !== "" || statusFilter !== "すべて" || categoryFilter !== "すべて";
      
      // 1. プロジェクトの取得 (フィルター適用)
      let pQuery = supabase.from('projects')
          .select('id, project_name, project_number, created_at, status_flag, category, client_name, site_name')
          .not('project_number', 'ilike', 'TEMP-%')
          .order('created_at', { ascending: false });

      if (statusFilter !== "すべて") pQuery = pQuery.eq('status_flag', statusFilter);
      if (categoryFilter !== "すべて") pQuery = pQuery.eq('category', categoryFilter);
      if (debouncedQuery) {
          pQuery = pQuery.or(`project_name.ilike.%${debouncedQuery}%,project_number.ilike.%${debouncedQuery}%,client_name.ilike.%${debouncedQuery}%,site_name.ilike.%${debouncedQuery}%`);
      }

      const { data: recentProjectsData } = await pQuery.limit(isFiltering ? 100 : 30);

      // Picker用のプロジェクト一覧はフィルター無し初期表示のものを使う
      if (!isFiltering && recentProjectsData) {
        setPickerProjects(recentProjectsData);
      }

      // 2. ツールの取得 (フィルター適用)
      let toolsQ1 = supabase.from('site_tools_data')
          .select(`id, tool_type, name, created_at, updated_at, created_by_name, project_id, data_payload, projects(project_name, project_number)`)
          .eq('tool_type', 'SITE_TREE') // レガシー幽霊ファイルを除外
          .order('updated_at', { ascending: false });
          
      let calcPanelsQ = supabase.from('calc_panels')
          .select(`id, panel_type, name, created_at, project_id, tree_node_id, projects(project_name, project_number)`)
          .order('created_at', { ascending: false });

      if (debouncedQuery) {
          toolsQ1 = toolsQ1.ilike('name', `%${debouncedQuery}%`);
          calcPanelsQ = calcPanelsQ.ilike('name', `%${debouncedQuery}%`);
      }
      
      const [ { data: directToolsDataRaw }, { data: directCalcPanelsRaw } ] = await Promise.all([
          toolsQ1.limit(isFiltering ? 200 : 100),
          calcPanelsQ.limit(isFiltering ? 200 : 100)
      ]);
      
      const mappedDirectCalcPanels = (directCalcPanelsRaw || []).map((p: any) => ({
         id: p.id,
         tool_type: p.panel_type === 'POWER' ? 'POWER_CALC' : 'LIGHTING_CALC',
         name: p.name,
         created_at: p.created_at,
         updated_at: p.created_at,
         created_by_name: null,
         project_id: p.project_id,
         data_payload: { treeNodeId: p.tree_node_id },
         projects: p.projects
      }));
      
      const directToolsData = [...(directToolsDataRaw || []), ...mappedDirectCalcPanels];

      // プロジェクトからの逆引きツール取得（検索ヒットしたプロジェクトに紐づく盤すべて）
      let toolsForProjects: any[] = [];
      if (isFiltering && recentProjectsData && recentProjectsData.length > 0) {
          const projectIds = recentProjectsData.map(p => p.id);
          const [ { data: nestedTData }, { data: nestedCalcPanels } ] = await Promise.all([
              supabase.from('site_tools_data')
                  .select(`id, tool_type, name, created_at, updated_at, created_by_name, project_id, data_payload, projects(project_name, project_number)`)
                  .eq('tool_type', 'SITE_TREE')
                  .in('project_id', projectIds.slice(0, 100)),
              supabase.from('calc_panels')
                  .select(`id, panel_type, name, created_at, project_id, tree_node_id, projects(project_name, project_number)`)
                  .in('project_id', projectIds.slice(0, 100))
          ]);
          
          if (nestedTData) toolsForProjects = [...toolsForProjects, ...nestedTData];
          
          if (nestedCalcPanels) {
             const mappedCalcPanels = nestedCalcPanels.map((p: any) => ({
                 id: p.id,
                 tool_type: p.panel_type === 'POWER' ? 'POWER_CALC' : 'LIGHTING_CALC',
                 name: p.name,
                 created_at: p.created_at,
                 updated_at: p.created_at,
                 created_by_name: null,
                 project_id: p.project_id,
                 data_payload: { treeNodeId: p.tree_node_id },
                 projects: p.projects
             }));
             toolsForProjects = [...toolsForProjects, ...mappedCalcPanels];
          }
      }

      // 結合と重複排除
      const combinedTools = [...(directToolsData || []), ...toolsForProjects];
      const uniqueToolsMap = new Map();
      combinedTools.forEach(t => uniqueToolsMap.set(t.id, t));
      const toolsData = Array.from(uniqueToolsMap.values());

      const pMap = new Map<string, GroupedProject>();
      const freeT: any[] = [];
      
      // ツール側のマッピング
      toolsData.forEach(t => {
          const pNumber = t.projects?.project_number;
          if (pNumber && pNumber.startsWith('TEMP-')) return; // 除外

          if (!t.project_id) {
              // フィルターが掛かっている場合、フリーツールは検索ワードにヒットしたものだけ表示
              if (debouncedQuery === "" || t.name.includes(debouncedQuery)) {
                  if (statusFilter === "すべて" && categoryFilter === "すべて") {
                      freeT.push(t);
                  }
              }
          } else {
              // ツールからプロジェクト情報を拾う場合でも、もしフィルタでプロジェクトが弾かれるならスキップ（完全連動）
              if (!pMap.has(t.project_id)) {
                  pMap.set(t.project_id, {
                      project_id: t.project_id,
                      project_name: t.projects?.project_name || '不明な案件',
                      project_number: t.projects?.project_number || null,
                      tools: [],
                      last_activity: new Date(t.updated_at).getTime()
                  });
              }
              pMap.get(t.project_id)!.tools.push(t);
          }
      });

      // 盤データ（ツール）が1件も存在しないプロジェクトは「計算履歴」に表示しないため、
      // ここで recentProjectsData を強制的に pMap へ追加する処理を削除しました。
      // この段階で、もし「ステータス」や「区分」フィルタがかかっているプロジェクトは、APIで既に弾かれているため map に載らない。
      // ただし、ツール側（directToolsData）から引っ張ってきたものが条件外のプロジェクトかもしれないので、
      // 厳密にはもう一度 projects テーブルと照合する必要があるが、実用上は一旦許容（フリーワード検索優先）。

      // 最終ソート
      let groupedArray = Array.from(pMap.values()).sort((a, b) => b.last_activity - a.last_activity);
      
      // もしフィルタがある場合、recentProjectsData に含まれない(=条件外)プロジェクトが tools 引っ張りで入った場合は排除
      if (statusFilter !== "すべて" || categoryFilter !== "すべて") {
         const validProjectIds = new Set(recentProjectsData?.map(p => p.id) || []);
         groupedArray = groupedArray.filter(g => validProjectIds.has(g.project_id));
      }

      const initialExpanded: Record<string, boolean> = {};
      if (groupedArray.length > 0) initialExpanded[groupedArray[0].project_id] = true;
      if (groupedArray.length > 1) initialExpanded[groupedArray[1].project_id] = true;
      // 検索時はヒットしたものをなるべく展開
      if (isFiltering) {
          groupedArray.slice(0, 5).forEach(g => initialExpanded[g.project_id] = true);
      }

      setExpandedProjects(initialExpanded);
      setGroupedProjects(groupedArray);
      setFreeTools(freeT);
      setLoading(false);
    };

    fetchDashboardData();
  }, [debouncedQuery, statusFilter, categoryFilter, refreshKey]);

  const openProjectPicker = async () => {
    setShowProjectPicker(true);
    // モーダルを開いたタイミングで、過去300件のプロジェクトを取得して選択肢を充実させる
    const { data } = await supabase.from('projects')
        .select('id, project_name, project_number, status_flag, category, client_name, site_name')
        .not('project_number', 'ilike', 'TEMP-%')
        .order('created_at', { ascending: false })
        .limit(300);
    
    if (data) {
        setPickerProjects(data);
    }
  };

  const openToolArea = (type: string, id: string, projectId: string | null) => {
    setSelectedProjectId(projectId || "");
    const params = new URLSearchParams();
    params.set('load_id', id);

    if (type === 'POWER_CALC') {
      navigate(`/tools/power-calc?${params.toString()}`);
    } else if (type === 'LIGHTING_CALC') {
      navigate(`/tools/lighting-calc?${params.toString()}`);
    } else if (type === 'SITE_TREE') {
      if (projectId) params.set('projectId', projectId);
      navigate(`/tools/site-design?${params.toString()}`);
    }
  };

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 未連携ツリーノードをポータルから削除
  const removeTreeNode = async (siteDesignToolId: string, dataPayload: any, nodeId: string) => {
    const removeFromTree = (node: any): any => {
      const filtered = node.children?.filter((c: any) => c.id !== nodeId).map(removeFromTree) || [];
      return { ...node, children: filtered };
    };
    const updatedRoot = removeFromTree(dataPayload.root);
    await supabase.from('site_tools_data').update({ data_payload: { ...dataPayload, root: updatedRoot } }).eq('id', siteDesignToolId);
    refresh();
  };

  // 盤を完全削除（calc_loads + calc_panels + ポータルノード）
  const deleteCalcPanelFull = async (panelId: string, treeNodeId?: string | null, projectId?: string | null) => {
    await supabase.from('calc_loads').delete().eq('panel_id', panelId);
    await supabase.from('calc_panels').delete().eq('id', panelId);
    if (treeNodeId && projectId) {
      const { data: treeRecord } = await supabase
        .from('site_tools_data').select('id, data_payload')
        .eq('project_id', projectId).eq('tool_type', 'SITE_TREE').maybeSingle();
      if (treeRecord?.data_payload?.root) {
        const removeNode = (node: any): any => ({
          ...node,
          children: (node.children || []).filter((c: any) => c.id !== treeNodeId).map(removeNode)
        });
        const updatedRoot = removeNode(treeRecord.data_payload.root);
        await supabase.from('site_tools_data')
          .update({ data_payload: { ...treeRecord.data_payload, root: updatedRoot } })
          .eq('id', treeRecord.id);
      }
    }
    refresh();
  };
  // 案件の全計算データを一括削除（calc_loads + calc_panels + SITE_TREE）
  // projectId === '__FREE__' の場合はproject_id IS NULL のフリー計算書を全削除
  const deleteProjectDataAll = async (projectId: string) => {
    if (projectId === '__FREE__') {
      // フリー計算書（未紐付け）を全削除
      const { data: panels } = await supabase.from('calc_panels').select('id').is('project_id', null);
      if (panels && panels.length > 0) {
        const panelIds = panels.map((p: any) => p.id);
        await supabase.from('calc_loads').delete().in('panel_id', panelIds);
        await supabase.from('calc_panels').delete().is('project_id', null);
      }
    } else {
      const { data: panels } = await supabase.from('calc_panels').select('id').eq('project_id', projectId);
      if (panels && panels.length > 0) {
        const panelIds = panels.map((p: any) => p.id);
        await supabase.from('calc_loads').delete().in('panel_id', panelIds);
        await supabase.from('calc_panels').delete().eq('project_id', projectId);
      }
      await supabase.from('site_tools_data').delete().eq('project_id', projectId).eq('tool_type', 'SITE_TREE');
    }
    refresh();
  };
  // (旧deleteCalcPanel互換)
  const deleteCalcPanel = async (panelId: string) => deleteCalcPanelFull(panelId);

  const renderProjectToolsArea = (group: GroupedProject) => {
      const siteDesignTool = group.tools.find(t => t.tool_type === 'SITE_TREE');
      let treeRoot: any = null;
      if (siteDesignTool?.data_payload?.root) {
        treeRoot = siteDesignTool.data_payload.root;
      }
      
      const linkedToolsMap = new Map<string, any>();
      group.tools.forEach(t => {
         if (t.data_payload?.treeNodeId) {
            linkedToolsMap.set(t.data_payload.treeNodeId, t);
         }
      });
      
      const activeTreeNodes = new Set<string>();
      const collectNodeIds = (node: any) => {
         if (!node) return;
         activeTreeNodes.add(node.id);
         if (node.children) {
            node.children.forEach(collectNodeIds);
         }
      };
      if (treeRoot) collectNodeIds(treeRoot);

      const renderTreeNode = (node: any, level: number) => {
         const matchingTool = linkedToolsMap.get(node.id);
    
         const isRoot = node.type.startsWith('root_');
         const isPower = node.type === 'power';
         const isLighting = node.type === 'lighting';
         const hasChildren = node.children && node.children.length > 0;
         const isDeletable = !matchingTool && !isRoot; // 未連携かつルートでない場合
         
         return (
           <li key={node.id} className={`relative flex flex-col ${level > 0 ? 'ml-6 pl-4 border-l-2 border-slate-200 dark:border-slate-700' : ''}`}>
             {level > 0 && <div className="absolute -left-[2px] top-7 w-4 border-t-2 border-slate-200 dark:border-slate-700"></div>}
             
             <div className="py-1">
               {matchingTool ? (
                  <div className="relative group/item">
                    <button 
                      onClick={(e) => { e.stopPropagation(); if (!isDeleteMode) openToolArea(matchingTool.tool_type, matchingTool.id, group.project_id); }}
                      className={`w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 border rounded-xl transition-all ${isDeleteMode ? 'border-red-200 dark:border-red-900 cursor-default' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md hover:translate-x-1'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-md border ${isDeleteMode ? 'bg-red-50 border-red-200 text-red-400' : matchingTool.tool_type === 'POWER_CALC' ? 'bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/30' : matchingTool.tool_type === 'LIGHTING_CALC' ? 'bg-yellow-50 border-yellow-200 text-yellow-600 dark:bg-yellow-900/30' : 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-900/30'}`}>
                          {matchingTool.tool_type === 'POWER_CALC' ? <Zap className="w-4 h-4"/> : matchingTool.tool_type === 'LIGHTING_CALC' ? <Lightbulb className="w-4 h-4"/> : <Network className="w-4 h-4"/>}
                        </div>
                        <div className="text-left">
                           <div className="flex items-center gap-2">
                             <span className={`font-bold text-sm ${isDeleteMode ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>{matchingTool.name}</span>
                             {matchingTool.tool_type === 'POWER_CALC' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-bold border border-orange-200">動力機能</span>}
                           </div>
                           <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3"/> {matchingTool.created_by_name || '不明'} | 
                              <Clock className="w-3 h-3 ml-1"/> 更新: {new Date(matchingTool.updated_at).toLocaleDateString('ja-JP')}
                           </span>
                        </div>
                      </div>
                      {!isDeleteMode && (
                        <span className="text-blue-500 opacity-0 group-hover/item:opacity-100 transition-opacity text-xs font-bold flex items-center gap-1">
                          開く <ChevronRight className="w-4 h-4"/>
                        </span>
                      )}
                    </button>
                    {isDeleteMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: matchingTool.id, name: matchingTool.name, treeNodeId: node.id, projectId: group.project_id }); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all"
                        title="この盤を削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
               ) : (
                  <div className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl opacity-75 grayscale-[0.5]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md border bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700">
                        {isRoot ? <Network className="w-4 h-4"/> : (isPower ? <Zap className="w-4 h-4"/> : <Lightbulb className="w-4 h-4"/>)}
                      </div>
                      <div className="text-left">
                         <div className="flex items-center gap-2">
                           <span className="font-bold text-slate-500 dark:text-slate-400 text-sm">{node.name}</span>
                           <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 font-bold border border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">未連携</span>
                         </div>
                         <span className="text-[10px] text-slate-400 mt-1 block">設計ポータル内のみに存在し、盤ファイルが連携されていません</span>
                      </div>
                    </div>
                    {isDeletable && siteDesignTool && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeTreeNode(siteDesignTool.id, siteDesignTool.data_payload, node.id); }}
                        className="p-1.5 grayscale-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                        title="このノードを系統図から削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
               )}
             </div>
             
             {hasChildren && (
               <ul className="flex flex-col mt-1 space-y-1">
                 {node.children.map((child: any) => renderTreeNode(child, level + 1))}
               </ul>
             )}
           </li>
         );
      };

      const unlinkedTools = group.tools.filter(t => {
         if (t.tool_type === 'SITE_TREE') return false;
         // ツリー上のノードIDにリンクされていない、またはリンク先のノードがツリー構造に存在しない場合は「単独」
         return !t.data_payload?.treeNodeId || !activeTreeNodes.has(t.data_payload.treeNodeId);
      });

      if (group.tools.length === 0) {
          return (
              <div className="py-8 px-4 text-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col items-center">
                 <div className="w-12 h-12 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mb-3">
                   <FolderOpen className="w-6 h-6"/>
                 </div>
                 <p className="text-sm font-bold text-slate-600">まだ盤データがありません。</p>
                 <p className="text-xs text-slate-400 mt-1 max-w-sm">上の「設計を始める」ボタンから現場ポータルを開き、動力盤や電灯盤などのファイルを追加してください。</p>
              </div>
          );
      }

      return (
        <div className="py-2">
          {treeRoot && (
            <div className="mb-4">
              <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide flex items-center gap-1">
                <Network className="w-3 h-3"/> 系統図ツリー構成
                <button 
                   onClick={(e) => { e.stopPropagation(); openToolArea('SITE_TREE', siteDesignTool!.id, group.project_id); }}
                   className="ml-2 text-blue-500 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors normal-case tracking-normal border border-blue-200 bg-white"
                >ポータルを開く</button>
              </h4>
              <ul className="space-y-1 ml-2">
                {renderTreeNode(treeRoot, 0)}
              </ul>
            </div>
          )}

          {unlinkedTools.length > 0 && (
            <div className={`${treeRoot ? 'pt-4 border-t border-slate-200 dark:border-slate-700' : ''}`}>
              {treeRoot && <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wide">単独の盤（ツリー未連携 / 個別に作成されたファイル）</h4>}
              <ul className="space-y-2 pl-2">
                {unlinkedTools.map((tool, index) => (
                    <li key={tool.id} className="relative animate-in slide-in-from-left-2 fade-in fill-mode-both" style={{ animationDelay: `${index * 50}ms` }}>
                      <div className="relative group/item">
                        <button 
                          onClick={(e) => { e.stopPropagation(); openToolArea(tool.tool_type, tool.id, group.project_id); }}
                          className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md hover:-translate-y-0.5 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-md border ${tool.tool_type === 'POWER_CALC' ? 'bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/30' : tool.tool_type === 'LIGHTING_CALC' ? 'bg-yellow-50 border-yellow-200 text-yellow-600 dark:bg-yellow-900/30' : 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-900/30'}`}>
                              {tool.tool_type === 'POWER_CALC' ? <Zap className="w-4 h-4"/> : tool.tool_type === 'LIGHTING_CALC' ? <Lightbulb className="w-4 h-4"/> : <Network className="w-4 h-4"/>}
                            </div>
                            <div className="text-left">
                               <div className="flex items-center gap-2">
                                 <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{tool.name}</span>
                                 {tool.tool_type === 'POWER_CALC' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-bold border border-orange-200">動力機能</span>}
                               </div>
                               <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                  <User className="w-3 h-3"/> {tool.created_by_name || '不明'} | 
                                  <Clock className="w-3 h-3 ml-1"/> 更新: {new Date(tool.updated_at).toLocaleDateString('ja-JP')}
                               </span>
                            </div>
                          </div>
                          <span className="text-blue-500 opacity-0 group-hover/item:opacity-100 transition-opacity text-xs font-bold flex items-center gap-1">
                            開く <ChevronRight className="w-4 h-4"/>
                          </span>
                        </button>
                        {isDeleteMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: tool.id, name: tool.name, treeNodeId: tool.data_payload?.treeNodeId, projectId: group.project_id }); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 bg-red-50 rounded-lg border border-red-200 transition-all"
                            title="この盤を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Network className="w-6 h-6 text-blue-500" />
          全社 現場ポータル履歴
        </h1>
        <p className="text-muted-foreground mt-1">現場ごとに紐づく設計ファイル（動力・電灯など）をツリー形式で管理・検索できます。</p>
      </div>

      {/* トップダウン型の巨大アクションボタン */}
      <div className="mb-6">
        <button 
          onClick={openProjectPicker} 
          className="w-full relative overflow-hidden group p-6 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 shadow-lg shadow-blue-900/20 hover:shadow-2xl transition-all flex items-center justify-between outline-none focus:ring-4 focus:ring-blue-500/50"
        >
          {/* 光沢ホバーエフェクト */}
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute -inset-[100%] group-hover:animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#00000000_50%,#ffffff30_100%)] opacity-20"></div>
          
          <div className="relative flex items-center gap-4">
            <div className="p-3 sm:p-4 bg-white/20 backdrop-blur text-white rounded-xl shadow-inner border border-white/30 truncate">
              <Network className="w-8 h-8" />
            </div>
            <div className="text-left">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-md">
                ＋ 現場（プロジェクト）の設計を始める
              </h2>
              <p className="text-blue-100 font-medium text-sm mt-1 drop-shadow-sm hidden sm:block">
                ここから案件を選択・作成し、現場に紐づく一連の計算書をトップダウンで連携させます。
              </p>
            </div>
          </div>
          <div className="relative text-white/50 group-hover:text-white transition-colors group-hover:translate-x-1 duration-300 pl-4 shrink-0">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
          </div>
        </button>
      </div>

      {/* 検索・フィルターバー */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm mb-6 relative z-20">
        <div className="flex flex-col md:flex-row gap-4">
          {/* フリーワード */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="案件名、番号、顧客名、または盤名で検索..." 
              className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-medium text-slate-700 dark:text-slate-200"
            />
            {searchQuery && (
               <button onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors">
                  <XCircle className="w-5 h-5"/>
               </button>
            )}
          </div>

          {/* フィルター */}
          <div className="flex gap-3">
            <div className="relative">
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-3 pr-8 py-2.5 h-full border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:ring-2 focus:ring-blue-500 transition-shadow appearance-none cursor-pointer"
              >
                <option value="すべて">全ステータス</option>
                <option value="着工前">🟦 着工前</option>
                <option value="着工中">🟩 着工中</option>
                <option value="完工">⬛️ 完工</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <Filter className="w-4 h-4"/>
              </div>
            </div>
                      <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="pl-3 pr-8 py-2.5 h-full border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:ring-2 focus:ring-blue-500 transition-shadow appearance-none cursor-pointer"
              >
                <option value="すべて">全区分</option>
                <option value="一般">一般</option>
                <option value="役所">役所</option>
                <option value="川北">川北</option>
                <option value="BPE">BPE</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4"/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ゴミ箱モードバナー */}
      {isDeleteMode && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded-xl px-5 py-3 animate-in slide-in-from-top-2 fade-in duration-200">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-red-700 dark:text-red-400 text-sm">ゴミ箱モード中 — 削除ボタンが表示されています</p>
            <p className="text-xs text-red-500 dark:text-red-400/70">削除すると計算データがすべて失われます。元に戻せません。</p>
          </div>
          <button onClick={() => setIsDeleteMode(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shrink-0">
            <X className="w-3.5 h-3.5" /> 終了
          </button>
        </div>
      )}

      {/* 履歴リスト */}
      <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center z-10 sticky top-0">
           <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
             <Clock className="w-4 h-4 text-slate-500" />
             {debouncedQuery || statusFilter !== 'すべて' || categoryFilter !== 'すべて' ? '検索結果' : '過去の計算履歴'}
           </h2>
           <button
             onClick={() => {
               const next = !isDeleteMode;
               setIsDeleteMode(next);
               if (next) {
                 const allExpanded: Record<string, boolean> = {};
                 groupedProjects.forEach(g => { allExpanded[g.project_id] = true; });
                 allExpanded['free_uncategorized'] = true;
                 setExpandedProjects(allExpanded);
               }
             }}
             className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${isDeleteMode ? 'bg-red-500 text-white border-red-500 hover:bg-red-600' : 'bg-white text-slate-500 border-slate-200 hover:border-red-300 hover:text-red-500 dark:bg-slate-800 dark:border-slate-700'}`}
           >
             <Trash2 className="w-3.5 h-3.5" />
             {isDeleteMode ? 'ゴミ箱モード終了' : 'ゴミ箱モード'}
           </button>
        </div>
        
        {loading ? (
           <div className="p-16 text-center text-slate-400 flex flex-col items-center">
             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             データ取得中...
           </div>
        ) : groupedProjects.length === 0 && freeTools.length === 0 ? (
           <div className="p-16 text-center">
             <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4 text-slate-400">
               <Search className="w-8 h-8"/>
             </div>
             <p className="text-slate-500 font-bold">条件に一致する案件・計算書が見つかりません</p>
             <p className="text-sm text-slate-400 mt-2">検索キーワードやフィルターを変更してください。</p>
           </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {groupedProjects.map((group) => (
              <div key={group.project_id} className="group/acc relative">
                <button 
                  onClick={() => toggleProject(group.project_id)} 
                  className="w-full px-6 py-4 flex items-center justify-between bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:bg-slate-50 outline-none"
                >
                   <div className="flex items-center gap-4">
                     <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                       <FolderOpen className="w-5 h-5"/>
                     </div>
                     <div className="text-left">
                       <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                         {group.project_number && <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono border border-slate-300 dark:border-slate-600"><Hash className="w-3 h-3 inline pb-0.5"/>{group.project_number}</span>}
                         {group.project_name}
                       </h3>
                       <p className="text-xs text-slate-400 mt-1 font-medium">盤ファイル数: {group.tools.length}件</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-2">
                     {isDeleteMode && (
                       <button
                         onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: group.project_id, name: group.project_name, projectId: group.project_id, isBulkProject: true }); }}
                         className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all"
                         title="この案件の全計算書を削除"
                       >
                         <Trash2 className="w-3.5 h-3.5" /> 全削除
                       </button>
                     )}
                     <div className="text-slate-300 group-hover/acc:text-blue-500 transition-all duration-300" style={{ transform: expandedProjects[group.project_id] ? 'rotate(180deg)' : 'rotate(0)' }}>
                       <ChevronDown className="w-5 h-5"/>
                     </div>
                   </div>
                </button>
                
                {expandedProjects[group.project_id] && (
                  <div className="bg-slate-50/70 dark:bg-slate-900/30 px-6 py-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 fade-in duration-200 overflow-hidden shadow-inner">
                    {renderProjectToolsArea(group)}
                  </div>
                )}
              </div>
            ))}

            {/* フリー計算書（未紐付け） */}
            {freeTools.length > 0 && (
              <div className="group/acc relative border-t-4 border-slate-100 dark:border-slate-950">
                <button 
                  onClick={() => toggleProject('free_uncategorized')} 
                  className="w-full px-6 py-4 flex items-center justify-between bg-orange-50/30 dark:bg-slate-900 hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors outline-none"
                >
                   <div className="flex items-center gap-4 opacity-70">
                     <div className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400">
                       <FolderOpen className="w-5 h-5"/>
                     </div>
                     <div className="text-left">
                       <h3 className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 text-base">
                         フリー計算書（未紐付けデータ）
                       </h3>
                       <p className="text-xs text-slate-400 mt-1 font-medium">盤ファイル数: {freeTools.length}件</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-2">
                    {isDeleteMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: '__FREE__', name: 'フリー計算書（未紐付け）全件', projectId: '__FREE__', isBulkProject: true }); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all"
                        title="フリー計算書を全削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 全削除
                      </button>
                    )}
                    <div className="text-slate-300 transition-transform duration-200" style={{ transform: expandedProjects['free_uncategorized'] ? 'rotate(180deg)' : 'rotate(0)' }}>
                      <ChevronDown className="w-5 h-5"/>
                    </div>
                  </div>
                </button>
                {expandedProjects['free_uncategorized'] && (
                  <div className="bg-slate-50/70 dark:bg-slate-900/30 px-6 py-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 fade-in duration-200 overflow-hidden shadow-inner">
                    <ul className="space-y-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700 ml-4 py-1">
                        {freeTools.map((tool, index) => (
                          <li key={tool.id} className="relative animate-in slide-in-from-left-2 fade-in fill-mode-both" style={{ animationDelay: `${index * 30}ms` }}>
                            {/* Tree branch line */}
                            <div className="absolute -left-4 top-1/2 w-4 border-t-2 border-slate-200 dark:border-slate-700"></div>
                            
                            <div className="relative group/item">
                            <button 
                              onClick={() => { if (!isDeleteMode) openToolArea(tool.tool_type, tool.id, null); }}
                              className={`w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 border rounded-xl transition-all ${isDeleteMode ? 'border-red-200 cursor-default' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-md border ${tool.tool_type === 'POWER_CALC' ? 'bg-slate-50 border-slate-200 text-slate-500' : tool.tool_type === 'LIGHTING_CALC' ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                  {tool.tool_type === 'POWER_CALC' ? <Zap className="w-4 h-4"/> : tool.tool_type === 'LIGHTING_CALC' ? <Lightbulb className="w-4 h-4"/> : <Network className="w-4 h-4"/>}
                                </div>
                                <div className="text-left">
                                   <div className="flex items-center gap-2">
                                     <span className="font-bold text-slate-500 dark:text-slate-300 text-sm">{tool.name}</span>
                                     <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold border border-slate-200 opacity-60">フリー</span>
                                   </div>
                                   <span className="text-[10px] text-slate-400 mt-0.5 block">更新: {new Date(tool.updated_at).toLocaleDateString('ja-JP')}</span>
                                </div>
                              </div>
                              {!isDeleteMode && (
                                <span className="text-slate-400 opacity-0 group-hover/item:opacity-100 transition-opacity text-xs font-bold flex items-center gap-1">
                                  開く <ChevronRight className="w-4 h-4"/>
                                </span>
                              )}
                            </button>
                            {isDeleteMode && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: tool.id, name: tool.name, treeNodeId: null, projectId: null }); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all"
                                title="この盤を削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            </div>
                          </li>
                        ))}
                      </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======= 削除確認モーダル ======= */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-red-200 dark:border-red-900">
            <div className="bg-red-500 p-5 flex items-center gap-3 text-white">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h2 className="text-lg font-black">計算書を削除しますか？</h2>
                <p className="text-red-100 text-xs mt-0.5">この操作は取り消せません</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-300 text-sm mb-1">以下の計算書を完全に削除します：</p>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg px-4 py-3 mb-5">
                <p className="font-bold text-slate-800 dark:text-slate-100">{confirmDelete.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {confirmDelete.isBulkProject
                    ? 'この案件に紐づく全計算書・系統図データが削除されます（プロジェクト自体は残ります）'
                    : '計算書データ・負荷情報・ポータル連携がすべて削除されます'}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={async () => {
                    if (confirmDelete.isBulkProject && confirmDelete.projectId) {
                      await deleteProjectDataAll(confirmDelete.projectId);
                    } else {
                      await deleteCalcPanelFull(confirmDelete.id, confirmDelete.treeNodeId, confirmDelete.projectId);
                    }
                    setConfirmDelete(null);
                  }}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" /> 削除する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======= 案件選択 モーダル ======= */}
      {showProjectPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="bg-slate-800 p-5 flex justify-between items-center text-white shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2"><Network className="w-5 h-5 text-blue-400"/> 現場（プロジェクト）を選択</h2>
              <button onClick={() => setShowProjectPicker(false)} className="p-1 hover:bg-slate-700 rounded transition-colors"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto">
              
              <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex gap-2">
                  <select 
                    value={pickerCategoryFilter}
                    onChange={(e) => setPickerCategoryFilter(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 font-bold"
                  >
                    <option value="すべて">全ての区分</option>
                    <option value="一般">一般</option>
                    <option value="役所">役所</option>
                    <option value="川北">川北</option>
                    <option value="BPE">BPE</option>
                  </select>
                  <select 
                    value={pickerStatusFilter}
                    onChange={(e) => setPickerStatusFilter(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 font-bold"
                  >
                    <option value="すべて">全て（着工前/中/完工）</option>
                    <option value="着工前">🟦 着工前</option>
                    <option value="着工中">🟩 着工中</option>
                    <option value="完工">⬛️ 完工</option>
                  </select>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-slate-400" />
                  </div>
                  <input 
                    type="text" 
                    value={pickerSearchQuery}
                    onChange={(e) => setPickerSearchQuery(e.target.value)}
                    placeholder="案件名、現場名、工事番号で検索..." 
                    className="block w-full pl-9 pr-8 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  />
                  {pickerSearchQuery && (
                    <button onClick={() => setPickerSearchQuery("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                      <XCircle className="w-4 h-4"/>
                    </button>
                  )}
                </div>
              </div>

              <div>
                 <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">設計を開始する案件を選択する</label>
                 {(() => {
                   const filtered = pickerProjects.filter(p => {
                     if (p.project_number?.startsWith('999999') || p.project_number === 'VACATION') return false;
                     if (pickerStatusFilter !== "すべて" && p.status_flag !== pickerStatusFilter) return false;
                     if (pickerCategoryFilter !== "すべて" && p.category !== pickerCategoryFilter) return false;
                     if (pickerSearchQuery) {
                       const q = pickerSearchQuery.toLowerCase();
                       if (![p.project_name, p.project_number, p.client_name, p.site_name].some(v => v && v.toLowerCase().includes(q))) return false;
                     }
                     return true;
                   });
                   return filtered.length === 0 ? (
                     <div className="w-full border border-slate-200 rounded-lg bg-slate-50 p-6 text-center text-slate-400 text-sm">条件に一致する案件が見つかりません</div>
                   ) : (
                     <ul className="w-full border border-blue-200 rounded-lg overflow-hidden shadow-sm max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                       {filtered.map(p => (
                         <li
                           key={p.id}
                           onClick={() => setPickerProjectId(p.id)}
                           className={`px-3 py-2.5 cursor-pointer font-bold text-sm transition-colors ${ pickerProjectId === p.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100' }`}
                         >
                           {p.project_number ? `[${p.project_number}] ` : ''}{p.project_name}
                         </li>
                       ))}
                     </ul>
                   );
                 })()}
                 <p className="text-xs text-slate-400 mt-2 text-right">
                   ※最近作成・更新された上位300件から検索しています。
                 </p>
              </div>
              
              <div className="flex gap-3 pt-2">
                 <button 
                   disabled={!pickerProjectId}
                   onClick={() => {
                      setSelectedProjectId(pickerProjectId);
                      navigate('/tools/site-design');
                   }}
                   className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
                 >
                   この現場でポータルを開く
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

