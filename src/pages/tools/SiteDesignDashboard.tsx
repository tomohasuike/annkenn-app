import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Trash2, Settings, Network, Save, ChevronDown, Zap, Search, Eye, Download, ShieldCheck, Activity, AlertTriangle, ExternalLink, Link as LinkIcon, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NumpadModal } from '../../components/ui/NumpadModal';

type NodeType = 'root_cubicle' | 'root_main_lv' | 'power' | 'lighting';

interface NodeData {
  id: string;
  name: string;
  type: NodeType;
  totalKw: number;
  demandFactor: number;
  mainBreakerA: number; // この盤自体の主幹ブレーカ（A）。子盤への送り制限基準となる
  parentFeederBreakerA?: number; // 親盤内でこの子盤へと送り出しているブレーカー容量(A)
  wireIw: number;       // 親からのケーブル許容電流 (Iw)
  lengthM: number;      // 親からの配線距離 (m)
  isDedicatedFeed?: boolean; // 専用受電(1対1)かどうか
  children: NodeData[];
  isExpanded: boolean;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const BREAKER_SIZES = [20, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 225, 250, 300, 400, 500, 600, 800, 1000];

export default function SiteDesignDashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  
  const [siteTitle, setSiteTitle] = useState('〇〇工場 新築電気設備工事');
  const [siteDiversityFactor, setSiteDiversityFactor] = useState(100);
  const [linkedBoards, setLinkedBoards] = useState<any[]>([]);
  const [nodeToDelete, setNodeToDelete] = useState<{ id: string, name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [treeDbId, setTreeDbId] = useState<string | null>(null);
  const [showBasis, setShowBasis] = useState(false); // 圧縮根拠の表示トグル

  // Numpad State
  const [numpad, setNumpad] = useState<{
    isOpen: boolean;
    targetId: string;
    targetField: 'totalKw' | 'demandFactor' | 'wireIw' | 'lengthM';
    initialValue: number;
    label: string;
  }>({
    isOpen: false,
    targetId: '',
    targetField: 'totalKw',
    initialValue: 0,
    label: ''
  });

  const openNumpad = (id: string, field: 'totalKw' | 'demandFactor' | 'wireIw' | 'lengthM', initialValue: number, label: string) => {
    setNumpad({ isOpen: true, targetId: id, targetField: field, initialValue, label });
  };

  const handleNumpadConfirm = (val: number) => {
    if (numpad.targetId) {
      handleUpdate(numpad.targetId, { [numpad.targetField]: val });
    }
    setNumpad(prev => ({ ...prev, isOpen: false }));
  };

  // Root Tree State
  const [root, setRoot] = useState<NodeData>({
    id: 'root-1',
    name: '第1キュービクル (高圧受電)',
    type: 'root_cubicle',
    totalKw: 0,
    demandFactor: 100,
    mainBreakerA: 400, // 高圧の場合はトランス二次側のメイン等
    parentFeederBreakerA: undefined,
    wireIw: 0,
    lengthM: 0,
    isDedicatedFeed: false,
    isExpanded: true,
    children: [] // 初期状態は空にし、データベースから読み込むか、初期デフォルトを上書きする
  });

  // Default hardcoded tree (Used if DB has no tree saved)
  const defaultTree: NodeData = {
    id: 'root-1',
    name: '第1キュービクル (高圧受電)',
    type: 'root_cubicle',
    totalKw: 0,
    demandFactor: 100,
    mainBreakerA: 400,
    wireIw: 0,
    lengthM: 0,
    isExpanded: true,
    children: [
      {
        id: generateId(),
        name: '第1動力盤 (屋上空調)',
        type: 'power',
        totalKw: 55.0,
        demandFactor: 60,
        mainBreakerA: 225,
        wireIw: 150,
        lengthM: 10,
        isExpanded: true,
        children: []
      },
      {
        id: generateId(),
        name: '1階 電灯分電盤-A',
        type: 'lighting',
        totalKw: 28.5,
        demandFactor: 80,
        mainBreakerA: 100,
        wireIw: 110,
        lengthM: 15,
        isExpanded: true,
        children: [
          {
            id: generateId(),
            name: 'サーバー室 専用子盤',
            type: 'power',
            totalKw: 10.0,
            demandFactor: 100,
            mainBreakerA: 40,
            wireIw: 45,
            lengthM: 6,
            isExpanded: true,
            children: []
          }
        ]
      }
    ]
  };

  // --- Linked Boards Operations ---
  useEffect(() => {
    if (projectId) {
      loadTreeData();
      loadLinkedBoards();
      loadProjectInfo();
    }
  }, [projectId]);

  const loadTreeData = async () => {
    const { data } = await supabase.from('site_tools_data')
      .select('*')
      .eq('project_id', projectId)
      .eq('tool_type', 'SITE_TREE')
      .single();

    if (data && data.data_payload) {
      setTreeDbId(data.id);
      if (data.data_payload.root) setRoot(data.data_payload.root);
      if (data.data_payload.siteDiversityFactor) setSiteDiversityFactor(data.data_payload.siteDiversityFactor);
    } else {
      setRoot(defaultTree); // なければデフォルト構成をセット
    }
  };

  const saveTreeData = async () => {
    if (!projectId) return;
    setIsSaving(true);
    
    try {
      const payload = { root, siteDiversityFactor };
      if (treeDbId) {
        await supabase.from('site_tools_data').update({ data_payload: payload }).eq('id', treeDbId);
      } else {
        const { data } = await supabase.from('site_tools_data').insert({
          project_id: projectId,
          tool_type: 'SITE_TREE',
          name: 'Main Site Tree',
          data_payload: payload
        }).select().single();
        if (data) setTreeDbId(data.id);
      }
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const loadProjectInfo = async () => {
    const { data } = await supabase.from('projects')
      .select('project_name, site_name, project_number, client_name')
      .eq('id', projectId)
      .single();
      
    if (data) {
      const parts = [];
      if (data.project_number) parts.push(`[${data.project_number}]`);
      parts.push(data.project_name);
      if (data.site_name || data.client_name) {
        parts.push(`(${data.site_name || data.client_name})`);
      }
      setSiteTitle(parts.join(' '));
    }
  };

  const loadLinkedBoards = async () => {
    const { data } = await supabase.from('site_tools_data')
      .select('id, name, data_payload, tool_type')
      .eq('project_id', projectId)
      .in('tool_type', ['POWER_CALC', 'LIGHTING_CALC']);
    
    if (data) {
      // ツリーと連携している盤のみ抽出
      const linked = data.filter(d => d.data_payload?.treeNodeId);
      setLinkedBoards(linked);
    }
  };

  // リンク済みの盤があれば取得
  const getLinkedBoardForNode = (nodeId: string) => {
    return linkedBoards.find(b => b.data_payload?.treeNodeId === nodeId);
  };

  // 各ノードの計算用 数値を安全に取得するヘルパー
  const getNodeValues = (node: NodeData) => {
    const linked = getLinkedBoardForNode(node.id);
    if (linked && linked.data_payload) {
      // リンクされていれば計算書の値を強制使用
      return {
        kw: linked.data_payload.summaryKw || 0,
        df: linked.data_payload.summaryDemandFactor ?? 100,
        isLinked: true,
        toolType: linked.tool_type,
        boardId: linked.id
      };
    }
    return {
      kw: node.totalKw,
      df: node.demandFactor,
      isLinked: false,
      toolType: null,
      boardId: null
    };
  };

  // --- Tree Operations ---
  const updateNode = (tree: NodeData, id: string, updates: Partial<NodeData>): NodeData => {
    if (tree.id === id) return { ...tree, ...updates };
    return { ...tree, children: tree.children.map(child => updateNode(child, id, updates)) };
  };

  const deleteNode = (tree: NodeData, id: string): NodeData | null => {
    if (tree.id === id) return null;
    return { ...tree, children: tree.children.map(c => deleteNode(c, id)).filter(Boolean) as NodeData[] };
  };

  const addChildNode = (tree: NodeData, parentId: string, nodeType: NodeType): NodeData => {
    if (tree.id === parentId) {
      const newNode: NodeData = {
        id: generateId(),
        name: `新規${nodeType === 'power' ? '動力' : '電灯'}盤`,
        type: nodeType,
        totalKw: 10,
        demandFactor: 100,
        mainBreakerA: 100,
        parentFeederBreakerA: tree.mainBreakerA,
        wireIw: 76,
        lengthM: 5,
        isExpanded: true,
        children: []
      };
      return { ...tree, children: [...tree.children, newNode], isExpanded: true };
    }
    return { ...tree, children: tree.children.map(c => addChildNode(c, parentId, nodeType)) };
  };

  const handleUpdate = (id: string, updates: Partial<NodeData>) => {
    setRoot(updateNode(root, id, updates));
  };

  // --- TEPCO Compliance Calculations ---
  interface PowerLoadDetail {
    id: string;
    boardName: string;
    machineName: string;
    kw: number;
    isLinked: boolean;
  }

  const extractTepcoDemands = (node: NodeData): { lightingRawSum: number, powerLoads: PowerLoadDetail[] } => {
    let lightingRawSum = 0;
    let powerLoads: PowerLoadDetail[] = [];
    
    const linked = getLinkedBoardForNode(node.id);
    if (node.type !== 'root_cubicle' && node.type !== 'root_main_lv') {
      if (node.type === 'lighting') {
         if (linked && linked.data_payload) {
            lightingRawSum += linked.data_payload.summaryKw || 0;
         } else {
            lightingRawSum += node.totalKw;
         }
      } else if (node.type === 'power') {
         if (linked && linked.data_payload && linked.data_payload.loads) {
            // 個別の動力負荷（モーター等）を展開
            linked.data_payload.loads.forEach((m: any) => {
               powerLoads.push({
                  id: m.id || generateId(),
                  boardName: node.name,
                  machineName: m.name || '不明な動力機器',
                  kw: typeof m.kw === 'number' ? m.kw : 0,
                  isLinked: true
               });
            });
         } else {
            // 未連携の場合は盤単位の合計を1台の機器（仮）としてみなす
            powerLoads.push({
               id: node.id,
               boardName: node.name,
               machineName: '盤内一括見なし負荷（要連携）',
               kw: node.totalKw,
               isLinked: false
            });
         }
      }
    }
  
    node.children.forEach(child => {
       const childRes = extractTepcoDemands(child);
       lightingRawSum += childRes.lightingRawSum;
       powerLoads = powerLoads.concat(childRes.powerLoads);
    });
    
    return { lightingRawSum, powerLoads };
  };

  const summary = useMemo(() => {
    const extracts = extractTepcoDemands(root);
    
    // 1. 電力会社特例：電灯（階段式）
    let lKw = extracts.lightingRawSum;
    let finalLightingDemand = 0;
    const lightingTiers = [];
    
    if (lKw > 0) {
      const tier1 = Math.min(lKw, 6);
      finalLightingDemand += tier1 * 1.0;
      lightingTiers.push({ label: '最初の6kW', kw: tier1, rate: 100, result: tier1 * 1.0 });
      lKw -= tier1;
    }
    if (lKw > 0) {
      const tier2 = Math.min(lKw, 14);
      finalLightingDemand += tier2 * 0.9;
      lightingTiers.push({ label: '次の14kW', kw: tier2, rate: 90, result: tier2 * 0.9 });
      lKw -= tier2;
    }
    if (lKw > 0) {
      const tier3 = Math.min(lKw, 30);
      finalLightingDemand += tier3 * 0.8;
      lightingTiers.push({ label: '次の30kW', kw: tier3, rate: 80, result: tier3 * 0.8 });
      lKw -= tier3;
    }
    if (lKw > 0) {
      finalLightingDemand += lKw * 0.7;
      lightingTiers.push({ label: '50kW超過分', kw: lKw, rate: 70, result: lKw * 0.7 });
    }

    // 2. 電力会社特例：動力（個体順位）
    // 換算率: 1〜2台目=100%, 3〜4台目=95%, 5台目以降=90%
    const sortedPower = [...extracts.powerLoads].sort((a,b) => b.kw - a.kw);
    let finalPowerDemand = 0;
    const powerDetails = sortedPower.map((p, idx) => {
       let rate = 90;
       if (idx === 0 || idx === 1) rate = 100;
       else if (idx === 2 || idx === 3) rate = 95;
       
       const res = p.kw * (rate / 100);
       finalPowerDemand += res;
       return { ...p, rate, result: res, rank: idx + 1 };
    });

    const totalSiteDemand = finalLightingDemand + finalPowerDemand;

    const LIMIT = 50.0;
    let contractType = 'HIGH_VOLTAGE';
    let suggestionMsg = '高圧引込（キュービクル設置）が必要です。';

    if (totalSiteDemand < LIMIT) {
      contractType = 'LOW_VOLTAGE';
      suggestionMsg = '低圧引込（電灯・動力）で契約可能です。';
    } else {
      if (finalLightingDemand < LIMIT && finalPowerDemand < LIMIT) {
        contractType = 'LOW_VOLTAGE_EXCEPTION';
        suggestionMsg = '電力会社との協議による【低圧引込の特例】が狙える可能性があります！(電灯・動力単独それぞれ50kW未満)';
      }
    }

    return { 
      finalLightingDemand, 
      finalPowerDemand, 
      totalSiteDemand, 
      contractType, 
      suggestionMsg, 
      lightingTiers,
      powerDetails,
      lightingRawSum: extracts.lightingRawSum
    };
  }, [root]);


  // --- Render Node Component ---
  const NodeItem = ({ node, parentNode, level }: { node: NodeData, parentNode: NodeData | null, level: number }) => {
    
    // 3m/8m Rule Logic
    let rule = null;
    if (parentNode && node.type !== 'root_cubicle' && node.type !== 'root_main_lv') {
      if (node.isDedicatedFeed) {
        rule = { ratio: 1, isValid: true, msg: '1対1 専用配線のため分岐則(3m/8m)適用外', limitMsg: '制限なし' };
      } else {
        const ib = node.parentFeederBreakerA || parentNode.mainBreakerA;
        const ratio = node.wireIw / ib;
        let limitM = 3;
        let limitMsg = '3m以内';
        let isValid = false;
        let msg = '';
        
        if (ratio >= 0.55) {
          limitM = Infinity; limitMsg = '制限なし'; isValid = true;
          msg = `I_w比 ${ (ratio*100).toFixed(0) }% ≥ 55% (距離制限なし)`;
        } else if (ratio >= 0.35) {
          limitM = 8; limitMsg = '8m以内'; isValid = node.lengthM <= limitM;
          msg = `I_w比 ${ (ratio*100).toFixed(0) }% ≥ 35% (${node.lengthM}m / 8m以内)`;
        } else {
          limitM = 3; limitMsg = '3m以内'; isValid = node.lengthM <= limitM;
          msg = `I_w比 ${ (ratio*100).toFixed(0) }% < 35% (${node.lengthM}m / 3m以内)`;
        }
        rule = { ratio, isValid, msg, limitMsg };
      }
    }

    const isRoot = node.type === 'root_cubicle' || node.type === 'root_main_lv';
    const vals = getNodeValues(node);

    const handleOpenCalc = (type: 'power' | 'lighting') => {
      const url = `/tools/${projectId}/${type}-calc?treeNodeId=${node.id}&name=${encodeURIComponent(node.name)}`;
      navigate(url);
    };

    return (
      <div className={`mt-3 ${level > 0 ? 'ml-6 border-l-2 border-slate-200 pl-4 relative' : ''}`}>
        
        {/* Branch Cable (Parent to Child) Indicator */}
        {parentNode && level > 0 && (
          <div className="absolute -left-[2px] top-6 w-4 h-2 border-b-2 border-slate-200"></div>
        )}

        <div className={`border rounded-lg shadow-sm transition-all overflow-hidden ${isRoot ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
          <div className={`p-3 flex flex-wrap items-center gap-3 ${isRoot ? 'border-b border-slate-700' : 'border-b bg-slate-50'}`}>
            
            <button onClick={() => handleUpdate(node.id, { isExpanded: !node.isExpanded })} className={`${isRoot ? 'text-white hover:text-blue-300' : 'text-slate-500 hover:text-blue-600'}`}>
              {node.children.length > 0 ? (node.isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />) : <div className="w-5 h-5" />}
            </button>

            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              isRoot ? 'bg-blue-600 text-white' : 
              node.type === 'lighting' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
            }`}>
              {isRoot ? '元' : node.type === 'lighting' ? '電' : '動'}
            </div>

            <div className="flex-1 min-w-[150px]">
              {isRoot ? (
                <div className="flex flex-col">
                  <select 
                    value={node.type}
                    onChange={(e) => handleUpdate(node.id, { type: e.target.value as NodeType })}
                    className="bg-transparent text-xs text-blue-300 border-0 focus:ring-0 px-0 outline-none font-bold"
                  >
                    <option value="root_cubicle" className="text-slate-800">高圧キュービクル</option>
                    <option value="root_main_lv" className="text-slate-800">低圧 引込開閉器盤</option>
                  </select>
                  <input type="text" value={node.name} onChange={e => handleUpdate(node.id, { name: e.target.value })} 
                    className="bg-transparent border-0 border-b border-transparent focus:border-blue-500 focus:ring-0 px-0 py-0 text-sm font-bold text-white placeholder-slate-400" />
                </div>
              ) : (
                <input type="text" value={node.name} onChange={e => handleUpdate(node.id, { name: e.target.value })} 
                  className="w-full bg-transparent border-0 border-b border-transparent focus:border-blue-500 focus:ring-0 px-0 py-0 text-sm font-bold text-slate-800" />
              )}
            </div>

            {/* Inputs based on type */}
            {!isRoot && (
              <>
                <div className="flex items-center gap-1 relative">
                  <span className="text-[10px] text-slate-500 font-bold">kW</span>
                  <input 
                    type="text" 
                    inputMode="none"
                    readOnly
                    value={Number(vals.kw).toFixed(1)} 
                    onClick={() => !vals.isLinked && openNumpad(node.id, 'totalKw', vals.kw, 'kW')} 
                    disabled={vals.isLinked}
                    title={vals.isLinked ? "計算書の合計値がリンクされています" : "タップして専用テンキーで入力"}
                    className={`w-14 h-7 text-xs border rounded px-1 font-mono text-right hide-spinners cursor-pointer focus:ring-2 focus:ring-blue-500 ${vals.isLinked ? 'bg-green-50 border-green-200 text-green-800 font-bold' : ''}`} 
                  />
                  {vals.isLinked && <LinkIcon className="w-3 h-3 text-green-500 absolute -bottom-1 -right-1" />}
                </div>
                <div className="flex items-center gap-1 relative">
                  <span className="text-[10px] text-orange-500 font-bold">需要率%</span>
                  <input 
                    type="text" 
                    inputMode="none"
                    readOnly
                    value={Number(vals.df).toFixed(0)} 
                    onClick={() => !vals.isLinked && openNumpad(node.id, 'demandFactor', vals.df, '需要率(%)')} 
                    disabled={vals.isLinked}
                    title={vals.isLinked ? "計算書の需要率がリンクされています" : "タップして専用テンキーで入力"}
                    className={`w-12 h-7 text-xs border rounded px-1 font-mono text-right hide-spinners cursor-pointer focus:ring-2 focus:ring-orange-500 ${vals.isLinked ? 'bg-green-50 border-green-200 text-green-800 font-bold' : 'border-orange-200 bg-orange-50 text-orange-800'}`} 
                  />
                </div>
                
                {/* 連携ボタン */}
                <div className="border-l border-slate-200 pl-2 ml-1">
                  <button 
                    onClick={() => handleOpenCalc(node.type as 'power' | 'lighting')}
                    className={`h-7 px-2 text-[10px] font-bold rounded flex items-center gap-1 transition-colors ${
                      vals.isLinked 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200' 
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100'
                    }`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {vals.isLinked ? '計算書' : '計算作成'}
                  </button>
                </div>
              </>
            )}

            <div className="flex items-center gap-1 border-l border-slate-200 pl-3 ml-2">
              <span className={`text-[10px] ${isRoot ? 'text-slate-400' : 'text-blue-500 font-bold'}`} title="この盤の主幹ブレーカー(A)。子へ送る配線の基準となります。">主幹 B</span>
              <select 
                value={node.mainBreakerA} 
                onChange={e => handleUpdate(node.id, { mainBreakerA: Number(e.target.value) })}
                className={`h-7 text-xs border rounded pl-1 pr-6 font-mono text-right appearance-none cursor-pointer ${isRoot ? 'bg-slate-700 border-slate-600 text-white' : 'border-blue-200 bg-blue-50 text-blue-800'}`}
              >
                {/* 既存の値がリストにない場合のフォールバック */}
                {!BREAKER_SIZES.includes(node.mainBreakerA) && <option value={node.mainBreakerA}>{node.mainBreakerA}</option>}
                {BREAKER_SIZES.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            {/* Add/Delete Buttons */}
            <div className="flex items-center gap-1 ml-auto shrink-0 pl-2">
              <button title="子（分岐先の盤）を追加" onClick={() => setRoot(addChildNode(root, node.id, 'power'))} className={`p-1 rounded text-xs transition-colors ${isRoot ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>+子盤</button>
              {!isRoot && (
                <button 
                  onClick={() => setNodeToDelete({ id: node.id, name: node.name })} 
                  className="p-1 rounded bg-red-50 text-red-500 hover:bg-red-100 ml-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Branch Rules & Properties Area (Only for non-root) */}
          {!isRoot && parentNode && (
            <div className="p-2 bg-slate-50 flex flex-wrap gap-4 items-center text-xs">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400" title="親盤内にある、この盤への送り出しブレーカー">送りブレーカ(I<sub>B</sub>)</span>
                <select 
                  value={node.parentFeederBreakerA || parentNode.mainBreakerA} 
                  onChange={e => handleUpdate(node.id, { parentFeederBreakerA: Number(e.target.value) })} 
                  className="border rounded pl-1.5 pr-6 py-0.5 text-center font-bold text-slate-700 text-xs appearance-none cursor-pointer bg-white" 
                >
                  {/* リストにないカスタム値の保護 */}
                  {!BREAKER_SIZES.includes(node.parentFeederBreakerA || parentNode.mainBreakerA) && (
                    <option value={node.parentFeederBreakerA || parentNode.mainBreakerA}>{node.parentFeederBreakerA || parentNode.mainBreakerA}</option>
                  )}
                  {BREAKER_SIZES.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400">A</span>
              </div>
              <div className="font-bold text-slate-400">→分岐→</div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-slate-600 font-bold">送り電線 I<sub>w</sub></label>
                <input 
                  type="text" 
                  inputMode="none" 
                  readOnly 
                  value={node.wireIw} 
                  onClick={() => openNumpad(node.id, 'wireIw', node.wireIw, 'ケーブル許容電流(Iw)')} 
                  className="w-12 h-6 text-xs border rounded px-1 text-right font-mono hide-spinners cursor-pointer focus:ring-2 focus:ring-slate-400" 
                /> A
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-slate-600 font-bold">距離 L</label>
                <input 
                  type="text" 
                  inputMode="none" 
                  readOnly 
                  value={node.lengthM} 
                  onClick={() => openNumpad(node.id, 'lengthM', node.lengthM, '距離 L(m)')} 
                  className="w-12 h-6 text-xs border rounded px-1 text-right font-mono hide-spinners cursor-pointer focus:ring-2 focus:ring-slate-400" 
                /> m
              </div>

              {/* Rule Validation Result Badge */}
              {rule && (
                <div className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-sm border ${rule.isValid ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {rule.isValid ? <Activity className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  <span className="font-bold">{rule.isValid ? '法規 適合' : '法規 違反'}</span>
                  <span className="opacity-80 text-[10px] ml-1">({rule.msg})</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Render Children Recursively */}
        {node.isExpanded && node.children.length > 0 && (
          <div>
            {node.children.map(child => <NodeItem key={child.id} node={child} parentNode={node} level={level + 1} />)}
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 print:pb-0 print:space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
             現場総合設計ポータル <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 font-bold rounded-full ml-2">Phase 1/3 (系統デザイン版)</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">「系統図」を作成し、3m/8m規程チェックから総合デマンド低圧判定まで一気通貫で設計します。</p>
        </div>
        <button
          onClick={saveTreeData}
          disabled={isSaving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-full shadow-sm shadow-blue-500/30 transition-all flex items-center gap-2"
        >
          {isSaving ? '保存中...' : 'クラウド保存'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print-hidden">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-500 mb-1">対象 工事案件（現場名称）</label>
            <div className="w-full text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-md">
              {siteTitle || <span className="text-slate-400 font-normal">読み込み中...</span>}
            </div>
          </div>
          <div className="w-full md:w-48 space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 text-purple-600">現場 全体不等率</label>
            <div className="relative">
              <input 
                type="number" 
                value={siteDiversityFactor} 
                onChange={(e) => setSiteDiversityFactor(Number(e.target.value))}
                className="w-full px-3 py-2 bg-purple-50 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold text-purple-800 pr-8 hide-spinners"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-600/60 font-medium text-xs">%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側：ツリー図形エディタ */}
        <div className="lg:col-span-2 bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col print-hidden">
          <div className="px-5 py-4 border-b bg-slate-50/80 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Network className="w-4 h-4 text-blue-500" />
              単線系統図 エディタ (Tree Editor)
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded shadow-sm font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                特例計算アルゴリズム適用中
              </span>
              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Phase 3 規程・約款準拠</span>
            </div>
          </div>
          
          <div className="p-5 flex-1 overflow-x-auto min-h-[400px]">
            {/* 再帰コールでRootから描画 */}
            <NodeItem node={root} parentNode={null} level={0} />
          </div>
        </div>

        {/* 右側：判定と集計 */}
        <div className="space-y-6">
          <div className={`rounded-xl border p-6 text-white shadow-lg relative overflow-hidden ${
             summary.contractType === 'LOW_VOLTAGE' ? 'bg-emerald-800 border-emerald-700' :
             summary.contractType === 'LOW_VOLTAGE_EXCEPTION' ? 'bg-indigo-800 border-indigo-700' :
             'bg-slate-800 border-slate-700'
          }`}>
            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-white/20 to-white/50" />
            
            <h3 className="text-sm font-medium text-slate-200 mb-6 flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400 fill-orange-400" /> 
              内線規程・契約容量 算定結果（特例準拠）
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-white/10 pb-2">
                <span className="text-white/70 text-sm">電灯 換算容量</span>
                <span className="text-2xl font-bold text-yellow-300">{summary.finalLightingDemand.toFixed(1)} <span className="text-sm text-yellow-300/60 font-normal">kW</span></span>
              </div>
              <div className="flex justify-between items-end border-b border-white/10 pb-2">
                <span className="text-white/70 text-sm">動力 換算容量</span>
                <span className="text-2xl font-bold text-red-300">{summary.finalPowerDemand.toFixed(1)} <span className="text-sm text-red-300/60 font-normal">kW</span></span>
              </div>
              <div className="flex justify-between items-end pt-2">
                <span className="text-slate-100 font-bold">現場総合デマンド（契約電力）</span>
                <span className="text-4xl font-black text-orange-400">{summary.totalSiteDemand.toFixed(1)} <span className="text-base text-white/50 font-bold">kW</span></span>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-black/20 border border-white/10">
              <p className="text-xs mb-1 opacity-80 text-white/80">自動設計システムからの一言アドバイス：</p>
              <p className="font-bold text-[14px] leading-relaxed tracking-wide text-white">{summary.suggestionMsg}</p>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/10 print-hidden">
              <button 
                onClick={() => setShowBasis(!showBasis)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-white/80 bg-white/5 hover:bg-white/10 rounded transition-colors print-hidden"
                title="計算の根拠・内訳を表示"
              >
                <span>各負荷の圧縮計算 根拠（提出用）を見る</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showBasis ? 'rotate-180' : ''}`} />
              </button>
            </div>
              
            {/* 印刷時にはshowBasisの状態に関わらず常に表示するよう print-only を活用するか、JSX側で制御 */}
            {showBasis && (
              <>
                <div className="print-only mb-4 hidden">
                   <h2 className="text-xl font-bold text-black border-b-2 border-black pb-2 mb-4">低圧需要家 制約容量計算書 根拠一覧</h2>
                   <div className="text-sm text-black mb-4 space-y-1">
                      <div><strong>工事案件:</strong> {siteTitle}</div>
                      <div><strong>設定不等率:</strong> {siteDiversityFactor}%</div>
                   </div>
                </div>
                
                <div className="mt-3 p-3 bg-black/40 print:bg-transparent print:p-0 print:text-black rounded-lg space-y-4 max-h-[400px] print:max-h-none overflow-y-auto print:overflow-visible animate-in fade-in slide-in-from-top-2 duration-200">
                  
                  {/* 一括負荷がある場合の強力な警告 */}
                  {summary.powerDetails.some(d => !d.isLinked) && (
                    <div className="bg-red-500/20 border border-red-500/50 print:bg-red-50 print:border-red-500 rounded p-3 mb-4">
                      <div className="flex items-start gap-2 text-red-200 print:text-red-700">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-xs font-bold leading-relaxed">
                          <p className="text-red-100 print:text-red-800 text-sm mb-1">【重要】明細が登録されていない盤があります</p>
                          「一括見なし負荷」として処理されている盤が存在します。この状態の根拠書は、電力会社の台数特例ルールの適用を正しく受けられないため、公式な申請等には使用できません。<br/>
                          対象の盤について「計算作成」ボタンから各機器のリスト（kWなど）を登録・連携してください。
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 電灯の明細 */}
                  <div className="space-y-1.5 print:mt-4 print:text-black">
                    <h4 className="text-xs font-bold text-yellow-400 print:text-amber-800 border-b border-yellow-400/30 print:border-amber-800 pb-1 mb-2">💡 電灯設備（合算逓減ルール）</h4>
                    <div className="flex justify-between text-[10px] text-white/50 print:text-slate-600 px-1">
                       <span>合計生負荷: {summary.lightingRawSum.toFixed(1)} kW</span>
                    </div>
                    {summary.lightingTiers.map((t, i) => (
                      <div key={i} className="flex justify-between items-center text-[11px]">
                        <span className="text-white/80 print:text-slate-800 w-24 truncate">{t.label}</span>
                        <div className="flex gap-3 font-mono print:text-black">
                          <span className="w-10 text-right opacity-70">{t.kw.toFixed(1)}</span>
                          <span className="w-8 text-right opacity-70">× {t.rate}%</span>
                          <span className="w-10 text-right text-yellow-200 print:text-amber-700 print:font-bold">{(t.result).toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 動力の明細 */}
                  <div className="space-y-1.5 pt-2 border-t border-white/10 print:border-black/20">
                    <h4 className="text-xs font-bold text-red-400 print:text-red-800 border-b border-red-400/30 print:border-red-800/50 pb-1 mb-2 text-left">⚙️ 動力設備（台数順特例ルール）</h4>
                    <div className="flex justify-between text-[10px] text-white/50 print:text-slate-600 font-bold px-1">
                      <span>対象機器（ランク順）</span>
                      <div className="flex gap-3">
                        <span className="w-10 text-right">kW(生)</span>
                        <span className="w-8 text-right">換算率</span>
                        <span className="w-10 text-right">換算kW</span>
                      </div>
                    </div>
                    {summary.powerDetails.length === 0 && <p className="text-xs text-center text-white/40 py-1">動力負荷がありません</p>}
                    {summary.powerDetails.map((det) => (
                      <div key={det.id} className="flex justify-between items-center text-[11px] group relative">
                        <div className="flex flex-col flex-1 min-w-0 pr-2">
                           <div className="flex items-center gap-1.5">
                             <span className="text-[9px] w-3 h-3 flex items-center justify-center bg-slate-700 print:bg-slate-300 rounded-full font-bold text-white print:text-black shrink-0">{det.rank}</span>
                             <span className="truncate text-white print:text-black" title={det.machineName}>{det.machineName}</span>
                           </div>
                           <span className="text-[9px] text-white/40 print:text-slate-500 pl-4.5 truncate">{det.boardName}</span>
                        </div>
                        <div className="flex gap-3 font-mono items-center shrink-0 print:text-black">
                          <span className="w-10 text-right opacity-70">{det.kw.toFixed(2)}</span>
                          <span className="w-8 text-right opacity-70">× {det.rate}%</span>
                          <span className="w-10 text-right font-bold text-red-200 print:text-red-700">{det.result.toFixed(2)}</span>
                        </div>
                        {!det.isLinked && (
                          <div className="absolute -left-1 -top-1 print:static print:ml-2">
                             <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse block print:hidden" title="明細がありません" />
                             <span className="hidden print:inline text-[9px] text-red-600 font-bold bg-red-100 px-1 rounded">要明細</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Print Command Button */}
                  <div className="pt-4 border-t border-white/10 mt-6 print-hidden flex justify-end">
                    <button
                      onClick={() => {
                        window.print();
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                      申請根拠をPDF出力・印刷
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* 削除確認モーダル */}
      {nodeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">ノードの削除確認</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                「<span className="font-bold text-slate-800 dark:text-slate-200">{nodeToDelete.name}</span>」を削除してもよろしいですか？<br/>
                <span className="text-red-500 text-xs mt-1 block">※この盤に紐づく子ノードのツリーもすべて一緒に削除されます。</span>
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setNodeToDelete(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    const res = deleteNode(root, nodeToDelete.id);
                    if (res) setRoot(res);
                    setNodeToDelete(null);
                  }}
                  className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                >
                  削除する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Numpad Popup */}
      <NumpadModal 
        isOpen={numpad.isOpen} 
        onClose={() => setNumpad(prev => ({ ...prev, isOpen: false }))} 
        onConfirm={handleNumpadConfirm} 
        initialValue={numpad.initialValue} 
        label={numpad.label} 
      />
    </div>
  );
}
