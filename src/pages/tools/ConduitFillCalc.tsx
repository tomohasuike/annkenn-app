import { useMemo, useState } from 'react';
import { Cable, PlusCircle, Trash2, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { NumpadModal } from '../../components/ui/NumpadModal';
import {
  type ConduitCategory,
  type MetalConduitType,
  type PvcConduitType,
} from '../../constants/conduitFillStandards';
import { selectSameGaugeConduit, selectMixedGaugeConduit, type ConduitSelectionResult } from '../../utils/conduitFillCalcEngine';

const generateId = () => crypto.randomUUID();

interface WireRowState {
  id: string;
  gauge: string;
  count: number;
}

// 選定表のキーに準拠した電線太さの選択肢(3110-2〜4表 / 3115-4〜5表 のキーと一致させている)
const GAUGE_OPTIONS: { value: string; label: string }[] = [
  { value: '1.6', label: '1.6mm (単線)' },
  { value: '2.0', label: '2.0mm (単線)' },
  { value: '2.6', label: '2.6mm / 5.5sq' },
  { value: '3.2', label: '3.2mm / 8sq' },
  { value: '14', label: '14sq' },
  { value: '22', label: '22sq' },
  { value: '38', label: '38sq' },
  { value: '60', label: '60sq' },
  { value: '100', label: '100sq' },
  { value: '150', label: '150sq' },
  { value: '200', label: '200sq' },
  { value: '250', label: '250sq' },
];

const METAL_TYPE_OPTIONS: { value: MetalConduitType; label: string }[] = [
  { value: 'thick', label: '厚鋼電線管' },
  { value: 'thin', label: '薄鋼電線管' },
  { value: 'thinless', label: 'ねじなし電線管' },
];

const PVC_TYPE_OPTIONS: { value: PvcConduitType; label: string }[] = [
  { value: 'rigid', label: '硬質ビニル管 (VE)' },
  { value: 'pf_cd', label: 'PF管・CD管' },
];

export default function ConduitFillCalc() {
  const [category, setCategory] = useState<ConduitCategory>('metal');
  const [conduitType, setConduitType] = useState<MetalConduitType | PvcConduitType>('thick');

  const [wires, setWires] = useState<WireRowState[]>([
    { id: generateId(), gauge: '1.6', count: 3 },
  ]);

  const [numpad, setNumpad] = useState<{ isOpen: boolean; targetId: string; initialValue: number }>({
    isOpen: false,
    targetId: '',
    initialValue: 1,
  });

  const handleCategoryChange = (next: ConduitCategory) => {
    setCategory(next);
    setConduitType(next === 'metal' ? 'thick' : 'rigid');
  };

  const addWire = () => {
    setWires(prev => [...prev, { id: generateId(), gauge: '1.6', count: 1 }]);
  };

  const removeWire = (id: string) => {
    setWires(prev => (prev.length > 1 ? prev.filter(w => w.id !== id) : prev));
  };

  const updateWireGauge = (id: string, gauge: string) => {
    setWires(prev => prev.map(w => (w.id === id ? { ...w, gauge } : w)));
  };

  const openNumpad = (id: string, initialValue: number) => {
    setNumpad({ isOpen: true, targetId: id, initialValue });
  };

  const handleNumpadConfirm = (val: number) => {
    setWires(prev => prev.map(w => (w.id === numpad.targetId ? { ...w, count: val } : w)));
    setNumpad(prev => ({ ...prev, isOpen: false }));
  };

  // 同一太さはまとめて集計する(複数行に分けて同じ太さを入力した場合も合算する)
  const groupedWires = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of wires) {
      if (w.gauge && w.count > 0) {
        map.set(w.gauge, (map.get(w.gauge) || 0) + w.count);
      }
    }
    return Array.from(map.entries()).map(([gauge, count]) => ({ gauge, count }));
  }, [wires]);

  const result: ConduitSelectionResult | null = useMemo(() => {
    if (groupedWires.length === 0) return null;
    if (groupedWires.length === 1) {
      return selectSameGaugeConduit(category, conduitType, groupedWires[0].gauge, groupedWires[0].count);
    }
    return selectMixedGaugeConduit(category, conduitType, groupedWires);
  }, [groupedWires, category, conduitType]);

  const typeOptions = category === 'metal' ? METAL_TYPE_OPTIONS : PVC_TYPE_OPTIONS;
  const typeLabel = typeOptions.find(o => o.value === conduitType)?.label || '';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Cable className="w-6 h-6 text-blue-500" />
          電線管 占積率計算
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          電線の太さ・本数から、収容に必要な電線管の最小サイズを内線規程に基づいて自動選定します。
        </p>
      </div>

      {/* 設定パネル: 管種別選択 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-2 block">管の種類</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'metal' as ConduitCategory, label: '金属管' },
              { value: 'pvc' as ConduitCategory, label: '合成樹脂管' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => handleCategoryChange(opt.value)}
                className={`px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  category === opt.value
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-2 block">管の規格</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {typeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setConduitType(opt.value)}
                className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
                  conduitType === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 電線入力テーブル */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">収容する電線</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {wires.map((wire) => (
            <div key={wire.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-slate-400 block mb-1">電線太さ</label>
                <select
                  value={wire.gauge}
                  onChange={(e) => updateWireGauge(wire.id, e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {GAUGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="text-[10px] font-semibold text-slate-400 block mb-1">本数</label>
                <button
                  onClick={() => openNumpad(wire.id, wire.count)}
                  className="w-full px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/50 rounded-md text-sm font-black text-orange-800 dark:text-orange-300 text-center"
                >
                  {wire.count} 本
                </button>
              </div>
              <button
                onClick={() => removeWire(wire.id)}
                disabled={wires.length === 1}
                className="mt-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="この行を削除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 p-2">
          <button
            onClick={addWire}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-3 py-2 rounded transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            電線の太さを追加
          </button>
        </div>
      </div>

      {/* 計算結果 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6">
        {result === null ? (
          <p className="text-sm text-slate-400 text-center py-6">電線を入力すると管サイズが自動計算されます。</p>
        ) : result.error || !result.size ? (
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700 dark:text-red-400">選定できませんでした</p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">{result.error || '入力内容をご確認ください。'}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <p className="text-xs font-semibold text-slate-400 mb-1">必要な最小管サイズ ({typeLabel})</p>
              <p className="text-5xl font-black text-blue-700 dark:text-blue-400 tracking-tight">
                {result.size}
              </p>
              <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-slate-500">
                  {result.method === 'same_gauge_table' ? '同一太さ選定表(1〜10本表)を使用' : '断面積計算(内断面積32%基準)を使用'}
                </span>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-6 py-4 text-center min-w-[160px]">
              <p className="text-[10px] font-semibold text-slate-400 mb-1">参考: 内断面積使用率</p>
              <p className={`text-2xl font-black ${
                result.method === 'area_calc' && result.usageRatePercent !== null && result.usageRatePercent > 32
                  ? 'text-red-600'
                  : 'text-slate-700 dark:text-slate-200'
              }`}>
                {result.usageRatePercent !== null ? result.usageRatePercent.toFixed(1) : '-'}
                <span className="text-sm font-bold">%</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {result.method === 'area_calc' ? '(断面積計算: 32%以下が基準)' : '(選定表による参考値)'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 免責文言 */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-800 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
          本ツールは内線規程2016年版に基づく参考値です。実際の採用前には有資格者による確認をお願いします。
        </p>
      </div>

      {/* 出典注記 */}
      <div className="flex items-start gap-2 text-xs text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          出典: 内線規程 JEAC 8001-2016(2016年版) 3編1章 3110節(金属管の電線管とその附属品)・3115節(合成樹脂管工事)。
          同一太さの電線を1〜10本収める場合は選定表(3110-2〜4表/3115-4〜5表)を、
          異なる太さが混在する場合・11本以上の場合は電線断面積の合計に補正係数を乗じた計算断面積が
          管の内断面積の32%以下となる最小サイズ(3110-7〜11表/3115-7〜10表)を選定しています。
        </p>
      </div>

      <NumpadModal
        isOpen={numpad.isOpen}
        onClose={() => setNumpad(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleNumpadConfirm}
        initialValue={numpad.initialValue}
        label="電線の本数"
      />
    </div>
  );
}
