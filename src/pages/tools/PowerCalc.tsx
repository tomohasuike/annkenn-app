import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { NumpadModal } from '../../components/ui/NumpadModal';
import { Plus, Trash2, Calculator, Settings2, FileText, List, PlusCircle, Save, ChevronLeft } from 'lucide-react';
import { 
  MOTOR_STANDARDS_200V, 
  calculateTrunkAllowableCurrent
} from '../../constants/wiringStandards';
import type { StartingMethod } from '../../constants/wiringStandards';

// データの型定義
interface MotorLoad {
  id: string;
  name: string;
  kw: number;
  startingMethod: StartingMethod;
  wireLength: number;     // m
  voltageDropLimit: number; // %
  breakerType: 'MCCB' | 'ELCB';
}

// 簡単なUUID生成
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function PowerCalc() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetTreeNodeId = searchParams.get('treeNodeId');
  const initialName = searchParams.get('name');

  const [savedBoards, setSavedBoards] = useState<any[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(targetTreeNodeId && targetTreeNodeId !== 'undefined' ? targetTreeNodeId : null);
  const [isSaving, setIsSaving] = useState(false);
  const [popupMessage, setPopupMessage] = useState<{title: string, message: string} | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: string, name: string } | null>(null);

  // Numpad State
  const [numpad, setNumpad] = useState<{
    isOpen: boolean;
    targetId: string;
    targetField: 'demandFactor' | 'kw' | 'wireLength';
    initialValue: number;
    label: string;
  }>({ isOpen: false, targetId: '', targetField: 'demandFactor', initialValue: 0, label: '' });

  const openNumpad = (id: string, field: 'demandFactor' | 'kw' | 'wireLength', initialValue: number, label: string) => {
    setNumpad({ isOpen: true, targetId: id, targetField: field, initialValue, label });
  };

  const handleNumpadConfirm = (val: number) => {
    if (numpad.targetId === 'BOARD_DF') {
      setDemandFactor(val);
    } else {
      updateLoad(numpad.targetId, numpad.targetField as keyof MotorLoad, val);
    }
    setNumpad(prev => ({ ...prev, isOpen: false }));
  };

  const [title, setTitle] = useState('動力盤-1');
  const [voltage, setVoltage] = useState<'200V' | '400V'>('200V');
  const [demandFactor, setDemandFactor] = useState(100); // 需要率 %
  
  const [loads, setLoads] = useState<MotorLoad[]>([
    { id: generateId(), name: '送風機1', kw: 3.7, startingMethod: 'direct', wireLength: 20, voltageDropLimit: 2, breakerType: 'MCCB' },
    { id: generateId(), name: 'ポンプ1', kw: 7.5, startingMethod: 'star_delta', wireLength: 30, voltageDropLimit: 2, breakerType: 'ELCB' },
  ]);

  // 初回ロードで保存済みリストを取得し、ツリー連携があれば自動ロード
  useEffect(() => {
    if (projectId) loadBoardsList();
  }, [projectId]);

  const loadBoardsList = async () => {
    const { data } = await supabase.from('site_tools_data')
      .select('id, name, updated_at, data_payload')
      .eq('project_id', projectId)
      .eq('tool_type', 'POWER_CALC')
      .order('updated_at', { ascending: false });
      
    if (data) {
      setSavedBoards(data);

      // URL引数があれば自動ロード/新規作成判定
      if (targetTreeNodeId && !currentBoardId) {
        const matchingBoard = data.find((b: any) => b.data_payload?.treeNodeId === targetTreeNodeId);
        if (matchingBoard) {
          loadBoard(matchingBoard);
        } else {
          // ツリーからの該当盤がない場合は、新規作成として名前だけセットする
          createNewBoard();
          if (initialName) setTitle(initialName);
        }
      } else if (!currentBoardId && data.length > 0) {
        // 通常アクセスで何もない場合は最新をロード
        loadBoard(data[0]);
      }
    }
  };

  const loadBoard = (board: any) => {
    setCurrentBoardId(board.id);
    setTitle(board.name || '無題');
    const p = board.data_payload;
    if (p) {
      if (p.voltage) setVoltage(p.voltage);
      if (p.demandFactor !== undefined) setDemandFactor(p.demandFactor);
      if (p.loads) setLoads(p.loads);
    }
  };

  const createNewBoard = () => {
    setCurrentBoardId(null);
    setTitle('新規動力盤');
    setLoads([{ id: generateId(), name: 'ポンプ1', kw: 2.2, startingMethod: 'direct', wireLength: 20, voltageDropLimit: 2, breakerType: 'MCCB' }]);
    setDemandFactor(100);
  };

  const saveBoard = async () => {
    if (!projectId) {
      setPopupMessage({ title: "エラー", message: "プロジェクトが選択されていません。ツールポータルから入り直してください。" });
      return;
    }
    setIsSaving(true);
    
    // ツリー側に返すための計算結果集計
    const totalKw = summary.totalKw;
    
    const payload = { 
      voltage, 
      demandFactor, 
      loads,
      treeNodeId: targetTreeNodeId || undefined, 
      summaryKw: totalKw,
      summaryDemandFactor: demandFactor,      
    };

    try {
      if (currentBoardId) {
        const { error } = await supabase.from('site_tools_data')
          .update({ name: title, data_payload: payload, updated_at: new Date().toISOString() })
          .eq('id', currentBoardId);
        if (error) throw error;
        setPopupMessage({ title: "保存完了", message: "上書き保存しました。" });
      } else {
        const { data, error } = await supabase.from('site_tools_data')
          .insert([{ project_id: projectId, tool_type: 'POWER_CALC', name: title, data_payload: payload }])
          .select().single();
        if (error) throw error;
        if (data) setCurrentBoardId(data.id);
        setPopupMessage({ title: "保存完了", message: "新しく保存しました。" });
      }
      await loadBoardsList();
    } catch (e: any) {
      console.error(e);
      setPopupMessage({ title: "保存エラー", message: "保存に失敗しました: " + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      const { error } = await supabase.from('site_tools_data').delete().eq('id', id);
      if (error) throw error;
      
      setPopupMessage({ title: "削除完了", message: "盤のデータを削除しました。" });
      if (currentBoardId === id) {
        createNewBoard();
      }
      await loadBoardsList();
      setConfirmDeleteId(null);
    } catch (e: any) {
      console.error(e);
      setPopupMessage({ title: "削除エラー", message: "削除に失敗しました: " + e.message });
    }
  };

  // 計算エンジン: 指定kWから200V時の定格電流とブレーカ容量を引く
  const getMotorSpec = (kw: number, method: StartingMethod) => {
    // 現在は200Vのみ対応。400Vの場合は近似的に電流を半分などにすることも可（厳密には別マスタが必要）
    const standard = MOTOR_STANDARDS_200V.find(s => s.kw === kw);
    
    if (standard) {
      const breaker = method === 'star_delta' && standard.breakerStarDelta !== null 
        ? standard.breakerStarDelta 
        : standard.breakerDirect;
      return {
        currentA: standard.currentA,
        breakerA: breaker,
        isStandard: true
      };
    } else {
      // 規程にないイレギュラー容量(5.7kWなど)の場合は概算電流を出す
      const estCurrent = kw * 4.5; 
      // 直入れ保護として概算のブレーカを選定（電流の約2.5倍〜3倍を直近上位に）
      const stdBreakers = [20, 30, 40, 50, 60, 75, 100, 125, 150, 200, 225];
      const targetBreaker = estCurrent * 2.5;
      const breaker = stdBreakers.find(b => b > targetBreaker) || Math.ceil(targetBreaker / 10) * 10;
      
      return {
        currentA: estCurrent,
        breakerA: breaker,
        isStandard: false
      };
    }
  };

  // 全モータの電流とブレーカを計算
  const calculatedLoads = useMemo(() => {
    return loads.map(load => {
      const spec = getMotorSpec(load.kw, load.startingMethod);
      
      // TODO: 本格的な電圧降下からの電線サイズ逆算ロジックは内線規程から実装予定
      // e = (35.6 * L * I) / (1000 * A) -> A = (35.6 * L * I) / (1000 * e)
      // e = 200V * 2% = 4V
      const e = (voltage === '200V' ? 200 : 400) * (load.voltageDropLimit / 100);
      const rawWireArea = (35.6 * load.wireLength * spec.currentA) / (1000 * e);
      // CVケーブルの近似標準サイズ (2, 3.5, 5.5, 8, 14, 22, 38...)
      const standardSizes = [2, 3.5, 5.5, 8, 14, 22, 38, 60, 100];
      const wireSize = standardSizes.find(s => s >= rawWireArea) || standardSizes[standardSizes.length - 1];

      return {
        ...load,
        ...spec,
        wireSq: wireSize
      };
    });
  }, [loads, voltage]);

  // 幹線の総合計算
  const summary = useMemo(() => {
    const totalRawCurrent = calculatedLoads.reduce((sum, item) => sum + item.currentA, 0);
    const im = totalRawCurrent * (demandFactor / 100);
    const ih = 0;
    
    // 幹線の許容電流 Iw
    const iw = calculateTrunkAllowableCurrent(im, ih);
    
    // 最大負荷モーターの特定（主幹ブレーカー選定のための基準）
    let maxMotor = { kw: 0, currentA: 0, startingMethod: 'direct' as StartingMethod };
    calculatedLoads.forEach(item => {
      // 出力(kW)が大きいものを最大とする（同じ場合は電流値）
      if (item.kw > maxMotor.kw || (item.kw === maxMotor.kw && item.currentA > maxMotor.currentA)) {
        maxMotor = item;
      }
    });

    // --- 内線規程（3705節）の主幹ブレーカー選定マトリックス ---
    // 行は「最大使用電流(im)の総和」、列は「最大の電動機の容量と始動方式」
    // Column Index:
    // 0: なし, 1: 0.75kW(直入), 2: 1.5kW(直入)/5.5kW(Y-Δ), 3: 2.2kW(直入)/7.5kW(Y-Δ)
    // 4: 3.7kW(直入)/11kW(Y-Δ), 5: 5.5kW(直入)/15kW(Y-Δ), 6: 7.5kW(直入)/18.5kW(Y-Δ), 7: 11kW(直入)/22kW(Y-Δ)
    let colIndex = 0;
    if (maxMotor.startingMethod === 'direct' || maxMotor.startingMethod === 'inverter') {
      if (maxMotor.kw >= 11) colIndex = 7;
      else if (maxMotor.kw >= 7.5) colIndex = 6;
      else if (maxMotor.kw >= 5.5) colIndex = 5;
      else if (maxMotor.kw >= 3.7) colIndex = 4;
      else if (maxMotor.kw >= 2.2) colIndex = 3;
      else if (maxMotor.kw >= 1.5) colIndex = 2;
      else if (maxMotor.kw >= 0.75) colIndex = 1;
    } else if (maxMotor.startingMethod === 'star_delta') {
      if (maxMotor.kw >= 22) colIndex = 7;
      else if (maxMotor.kw >= 18.5) colIndex = 6;
      else if (maxMotor.kw >= 15) colIndex = 5;
      else if (maxMotor.kw >= 11) colIndex = 4;
      else if (maxMotor.kw >= 7.5) colIndex = 3;
      else if (maxMotor.kw >= 5.5) colIndex = 2;
      else colIndex = 1; // 5.5未満のY-Δは通常直入と同等以下に丸める
    }

    const breakerMatrix: Record<number, number[]> = {
      15: [15, 15, 15, 20, 30, 40, 50, 75],
      20: [20, 20, 20, 30, 30, 40, 50, 75],
      30: [30, 30, 30, 30, 40, 50, 60, 75],
      40: [40, 40, 40, 40, 50, 60, 75, 100],
      50: [50, 50, 50, 50, 75, 75, 100, 125],
      60: [60, 60, 60, 100, 100, 100, 125, 125],
      75: [75, 75, 75, 100, 100, 100, 125, 150],
      100: [100, 100, 100, 100, 125, 125, 150, 175],
      125: [125, 125, 125, 125, 125, 150, 175, 200],
      150: [150, 150, 150, 150, 150, 150, 200, 225],
      175: [175, 175, 175, 175, 175, 175, 200, 225],
      200: [200, 200, 200, 200, 200, 200, 200, 250],
      225: [225, 225, 225, 225, 225, 225, 225, 250],
      250: [250, 250, 250, 250, 250, 250, 250, 250]
    };

    const rowKeys = Object.keys(breakerMatrix).map(Number).sort((a, b) => a - b);
    const targetRow = rowKeys.find(row => row >= im) || rowKeys[rowKeys.length - 1];
    
    let recommendedMainBreaker = breakerMatrix[targetRow][colIndex];
    if (!recommendedMainBreaker) recommendedMainBreaker = targetRow; // フォールバック

    return {
      totalKw: calculatedLoads.reduce((sum, item) => sum + item.kw, 0),
      totalCurrentA: totalRawCurrent,
      im,
      iw,
      recommendedMainBreaker,
      maxMotorKw: maxMotor.kw
    };
  }, [calculatedLoads, demandFactor]);

  const addLoad = () => {
    setLoads([...loads, { 
      id: generateId(), 
      name: `新規負荷${loads.length + 1}`, 
      kw: 2.2, 
      startingMethod: 'direct', 
      wireLength: 15, 
      voltageDropLimit: 2,
      breakerType: 'MCCB'
    }]);
  };

  const removeLoad = (id: string) => {
    setLoads(loads.filter(l => l.id !== id));
  };

  const updateLoad = (id: string, field: keyof MotorLoad, value: any) => {
    setLoads(loads.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-100px)] -m-4 sm:-m-6 md:-m-8 border-t border-slate-200 dark:border-slate-800">
      
      {/* 画面左側の「版（計算書）一覧サイドバー」 */}
      <div className="w-full md:w-64 lg:w-72 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex justify-between items-center">
          <h2 className="font-bold text-sm flex items-center gap-2"><List className="w-4 h-4"/> 案件内の動力盤</h2>
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
                onClick={() => {
                  loadBoard(board);
                }}
                className={`w-full text-left px-3 py-2.5 pr-8 rounded-md text-sm transition-colors ${currentBoardId === board.id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold' : 'hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="truncate flex-1">{board.name || '無題の動力盤'}</span>
                    {board.data_payload?.treeNodeId && (
                      <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200 ml-1 shrink-0" title="ツリーと連携中">Link</span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-60">
                    {new Date(board.updated_at).toLocaleDateString()} {new Date(board.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId({ id: board.id, name: board.name || '無題の動力盤' });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                title="この盤を削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 右側の計算書メインエリア */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-white dark:bg-[#0B1120]">
        <div className="max-w-6xl mx-auto space-y-6 pb-12">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <button 
                onClick={() => navigate(`/tools/${projectId}/site-design`)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 font-bold mb-3 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 px-3 py-1.5 rounded-full shadow-sm transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                現場ツリー(親)へ戻る
              </button>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
                 {title || '動力計算書'} <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-full ml-2">三相3線式 200V</span>
                 {targetTreeNodeId && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded-full border border-green-200 ml-1">ツリー連携中</span>}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">電線の太さから主幹ブレーカーまでを自動設計（内線規程準拠）</p>
            </div>
            <div className="flex gap-3 w-full sm:w-auto mt-2 sm:mt-0">
              <button 
                onClick={saveBoard}
                disabled={isSaving}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" />
                {isSaving ? '保存中...' : 'クラウド保存'}
              </button>
              {/* 追加機能想定: 「PDF取り込み」ボタン */}
              <button 
                 className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm flex items-center gap-2 transition-all transform hover:scale-[1.02]"
                 onClick={() => setPopupMessage({ title: "近日公開", message: "図面やPDFを読み込んで、AIが単線結線図から負荷リストを自動作成するAIビジョン機能がここに実装される予定です！" })}
              >
                <FileText className="w-4 h-4" />
                図面からAI入力
              </button>
            </div>
          </div>

      {/* 設定パネル */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 flex flex-wrap gap-6 items-end">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">盤・幹線名称</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800"
          />
        </div>
        <div className="space-y-1.5 w-32">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">電圧</label>
          <select 
            value={voltage} 
            onChange={(e) => setVoltage(e.target.value as any)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
          >
            <option value="200V">三相 200V</option>
            <option value="400V" disabled>三相 400V</option>
          </select>
        </div>
        <div className="space-y-1.5 w-32">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-orange-600">需要率 (%)</label>
          <div className="relative">
            <input 
              type="text" 
              inputMode="none"
              readOnly
              value={demandFactor} 
              onClick={() => openNumpad('BOARD_DF', 'demandFactor', demandFactor, '総需要率(%)')}
              className="w-full px-3 py-2 bg-orange-50 border border-orange-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-orange-800 pr-8 cursor-pointer hide-spinners"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-600/60 font-medium text-xs">%</span>
          </div>
        </div>
      </div>

      {/* メインテーブル */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-800/50 uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold min-w-[150px] whitespace-nowrap">負荷名称</th>
                <th className="px-4 py-3 font-semibold w-24">容量 (kW)</th>
                <th className="px-4 py-3 font-semibold w-28">始動方式</th>
                <th className="px-4 py-3 font-semibold w-24 text-center">配線長 (m)</th>
                <th className="px-4 py-3 font-semibold w-24 text-center">許容V降下</th>
                <th className="px-4 py-3 font-semibold bg-blue-50/50 dark:bg-blue-900/10 text-blue-700 w-24 text-right">電流 (A)</th>
                <th className="px-4 py-3 font-semibold bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-700 w-24 text-center">サイズ(sq)</th>
                <th className="px-4 py-3 font-semibold bg-blue-50/40 text-blue-800 min-w-[90px] border-l border-white text-center">遮断器</th>
                <th className="px-4 py-3 font-semibold bg-blue-50/40 text-blue-800 w-20 text-center">分岐(A)</th>
                <th className="px-2 py-3 w-12 text-center">
                  <Settings2 className="w-4 h-4 mx-auto text-slate-400" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {calculatedLoads.map((load) => (
                <tr key={load.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="px-4 py-2.5 min-w-[150px]">
                    <input 
                      type="text" 
                      value={load.name}
                      onChange={(e) => updateLoad(load.id, 'name', e.target.value)}
                      className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 rounded outline-none transition-colors"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center">
                      <input 
                        type="text" 
                        inputMode="none"
                        readOnly
                        value={load.kw}
                        onClick={() => openNumpad(load.id, 'kw', load.kw, '容量 (kW)')}
                        className={`w-16 bg-transparent border-0 border-b border-transparent focus:border-blue-500 focus:ring-0 px-0 py-1 text-sm font-bold cursor-pointer hide-spinners ${!load.isStandard ? 'text-orange-600' : 'text-slate-700'}`}
                        title={!load.isStandard ? '特注容量（概算推計値を適用）' : '標準容量'}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <select 
                      value={load.startingMethod}
                      onChange={(e) => updateLoad(load.id, 'startingMethod', e.target.value)}
                      className="bg-slate-100 border-0 text-xs font-medium text-slate-600 rounded-full px-2.5 py-1 min-w-[90px]"
                    >
                      <option value="direct">じか入れ</option>
                      <option value="star_delta">Y-Δ</option>
                      <option value="inverter">インバータ</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <input 
                      type="text" 
                      inputMode="none"
                      readOnly
                      value={load.wireLength}
                      onClick={() => openNumpad(load.id, 'wireLength', load.wireLength, '配線長 (m)')}
                      className="w-14 bg-transparent border border-transparent hover:border-slate-200 rounded focus:border-blue-500 focus:bg-white focus:ring-0 px-1 py-1 text-sm text-center cursor-pointer hide-spinners"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select 
                      value={load.voltageDropLimit}
                      onChange={(e) => updateLoad(load.id, 'voltageDropLimit', Number(e.target.value))}
                      className="bg-transparent border-0 text-sm text-slate-600 px-1 py-1 text-center"
                    >
                      <option value={1}>1%</option>
                      <option value={2}>2%</option>
                      <option value={3}>3%</option>
                    </select>
                  </td>
                  {/* 自動計算列 */}
                  <td className="px-4 py-2.5 bg-blue-50/30 dark:bg-blue-900/5 font-bold text-blue-700 text-right">
                    {load.currentA.toFixed(1)} <span className="text-[10px] text-blue-400 font-normal">A</span>
                  </td>
                  <td className="px-4 py-2.5 bg-indigo-50/30 dark:bg-indigo-900/5 font-extrabold text-indigo-700 text-center">
                    {load.wireSq} <span className="text-xs text-indigo-400 font-normal ml-0.5">sq</span>
                  </td>

                  {/* 遮断器種別 と 自動選定 (末尾へ移動) */}
                  <td className="px-4 py-2.5 bg-blue-50/20 border-l border-white text-center">
                    <select 
                      value={load.breakerType}
                      onChange={(e) => updateLoad(load.id, 'breakerType', e.target.value)}
                      className={`border-0 text-[11px] font-bold rounded px-1.5 py-1 cursor-pointer w-full min-w-[70px] text-center ${load.breakerType === 'ELCB' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-700'}`}
                    >
                      <option value="MCCB">MCCB</option>
                      <option value="ELCB">ELCB(漏)</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 bg-blue-50/20 text-center">
                     <span className="text-sm font-bold text-blue-800 bg-white border border-blue-200 px-2 py-1 rounded shadow-sm relative">
                        {load.breakerA}A
                        {!load.isStandard && <span className="absolute -top-2 -right-2 text-orange-500" title="推計値">*</span>}
                     </span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button 
                      onClick={() => removeLoad(load.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* サジェスト用のデータリスト */}
        <datalist id="motor-kw-list">
          {MOTOR_STANDARDS_200V.map(m => (
            <option key={m.kw} value={m.kw}>{m.kw} (標準)</option>
          ))}
        </datalist>
        
        {/* レコード追加ボタン */}
        <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-200 p-3">
          <button 
            onClick={addLoad}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            モーター回路を追加
          </button>
        </div>
      </div>

      {/* サマリー（計算結果）エリア */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 1. 総合負荷 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 p-5 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
            <Calculator className="w-4 h-4" /> 総合モーター負荷 (Im)
          </h3>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-black text-slate-800 tracking-tighter">
              {summary.im.toFixed(1)}
            </div>
            <div className="text-lg font-bold text-slate-400 mb-1">A</div>
          </div>
          <p className="text-xs text-slate-400 mt-3 font-medium bg-slate-100 px-3 py-1 rounded-full">
            合計 {summary.totalKw.toFixed(2)} kW × 需要率 {demandFactor}%
          </p>
        </div>

        {/* 2. 幹線の太さ */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 p-5 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <h3 className="text-sm font-semibold text-slate-500 mb-4">
            必要な幹線の許容電流 (Iw)
          </h3>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-black text-emerald-600 tracking-tighter">
              {summary.iw.toFixed(1)}
            </div>
            <div className="text-lg font-bold text-slate-400 mb-1">A以上</div>
          </div>
          <p className="text-xs text-slate-400 mt-3 font-medium bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full">
            ※{summary.im > 50 ? '1.1倍' : '1.25倍'}の割増保護を適用済
          </p>
        </div>

        {/* 3. 主幹ブレーカー */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-orange-400 to-red-500" />
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            推奨主幹ブレーカー (Ib)
          </h3>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-black text-white tracking-tighter">
              {summary.recommendedMainBreaker}
            </div>
            <div className="text-lg font-bold text-slate-400 mb-1">AF/AT</div>
          </div>
          <p className="text-xs font-medium bg-slate-700/50 text-slate-300 px-3 py-1 rounded-full mt-3">
            内線規程保護ルール (2.5×Iw等) クリア
          </p>
        </div>

      </div>

        </div>
      </div>

      {/* カスタムポップアップ（アラートの代わり） */}
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
