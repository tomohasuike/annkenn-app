import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { NumpadModal } from '../../components/ui/NumpadModal';
import { Plus, Trash2, Settings2, FileText, List, PlusCircle, Save, ChevronLeft, Zap, ShieldAlert, CheckCircle2, FileSpreadsheet, X, Calculator, Bot, Check, Menu, Lock, Loader2 } from 'lucide-react';
import PowerReportPreview from '../../components/PowerReportPreview';
import { calculateTrunkAllowableCurrent } from '../../constants/wiringStandards';
import { CalcEngine } from '../../utils/calcEngine';
import type { CalcLoad } from '../../utils/calcEngine';

// データの型定義 (CalcLoadを拡張)
interface MotorLoad extends Omit<CalcLoad, 'equipment_type'> {
  kw: number;
  wireLength: number;
  voltageDropLimit: number;
  breakerType: 'MCCB' | 'ELCB';
  is_verified?: boolean;
  symbol?: string;
}

const generateId = () => crypto.randomUUID();

export default function PowerCalc() {
  const { selectedProjectId } = useOutletContext<{ selectedProjectId: string }>();
  const projectId = selectedProjectId || null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetTreeNodeId = searchParams.get('treeNodeId');
  const initialName = searchParams.get('name');
  const loadId = searchParams.get('load_id');

  const [savedBoards, setSavedBoards] = useState<any[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(loadId || (targetTreeNodeId && targetTreeNodeId !== 'undefined' ? targetTreeNodeId : null));
  const [isSaving, setIsSaving] = useState(false);
  const [popupMessage, setPopupMessage] = useState<{title: string, message: string} | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: string, name: string } | null>(null);
  
  // 盤リストサイドバーの開閉ステート（タブレット以下はデフォルト閉）
  const [isPanelListOpen, setIsPanelListOpen] = useState(window.innerWidth >= 1024);

  const [numpad, setNumpad] = useState<{
    isOpen: boolean;
    targetId: string;
    targetField: 'demandFactor' | 'kw' | 'wireLength' | 'override_breaker_size';
    initialValue: number;
    label: string;
  }>({ isOpen: false, targetId: '', targetField: 'demandFactor', initialValue: 0, label: '' });

  const openNumpad = (id: string, field: 'demandFactor' | 'kw' | 'wireLength' | 'override_breaker_size', initialValue: number, label: string) => {
    setNumpad({ isOpen: true, targetId: id, targetField: field, initialValue, label });
  };

  const handleNumpadConfirm = (val: number) => {
    if (numpad.targetId === 'BOARD_DF') {
      setDemandFactor(val);
    } else {
      if (numpad.targetField === 'override_breaker_size') {
         updateLoad(numpad.targetId, 'override_breaker_size', val === 0 ? '' : String(val));
      } else {
         updateLoad(numpad.targetId, numpad.targetField, val);
      }
    }
    setNumpad(prev => ({ ...prev, isOpen: false }));
  };

  const [showPreview, setShowPreview] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const [title, setTitle] = useState('動力盤-1');
  const [voltage, setVoltage] = useState<'200V' | '400V'>('200V');
  const [demandFactor, setDemandFactor] = useState(100); 
  
  const [loads, setLoads] = useState<MotorLoad[]>([
    { id: generateId(), symbol: 'SF-1', name: '送風機1', kw: 3.7, starting_method: 'direct', wireLength: 20, voltageDropLimit: 2, breakerType: 'MCCB', capacity_kw: 3.7, is_existing: false, operation_mode: 'simultaneous' },
    { id: generateId(), symbol: 'P-1', name: 'ポンプ1', kw: 7.5, starting_method: 'star_delta', wireLength: 30, voltageDropLimit: 2, breakerType: 'ELCB', capacity_kw: 7.5, is_existing: false, operation_mode: 'alternating', interlock_group_id: 'pump_group' },
    { id: generateId(), symbol: 'P-2', name: '予備ポンプ', kw: 7.5, starting_method: 'star_delta', wireLength: 35, voltageDropLimit: 2, breakerType: 'ELCB', capacity_kw: 7.5, is_existing: false, operation_mode: 'alternating', interlock_group_id: 'pump_group' }
  ]);

  useEffect(() => {
    loadBoardsList();
  }, [projectId]);

  const loadBoardsList = async () => {
    let query = supabase.from('calc_panels')
      .select('id, name')
      .eq('panel_type', 'POWER')
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    } else {
      query = query.is('project_id', null);
    }

    const { data } = await query;
      
    if (data) {
      setSavedBoards(data);
      if (loadId && !currentBoardId) {
         await loadBoard(loadId, data.find((b: any) => b.id === loadId)?.name);
      } else if (targetTreeNodeId && !currentBoardId) {
         createNewBoard();
         if (initialName) setTitle(initialName);
      } else if (!currentBoardId && data.length > 0) {
         await loadBoard(data[0].id, data[0].name);
      }
    }
  };

  const loadBoard = async (id: string, boardName?: string) => {
    setCurrentBoardId(id);
    if (boardName) setTitle(boardName);

    const { data: panelData } = await supabase.from('calc_panels').select('*').eq('id', id).single();
    if (panelData) {
      if (panelData.name) setTitle(panelData.name);
      if (panelData.voltage_system) setVoltage(panelData.voltage_system === '3Φ3W 400V' ? '400V' : '200V');
      if (panelData.reduction_factor) setDemandFactor(panelData.reduction_factor * 100);

      const { data: loadsData } = await supabase.from('calc_loads').select('*').eq('panel_id', id).order('circuit_no', { ascending: true });
      if (loadsData && loadsData.length > 0) {
         setLoads(loadsData.map((l: any) => ({
           id: l.id,
           symbol: l.symbol || '',
           name: l.name,
           kw: Number(l.capacity_kw),
           capacity_kw: Number(l.capacity_kw),
           starting_method: l.starting_method || 'direct',
           wireLength: Number(l.cable_length_m) || 15,
           voltageDropLimit: 2,
           breakerType: 'MCCB',
           is_existing: l.is_existing || false,
           operation_mode: l.interlock_group_id ? 'alternating' : 'simultaneous',
           override_breaker_size: l.override_breaker_at ? String(l.override_breaker_at) : undefined
         })));
      }
    }
  };

  const createNewBoard = () => {
    setCurrentBoardId(null);
    setTitle('新規動力盤');
    setLoads([{ id: generateId(), symbol: 'P-1', name: 'ポンプ1', kw: 2.2, starting_method: 'direct', wireLength: 20, voltageDropLimit: 2, breakerType: 'MCCB', capacity_kw: 2.2, is_existing: false, operation_mode: 'simultaneous' }]);
    setDemandFactor(100);
    // URLのload_idをクリア
    if (loadId) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('load_id');
      setSearchParams(newParams, { replace: true });
    }
  };

  const saveBoard = async () => {
    setIsSaving(true);
    try {
      let panelId = currentBoardId;
      
      const panelData = {
         project_id: projectId,
         name: title,
         panel_type: 'POWER',
         voltage_system: voltage === '400V' ? '3Φ3W 400V' : '3Φ3W 200V',
         reduction_factor: demandFactor / 100.0,
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
         await supabase.from('calc_loads').delete().eq('panel_id', panelId);

         const insertLoads = loads.map((l, idx) => ({
            id: l.id,
            panel_id: panelId,
            circuit_no: idx + 1,
            symbol: l.symbol || null,
            name: l.name,
            is_spare: false,
            is_existing: l.is_existing,
            capacity_kw: l.kw,
            phase: '3PH',
            starting_method: l.starting_method,
            cable_length_m: l.wireLength,
            override_breaker_at: l.override_breaker_size ? parseInt(l.override_breaker_size) : null,
            interlock_group_id: l.operation_mode === 'alternating' ? crypto.randomUUID() : null
         }));

         const { error: loadError } = await supabase.from('calc_loads').insert(insertLoads);
         if (loadError) throw loadError;
      }

      setPopupMessage({ title: "保存完了", message: currentBoardId ? "上書き保存しました。" : "新しく保存しました。" });
      await loadBoardsList();
    } catch (e: any) {
      console.error(e);
      setPopupMessage({ title: "エラー", message: "保存に失敗: " + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      await supabase.from('calc_panels').delete().eq('id', id);
      if (currentBoardId === id) createNewBoard();
      await loadBoardsList();
      setConfirmDeleteId(null);
    } catch (e: any) {
      setPopupMessage({ title: "エラー", message: "削除に失敗しました" });
    }
  };

  // 全モータの電流とブレーカをエンジンで計算
  const calculatedLoads = useMemo(() => {
    return loads.map(load => {
      // エンジンに渡すためにフォーマット
      const engineLoad: CalcLoad = {
        name: load.name,
        capacity_kw: load.kw,
        equipment_type: 'motor',
        starting_method: load.starting_method,
        is_existing: load.is_existing,
        operation_mode: load.operation_mode,
        interlock_group_id: load.interlock_group_id
      };
      
      const calcResult = CalcEngine.calculateDeviceSizing(engineLoad);
      const breakerStr = calcResult.calculated_breaker_size || '0AT';
      const breakerInt = parseInt(breakerStr.replace('AT', '')) || 0;

      // 概算電流計算（従来の簡易版）
      const currentA = load.kw * 4.5;
      
      return {
        ...load,
        breakerA: load.override_breaker_size ? parseInt(load.override_breaker_size) : breakerInt,
        currentA,
        wireSq: 5.5, // TODO: V降下計算は別途完全実装
        isStandard: true
      };
    });
  }, [loads]);

  // 東電圧縮アルゴリズムの実行
  const tepcoEvaluation = useMemo(() => {
    const engineLoads = calculatedLoads.map(l => ({
        name: l.name,
        capacity_kw: l.kw,
        equipment_type: 'motor',
        is_existing: false, // 契約計算に既存/新設は関係なく全体の受電容量計算
        operation_mode: l.operation_mode,
        interlock_group_id: l.interlock_group_id
    }));
    // To properly calculate route B, we need the Main Breaker. Let's use a rough estimation for trunk.
    const totalRawCurrent = calculatedLoads.reduce((sum, item) => sum + item.currentA, 0);
    const im = totalRawCurrent * (demandFactor / 100);
    const estMainBreaker = im > 100 ? 150 : 100;

    return CalcEngine.evaluateContract(engineLoads as CalcLoad[], estMainBreaker);
  }, [calculatedLoads, demandFactor]);

  // 幹線の総合計算
  const summary = useMemo(() => {
    const totalRawCurrent = calculatedLoads.reduce((sum, item) => sum + item.currentA, 0);
    const im = totalRawCurrent * (demandFactor / 100);
    const iw = calculateTrunkAllowableCurrent(im, 0);
    
    // 主幹ブレーカー簡易マトリックス（詳細ロジック省略）
    let recommendedMainBreaker = im > 200 ? 250 : im > 150 ? 200 : im > 100 ? 125 : im > 75 ? 100 : 75;

    return {
      totalKw: calculatedLoads.reduce((sum, item) => sum + item.kw, 0),
      totalCurrentA: totalRawCurrent,
      im, iw, recommendedMainBreaker
    };
  }, [calculatedLoads, demandFactor]);

  const addLoad = () => {
    setLoads([...loads, { 
      id: generateId(), name: `新規負荷${loads.length + 1}`, kw: 2.2, capacity_kw: 2.2,
      starting_method: 'direct', wireLength: 15, voltageDropLimit: 2,
      breakerType: 'MCCB', is_existing: false, operation_mode: 'simultaneous'
    }]);
  };

  const removeLoad = (id: string) => setLoads(loads.filter(l => l.id !== id));
  
  const updateLoad = (id: string, field: string, value: any) => {
    setLoads(loads.map(l => {
      if (l.id === id) {
         const newL = { ...l, [field]: value } as any;
         if (field === 'kw') newL.capacity_kw = value;
         return newL;
      }
      return l;
    }));
  };

  const verifyLoad = (id: string) => {
    setLoads(loads.map(l => l.id === id ? { ...l, is_verified: true } : l));
  };

  const handleImportJSON = async () => {
    try {
      const parsed = JSON.parse(importJsonText);
      setIsImporting(true);

      // JSONが配列で、かつ最初の要素が盤構造（loadsを持つ）の場合は、複数盤のバッチ作成モード
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0].loads)) {
        let successCount = 0;
        let lastCreatedPanelId = null;
        let lastCreatedPanelName = '';

        for (const panelData of parsed) {
          // 盤を新規作成して保存
          const newPanel = {
             project_id: projectId,
             name: panelData.panel_name || '名称不明の動力盤',
             panel_type: 'POWER',
             voltage_system: '3Φ3W 200V',
             reduction_factor: 1.0,
          };
          
          const { data: insertedPanel, error: panelError } = await supabase.from('calc_panels').insert([newPanel]).select().single();
          if (panelError) throw panelError;
          
          const panelId = insertedPanel.id;
          lastCreatedPanelId = panelId;
          lastCreatedPanelName = newPanel.name;
          
          // その盤に紐づく負荷をDBに直接挿入
          if (Array.isArray(panelData.loads) && panelData.loads.length > 0) {
            const newLoads = panelData.loads.map((l: any, idx: number) => ({
              panel_id: panelId,
              circuit_no: idx + 1,
              symbol: l.symbol || l.load_symbol || null,
              name: l.name || '名称不明',
              is_spare: l.is_spare || false,
              is_existing: false,
              capacity_kw: Number(l.capacity_kw) || 0,
              phase: '3PH',
              starting_method: l.starting_method === 'Y_DELTA' ? 'star_delta' : l.starting_method === 'INVERTER' ? 'inverter' : 'direct',
              cable_length_m: l.auto_cable_sq ? 20 : 15,
              override_breaker_at: l.auto_breaker_at ? parseInt(l.auto_breaker_at) : null,
              interlock_group_id: null
            }));

            const { error: loadError } = await supabase.from('calc_loads').insert(newLoads);
            if (loadError) throw loadError;
          }
          successCount++;
        }

        // バッチ処理完了後、ツリー（盤リスト）を再読み込み
        await loadBoardsList();
        setShowImport(false);
        setImportJsonText('');
        setPopupMessage({ title: 'バッチインポート完了', message: `${successCount}件の動力盤とデータを一括作成しました。` });
        
        // 最後に作成した盤を画面に表示する
        if (lastCreatedPanelId) {
          await loadBoard(lastCreatedPanelId, lastCreatedPanelName);
        }

        // スマホ表示などで再度バーが閉じている可能性があるため、リストを強制的に開いて見せる
        setIsPanelListOpen(true);

      } else {
        // [フォールバック] 単一盤、または単なる負荷リストの場合（既存ロジック）
        const importedLoads = Array.isArray(parsed.loads) ? parsed.loads : parsed;
        
        const newLoads: MotorLoad[] = importedLoads.map((l: any) => ({
          id: generateId(),
          name: l.name || '名称不明',
          kw: Number(l.capacity_kw) || 0,
          capacity_kw: Number(l.capacity_kw) || 0,
          starting_method: l.starting_method === 'Y_DELTA' ? 'star_delta' : l.starting_method === 'INVERTER' ? 'inverter' : 'direct',
          wireLength: l.auto_cable_sq ? 20 : 15,
          voltageDropLimit: 2,
          breakerType: 'MCCB',
          is_existing: false,
          operation_mode: 'simultaneous',
          override_breaker_size: l.auto_breaker_at ? String(l.auto_breaker_at) : undefined,
          is_verified: l.is_verified === undefined ? true : l.is_verified,
          is_spare: l.is_spare || false
        }));

        // JSONの盤名称が存在し、現在の盤名が初期値の場合は上書き
        if (parsed.panel_name && (title === '新規動力盤' || !title)) {
          setTitle(parsed.panel_name);
        }

        setLoads([...loads, ...newLoads]);
        setShowImport(false);
        setImportJsonText('');
        setPopupMessage({ title: 'インポート完了', message: `${newLoads.length}件の負荷を現在の盤に取り込みました。` });
      }
    } catch (e: any) {
      setPopupMessage({ title: 'インポートエラー', message: '解析または保存に失敗しました: ' + e.message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === loads.length - 1 && field === 'last') {
        addLoad();
      }
    }
  };

  // const toggleGroupInterlock = () => {
  //   // 選択された複数行を「交互グループ」にするUIダミーファンクション
  //   alert("フェーズ2UI：Shift+Clickされた複数モータを「交互グループ（インターロック）」としてグループ化します。");
  // }

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-100px)] -m-4 sm:-m-6 md:-m-8 border-t border-slate-200 dark:border-slate-800">
      
      {/* 画面左側の「版（計算書）一覧サイドバー」 */}
      <div className={`bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-all duration-300 ease-in-out z-10 ${
        isPanelListOpen 
          ? 'w-full md:w-56 lg:w-64 border-r' 
          : 'w-0 overflow-hidden border-r-0'
      }`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex justify-between items-center">
          <h2 className="font-bold text-sm flex items-center gap-2"><List className="w-4 h-4"/> {projectId ? '案件内の動力盤' : 'フリー計算書(未紐付け)'}</h2>
          <button onClick={createNewBoard} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-blue-600 transition-colors" title="新しい動力盤を追加">
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
                    <span className="truncate flex-1">{board.name || '無題の動力盤'}</span>
                  </div>
                  <span className="text-[10px] opacity-60">
                    {new Date(board.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId({ id: board.id, name: board.name || '無題の動力盤' }); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 右側の計算書メインエリア */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-white dark:bg-[#0B1120]">
        <div className="max-w-7xl mx-auto space-y-6 pb-12">
          
          {/* ヘッダーエリア */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-start gap-4">
              <button 
                onClick={() => setIsPanelListOpen(!isPanelListOpen)}
                className="mt-1 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 transition-colors shadow-sm shrink-0"
                title="盤リストを開閉"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                {projectId ? (
                   <button onClick={() => navigate(`/tools/site-design`)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 font-bold mb-3 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 px-3 py-1.5 rounded-full outline-none shadow-sm transition-all">
                     <ChevronLeft className="w-3.5 h-3.5" />
                     現場ツリー(親)へ戻る
                   </button>
                ) : (
                   <span className="inline-block mb-3 px-3 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded-full border border-orange-200">フリー作成モード</span>
                )}
                <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
                   {title || '動力計算書'} 
                   <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-full ml-2 shrink-0">三相3線式 200V</span>
                </h1>
                <p className="text-sm text-slate-500 mt-1">電線の太さから主幹ブレーカーまでを一瞬で自動設計（内線規程・東電公式準拠）</p>
              </div>
            </div>
            <div className="flex gap-3 w-full sm:w-auto mt-2 sm:mt-0">
              <button 
                onClick={saveBoard}
                disabled={isSaving}
                className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" />
                {isSaving ? '保存中...' : 'クラウド保存'}
              </button>
              <button 
                onClick={() => setShowImport(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Bot className="w-4 h-4" />
                AIデータ取り込み
              </button>
              <button 
                onClick={() => setShowPreview(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                プレビュー/出力
              </button>
              <button 
                onClick={() => setShowSimulation(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Calculator className="w-4 h-4" />
                契約シミュレーション
              </button>
            </div>
          </div>

          {/* 設定パネル */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-slate-500">盤・幹線名称</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 dark:bg-slate-800 dark:text-white dark:border-slate-700" />
            </div>
            <div className="space-y-1.5 w-32">
              <label className="text-xs font-semibold text-slate-500">電圧</label>
              <select value={voltage} onChange={(e) => setVoltage(e.target.value as any)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium dark:bg-slate-800 dark:text-white dark:border-slate-700">
                <option value="200V">三相 200V</option>
              </select>
            </div>
            <div className="space-y-1.5 w-32">
              <label className="text-xs font-semibold text-slate-500 text-orange-600">需要率 (%)</label>
              <input type="text" readOnly value={demandFactor} onClick={() => openNumpad('BOARD_DF', 'demandFactor', demandFactor, '総需要率(%)')} className="w-full px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-orange-800 cursor-pointer" />
            </div>
          </div>

          {/* メインテーブル */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-800/50 uppercase border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold min-w-[280px] whitespace-nowrap sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] select-none">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-blue-600" title="既設ロック" />
                        <span className="w-20">負荷記号</span>
                        <span>負荷名称</span>
                      </div>
                    </th>
                    <th className="px-3 py-3 font-semibold w-24 text-center whitespace-nowrap">制御モード</th>
                    <th className="px-3 py-3 font-semibold w-24 whitespace-nowrap">始動方式</th>
                    <th className="px-3 py-3 font-semibold w-20 whitespace-nowrap">容量(kW)</th>
                    <th className="px-3 py-3 font-semibold w-16 text-center whitespace-nowrap">配線長(m)</th>
                    <th className="px-3 py-3 font-semibold bg-gray-50 dark:bg-slate-800/70 text-right w-16 whitespace-nowrap">推定電流(A)</th>
                    <th className="px-3 py-3 font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 w-16 text-center whitespace-nowrap">電線(sq)</th>
                    <th className="px-3 py-3 font-semibold bg-blue-50/60 dark:bg-blue-900/30 text-blue-800 text-center whitespace-nowrap">推奨ブレーカ</th>
                    <th className="px-3 py-3 font-semibold w-20 text-blue-800 text-center whitespace-nowrap">オーバーライド</th>
                    <th className="px-2 py-3 w-10 text-center whitespace-nowrap"><Settings2 className="w-4 h-4 mx-auto text-slate-400" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {calculatedLoads.map((load, index) => (
                    <tr key={load.id} className={`group hover:bg-blue-50/50 dark:hover:bg-slate-800/30 transition-colors ${load.is_verified === false ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-white dark:bg-slate-900'}`}>
                      <td className={`px-4 py-2 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] transition-colors ${load.is_verified === false ? 'bg-yellow-50 dark:bg-yellow-900/40' : 'bg-white dark:bg-slate-900'} group-hover:bg-blue-50/50 dark:group-hover:bg-slate-800/50`}>
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={load.is_existing}
                            onKeyDown={(e) => handleKeyDown(e, index, 'is_existing')}
                            onChange={(e) => updateLoad(load.id as string, 'is_existing', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                            title="既設設備として再計算対象から除外（ロック）する"
                          />
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input 
                              type="text" 
                              onKeyDown={(e) => handleKeyDown(e, index, 'symbol')}
                              value={load.symbol || ''}
                              onChange={(e) => updateLoad(load.id as string, 'symbol', e.target.value)}
                              className="w-16 px-2 py-1 bg-transparent border-b border-transparent focus:border-blue-500 font-bold outline-none text-slate-800 dark:text-slate-100 placeholder-slate-300 truncate"
                              placeholder="M3-1"
                            />
                            <div className="flex-1 min-w-0 relative">
                              <input 
                                type="text" 
                                onKeyDown={(e) => handleKeyDown(e, index, 'name')}
                                value={load.name}
                                onChange={(e) => updateLoad(load.id as string, 'name', e.target.value)}
                                className="w-full px-2 py-1 bg-transparent border-b border-transparent focus:border-blue-500 font-bold outline-none text-slate-800 dark:text-slate-100 placeholder-slate-300 truncate"
                                placeholder="例: ポンプ"
                              />
                            </div>
                          </div>
                          {load.operation_mode === 'alternating' && <span className="absolute bottom-1 left-12 text-[9px] text-orange-500 font-bold mt-0.5 truncate pointer-events-none">※交互運転グループ（特例圧縮）</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select 
                          value={load.operation_mode}
                          onChange={(e) => updateLoad(load.id as string, 'operation_mode', e.target.value)}
                          className={`bg-slate-100 dark:bg-slate-800 border-0 text-[10px] font-bold rounded-lg px-2 py-1 w-full cursor-pointer h-7 ${load.operation_mode === 'simultaneous' ? 'text-slate-700' : 'text-orange-700 bg-orange-50'}`}
                        >
                          <option value="simultaneous">通常</option>
                          <option value="alternating">交互 / 予備</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select 
                          value={load.starting_method}
                          onChange={(e) => updateLoad(load.id as string, 'starting_method', e.target.value)}
                          className="bg-slate-100 dark:bg-slate-800 border-0 text-[11px] font-medium text-slate-700 dark:text-slate-300 rounded px-2 py-1 w-full cursor-pointer h-7"
                        >
                          <option value="direct">直入 (6倍)</option>
                          <option value="star_delta">Y-Δ (2倍)</option>
                          <option value="inverter">インバータ</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                          <input 
                            type="number" 
                            step="0.1"
                            value={load.kw || ''}
                            onKeyDown={(e) => handleKeyDown(e, index, 'kw')}
                            onChange={(e) => updateLoad(load.id as string, 'kw', Number(e.target.value))}
                            className="w-16 bg-transparent text-sm font-black border border-transparent focus:bg-white focus:border-blue-500 rounded px-2 py-1 text-slate-800 dark:text-slate-100"
                          />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input 
                           type="number" 
                           value={load.wireLength || ''}
                           onKeyDown={(e) => handleKeyDown(e, index, 'length')}
                           onChange={(e) => updateLoad(load.id as string, 'wireLength', Number(e.target.value))}
                           className="w-14 text-center bg-transparent text-sm border border-transparent focus:bg-white focus:border-blue-500 rounded px-1 py-1 dark:text-slate-100" 
                        />
                      </td>
                      <td className="px-3 py-2 bg-slate-50/50 dark:bg-slate-800/10 text-right font-medium text-slate-600 dark:text-slate-400">
                        {load.currentA?.toFixed(1)} <span className="text-[10px]">A</span>
                      </td>
                      <td className="px-3 py-2 bg-indigo-50/30 dark:bg-indigo-900/10 text-center font-bold text-indigo-700 dark:text-indigo-400 border-x border-white dark:border-slate-900">
                        {load.wireSq} <span className="text-[10px]">sq</span>
                      </td>
                      
                      {/* システム最適計算列 */}
                      <td className="px-3 py-2 bg-blue-50/30 dark:bg-blue-900/10 text-center">
                         <div className="flex flex-col items-center">
                            <span className="text-[10px] text-slate-400">{load.breakerType}</span>
                            <span className={`text-sm font-black ${load.is_existing ? 'text-slate-400 grayscale' : 'text-blue-700 dark:text-blue-400'}`}>
                                {load.breakerA}AT
                            </span>
                         </div>
                      </td>
                      
                      {/* カスタム上書き（オーバーライド）列 */}
                      <td className="px-3 py-2 bg-orange-50/30 dark:bg-orange-900/10 text-center relative group/override">
                         <div className="flex bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-900/50 focus-within:ring-2 focus-within:ring-orange-500 overflow-hidden rounded items-center">
                           <input 
                              type="number"
                              value={load.override_breaker_size || ''}
                              onKeyDown={(e) => handleKeyDown(e, index, 'last')}
                              onChange={(e) => updateLoad(load.id as string, 'override_breaker_size', e.target.value ? String(e.target.value) : undefined)}
                              className="w-full text-center bg-transparent px-1 py-1 text-orange-700 outline-none text-xs font-bold placeholder-slate-300"
                              placeholder="自動"
                           />
                         </div>
                      </td>

                      <td className="px-2 py-2 text-center">
                        <div className="flex justify-center items-center gap-2">
                           {load.is_verified === false && (
                              <button onClick={() => verifyLoad(load.id as string)} className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded-md text-[10px] font-bold transition-colors">
                                <Check className="w-3.5 h-3.5" />
                                確認済
                              </button>
                           )}
                           <button onClick={() => removeLoad(load.id as string)} className={load.is_verified === false ? "p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" : "p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"}>
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-between p-2">
              <button onClick={addLoad} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-3 py-2 rounded transition-colors">
                <Zap className="w-4 h-4" />
                モーター負荷を追加
              </button>
              {/* <button onClick={toggleGroupInterlock} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 px-3 py-2 rounded transition-colors">
                <Settings2 className="w-4 h-4" />
                選択機器を交互グループ化（特例圧縮）
              </button> */}
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
               <h2 className="text-xl font-bold dark:text-white">様式 電-8-1 プレビュー (動力)</h2>
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
               <PowerReportPreview 
                 title={title}
                 loads={calculatedLoads as any}
                 summary={{
                   totalKw: summary.totalKw,
                   recommendedMainBreaker: summary.recommendedMainBreaker
                 }}
               />
             </div>
          </div>
        </div>
      )}

      {/* ======= 契約電力シミュレーション モーダル ======= */}
      {showSimulation && (() => {
        const isHighVoltage = !tepcoEvaluation.is_low_voltage_ok;
        const remainingToLowVoltage = tepcoEvaluation.final_contract_kw - 49.9;

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
              
              <div className="bg-slate-800 p-5 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <Calculator className="w-6 h-6 text-blue-400" />
                  <h2 className="text-xl font-bold">東電・契約電力シミュレーション（動力）</h2>
                </div>
                <button onClick={() => setShowSimulation(false)} className="p-1 hover:bg-slate-700 rounded transition-colors"><X className="w-5 h-5"/></button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                   <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
                     <p className="text-xs font-bold text-slate-500 mb-1">① 単純な機器容量合計</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{summary.totalKw.toFixed(1)} <span className="text-sm font-normal">kW</span></p>
                   </div>
                   <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
                     <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-1">③ 主開閉器契約による容量 (ルートB)</p>
                          <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{tepcoEvaluation.route_b_main_kw.toFixed(1)} <span className="text-sm font-normal">kW</span></p>
                        </div>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold">{summary.recommendedMainBreaker}A</span>
                     </div>
                   </div>
                   <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50 col-span-2">
                     <p className="text-xs font-bold text-slate-500 mb-1">② 特例圧縮適用後（負荷設備契約・ルートA）</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{tepcoEvaluation.route_a_load_kw.toFixed(1)} <span className="text-sm font-normal">kW</span></p>
                     <p className="text-[10px] text-slate-400 mt-1">※交互運転を加味し、容量順に1台目1.0, 3台目0.95...の逓減率を満載稼動率に乗じて適用</p>
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
                         最終推定契約 (小さい方): {tepcoEvaluation.final_contract_kw.toFixed(1)} kW
                       </p>
                       {isHighVoltage ? (
                         <p className="text-sm text-red-600 mt-1 font-bold">
                           ※低圧で収めるには、あと <span className="text-xl">{remainingToLowVoltage.toFixed(1)}</span> kW 分の機器を削減、交互運転指定、または別系統にする必要があります。
                         </p>
                       ) : (
                         <p className="text-sm text-emerald-600 mt-1 font-bold">
                           安全に低圧電力以内で収まっています。（残り {(49.9 - tepcoEvaluation.final_contract_kw).toFixed(1)} kW の余裕）
                         </p>
                       )}
                    </div>
                  </div>
                </div>
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
                placeholder={'{\n  "panel_name": "動力盤 M-1",\n  "loads": [\n    { "symbol": "SF-1", "name": "ファン", "capacity_kw": 2.2, "is_verified": true }\n  ]\n}'}
                className="w-full h-64 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-slate-300"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button 
                  onClick={() => setShowImport(false)} 
                  disabled={isImporting}
                  className="px-5 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button 
                  onClick={handleImportJSON} 
                  disabled={isImporting}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                  {isImporting ? 'インポート処理中...' : '解析して取り込む'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">盤の削除確認</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              「<span className="font-bold text-slate-800 dark:text-slate-100">{confirmDeleteId.name}</span>」を削除してもよろしいですか？この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">キャンセル</button>
              <button onClick={() => deleteBoard(confirmDeleteId.id)} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg">削除する</button>
            </div>
          </div>
        </div>
      )}

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
