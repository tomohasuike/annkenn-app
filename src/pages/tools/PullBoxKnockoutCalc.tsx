// src/pages/tools/PullBoxKnockoutCalc.tsx
// プルボックス穴あけ計算。ダクターの型番と配管を選ぶと、罫書きに必要な芯位置・穴径・
// 使うクリップの型番までを実寸図とセットで出す。
//
// 計算の根拠と検証記録:
//   hitec-ai-team/reports/プルボックス穴あけアプリ_計画_2026-09-15/

import { useMemo, useState } from 'react';
import { Target, Plus, X, AlertTriangle, RotateCcw, Info } from 'lucide-react';
import {
  CLEARANCE_OPTIONS_MM,
  CONDUIT_KIND_LABELS,
  CONDUIT_SIZES,
  DEFAULT_PIPE_GAP_MM,
  DUCTER_HEIGHT_MM,
  DUCTER_ORDER,
  SUPPORT_FROM_BOX_MAX_MM,
  conduitLabel,
  threadOptionsFor,
  type ConduitKind,
  type ConduitRef,
  type DucterType,
  type ThreadOption,
} from '../../constants/pullBoxKnockout';
import {
  computeLayout,
  summarizeParts,
  type Alignment,
  type TierInput,
} from '../../utils/pullBoxLayoutEngine';
import PullBoxDrawing, { TIER_COLORS, type DimensionMode } from './PullBoxDrawing';

const BOX_PRESETS: [number, number][] = [
  [200, 200], [300, 300], [400, 300], [400, 400],
  [500, 400], [600, 400], [600, 600], [800, 600],
];

const ALIGNMENT_LABELS: Record<Alignment, string> = {
  center: '中央振り分け',
  left: '左端から',
  right: '右端から',
};

export default function PullBoxKnockoutCalc() {
  const [boxWidthMm, setBoxWidthMm] = useState(400);
  const [boxHeightMm, setBoxHeightMm] = useState(400);
  const [tiers, setTiers] = useState<TierInput[]>([{ ducter: 'D1', pipes: [] }]);
  const [clearancesMm, setClearancesMm] = useState<number[]>([]);
  const [alignment, setAlignment] = useState<Alignment>('center');
  const [edgeGapMm, setEdgeGapMm] = useState(DEFAULT_PIPE_GAP_MM);
  const [dimensionMode, setDimensionMode] = useState<DimensionMode>('cumulative');
  const [addKind, setAddKind] = useState<ConduitKind>('C');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** 同じ呼び径に複数の接続方法(ねじ呼び)があるとき、選ばせている最中の状態。 */
  const [pendingVariant, setPendingVariant] = useState<{ ti: number; size: number } | null>(null);

  const result = useMemo(
    () => computeLayout({ boxWidthMm, boxHeightMm, tiers, clearancesMm, alignment, edgeGapMm }),
    [boxWidthMm, boxHeightMm, tiers, clearancesMm, alignment, edgeGapMm],
  );
  const parts = useMemo(() => summarizeParts(result), [result]);
  const totalHoles = result.tiers.reduce((n, t) => n + t.holes.length, 0);

  const errors = result.warnings.filter(w => w.level === 'error');
  const warns = result.warnings.filter(w => w.level === 'warn');

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const [ti, hi] = selectedKey.split('-').map(Number);
    return result.tiers[ti]?.holes[hi] ?? null;
  }, [selectedKey, result]);

  // ── 操作 ──────────────────────────────────────────────
  const setDucter = (ti: number, d: DucterType) =>
    setTiers(prev => prev.map((t, i) => (i === ti ? { ...t, ducter: d } : t)));

  const addPipe = (ti: number, size: number, variant?: string) =>
    setTiers(prev => prev.map((t, i) => (i === ti ? { ...t, pipes: [...t.pipes, { kind: addKind, size, variant }] } : t)));

  /** 呼び径のボタンを押したとき。接続方法(ねじ呼び)が複数あれば選ばせてから足す。 */
  const chooseSize = (ti: number, size: number) => {
    const options = threadOptionsFor(addKind, size);
    if (options.length > 1) {
      setPendingVariant({ ti, size });
      return;
    }
    addPipe(ti, size, options[0]?.variant);
    setPendingVariant(null);
  };

  const chooseVariant = (opt: ThreadOption) => {
    if (!pendingVariant) return;
    addPipe(pendingVariant.ti, pendingVariant.size, opt.variant);
    setPendingVariant(null);
  };

  const removePipe = (ti: number, pi: number) => {
    setSelectedKey(null);
    setTiers(prev => prev.map((t, i) => (i === ti ? { ...t, pipes: t.pipes.filter((_, j) => j !== pi) } : t)));
  };

  const addTier = () => {
    setTiers(prev => [...prev, { ducter: prev[prev.length - 1]?.ducter ?? 'D1', pipes: [] }]);
    setClearancesMm(prev => [...prev, 10]);
  };

  const removeTier = (ti: number) => {
    setSelectedKey(null);
    setPendingVariant(null);
    setTiers(prev => prev.filter((_, i) => i !== ti));
    setClearancesMm(prev => prev.filter((_, i) => i !== Math.max(ti - 1, 0)));
  };

  const setClearance = (i: number, v: number) =>
    setClearancesMm(prev => prev.map((c, j) => (j === i ? v : c)));

  const reset = () => {
    setTiers([{ ducter: 'D1', pipes: [] }]);
    setClearancesMm([]);
    setSelectedKey(null);
    setPendingVariant(null);
  };

  // ── 画面 ──────────────────────────────────────────────
  const chip = (active: boolean) =>
    `px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
      active
        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
    }`;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-500" />
            プルボックス穴あけ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ダクターの型番と配管を選ぶと、罫書きに必要な芯位置・穴径・使うクリップまで出します。
            高さの基準はプルボックスの下端です。
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

      {/* プルボックスの大きさ */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
        <label className="text-xs font-semibold text-slate-500 block">プルボックスの大きさ</label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-8">横</span>
            <input
              type="number" inputMode="numeric" value={boxWidthMm}
              onChange={e => setBoxWidthMm(Math.max(Number(e.target.value) || 0, 1))}
              className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
            />
            <span className="text-xs text-slate-400">mm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-8">高さ</span>
            <input
              type="number" inputMode="numeric" value={boxHeightMm}
              onChange={e => setBoxHeightMm(Math.max(Number(e.target.value) || 0, 1))}
              className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
            />
            <span className="text-xs text-slate-400">mm</span>
          </div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {BOX_PRESETS.map(([w, h]) => (
            <button
              key={`${w}x${h}`}
              onClick={() => { setBoxWidthMm(w); setBoxHeightMm(h); }}
              className={chip(boxWidthMm === w && boxHeightMm === h) + ' !text-xs !px-1'}
            >
              {w}×{h}
            </button>
          ))}
        </div>
      </div>

      {/* 段 */}
      {tiers.map((tier, ti) => (
        <div key={ti} className="space-y-3">
          {ti > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-2">
              <label className="text-xs font-semibold text-slate-500 block">
                {ti}段目のクリップ頂部から、{ti + 1}段目のダクター下端までのあき
              </label>
              <div className="grid grid-cols-5 gap-2">
                {CLEARANCE_OPTIONS_MM.map(v => (
                  <button key={v} onClick={() => setClearance(ti - 1, v)} className={chip(clearancesMm[ti - 1] === v)}>
                    {v}mm
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-bold"
                style={{ color: TIER_COLORS[ti % TIER_COLORS.length] }}
              >
                {ti + 1}段目
              </span>
              {tiers.length > 1 && (
                <button onClick={() => removeTier(ti)} className="text-xs font-bold text-slate-400 hover:text-red-500 px-2 py-1">
                  この段を消す
                </button>
              )}
            </div>

            {/* 支持材 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 block">支持材（ダクターチャンネル）</label>
              <div className="grid grid-cols-5 gap-2">
                {DUCTER_ORDER.map(d => (
                  <button key={d} onClick={() => setDucter(ti, d)} className={chip(tier.ducter === d)}>
                    <div>{d}</div>
                    <div className={`text-[10px] font-normal ${tier.ducter === d ? 'text-blue-100' : 'text-slate-400'}`}>
                      {DUCTER_HEIGHT_MM[d]}mm
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 入っている管 */}
            {tier.pipes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tier.pipes.map((p, pi) => (
                  <button
                    key={pi}
                    onClick={() => removePipe(ti, pi)}
                    className="group flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    {conduitLabel(p)}
                    <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500" />
                  </button>
                ))}
              </div>
            )}

            {/* 管を足す */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-slate-500 block">配管を足す（左から順に並びます）</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {(Object.keys(CONDUIT_KIND_LABELS) as ConduitKind[]).map(k => (
                  <button
                    key={k}
                    onClick={() => { setAddKind(k); setPendingVariant(null); }}
                    className={chip(addKind === k) + ' !text-xs'}
                  >
                    {CONDUIT_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {CONDUIT_SIZES[addKind].map(s => (
                  <button
                    key={s}
                    onClick={() => chooseSize(ti, s)}
                    className="px-2 py-2.5 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {pendingVariant?.ti === ti && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-2.5">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    呼び{pendingVariant.size}の接続方法を選んでください（現場で使う方）:
                  </span>
                  {threadOptionsFor(addKind, pendingVariant.size).map(opt => (
                    <button
                      key={opt.variant ?? opt.variantLabel}
                      onClick={() => chooseVariant(opt)}
                      className="px-3 py-1.5 rounded-lg text-sm font-bold border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                    >
                      {opt.variantLabel} <span className="font-normal opacity-70">（{opt.thread}）</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setPendingVariant(null)}
                    className="text-xs font-bold text-slate-400 hover:text-red-500 px-2"
                  >
                    やめる
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={addTier}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 hover:border-blue-400 hover:text-blue-600"
      >
        <Plus className="w-4 h-4" />
        段を足す
      </button>

      {/* 図 */}
      {totalHoles > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">加工図（実寸比）</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ALIGNMENT_LABELS) as Alignment[]).map(a => (
                <button key={a} onClick={() => setAlignment(a)} className={chip(alignment === a) + ' !text-xs !py-1.5'}>
                  {ALIGNMENT_LABELS[a]}
                </button>
              ))}
              <button
                onClick={() => setDimensionMode(m => (m === 'cumulative' ? 'serial' : 'cumulative'))}
                className={chip(false) + ' !text-xs !py-1.5'}
              >
                寸法：{dimensionMode === 'cumulative' ? '端から通し' : '隣との芯々'}
              </button>
            </div>
          </div>

          {alignment !== 'center' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">端から1本目の管まで（あき）</span>
              <input
                type="number" inputMode="numeric" value={edgeGapMm}
                onChange={e => setEdgeGapMm(Math.max(Number(e.target.value) || 0, 0))}
                className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400">mm</span>
            </div>
          )}

          <PullBoxDrawing
            boxWidthMm={boxWidthMm}
            boxHeightMm={boxHeightMm}
            result={result}
            dimensionMode={dimensionMode}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />

          {selected && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
              <div className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">{selected.label}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  ['端から', `${selected.x}`],
                  ['下端から', `${selected.y}`],
                  ['開ける径', `φ${selected.actualHoleMm}`],
                  ['最小径（おねじ）', `φ${selected.threadOdMm}`],
                  ['開け方', selected.drilling.tool === 'ホールソー'
                    ? `ホールソー φ${selected.drilling.sawMm}`
                    : 'パンチャー'],
                  ['クリップ', selected.clipModel ?? '（現場選定）'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] text-blue-600 dark:text-blue-300">{k}</div>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
              {selected.drilling.notes.map(n => (
                <p key={n} className="mt-2 text-xs text-blue-700 dark:text-blue-300">※ {n}</p>
              ))}
            </div>
          )}
          {/* あきの実数値。警告が出ない範囲でも常に見せる。 */}
          <div className="space-y-1.5">
            {result.tiers.map((t, ti) =>
              t.holes.length === 0 ? null : (
                <div key={ti} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-bold" style={{ color: TIER_COLORS[ti % TIER_COLORS.length] }}>
                    {ti + 1}段目のあき
                  </span>
                  <span className={t.leftClearanceMm != null && t.leftClearanceMm < DEFAULT_PIPE_GAP_MM
                    ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                    左端 {t.leftClearanceMm?.toFixed(1)}
                  </span>
                  {t.gapsMm.map((g, i) => (
                    <span key={i} className={g < DEFAULT_PIPE_GAP_MM
                      ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                      {t.holes[i].label}〜{t.holes[i + 1].label} {g.toFixed(1)}
                    </span>
                  ))}
                  <span className={t.rightClearanceMm != null && t.rightClearanceMm < DEFAULT_PIPE_GAP_MM
                    ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                    右端 {t.rightClearanceMm?.toFixed(1)}
                  </span>
                </div>
              ),
            )}
            <p className="text-[11px] text-slate-400">
              管の外面どうし・管と箱の端のあき(mm)。{DEFAULT_PIPE_GAP_MM}mmを下回ると橙色になります。
            </p>
          </div>
          <p className="text-[11px] text-slate-400">図の丸をタップすると、その穴の数字が大きく出ます。</p>
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

      {/* 一覧と拾い */}
      {totalHoles > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-slate-500 mb-3">穴の一覧</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left py-1.5 font-semibold">段</th>
                    <th className="text-left font-semibold">管</th>
                    <th className="text-right font-semibold">端から</th>
                    <th className="text-right font-semibold">下端から</th>
                    <th className="text-right font-semibold">開ける径</th>
                    <th className="text-right font-semibold">クリップ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tiers.flatMap((t, ti) =>
                    t.holes.map((h, hi) => (
                      <tr
                        key={`${ti}-${hi}`}
                        onClick={() => setSelectedKey(`${ti}-${hi}`)}
                        className={`cursor-pointer border-b border-slate-50 dark:border-slate-800/60 ${
                          selectedKey === `${ti}-${hi}` ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <td className="py-1.5 font-bold" style={{ color: TIER_COLORS[ti % TIER_COLORS.length] }}>{ti + 1}</td>
                        <td className="font-bold text-slate-700 dark:text-slate-200">{h.label}</td>
                        <td className="text-right tabular-nums text-slate-700 dark:text-slate-200">{h.x}</td>
                        <td className="text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">{h.y}</td>
                        <td className="text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">φ{h.actualHoleMm}</td>
                        <td className="text-right text-[11px] text-slate-500">{h.clipModel ?? '（現場選定）'}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">使う工具</div>
              <div className="flex flex-wrap gap-2">
                {parts.tools.map(t => (
                  <span
                    key={t.label}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                      t.isPunch
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                        : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                    }`}
                  >
                    {t.label} <span className="opacity-60 font-normal">×{t.count}</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                常備しているホールソーは φ21・φ27・φ33。これで足りない穴はノックアウトパンチャーになります。
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">使うクリップ</div>
              <div className="flex flex-wrap gap-2">
                {parts.clips.map(c => (
                  <span key={c.model} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200">
                    {c.model} <span className="text-slate-400 font-normal">×{c.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 根拠 */}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
          <Info className="w-3.5 h-3.5" />
          計算の根拠
        </div>
        <p>
          芯高さ ＝ ダクターの高さ ＋ 電線管の外径 ÷ 2。公開されている支持材別開口寸法表17件と完全に一致することを確認しています。
          ダクター寸法はネグロス電工の公式カタログ・寸法図（D15=15／D20=20／D1=30／D2=45／D3=75mm）、
          クリップはDCシリーズのA寸法によります。
        </p>
        <p>
          <span className="font-semibold">穴径はボックスコネクタのおねじ部に合わせています。</span>
          パナソニック公式FAQの「厚鋼／薄鋼電線管ねじの基準寸法」（おねじ外径）と品番別「適合ノックアウト径」が出典です。
          公式の開口ルールは「おねじ外径＋約1〜2mm」。ねじなし電線管(E)用コネクタのねじ部は薄鋼電線管ねじ(CTC)と同じため、C管と同値です。
          厚鋼ねじのコネクタを使う場合は穴径が変わるので、その際は厚鋼側の値を見てください。
        </p>
        <p>
          管どうしのあき{DEFAULT_PIPE_GAP_MM}mmは、コネクタを締める作業スペースを確保するための実務慣行値です。
          内線規程に該当条文は無いことを確認済みです（3110-9・3110-10は「十分な容積」とのみ規定）。
        </p>
        <p>
          支持点はボックスとの接続箇所から{SUPPORT_FROM_BOX_MAX_MM}mm以下に取ってください（内線規程 3110-7条3項〔注2〕・3110-4図）。
        </p>
        <p>
          <span className="font-semibold">VE管・PF/CD管・プリカチューブ(F2)</span>も、
          管の太さではなくボックスコネクタの<span className="font-semibold">ねじ呼び</span>で穴径が決まります。
          同じ呼び径でも接続方法（Sタイプ／標準、BG／BC等）でねじ呼びが変わることがあるため、選択式にしています。
          外径の出典が無い呼び径（VE呼び10・100、PF・CD呼び36以上）は今回は対象外です。
          また、これらの管種は支持クリップのカタログを未確認のため、クリップ頂部の値は目安（下限）です。
          段を重ねる場合や蓋との干渉は必ず現場で確認してください。
        </p>
      </div>
    </div>
  );
}
