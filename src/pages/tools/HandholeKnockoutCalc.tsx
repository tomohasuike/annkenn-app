// src/pages/tools/HandholeKnockoutCalc.tsx
// ハンドホール穴あけ（北関東工業・発注仕様モード）。
//
// プルボックスの穴あけ計算（現場でホールソーを開ける位置を出す）とは目的が違う。
// こちらは「北関東工業への発注時に、加工可能エリアのどこに何径の穴をどのコネクター銘柄で
// 配置するか」という発注仕様を組み立てて、原寸イメージの図と穴一覧を出す。
//
// KK-E型450サイズ（品名規格 450E-750）以外は加工可能エリアの実寸が未確認のため、
// 自動配置は行わず「参考値・要問い合わせ」として穴一覧のみを出す。

import { useMemo, useState } from 'react';
import { Boxes, Plus, X, AlertTriangle, RotateCcw, Info } from 'lucide-react';
import {
  CONNECTOR_BRAND_LABELS,
  CONNECTOR_BRAND_ORDER,
  FEP_SIZES,
  HANDHOLE_SERIES_LABELS,
  IMPLEMENTED_SERIES,
  KKE_OUTER_SPEC,
  KKE_WIDTHS,
  PLACEMENT_GRID_OPTIONS_MM,
  DEFAULT_PLACEMENT_GRID_MM,
  machinableAreaFor,
  type ConnectorBrand,
  type FepSize,
  type KkEWidth,
  type PlacementGridMm,
} from '../../constants/handholeKitakanto';
import {
  computeHandholeLayout,
  summarizeOrder,
  type ConduitRun,
} from '../../utils/handholeLayoutEngine';
import HandholeDrawing from './HandholeDrawing';

export default function HandholeKnockoutCalc() {
  const [width, setWidth] = useState<KkEWidth>(450);
  const [gridMm, setGridMm] = useState<PlacementGridMm>(DEFAULT_PLACEMENT_GRID_MM);
  const [runs, setRuns] = useState<ConduitRun[]>([]);
  const [addBrand, setAddBrand] = useState<ConnectorBrand>('kkfit');
  const [addFep, setAddFep] = useState<FepSize>(50);
  const [addCount, setAddCount] = useState(1);

  const area = useMemo(() => machinableAreaFor(width), [width]);
  const result = useMemo(() => computeHandholeLayout({ width, runs, gridMm }), [width, runs, gridMm]);
  const orderLines = useMemo(() => summarizeOrder(result), [result]);
  const totalHoles = result.requiredHoles.length;

  const errors = result.warnings.filter(w => w.level === 'error');
  const warns = result.warnings.filter(w => w.level === 'warn');

  const addRun = () => {
    if (addCount <= 0) return;
    setRuns(prev => [...prev, { brand: addBrand, fepSize: addFep, count: addCount }]);
  };
  const removeRun = (i: number) => setRuns(prev => prev.filter((_, j) => j !== i));
  const reset = () => setRuns([]);

  const chip = (active: boolean) =>
    `px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
      active
        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
    }`;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-16 min-w-0">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-blue-500" />
            ハンドホール穴あけ（北関東工業）
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            型式・サイズと配管条件から、北関東工業への発注仕様（加工可能エリア内のコネクター配置・穴一覧）を作ります。
            現場でユーザー自身が穴を開けるのではなく、工場発注用の仕様書を作るツールです。
          </p>
        </div>
        <button
          onClick={reset}
          className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-3 py-2 rounded-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          やり直す
        </button>
      </div>

      {/* 型式 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
        <label className="text-xs font-semibold text-slate-500 block">型式</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {IMPLEMENTED_SERIES.map(s => (
            <button key={s} className={chip(true) + ' !cursor-default'}>{HANDHOLE_SERIES_LABELS[s]}</button>
          ))}
          {(Object.keys(HANDHOLE_SERIES_LABELS) as (keyof typeof HANDHOLE_SERIES_LABELS)[])
            .filter(s => !IMPLEMENTED_SERIES.includes(s))
            .map(s => (
              <button key={s} disabled className="px-3 py-2.5 rounded-lg text-sm font-bold border border-dashed border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed">
                {HANDHOLE_SERIES_LABELS[s]}
              </button>
            ))}
        </div>
      </div>

      {/* サイズ */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
        <label className="text-xs font-semibold text-slate-500 block">サイズ（内空幅mm）</label>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {KKE_WIDTHS.map(w => (
            <button key={w} onClick={() => setWidth(w)} className={chip(width === w) + ' !text-sm'}>
              <div>{w}</div>
              <div className={`text-[10px] font-normal ${width === w ? 'text-blue-100' : 'text-slate-400'}`}>
                外形{KKE_OUTER_SPEC[w].outerMm}
              </div>
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>蓋開口: {KKE_OUTER_SPEC[width].lidOpening}</span>
          <span>壁厚: {KKE_OUTER_SPEC[width].wallThicknessMm}mm</span>
        </div>
        {area ? (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300">
            {area.faceLabel}の加工可能エリア: 幅{area.workableWidthMm}mm × 高さ{area.workableHeightMm}mm（全幅{area.totalWidthMm}・全高{area.totalHeightMm}mm中、
            上端{area.topExcludeMm}mm・下端{area.bottomExcludeMm}mmは加工不可）
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              このサイズ（{width}）は加工可能エリアの実寸が<span className="font-bold">未確認</span>です。
              自動配置は行わず、穴一覧のみを参考値として出します。発注前に必ず北関東工業へ現物の加工図面を確認してください。
            </span>
          </div>
        )}
      </div>

      {/* 配管条件 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
        <label className="text-xs font-semibold text-slate-500 block">配管条件（本数・呼び径・コネクター銘柄）</label>

        {runs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {runs.map((r, i) => (
              <button
                key={i}
                onClick={() => removeRun(i)}
                className="group flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                {CONNECTOR_BRAND_LABELS[r.brand]} FEP{r.fepSize} × {r.count}
                <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500" />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2 pt-1">
          <label className="text-[11px] font-semibold text-slate-400 block">コネクター銘柄</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CONNECTOR_BRAND_ORDER.map(b => (
              <button key={b} onClick={() => setAddBrand(b)} className={chip(addBrand === b) + ' !text-xs'}>
                {CONNECTOR_BRAND_LABELS[b]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-slate-400 block">FEP呼び径</label>
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
            {FEP_SIZES.map(f => (
              <button key={f} onClick={() => setAddFep(f)} className={chip(addFep === f) + ' !text-sm'}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">本数</span>
            <input
              type="number" inputMode="numeric" min={1} value={addCount}
              onChange={e => setAddCount(Math.max(Number(e.target.value) || 0, 0))}
              className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
            />
          </div>
          <button
            onClick={addRun}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            この条件を追加
          </button>
        </div>
      </div>

      {/* 配置グリッド */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-2">
        <label className="text-xs font-semibold text-slate-500 block">コネクター中心位置の丸め単位</label>
        <div className="flex gap-2">
          {PLACEMENT_GRID_OPTIONS_MM.map(g => (
            <button key={g} onClick={() => setGridMm(g)} className={chip(gridMm === g) + ' !text-sm'}>
              {g}mm刻み
            </button>
          ))}
        </div>
      </div>

      {/* 図 */}
      {totalHoles > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
          <span className="text-xs font-semibold text-slate-500">加工図（発注仕様・実寸比）</span>
          <HandholeDrawing result={result} />
        </div>
      )}

      {/* 警告 */}
      {(errors.length > 0 || warns.length > 0) && (
        <div className="space-y-2">
          {[...errors, ...warns].map((w, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                w.level === 'error'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* 穴一覧・発注仕様 */}
      {totalHoles > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-slate-500 mb-3">穴の一覧（発注仕様）</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left py-1.5 font-semibold">コネクター銘柄</th>
                    <th className="text-right font-semibold">FEP呼び径</th>
                    <th className="text-right font-semibold">穴径</th>
                    <th className="text-right font-semibold">本数</th>
                  </tr>
                </thead>
                <tbody>
                  {orderLines.map((l, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800/60">
                      <td className="py-1.5 font-bold text-slate-700 dark:text-slate-200">{CONNECTOR_BRAND_LABELS[l.brand]}</td>
                      <td className="text-right tabular-nums text-slate-700 dark:text-slate-200">{l.fepSize}</td>
                      <td className="text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">φ{l.diameterMm}</td>
                      <td className="text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">{l.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              配置済み {result.placedHoles.length}件 / 未配置 {result.unplacedHoles.length}件 / 合計 {totalHoles}件
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-slate-500 mb-3">配置座標一覧（加工可能エリア左下が原点）</div>
            {result.area ? (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left py-1.5 font-semibold">穴</th>
                      <th className="text-right font-semibold">X</th>
                      <th className="text-right font-semibold">Y</th>
                      <th className="text-right font-semibold">径</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.placedHoles.map(h => (
                      <tr key={h.id} className="border-b border-slate-50 dark:border-slate-800/60">
                        <td className="py-1.5 text-slate-700 dark:text-slate-200">{h.label}</td>
                        <td className="text-right tabular-nums text-slate-700 dark:text-slate-200">{h.x}</td>
                        <td className="text-right tabular-nums text-slate-700 dark:text-slate-200">{h.y}</td>
                        <td className="text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">φ{h.diameterMm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">このサイズは加工可能エリアが未確認のため、座標は出せません。</p>
            )}
          </div>
        </div>
      )}

      {/* 根拠 */}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
          <Info className="w-3.5 h-3.5" />
          計算の根拠・使い方
        </div>
        <p>
          このツールは<span className="font-semibold">工場発注用の仕様</span>を作るものです。プルボックスのように現場でホールソーを使って
          ユーザー自身が穴を開けるのではなく、ここで決めた配置（どの面のどこに何径の穴を、どのコネクター銘柄で）を
          北関東工業に伝えて加工してもらいます。
        </p>
        <p>
          穴径は「配管のFEP呼び径×使用するコネクター銘柄」の2軸で決まります。出典は北関東工業のカタログ・コネクター一覧（2026-09-15確認）。
        </p>
        <p>
          コネクター同士の離隔は最低10mm以上（コネクターを使わない「穴のみ」加工は30mm以上）。中心位置は5mmまたは10mm刻みに丸めて配置します。
        </p>
        <p>
          <span className="font-semibold">加工可能エリアの実寸はKK-E型450サイズ（品名規格「450E-750」）のA面のみ確認できています。</span>
          それ以外のサイズ（600・800・900・1000・1200・1500・1800・2000）は加工可能エリアの実寸が未確認のため、
          自動配置は行わず穴の一覧のみを参考値として出します。450サイズの比率をそのまま他サイズへ流用・外挿することはしていません
          （サイズごとに比率が異なる可能性が高いため）。発注前に必ず北関東工業へ現物の加工図面を確認してください。
        </p>
        <p>
          KK-R型・国交省型は今回未対応です（型だけ用意し、データは投入していません）。
        </p>
      </div>
    </div>
  );
}
