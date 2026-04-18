import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Settings2, List, PlusCircle, Save, ChevronLeft, ShieldAlert, FileSpreadsheet, X, Calculator, Bot, Check, GripVertical, Undo2, Redo2, Loader2, CloudOff, CheckCircle2 } from 'lucide-react';
import Den81ReportPreview from '../../components/Den81ReportPreview';
import VACalculatorModal from '../../components/tools/VACalculatorModal';
import { useBoardHistory } from '../../hooks/useBoardHistory';
import { addBoardToPortalTree, fetchPortalTreeNodes, fetchParentNodes, moveNodeToNewParent } from '../../utils/syncPortalTree';

interface LightingLoad {
  id: string;
  symbol?: string; // 回路記号（旧回路番号を含む）
  circuitNo: number; // DB連携用の並び順
  name: string;
  voltage: '100V' | '200V';
  equipment_type?: string; // 負荷の種別 (L, C, F, A, etc.)
  phase: 'U' | 'W' | 'UW'; // 表示用（内部状態は配列インデックスに依存させる）
  va: number; // 容量(VA)
  length_m: number; // こう長(m)
  breakerType: 'MCCB' | 'ELCB'; // 遮断器種別
  is_verified?: boolean;
}

const generateId = () => crypto.randomUUID();

export const STANDARD_MAIN_BREAKERS = [20, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 500, 600];

export default function LightingCalc() {
  const { selectedProjectId } = useOutletContext<{ selectedProjectId: string }>();
  const projectId = selectedProjectId || null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetTreeNodeId = searchParams.get('treeNodeId');
  const initialName = searchParams.get('name');
  const loadId = searchParams.get('load_id');

  const [savedBoards, setSavedBoards] = useState<any[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(loadId);
  const [treeNodeId, setTreeNodeId] = useState<string | null>(targetTreeNodeId && targetTreeNodeId !== 'undefined' ? targetTreeNodeId : null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const skipHistory = useRef(false);
  const isDataLoaded = useRef(false);

  const { initHistory, pushHistory, undo, redo, canUndo, canRedo } = useBoardHistory<{title: string, demandFactor: number, mainBreakerOverride: number | null, loads: LightingLoad[]}>();

  const [popupMessage, setPopupMessage] = useState<{title: string, message: string} | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: string, name: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [parentNodes, setParentNodes] = useState<{id: string; name: string; type: string; depth: number}[]>([]);
  
  // VA Calculator State
  const [calculatorOpenId, setCalculatorOpenId] = useState<string | null>(null);
  const [typePopoverId, setTypePopoverId] = useState<string | null>(null);

  // 設備種別ボタン定義
  const EQUIPMENT_TYPES = [
    { code: 'L',  label: '照明',     color: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300' },
    { code: 'C',  label: 'コンセント', color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300' },
    { code: 'F',  label: '換気',     color: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300' },
    { code: 'A',  label: '空調',     color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300' },
    { code: 'X',  label: 'その他',   color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300' },
  ] as const;

  // VACalculatorModalのカテゴリ→種別コードのマッピング
  const CATEGORY_TO_TYPE: Record<string, string> = {
    led:     'L',
    legacy:  'L',
    outlets: 'C',
    heavy:   'A',
    special: 'X',
  };

  const [title, setTitle] = useState('新規電灯盤');
  const [demandFactor, setDemandFactor] = useState(100);
  const [mainBreakerOverride, setMainBreakerOverride] = useState<number | null>(null);

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // 列幅リサイズ―各列のpx幅をステートで管理
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    circuit: 72,
    type:    72,
    name:    200,
    voltage: 88,
    va:      100,
    uA:      64,
    wA:      64,
    breaker: 80,
  });
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = { col, startX: e.clientX, startW: colWidths[col] };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newW = Math.max(40, resizingRef.current.startW + delta);
      setColWidths(prev => ({ ...prev, [resizingRef.current!.col]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  // テーブル全体の幅 = 全列合計 + ドラッグハンドル列(32px)
  const tableWidth = Object.values(colWidths).reduce((s, v) => s + v, 0) + 32;

  const [loads, setLoads] = useState<LightingLoad[]>([]); // 新規は空の状態で開始

  // 初回ロードで保存済みリストを取得
  useEffect(() => {
    loadBoardsList(currentBoardId);
  }, [projectId]);

  const loadBoardsList = async (activeId?: string | null) => {
    let query = supabase
      .from('calc_panels')
      .select('id, name, tree_node_id')
      .eq('panel_type', 'LIGHTING')
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    } else {
      query = query.is('project_id', null);
    }

    const { data } = await query;
      
    if (data) {
      if (data.length > 0) {
        setSavedBoards(data);
      }

      if (loadId && !activeId) {
        // load_id指定の場合は直接ロード
        await loadBoard(loadId, data.find((b: any) => b.id === loadId)?.name);
      } else if (targetTreeNodeId && !activeId) {
        // treeNodeId指定の場合: 一致する盤があればロード、なければ新規作成
        const matchingBoard = data.find((b: any) => b.tree_node_id === targetTreeNodeId);
        if (matchingBoard) {
          await loadBoard(matchingBoard.id, matchingBoard.name);
        } else {
          createNewBoard(initialName || undefined);
        }
      } else if (!activeId && data.length > 0) {
        // 通常アクセス: 最新をロード
        await loadBoard(data[0].id, data[0].name);
      }
    }
  };

  const loadBoard = async (id: string, boardName?: string) => {
    setCurrentBoardId(id);
    if (boardName) setTitle(boardName);

    // Fetch parent panel
    const { data: panelData } = await supabase.from('calc_panels').select('*').eq('id', id).single();
    if (panelData) {
      // Set name and attributes
      if (panelData.name) setTitle(panelData.name);
      if (panelData.reduction_factor) setDemandFactor(panelData.reduction_factor * 100);
      if (panelData.main_breaker_at) setMainBreakerOverride(panelData.main_breaker_at);
      else setMainBreakerOverride(null);
      // ツリーノードIDをstateに反映（saveBoard時に正しく保存するため）
      const existingTreeNodeId = panelData.tree_node_id || null;
      setTreeNodeId(existingTreeNodeId);

      // tree_node_idがnull（未連携）の場合はポータルに自動追加
      if (!existingTreeNodeId && projectId) {
        const newTreeNodeId = await addBoardToPortalTree({
          projectId,
          boardName: panelData.name || '電灯盤',
          panelType: 'LIGHTING',
        });
        if (newTreeNodeId) {
          setTreeNodeId(newTreeNodeId);
          // DBも更新
          await supabase.from('calc_panels').update({ tree_node_id: newTreeNodeId }).eq('id', id);
        }
      }

      const { data: loadsData } = await supabase.from('calc_loads').select('*').eq('panel_id', id).order('circuit_no', { ascending: true });
      if (loadsData && loadsData.length > 0) {
         const parsedLoads = loadsData.map((l: any) => ({
           id: l.id,
           circuitNo: l.circuit_no,
           symbol: l.symbol || '',
           equipment_type: l.equipment_type || '',
           name: l.name,
           voltage: l.phase === 'UW' ? '200V' : '100V',
           phase: l.phase,
           va: Math.round(l.capacity_kw * 1000),
           length_m: l.cable_length_m || 20,
           breakerType: 'MCCB'
         }));
         skipHistory.current = true;
         setLoads(parsedLoads);
         initHistory({ title: panelData.name || '', demandFactor: (panelData.reduction_factor || 1) * 100, mainBreakerOverride: panelData.main_breaker_at || null, loads: parsedLoads });
      }
      // loadsがあってもなくても isDataLoaded を true にする
      isDataLoaded.current = true;
      setSaveStatus('saved');
    }
  };

  const createNewBoard = async (overrideName?: any) => {
    const isEvent = overrideName && typeof overrideName === 'object' && ('_reactName' in overrideName || 'nativeEvent' in overrideName || 'type' in overrideName);
    const finalName = (!overrideName || isEvent || typeof overrideName !== 'string') ? '新規電灯盤' : overrideName;
    const initLoads: LightingLoad[] = []; // 新規は空の状態で開始

    try {
      // 新規盤なので既存のtreeNodeIdを引き継がず、必ず新規ノードをポータルに追加する
      let newTreeNodeId: string | null = null;
      if (projectId) {
        newTreeNodeId = await addBoardToPortalTree({
          projectId,
          boardName: finalName,
          panelType: 'LIGHTING',
        });
        setTreeNodeId(newTreeNodeId);
      } else {
        setTreeNodeId(null);
      }

      const newPanelData = {
        project_id: projectId,
        name: finalName,
        panel_type: 'LIGHTING',
        voltage_system: '1Φ3W 100/200V',
        reduction_factor: 1.0,
        main_breaker_at: null,
        tree_node_id: newTreeNodeId,
      };
      const { data, error } = await supabase.from('calc_panels').insert([newPanelData]).select().single();
      if (error) throw error;

      const newPanelId = data.id;

      // デフォルト負荷は作成しない（空の状態で開始）

      // 直接stateをセット
      setCurrentBoardId(newPanelId);
      setTitle(finalName);
      setLoads([]);
      setDemandFactor(100);
      setMainBreakerOverride(null);
      setSaveStatus('saved');
      initHistory({ title: finalName, demandFactor: 100, mainBreakerOverride: null, loads: [] });
      isDataLoaded.current = true;

      // サイドバーに即座に追加（DBの再取得に依存しない）
      setSavedBoards(prev => [{ id: newPanelId, name: finalName, tree_node_id: newTreeNodeId }, ...prev]);

      // URLのload_idをクリア
      if (loadId) {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('load_id');
        setSearchParams(newParams, { replace: true });
      }
    } catch (e: any) {
      console.error('createNewBoard error:', e);
      setPopupMessage({ title: '盤の作成エラー', message: e.message || JSON.stringify(e) });
    }
  };

  // --- Undo/Redo & AutoSave ---
  const handleUndo = () => {
    const prev = undo();
    if (prev) {
      skipHistory.current = true;
      setTitle(prev.title);
      setDemandFactor(prev.demandFactor);
      setMainBreakerOverride(prev.mainBreakerOverride);
      setLoads(prev.loads);
    }
  };

  const handleRedo = () => {
    const next = redo();
    if (next) {
      skipHistory.current = true;
      setTitle(next.title);
      setDemandFactor(next.demandFactor);
      setMainBreakerOverride(next.mainBreakerOverride);
      setLoads(next.loads);
    }
  };

  useEffect(() => {
    if (!isDataLoaded.current) return;
    
    setSaveStatus('idle');

    const timeoutId = setTimeout(() => {
      const currentState = { title, demandFactor, mainBreakerOverride, loads };
      if (!skipHistory.current) {
         pushHistory(currentState);
      }
      skipHistory.current = false;
      saveBoard(true);
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [title, demandFactor, mainBreakerOverride, loads]);

  const saveBoard = async (isAutoSave = false) => {
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      let panelId = currentBoardId;
      
      const panelData = {
         project_id: projectId,
         name: title,
         panel_type: 'LIGHTING',
         voltage_system: '1Φ3W 100/200V',
         reduction_factor: demandFactor / 100.0,
         main_breaker_at: mainBreakerOverride,
         tree_node_id: treeNodeId
      };

      if (panelId) {
         const { error } = await supabase.from('calc_panels').update(panelData).eq('id', panelId);
         if (error) throw error;
      } else {
         const { data, error } = await supabase.from('calc_panels').insert([panelData]).select().single();
         if (error) throw error;
         if (data) {
           panelId = data.id;
           setCurrentBoardId(panelId);
         }
      }

      if (panelId) {
         // Wipe existing loads
         await supabase.from('calc_loads').delete().eq('panel_id', panelId);

         // Insert new loads
         const insertLoads = loads.map(l => ({
            id: l.id,
            panel_id: panelId,
            circuit_no: l.circuitNo,
            symbol: l.symbol || '',
            equipment_type: l.equipment_type || 'X', // NOT NULL制約: undefinedの場合は「その他」
            name: l.name,
            is_spare: false,
            capacity_kw: l.va / 1000.0,
            phase: l.phase,
            cable_length_m: l.length_m
         }));

         const { error: loadError } = await supabase.from('calc_loads').insert(insertLoads);
         if (loadError) throw loadError;
      }

      const isAuto = typeof isAutoSave === 'boolean' ? isAutoSave : false;
      if (!isAuto) {
         setPopupMessage({ title: "保存完了", message: currentBoardId ? "上書き保存しました。" : "新しく保存しました。" });
      }
      setSaveStatus('saved');
      // 手動保存時のみサイドバーを更新
      if (!isAuto) {
         await loadBoardsList(panelId);
      }
    } catch (e: any) {
      console.error('Save failed:', e);
      setSaveStatus('error');
      // 自動保存でも常にエラー内容を表示（デバッグ用）
      setPopupMessage({ title: '保存エラー', message: '保存に失敗しました: ' + (e.message || JSON.stringify(e)) });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      const { error } = await supabase.from('calc_panels').delete().eq('id', id);
      if (error) throw error;
      
      setPopupMessage({ title: "削除完了", message: "盤のデータを削除しました。" });
      if (currentBoardId === id) {
        // 現在表示中の盤を削除した場合はstateをリセットしてloadBoardsListに任せる
        setCurrentBoardId(null);
        isDataLoaded.current = false;
      }
      await loadBoardsList();
      setConfirmDeleteId(null);
    } catch (e: any) {
      console.error(e);
      setPopupMessage({ title: "削除エラー", message: "削除に失敗しました: " + e.message });
    }
  };

  // 各回路の電流をU相・W相に分配する計算
  const calculatedLoads = useMemo(() => {
    let count100V = 0;

    return loads.map((load) => {
      let uCurrent = 0;
      let wCurrent = 0;

      let computedPhase: 'U' | 'W' | 'UW' = 'UW';
      if (load.voltage === '100V') {
        computedPhase = count100V % 2 === 0 ? 'U' : 'W';
        count100V++;
      }

      if (load.voltage === '100V') {
        if (computedPhase === 'U') {
          uCurrent = load.va / 100;
        } else {
          wCurrent = load.va / 100;
        }
      } else if (load.voltage === '200V') {
        const current = load.va / 200;
        uCurrent = current;
        wCurrent = current;
      }

      const maxCurrent = Math.max(uCurrent, wCurrent);
      let autoBreakerA = 20;
      if (maxCurrent > 15) autoBreakerA = 30;
      if (maxCurrent > 22) autoBreakerA = 40;
      if (maxCurrent > 30) autoBreakerA = 50;
      if (maxCurrent > 40) autoBreakerA = 60;
      if (maxCurrent > 50) autoBreakerA = 75;

      return {
        ...load,
        phase: computedPhase,
        uCurrent,
        wCurrent,
        autoBreakerA
      };
    });
  }, [loads]);

  // 盤全体のサマリー計算
  const summary = useMemo(() => {
    const rawTotalU = calculatedLoads.reduce((sum, item) => sum + item.uCurrent, 0);
    const rawTotalW = calculatedLoads.reduce((sum, item) => sum + item.wCurrent, 0);
    const totalVA = calculatedLoads.reduce((sum, item) => sum + item.va, 0);

    const df = demandFactor / 100;
    const totalU = rawTotalU * df;
    const totalW = rawTotalW * df;

    // 内線規程による不平衡率の計算
    // 不平衡率(%) = (各相間に接続される単相負荷設備の容量の最大と最小の差) / (総負荷容量の1/2) * 100
    // 分母となる総負荷容量には、200V機器の容量も含めます。
    const u100VA = calculatedLoads.filter(l => l.voltage === '100V' && l.phase === 'U').reduce((sum, l) => sum + l.va, 0);
    const w100VA = calculatedLoads.filter(l => l.voltage === '100V' && l.phase === 'W').reduce((sum, l) => sum + l.va, 0);
    
    let unbalanceRate = 0;
    if (totalVA > 0) {
      unbalanceRate = (Math.abs(u100VA - w100VA) / (totalVA / 2)) * 100;
    }

    // 主幹ブレーカーの選定
    // 単相3線式の場合、最大相の電流を基準にする
    const maxPhaseCurrent = Math.max(totalU, totalW);
    const mainBreakerStandards = [30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 225, 250];
    const recommendedMainBreaker = mainBreakerStandards.find(s => s >= maxPhaseCurrent) || Math.ceil(maxPhaseCurrent);

    return {
      totalU,
      totalW,
      totalVA,
      unbalanceRate,
      recommendedMainBreaker,
      neutralCurrent: Math.abs(totalU - totalW) // 中性線(白)に流れる不平衡電流
    };
  }, [calculatedLoads, demandFactor]);

  const addLoad = () => {
    const nextCircuit = loads.length > 0 ? Math.max(...loads.map(l => l.circuitNo)) + 1 : 1;
    setLoads([...loads, { 
      id: generateId(), 
      symbol: String(nextCircuit),
      circuitNo: nextCircuit, 
      name: ``, 
      voltage: '100V', 
      phase: nextCircuit % 2 === 0 ? 'W' : 'U', 
      va: 0,
      length_m: 10,
      breakerType: 'MCCB'
    }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === loads.length - 1 && field === 'last') {
        addLoad();
        // focus will be handled by auto-focusing on mount or a ref, but for rapid entry, just relying on Tab is fine.
      }
    }
  };

  const removeLoad = (id: string) => {
    setLoads(loads.filter(l => l.id !== id));
  };

  const updateLoad = (id: string, field: keyof LightingLoad, value: any) => {
    setLoads(prev => prev.map(l => {
      if (l.id === id) {
        return { ...l, [field]: value };
      }
      return l;
    }));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newLoads = [...loads];
    const draggedItem = newLoads[draggedIndex];
    newLoads.splice(draggedIndex, 1);
    newLoads.splice(index, 0, draggedItem);
    
    // index順にcircuitNoを振り直す
    newLoads.forEach((l, i) => {
      l.circuitNo = i + 1;
      // symbolが自動採番の数字だけであれば、連動して更新する
      if (/^\d+$/.test(l.symbol || '')) {
         l.symbol = String(i + 1);
      }
    });

    setLoads(newLoads);
    setDraggedIndex(null);
  };

  const verifyLoad = (id: string) => {
    setLoads(loads.map(l => l.id === id ? { ...l, is_verified: true } : l));
  };

  const handleImportJSON = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      const importedLoads = Array.isArray(parsed.loads) ? parsed.loads : parsed;
      
      const nextCircuit = loads.length > 0 ? Math.max(...loads.map(l => l.circuitNo)) + 1 : 1;

      const newLoads: LightingLoad[] = importedLoads.map((l: any, index: number) => ({
        id: generateId(),
        circuitNo: l.circuit_no || (nextCircuit + index),
        name: l.name || '名称不明',
        voltage: '100V', // JSONから自動推測がない場合は100V
        phase: (nextCircuit + index) % 2 === 0 ? 'W' : 'U',
        va: (Number(l.capacity_kw) * 1000) || 0,
        length_m: 10,
        breakerType: 'MCCB',
        is_verified: l.is_verified === undefined ? true : l.is_verified
      }));

      // JSONの盤名称が存在し、現在の盤名が初期値の場合は上書き
      if (parsed.panel_name && (title === '電灯盤-1' || !title)) {
        setTitle(parsed.panel_name);
      }

      setLoads([...loads, ...newLoads]);
      setShowImport(false);
      setImportJsonText('');
      setPopupMessage({ title: 'インポート完了', message: `${newLoads.length}件の負荷を取り込みました。` });
    } catch (e: any) {
      setPopupMessage({ title: 'インポートエラー', message: 'JSONの解析に失敗しました。形式を確認してください。' });
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-100px)] -m-4 sm:-m-6 md:-m-8 border-t border-slate-200 dark:border-slate-800">
      
      {/* 画面左側の「版（計算書）一覧サイドバー」 */}
      <div className="w-full md:w-64 lg:w-72 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex justify-between items-center">
          <h2 className="font-bold text-sm flex items-center gap-2"><List className="w-4 h-4"/> {projectId ? '案件内の電灯盤' : 'フリー計算書(未紐付け)'}</h2>
          <button onClick={createNewBoard} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-blue-600 transition-colors" title="新しい電灯盤を追加">
            <PlusCircle className="w-5 h-5"/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {savedBoards.length === 0 && (
            <p className="p-4 text-xs text-slate-500 text-center">保存された盤はありません。「保存」を押すとここに追加されます。</p>
          )}
          {savedBoards.map(board => (
            <div key={board.id} className="relative group">
              <button
                onClick={() => loadBoard(board.id, board.name)}
                className={`w-full text-left px-3 py-2.5 pr-8 rounded-md text-sm transition-colors ${currentBoardId === board.id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold' : 'hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="truncate flex-1">{board.name || '無題の電灯盤'}</span>
                    {board.tree_node_id && (
                      <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200 ml-1 shrink-0" title="ツリーと連携中">Link</span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-60">
                    {board.updated_at ? `${new Date(board.updated_at).toLocaleDateString()} ${new Date(board.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId({ id: board.id, name: board.name || '無題の電灯盤' });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                title="この盤を削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        {/* 現在選択中の盤の系統図位置変更 */}
        {currentBoardId && treeNodeId && projectId && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
            <button
              onClick={async () => {
                const nodes = await fetchParentNodes(projectId);
                setParentNodes(nodes);
                setShowMoveModal(true);
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-2 rounded transition-colors border border-slate-200 dark:border-slate-700"
            >
              📍 系統図の位置を変更
            </button>
          </div>
        )}
      </div>

      {/* 右側の計算書メインエリア */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-white dark:bg-[#0B1120]">
        <div className="max-w-6xl mx-auto space-y-6 pb-12">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              {projectId ? (
                 <button 
                   onClick={() => navigate(`/tools/site-design`)}
                   className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 font-bold mb-3 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 px-3 py-1.5 rounded-full shadow-sm transition-all"
                 >
                   <ChevronLeft className="w-3.5 h-3.5" />
                   現場ツリー(親)へ戻る
                 </button>
              ) : (
                 <span className="inline-block mb-3 px-3 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded-full border border-orange-200">フリー作成モード</span>
              )}
              <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
                 {title || '電灯計算書'} <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-full ml-2">単相3線式 100/200V</span>
                 {targetTreeNodeId && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded-full border border-green-200 ml-1">ツリー連携中</span>}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">電灯・コンセント容量から、回路の相バランス・不平衡率と主幹ブレーカーを自動計算</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0 items-center justify-end flex-wrap">
              {/* Undo / Redo */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  disabled={!canUndo}
                  onClick={handleUndo}
                  className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 rounded hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm"
                  title="元に戻す"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                <button
                  disabled={!canRedo}
                  onClick={handleRedo}
                  className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 rounded hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm"
                  title="やり直す"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>

              {/* Save Status Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 min-w-[110px] justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm shadow-sm">
                {saveStatus === 'saving' ? (
                  <><Loader2 className="w-4 h-4 text-blue-500 animate-spin" /><span className="text-slate-500 font-medium text-[11px]">保存中...</span></>
                ) : saveStatus === 'saved' ? (
                  <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">保存完了</span></>
                ) : saveStatus === 'error' ? (
                  <><CloudOff className="w-4 h-4 text-red-500" /><span className="text-red-600 font-bold text-[11px]">エラー</span></>
                ) : (
                  <><Settings2 className="w-4 h-4 text-slate-400" /><span className="text-slate-500 font-medium text-[11px]">編集中...</span></>
                )}
              </div>

              <button 
                onClick={() => setShowPreview(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors ml-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                プレビュー
              </button>
              <button 
                onClick={() => setShowSimulation(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Calculator className="w-4 h-4" />
                シミュレーション
              </button>
            </div>
          </div>

      {/* 設定パネル (シンプル化) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 flex flex-wrap gap-6 items-end">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">分電盤名称</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800"
          />
        </div>
        <div className="space-y-1.5 w-32">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-orange-600">全体需要率 (%)</label>
          <div className="relative">
            <input 
              type="number" 
              value={demandFactor} 
              onChange={(e) => setDemandFactor(Number(e.target.value))}
              className="w-full px-3 py-2 bg-orange-50 border border-orange-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-orange-800 pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-600/60 font-medium text-xs">%</span>
          </div>
        </div>
      </div>

      {/* 総合サマリパネル */}
      <div className="bg-blue-50 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 rounded-xl shadow-sm p-4 flex flex-wrap gap-x-6 gap-y-4 items-center">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">総容量(ΣVA)</span>
          <span className="text-xl font-black text-slate-800 dark:text-white">{(summary.totalVA).toLocaleString()} <span className="text-sm font-bold text-slate-500">VA</span></span>
        </div>
        <div className="h-8 w-px bg-blue-200 dark:bg-slate-700 hidden sm:block"></div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">各相電流 (需要率加味)</span>
          <div className="flex items-baseline gap-2">
            <span className="text-slate-800 dark:text-white font-bold text-sm">U: {summary.totalU.toFixed(1)}A</span>
            <span className="text-slate-600 font-bold text-sm">/</span>
            <span className="text-slate-800 dark:text-white font-bold text-sm">W: {summary.totalW.toFixed(1)}A</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">設備不平衡率 (40%以下)</span>
          <div className="flex items-baseline gap-2">
            <div className="flex items-baseline gap-0.5">
              <span className={`text-xl font-black ${summary.unbalanceRate <= 40 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {summary.unbalanceRate.toFixed(1)}
              </span>
              <span className={`text-sm font-bold ${summary.unbalanceRate <= 40 ? 'text-emerald-600/80' : 'text-red-600/80'}`}>%</span>
            </div>
            {summary.unbalanceRate <= 40 ? (
              <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 px-1 py-0.5 rounded leading-none border border-emerald-200 dark:border-emerald-800">OK</span>
            ) : (
              <span className="text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 px-1 py-0.5 rounded leading-none border border-red-200 dark:border-red-800">NG</span>
            )}
          </div>
        </div>
        <div className="h-8 w-px bg-blue-200 dark:bg-slate-700 hidden sm:block"></div>
        <div className="flex flex-col ml-auto pl-4 border-l-4 border-blue-200 dark:border-blue-900">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">盤 主幹サイズ</span>
            {mainBreakerOverride ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-800">手動</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${mainBreakerOverride < summary.recommendedMainBreaker ? 'bg-red-100 border-red-300 text-red-700' : 'bg-emerald-100 border-emerald-300 text-emerald-700'}`}>
                   {mainBreakerOverride < summary.recommendedMainBreaker ? 'NG' : 'OK'}
                </span>
              </div>
            ) : (
              <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">自動</span>
            )}
          </div>
          <div className="flex items-baseline gap-1 relative" title="主幹サイズを選択（自動枠を選ぶと再計算に追従します）">
            <span className="text-xs font-bold text-slate-500">MCCB</span>
            <select
              value={mainBreakerOverride || ''}
              onChange={(e) => setMainBreakerOverride(e.target.value ? Number(e.target.value) : null)}
              className={`text-3xl font-black bg-transparent border-0 outline-none cursor-pointer appearance-none text-center ${mainBreakerOverride ? (mainBreakerOverride < summary.recommendedMainBreaker ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400') : 'text-blue-700 dark:text-blue-400'}`}
            >
              <option value="">{summary.recommendedMainBreaker}</option>
              {STANDARD_MAIN_BREAKERS.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-sm font-bold text-blue-600">AT</span>
          </div>
        </div>
      </div>


      {/* メインテーブル */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden min-h-[200px]">
        <div className="overflow-x-auto">
          <table className="text-sm text-left" style={{ tableLayout: 'fixed', width: tableWidth }}>
            <thead className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-800/50 uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                {([
                  { key: 'circuit', label: '回路',      cls: 'text-center' },
                  { key: 'type',    label: '種別',      cls: 'text-center' },
                  { key: 'name',    label: '名称',      cls: '' },
                  { key: 'voltage', label: '電圧',      cls: '' },
                  { key: 'va',      label: '容量 (VA)', cls: 'text-right' },
                  { key: 'uA',      label: 'U(A)',     cls: 'text-right border-l border-slate-100' },
                  { key: 'wA',      label: 'W(A)',     cls: 'text-right' },
                  { key: 'breaker', label: '遮断器',    cls: 'text-center border-l border-white' },
                ] as const).map(({ key, label, cls }) => (
                  <th
                    key={key}
                    style={{ width: colWidths[key], minWidth: 40 }}
                    className={`relative py-2 font-semibold whitespace-nowrap select-none ${cls}`}
                  >
                    <span className="px-2">{label}</span>
                    <div
                      onMouseDown={(e) => handleResizeStart(key, e)}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize group/resizer flex items-center justify-center z-10"
                    >
                      <div className="w-0.5 h-4 bg-slate-300 dark:bg-slate-600 rounded group-hover/resizer:bg-blue-500 transition-colors" />
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 w-8 text-center">
                  <Settings2 className="w-4 h-4 mx-auto text-slate-400" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {calculatedLoads.map((load, index) => (
                <tr 
                  key={load.id} 
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDragEnd={() => setDraggedIndex(null)}
                  onDrop={() => handleDrop(index)}
                  className={`group transition-colors cursor-move relative
                    ${draggedIndex === index ? 'opacity-50 bg-blue-50 dark:bg-blue-900/30' : ''} 
                    ${load.is_verified === false 
                      ? 'bg-yellow-50 dark:bg-yellow-900/20' 
                      : load.voltage === '200V'
                        ? 'bg-indigo-50/40 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                        : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <td className="px-3 py-1.5 text-center relative">
                    {load.voltage === '200V' && (
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-400 dark:bg-indigo-600"></div>
                    )}
                    <input 
                      type="text" 
                      value={load.symbol || ''}
                      onChange={(e) => updateLoad(load.id, 'symbol', e.target.value)}
                      className="w-full bg-transparent border border-transparent focus:border-blue-500 hover:border-slate-200 focus:bg-white dark:focus:bg-slate-800/80 px-1 py-1 text-sm font-mono text-center flex-1 mx-auto text-slate-700 dark:text-slate-300 rounded outline-none w-16"
                      placeholder="1"
                    />
                  </td>
                  <td className="py-1.5 text-center relative">
                    {/* 複数種別バッジ表示ボタン */}
                    <button
                      onClick={() => setTypePopoverId(typePopoverId === load.id ? null : load.id)}
                      className={`flex flex-wrap gap-0.5 items-center justify-center min-w-[36px] min-h-[28px] px-1 py-0.5 rounded border transition-colors mx-auto ${
                        (load.equipment_type || '').length > 0
                          ? 'border-slate-200 hover:border-blue-300'
                          : 'bg-slate-50 border-dashed border-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {(load.equipment_type || '').split(',').filter(Boolean).length > 0
                        ? (load.equipment_type || '').split(',').filter(Boolean).map(code => {
                            const t = EQUIPMENT_TYPES.find(t => t.code === code);
                            return (
                              <span key={code} className={`text-[10px] font-black px-1 rounded ${t?.color || 'bg-slate-100 text-slate-700'}`}>
                                {code}
                              </span>
                            );
                          })
                        : <span className="text-slate-400 text-xs font-bold">+</span>
                      }
                    </button>
                    {/* 種別選択ポップオーバー（複数選択対応） */}
                    {typePopoverId === load.id && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 w-48">
                        <div className="text-[10px] font-bold text-slate-400 px-1 mb-1.5">種別を選択（複数可）</div>
                        <div className="grid grid-cols-3 gap-1">
                          {EQUIPMENT_TYPES.map(t => {
                            const codes = (load.equipment_type || '').split(',').filter(Boolean);
                            const isSelected = codes.includes(t.code);
                            return (
                              <button
                                key={t.code}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newCodes = isSelected
                                    ? codes.filter(c => c !== t.code)
                                    : [...codes, t.code];
                                  updateLoad(load.id, 'equipment_type', newCodes.join(','));
                                }}
                                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-[10px] font-bold transition-all ${
                                  isSelected
                                    ? t.color + ' ring-2 ring-blue-500'
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                                }`}
                              >
                                <span className="text-sm font-black">{t.code}</span>
                                <span>{t.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setTypePopoverId(null)}
                          className="mt-2 w-full text-[10px] text-slate-400 hover:text-slate-600 py-1 border-t border-slate-100"
                        >
                          ✓ 確定
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 min-w-[200px]">
                    <input 
                      type="text" 
                      value={load.name}
                      onKeyDown={(e) => handleKeyDown(e, index, 'name')}
                      onChange={(e) => updateLoad(load.id, 'name', e.target.value)}
                      className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 rounded outline-none transition-colors font-bold text-slate-700 dark:text-slate-200"
                      placeholder="例: 会議室照明"
                      autoFocus={index === loads.length - 1} // 新規行に追加時に自動フォーカス
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select 
                      value={load.voltage}
                      onChange={(e) => updateLoad(load.id, 'voltage', e.target.value)}
                      className={`w-full border-0 text-sm font-medium cursor-pointer rounded px-1 py-1 
                        ${load.voltage === '200V' 
                          ? 'bg-indigo-100 text-indigo-800 font-bold dark:bg-indigo-900/40 dark:text-indigo-300 shadow-sm' 
                          : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <option value="100V">100V</option>
                      <option value="200V">200V</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5 focus-within:bg-blue-50 dark:focus-within:bg-blue-900/10 transition-colors">
                    <div className="flex items-center gap-1 group/va">
                      <input 
                        type="number" 
                        value={load.va === 0 ? '' : load.va}
                        onKeyDown={(e) => handleKeyDown(e, index, 'va')}
                        onChange={(e) => updateLoad(load.id, 'va', Number(e.target.value))}
                        className="w-full bg-transparent border border-transparent group-hover/va:border-slate-200 focus:bg-white focus:border-blue-500 rounded outline-none px-2 py-1 text-sm font-bold text-right"
                        step="100"
                      />
                      <button 
                        onClick={() => setCalculatorOpenId(load.id)}
                        className="p-1.5 text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors opacity-0 group-hover/va:opacity-100 focus:opacity-100"
                        title="容量内訳を計算"
                      >
                        <Calculator className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  
                  {/* 自動計算列 (U相電流) */}
                  <td className="px-3 py-1.5 bg-slate-50/40 dark:bg-slate-100/5 font-mono text-sm font-medium text-slate-800 dark:text-slate-200 border-l border-r border-slate-100 text-right">
                    {load.uCurrent > 0 ? load.uCurrent.toFixed(1) : ''}
                  </td>
                  
                  {/* 自動計算列 (W相電流) */}
                  <td className="px-3 py-1.5 bg-slate-50/40 dark:bg-slate-100/5 font-mono text-sm font-medium text-slate-800 dark:text-slate-200 text-right">
                    {load.wCurrent > 0 ? load.wCurrent.toFixed(1) : ''}
                  </td>

                  {/* 遮断器種別 と 自動選定 (末尾へ移動) */}
                  <td className="px-3 py-1.5 bg-blue-50/20 dark:bg-blue-900/10 border-l border-white dark:border-slate-800 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <select 
                        value={load.breakerType}
                        onKeyDown={(e) => handleKeyDown(e, index, 'last')}
                        onChange={(e) => updateLoad(load.id, 'breakerType', e.target.value)}
                        className={`border border-transparent text-[10px] font-bold rounded px-1 py-0.5 cursor-pointer text-center appearance-none ${load.breakerType === 'ELCB' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' : 'bg-transparent text-slate-500 hover:bg-white dark:hover:bg-slate-800'}`}
                      >
                        <option value="MCCB">M</option>
                        <option value="ELCB">EL</option>
                      </select>
                      <span className="text-sm font-black text-blue-700 dark:text-blue-400">
                        {load.autoBreakerA}AT
                      </span>
                    </div>
                  </td>
                  
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex justify-center items-center gap-2">
                       {load.is_verified === false && (
                          <button onClick={() => verifyLoad(load.id)} className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded-md text-[10px] font-bold transition-colors">
                            <Check className="w-3.5 h-3.5" />
                            確認済
                          </button>
                       )}
                       <button onClick={() => removeLoad(load.id)} className={load.is_verified === false ? "p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" : "p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"}>
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            
            {/* 合計行 */}
            <tfoot className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-200 font-bold text-sm">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right text-slate-500 uppercase">設計容量計 / 相電流計:</td>
                <td className="px-3 py-3 text-slate-800 dark:text-slate-200 text-right">{summary.totalVA.toLocaleString()}</td>
                <td className="px-3 py-3 text-slate-800 dark:text-slate-200 bg-slate-100/50 dark:bg-slate-700/50 border-l border-r border-white dark:border-slate-700 text-right">{summary.totalU.toFixed(1)}</td>
                <td className="px-3 py-3 text-slate-800 dark:text-slate-200 text-right">{summary.totalW.toFixed(1)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        {/* レコード追加ボタン */}
        <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-200 p-3">
          <button 
            onClick={addLoad}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            電灯・コンセント回路を追加
          </button>
        </div>
      </div>

        </div>
      </div>
      
      {/* ======= プレビューモーダル ======= */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/80 backdrop-blur-sm p-4 sm:p-8 animate-in fade-in duration-200">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-t-xl mb-0 shadow-lg border-b border-slate-200 dark:border-slate-800 shrink-0 max-w-5xl mx-auto w-full">
             <div className="flex items-center gap-3">
               <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
               <h2 className="text-xl font-bold dark:text-white">様式 電-8-1 プレビュー</h2>
             </div>
             <div className="flex gap-3">
                <button 
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-slate-800 text-white hover:bg-slate-700 text-sm font-bold rounded-lg transition-colors shadow-sm"
                >
                  印刷 / PDF保存
                </button>
                <button 
                  onClick={() => setShowPreview(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
             </div>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 p-8 overflow-y-auto w-full max-w-5xl mx-auto rounded-b-xl shadow-2xl flex justify-center items-start print:p-0 print:bg-white print:shadow-none print:w-full print:max-w-none print:block">
             <div className="print:w-full">
               <Den81ReportPreview 
                 title={title}
                 loads={calculatedLoads}
                 summary={summary}
               />
             </div>
          </div>
        </div>
      )}

      {/* ======= 契約電力シミュレーション モーダル ======= */}
      {showSimulation && (() => {
        const simpleTotalKw = summary.totalVA / 1000;
        
        // 負荷設備契約（東電ルール 電灯負荷圧縮）
        let compressedKw = simpleTotalKw;
        if (compressedKw > 6 && compressedKw <= 20) {
          compressedKw = 6 + (compressedKw - 6) * 0.9;
        } else if (compressedKw > 20 && compressedKw <= 50) {
          compressedKw = 6 + 14 * 0.9 + (compressedKw - 20) * 0.8;
        } else if (compressedKw > 50) {
          compressedKw = 6 + 14 * 0.9 + 30 * 0.8 + (compressedKw - 50) * 0.7;
        }

        // 主開閉器契約（単三 200V換算）
        const breakerKw = (summary.recommendedMainBreaker * 200) / 1000;

        // 小さい方を採用
        const adoptedKw = Math.min(compressedKw, breakerKw);
        const isHighVoltage = adoptedKw >= 50;
        const remainingToLowVoltage = adoptedKw - 49.9;

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
              
              <div className="bg-slate-800 p-5 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <Calculator className="w-6 h-6 text-blue-400" />
                  <h2 className="text-xl font-bold">東電・契約電力シミュレーション（電灯）</h2>
                </div>
                <button onClick={() => setShowSimulation(false)} className="p-1 hover:bg-slate-700 rounded transition-colors"><X className="w-5 h-5"/></button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                   <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
                     <p className="text-xs font-bold text-slate-500 mb-1">① 単純な機器容量合計</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{simpleTotalKw.toFixed(1)} <span className="text-sm font-normal">kW</span></p>
                   </div>
                   <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
                     <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-1">③ 主開閉器契約による容量</p>
                          <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{breakerKw.toFixed(1)} <span className="text-sm font-normal">kW</span></p>
                        </div>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold">{summary.recommendedMainBreaker}A</span>
                     </div>
                   </div>
                   <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50 col-span-2">
                     <p className="text-xs font-bold text-slate-500 mb-1">② 特例圧縮適用後（負荷設備契約）の容量</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{compressedKw.toFixed(1)} <span className="text-sm font-normal">kW</span></p>
                     <p className="text-[10px] text-slate-400 mt-1">※6kWまで100%, 20kWまで90%, 50kWまで80%...の逓減率を適用</p>
                   </div>
                </div>

                <div className={`rounded-xl p-5 border-2 ${isHighVoltage ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-300'}`}>
                  <h3 className={`text-sm font-bold mb-2 ${isHighVoltage ? 'text-red-800' : 'text-emerald-800'}`}>判定結果（50kWの壁）</h3>
                  <div className="flex items-center gap-4">
                    <div className={`text-4xl font-black ${isHighVoltage ? 'text-red-600' : 'text-emerald-600'}`}>
                      {isHighVoltage ? '【高圧】' : '【低圧】'}
                    </div>
                    <div className="flex-1">
                       <p className={`text-lg font-bold ${isHighVoltage ? 'text-red-700' : 'text-emerald-700'}`}>
                         最終推定契約: {adoptedKw.toFixed(1)} kW
                       </p>
                       {isHighVoltage ? (
                         <p className="text-sm text-red-600 mt-1 font-bold">
                           ※低圧で収めるには、あと <span className="text-xl">{remainingToLowVoltage.toFixed(1)}</span> kW 分の機器を削減または別系統にする必要があります。
                         </p>
                       ) : (
                         <p className="text-sm text-emerald-600 mt-1 font-bold">
                           安全に低圧電力以内で収まっています。（残り {(49.9 - adoptedKw).toFixed(1)} kW の余裕）
                         </p>
                       )}
                    </div>
                  </div>
                </div>

                {/* 不平衡率警告 */}
                {summary.unbalanceRate > 40 && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-800 flex items-start gap-2">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-orange-500" />
                    <div>
                      <p className="font-bold">内線規程・不平衡率の警告</p>
                      <p className="text-xs mt-0.5">U相・W相のバランスが著しく崩れています（{summary.unbalanceRate.toFixed(1)}%）。この状態は電圧降下や中性線電流増大のリスクがあるため、相の割り当てを見直してください。</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======= JSONインポート モーダル ======= */}
      {showImport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-800 p-5 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6 text-emerald-400" />
                <h2 className="text-xl font-bold">AI抽出データ（JSON）の取り込み</h2>
              </div>
              <button onClick={() => setShowImport(false)} className="p-1 hover:bg-slate-700 rounded transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 font-bold">
                AIが図面から読み取った JSON データを下のテキストボックスに貼り付けてください。現在のリストの末尾に追記されます。
              </p>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder={'{\n  "panel_name": "電灯盤 L-1",\n  "loads": [\n    { "name": "照明", "capacity_kw": 0.5, "is_verified": true }\n  ]\n}'}
                className="w-full h-64 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-slate-300"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setShowImport(false)} className="px-5 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                  キャンセル
                </button>
                <button onClick={handleImportJSON} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 shadow-sm transition-colors">
                  <Bot className="w-4 h-4" />
                  解析して取り込む
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* カスタムポップアップ */}
      {popupMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">{popupMessage.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">{popupMessage.message}</p>
            <div className="flex justify-end">
              <button 
                onClick={() => setPopupMessage(null)}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 系統図の位置変更モーダル */}
      {showMoveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">系統図の配置を変更</h3>
            <p className="text-xs text-slate-500 mb-4">この盤をどの親盤の下に移動しますか？</p>
            <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
              {parentNodes.filter(n => n.id !== treeNodeId).map(node => (
                <button
                  key={node.id}
                  onClick={async () => {
                    if (!projectId || !treeNodeId) return;
                    const ok = await moveNodeToNewParent({ projectId, targetNodeId: treeNodeId, newParentId: node.id });
                    if (ok) {
                      setPopupMessage({ title: '移動完了', message: `「${node.name}」の下に移動しました。` });
                    } else {
                      setPopupMessage({ title: 'エラー', message: '移動に失敗しました。' });
                    }
                    setShowMoveModal(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border border-transparent hover:border-blue-200"
                  style={{ paddingLeft: `${(node.depth * 16) + 12}px` }}
                >
                  <span className="text-slate-400 mr-1">{['🏢','⚡','🔴','💡'][Math.min(node.depth, 3)]}</span>
                  {node.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowMoveModal(false)} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">盤の削除確認</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              「<span className="font-bold text-slate-800 dark:text-slate-100">{confirmDeleteId.name}</span>」を削除してもよろしいですか？この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
              >
                キャンセル
              </button>
              <button 
                onClick={() => {
                  deleteBoard(confirmDeleteId.id);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 容量計算ポップアップ */}
      <VACalculatorModal
        isOpen={calculatorOpenId !== null}
        onClose={() => setCalculatorOpenId(null)}
        targetName={loads.find(l => l.id === calculatorOpenId)?.name}
        targetId={calculatorOpenId || undefined}
        onApply={(totalVA, primaryCategoryId) => {
          if (calculatorOpenId) {
            const currentLoad = loads.find(l => l.id === calculatorOpenId);
            updateLoad(calculatorOpenId, 'va', totalVA);
            // カテゴリから種別コードを取得（L, C, A, X など）
            const autoType = CATEGORY_TO_TYPE[primaryCategoryId] || 'X';
            // テーブルのVAとモーダルの合計が一致 → 上書き（同じ内訳で管理されている）
            // 不一致（新規 or 変更）→ 追記（重複なし）
            if (currentLoad?.va === totalVA) {
              updateLoad(calculatorOpenId, 'equipment_type', autoType);
            } else {
              const existingCodes = (currentLoad?.equipment_type || '').split(',').filter(Boolean);
              if (!existingCodes.includes(autoType)) {
                updateLoad(calculatorOpenId, 'equipment_type', [...existingCodes, autoType].join(','));
              }
            }
          }
        }}
      />
    </div>
  );
}
