import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Activity, Settings2, FileText, List, PlusCircle, Save, ChevronLeft } from 'lucide-react';

interface LightingLoad {
  id: string;
  circuitNo: number;
  name: string;
  voltage: '100V' | '200V';
  phase: 'U' | 'W' | 'UW'; // U相(赤), W相(黒), U-W両相(赤黒200V用)
  va: number; // 容量(VA)
  breakerType: 'MCCB' | 'ELCB'; // 遮断器種別
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function LightingCalc() {
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

  const [title, setTitle] = useState('電灯盤-1');
  const [demandFactor, setDemandFactor] = useState(100);

  const [loads, setLoads] = useState<LightingLoad[]>([
    { id: generateId(), circuitNo: 1, name: '照明 L1', voltage: '100V', phase: 'U', va: 600, breakerType: 'MCCB' },
    { id: generateId(), circuitNo: 2, name: 'コンセント C1', voltage: '100V', phase: 'W', va: 1200, breakerType: 'ELCB' },
    { id: generateId(), circuitNo: 3, name: '空調機', voltage: '200V', phase: 'UW', va: 2000, breakerType: 'ELCB' },
  ]);

  // 初回ロードで保存済みリストを取得
  useEffect(() => {
    if (projectId) loadBoardsList();
  }, [projectId]);

  const loadBoardsList = async () => {
    const { data } = await supabase.from('site_tools_data')
      .select('id, name, updated_at, data_payload')
      .eq('project_id', projectId)
      .eq('tool_type', 'LIGHTING_CALC')
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
      if (p.demandFactor !== undefined) setDemandFactor(p.demandFactor);
      if (p.loads) setLoads(p.loads);
    }
  };

  const createNewBoard = () => {
    setCurrentBoardId(null);
    setTitle('新規電灯盤');
    setLoads([{ id: generateId(), circuitNo: 1, name: '照明 L1', voltage: '100V', phase: 'U', va: 1000, breakerType: 'MCCB' }]);
    setDemandFactor(100);
  };

  const saveBoard = async () => {
    if (!projectId) {
      setPopupMessage({ title: "エラー", message: "プロジェクトが選択されていません。ツールポータルから入り直してください。" });
      return;
    }
    setIsSaving(true);
    
    // ツリー側に返すための計算結果集計 (VA -> kW換算: 単純に1000で割る。需要率適用前の値)
    const totalKw = summary.totalVA / 1000;

    const payload = { 
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
          .insert([{ project_id: projectId, tool_type: 'LIGHTING_CALC', name: title, data_payload: payload }])
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

  // 各回路の電流をU相・W相に分配する計算
  const calculatedLoads = useMemo(() => {
    return loads.map(load => {
      let uCurrent = 0;
      let wCurrent = 0;

      if (load.voltage === '100V') {
        if (load.phase === 'U') {
          uCurrent = load.va / 100;
        } else if (load.phase === 'W') {
          wCurrent = load.va / 100;
        }
      } else if (load.voltage === '200V') {
        // 200V負荷はU相とW相の両方に均等に電流が流れる
        const current = load.va / 200;
        uCurrent = current;
        wCurrent = current;
      }

      // 自動ブレーカ選定
      const maxCurrent = Math.max(uCurrent, wCurrent);
      let autoBreakerA = 20;
      if (maxCurrent > 15) autoBreakerA = 30;
      if (maxCurrent > 22) autoBreakerA = 40;
      if (maxCurrent > 30) autoBreakerA = 50;
      if (maxCurrent > 40) autoBreakerA = 60;
      if (maxCurrent > 50) autoBreakerA = 75;

      return {
        ...load,
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
    // 不平衡率(%) = (各相間に接続される単相負荷設備の容量の最大と最小の差) / (総単相負荷容量の1/2) * 100
    // ここでは簡易的に(U-Wの差) / ((U+W)/2) * 100 とし、200V負荷は相殺されるため影響しないようにします
    const u100VA = calculatedLoads.filter(l => l.voltage === '100V' && l.phase === 'U').reduce((sum, l) => sum + l.va, 0);
    const w100VA = calculatedLoads.filter(l => l.voltage === '100V' && l.phase === 'W').reduce((sum, l) => sum + l.va, 0);
    const total100VA = u100VA + w100VA;
    
    let unbalanceRate = 0;
    if (total100VA > 0) {
      unbalanceRate = (Math.abs(u100VA - w100VA) / (total100VA / 2)) * 100;
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
      circuitNo: nextCircuit, 
      name: `回路 ${nextCircuit}`, 
      voltage: '100V', 
      phase: nextCircuit % 2 === 0 ? 'W' : 'U', 
      va: 1000,
      breakerType: 'MCCB'
    }]);
  };

  const removeLoad = (id: string) => {
    setLoads(loads.filter(l => l.id !== id));
  };

  const updateLoad = (id: string, field: keyof LightingLoad, value: any) => {
    setLoads(loads.map(l => {
      if (l.id === id) {
        // 電圧が200Vに変更された場合、自動的に相を'UW'にする
        const newVoltage = field === 'voltage' ? value : l.voltage;
        const newPhase = field === 'phase' ? value : (newVoltage === '200V' ? 'UW' : (l.phase === 'UW' ? 'U' : l.phase));
        
        return { ...l, [field]: value, phase: newPhase };
      }
      return l;
    }));
  };

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-100px)] -m-4 sm:-m-6 md:-m-8 border-t border-slate-200 dark:border-slate-800">
      
      {/* 画面左側の「版（計算書）一覧サイドバー」 */}
      <div className="w-full md:w-64 lg:w-72 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex justify-between items-center">
          <h2 className="font-bold text-sm flex items-center gap-2"><List className="w-4 h-4"/> 案件内の電灯盤</h2>
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
                onClick={() => loadBoard(board)}
                className={`w-full text-left px-3 py-2.5 pr-8 rounded-md text-sm transition-colors ${currentBoardId === board.id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold' : 'hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="truncate flex-1">{board.name || '無題の電灯盤'}</span>
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
                 {title || '電灯計算書'} <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-full ml-2">単相3線式 100/200V</span>
                 {targetTreeNodeId && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded-full border border-green-200 ml-1">ツリー連携中</span>}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">電灯・コンセント容量から、回路の相バランス・不平衡率と主幹ブレーカーを自動計算</p>
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
              {/* AI読み込みボタン（将来構想） */}
              <button 
                 className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm flex items-center gap-2 transition-all transform hover:scale-[1.02]"
                 onClick={() => setPopupMessage({ title: "近日公開", message: "図面やPDFを読み込んで、AIが単線結線図から負荷リストを自動作成するAIビジョン機能がここに実装予定です！" })}
              >
                <FileText className="w-4 h-4" />
                図面からAI入力
              </button>
            </div>
          </div>

      {/* 設定パネル */}
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

      {/* メインテーブル */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-800/50 uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold w-16 text-center">回路</th>
                <th className="px-4 py-3 font-semibold min-w-[150px] whitespace-nowrap">負荷名称</th>
                <th className="px-4 py-3 font-semibold w-24">電圧</th>
                <th className="px-4 py-3 font-semibold w-24 text-center">接続相</th>
                <th className="px-4 py-3 font-semibold w-28 text-right">容量 (VA)</th>
                <th className="px-4 py-3 font-semibold bg-red-50/50 dark:bg-red-900/10 text-red-700 w-20 text-right border-l border-r border-slate-100">U相(赤)</th>
                <th className="px-4 py-3 font-semibold bg-slate-800/5 dark:bg-slate-100/10 text-slate-800 dark:text-slate-200 w-20 text-right">W相(黒)</th>
                <th className="px-4 py-3 font-semibold bg-blue-50/40 text-blue-800 min-w-[90px] border-l border-white text-center">遮断器</th>
                <th className="px-4 py-3 font-semibold bg-blue-50/40 text-blue-800 w-16 text-center">自動(A)</th>
                <th className="px-2 py-3 w-10 text-center">
                  <Settings2 className="w-4 h-4 mx-auto text-slate-400" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {calculatedLoads.map((load) => (
                <tr key={load.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="px-4 py-2.5 text-center">
                    <input 
                      type="number" 
                      value={load.circuitNo}
                      onChange={(e) => updateLoad(load.id, 'circuitNo', Number(e.target.value))}
                      className="w-10 bg-transparent border-0 focus:ring-0 px-0 py-1 text-sm font-mono text-center mx-auto text-slate-500"
                    />
                  </td>
                  <td className="px-4 py-2.5 min-w-[150px]">
                    <input 
                      type="text" 
                      value={load.name}
                      onChange={(e) => updateLoad(load.id, 'name', e.target.value)}
                      className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 rounded outline-none transition-colors"
                      placeholder="例: 会議室照明"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select 
                      value={load.voltage}
                      onChange={(e) => updateLoad(load.id, 'voltage', e.target.value)}
                      className="bg-transparent border-0 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100 rounded px-1 py-1"
                    >
                      <option value="100V">100V</option>
                      <option value="200V">200V</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {load.voltage === '200V' ? (
                      <span className="inline-block px-2 py-0.5 bg-gradient-to-r from-red-100 to-slate-200 text-slate-700 text-xs font-bold rounded border border-slate-300">
                        U-W (赤黒)
                      </span>
                    ) : (
                      <select 
                        value={load.phase}
                        onChange={(e) => updateLoad(load.id, 'phase', e.target.value)}
                        className={`border-0 text-xs font-bold rounded-md px-2 py-1 cursor-pointer ${
                          load.phase === 'U' 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        <option value="U">U相 (赤)</option>
                        <option value="W">W相 (黒)</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center">
                      <input 
                        type="number" 
                        value={load.va}
                        onChange={(e) => updateLoad(load.id, 'va', Number(e.target.value))}
                        className="w-16 bg-transparent border-0 border-b border-transparent focus:border-blue-500 focus:ring-0 px-0 py-1 text-sm font-bold text-right"
                        step="100"
                      />
                      <span className="text-xs text-slate-400 ml-1">VA</span>
                    </div>
                  </td>
                  
                  {/* 自動計算列 (U相電流) */}
                  <td className="px-4 py-2.5 bg-red-50/20 dark:bg-red-900/5 font-mono font-medium text-red-600 border-l border-r border-slate-100">
                    {load.uCurrent > 0 ? `${load.uCurrent.toFixed(1)} A` : '-'}
                  </td>
                  
                  {/* 自動計算列 (W相電流) */}
                  <td className="px-4 py-2.5 bg-slate-50/40 dark:bg-slate-100/5 font-mono font-medium text-slate-800 dark:text-slate-200 text-right">
                    {load.wCurrent > 0 ? `${load.wCurrent.toFixed(1)} A` : '-'}
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
                     <span className="text-sm font-bold text-blue-800 bg-white border border-blue-200 px-2 py-1 rounded shadow-sm">{load.autoBreakerA}A</span>
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
            
            {/* 合計行 */}
            <tfoot className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-200 font-bold text-sm">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right text-slate-500 uppercase">設計容量計 / 相電流計:</td>
                <td className="px-4 py-3 text-slate-800 text-right">{summary.totalVA.toLocaleString()} <span className="text-xs font-normal text-slate-500">VA</span></td>
                <td className="px-4 py-3 text-red-700 bg-red-100/50 border-l border-r border-white text-right">{summary.totalU.toFixed(1)} <span className="text-xs font-normal">A</span></td>
                <td className="px-4 py-3 text-slate-800 text-right">{summary.totalW.toFixed(1)} <span className="text-xs font-normal">A</span></td>
                <td colSpan={3}></td>
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

      {/* サマリー（計算結果）エリア */}
      <h2 className="text-lg font-bold text-slate-800 mt-8 mb-4 border-l-4 border-blue-500 pl-3">盤 総合評価</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 1. 不平衡率 */}
        <div className={`rounded-xl border p-5 flex flex-col items-center justify-center relative overflow-hidden transition-colors ${
          summary.unbalanceRate <= 30 
            ? 'bg-white border-slate-200' 
            : summary.unbalanceRate <= 40 
              ? 'bg-yellow-50 border-yellow-200' 
              : 'bg-red-50 border-red-200'
        }`}>
          <div className={`absolute top-0 w-full h-1 ${
             summary.unbalanceRate <= 30 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' :
             summary.unbalanceRate <= 40 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
             'bg-gradient-to-r from-red-500 to-rose-600'
          }`} />
          <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> 設備不平衡率 (単相100V)
          </h3>
          <div className="flex items-end gap-2">
            <div className={`text-5xl font-black tracking-tighter ${
              summary.unbalanceRate <= 30 ? 'text-slate-800' :
              summary.unbalanceRate <= 40 ? 'text-yellow-700' : 'text-red-700'
            }`}>
              {summary.unbalanceRate.toFixed(1)}
            </div>
            <div className="text-lg font-bold text-slate-400 mb-1">%</div>
          </div>
          <p className={`text-xs font-medium px-3 py-1 rounded-full mt-3 ${
             summary.unbalanceRate <= 40 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {summary.unbalanceRate <= 40 ? '内線規程クリア (40%以下)' : 'NG: 限界値超過！相の配分を見直してください'}
          </p>
        </div>

        {/* 2. 中性線電流 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 p-5 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-slate-200 to-slate-400" />
          <h3 className="text-sm font-semibold text-slate-500 mb-4">
            中性線(白) 電流
          </h3>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-black text-slate-600 tracking-tighter">
              {summary.neutralCurrent.toFixed(1)}
            </div>
            <div className="text-lg font-bold text-slate-400 mb-1">A</div>
          </div>
          <p className="text-xs text-slate-400 mt-3 font-medium bg-slate-50 px-3 py-1 rounded-full">
            | U相({summary.totalU.toFixed(1)}A) - W相({summary.totalW.toFixed(1)}A) |
          </p>
        </div>

        {/* 3. 推奨主幹ブレーカー */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 flex flex-col items-center justify-center relative overflow-hidden shadow-lg">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-400 to-purple-500" />
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            推奨主幹ブレーカー 
          </h3>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-black text-white tracking-tighter shadow-sm">
              {summary.recommendedMainBreaker}
            </div>
            <div className="text-lg font-bold text-slate-400 mb-1 flex flex-col justify-end">
              <span>AF/AT</span>
            </div>
          </div>
          <p className="text-xs font-medium bg-slate-700/50 text-slate-300 px-3 py-1 rounded-full mt-3 border border-slate-600">
            最大電流相: {summary.totalU > summary.totalW ? 'U相(赤)' : summary.totalU < summary.totalW ? 'W相(黒)' : '均等'} ベース
          </p>
        </div>

      </div>

        </div>
      </div>
      
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
    </div>
  );
}
