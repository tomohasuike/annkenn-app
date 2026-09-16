// src/pages/tools/HandholeKnockoutCalc.tsx
// ハンドホール穴あけ（北関東工業・発注仕様モード）。
//
// プルボックスの穴あけ計算（現場でホールソーを開ける位置を出す）とは目的が違う。
// こちらは「北関東工業への発注時に、加工可能エリアのどこに何径の穴をどのコネクター銘柄で
// 配置するか」という発注仕様を組み立てて、原寸イメージの図と穴一覧を出す。
//
// 面・段の選び方（2026-09-16「FEP100なら何段詰まるかを見せて、上段/中段/下段のどこに
// 置くかを選べるようにしたい」という社長ご要望で変更）:
//   以前は面(A/B/C/D)へ自動で振り分けていたが、今は面もその中の「段」もユーザーが選ぶ。
//   面タブの中に段カードを縦に並べる構成は、プルボックス穴あけ(PullBoxKnockoutCalc.tsx)の
//   「段(tier)」UIとほぼ同じ発想（段を足す・段ごとに配管条件を足す・段を消す）。
//   段の中の配管の左右の並びだけは、これまで通り自動（径・離隔からピッチ計算）。
//
// KK-E型450サイズ（品名規格 450E-750）以外は加工可能エリアの実寸が未確認のため、
// 自動配置は行わず「参考値・要問い合わせ」として穴一覧のみを出す。

import { useEffect, useMemo, useState } from 'react';
import { Boxes, Plus, X, AlertTriangle, RotateCcw, Info, Download, Loader2 } from 'lucide-react';
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
  machinableAreasFor,
  HANDHOLE_FACE_ORDER,
  FACE_LABELS,
  type ConnectorBrand,
  type FepSize,
  type KkEWidth,
  type PlacementGridMm,
  type HandholeFace,
} from '../../constants/handholeKitakanto';
import {
  computeHandholeLayout,
  summarizeOrder,
  type ConduitRun,
} from '../../utils/handholeLayoutEngine';
import { generateHandholeOrderDxf, downloadDxfText, HandholeDxfExportError } from '../../utils/handholeDxfExport';
import HandholeDrawing from './HandholeDrawing';

const KKE450_TEMPLATE_URL = '/handhole-templates/KKE450_B75.dxf';

/** 1段ぶんの入力：この段に足した配管条件の一覧。段番号は面ごとの配列の並び順(index+1)で決まる。 */
interface RowInput {
  runs: { brand: ConnectorBrand; fepSize: FepSize; count: number }[];
}

type FaceRowsState = Record<HandholeFace, RowInput[]>;

const emptyFaceRows = (): FaceRowsState => ({ A: [{ runs: [] }], B: [], C: [], D: [] });

export default function HandholeKnockoutCalc() {
  const [width, setWidth] = useState<KkEWidth>(450);
  const [gridMm, setGridMm] = useState<PlacementGridMm>(DEFAULT_PLACEMENT_GRID_MM);
  // 工具（ベルトレンチ等）用の追加離隔(mm)。メーカー資料に数値の定めが無いため既定0=補正なし。
  // 大径コネクターは手締めだけでなく工具が必要になる場合があり、その分の余裕を現場判断で
  // 上乗せできるようにする（2026-09-16 社長ご指摘）。
  const [extraClearanceMm, setExtraClearanceMm] = useState(0);
  const [faceRows, setFaceRows] = useState<FaceRowsState>(emptyFaceRows);
  const [addBrand, setAddBrand] = useState<ConnectorBrand>('kkfit');
  const [addFep, setAddFep] = useState<FepSize>(50);
  const [addCount, setAddCount] = useState(1);
  const [dxfBusy, setDxfBusy] = useState(false);
  const [dxfError, setDxfError] = useState<string | null>(null);
  const [activeFace, setActiveFace] = useState<HandholeFace>('A');

  const areas = useMemo(() => machinableAreasFor(width), [width]);
  const allFacesUnconfirmed = HANDHOLE_FACE_ORDER.every(f => areas[f] == null);

  // 面ごとの段配列(faceRows)を、計算エンジンが受け取るフラットなConduitRun[]に変換する。
  // 段番号はUI側の配列index+1（1段目＝一番下）。
  const runs = useMemo<ConduitRun[]>(() => {
    const out: ConduitRun[] = [];
    HANDHOLE_FACE_ORDER.forEach(face => {
      faceRows[face].forEach((row, idx) => {
        row.runs.forEach(r => {
          if (r.count > 0) out.push({ face, row: idx + 1, brand: r.brand, fepSize: r.fepSize, count: r.count });
        });
      });
    });
    return out;
  }, [faceRows]);

  const result = useMemo(
    () => computeHandholeLayout({ width, runs, gridMm, extraClearanceMm }),
    [width, runs, gridMm, extraClearanceMm],
  );
  const orderLines = useMemo(() => summarizeOrder(result), [result]);
  const totalHoles = result.requiredHoles.length;

  const errors = result.warnings.filter(w => w.level === 'error');
  const warns = result.warnings.filter(w => w.level === 'warn');

  // サイズを切り替えた時など、選択中の面が確認できない面になっていたら、確認できている
  // 最初の面（無ければA面）に戻す。
  useEffect(() => {
    if (areas[activeFace] == null) {
      const firstConfirmed = HANDHOLE_FACE_ORDER.find(f => areas[f] != null);
      setActiveFace(firstConfirmed ?? 'A');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const activeFaceResult = result.faces.find(f => f.face === activeFace) ?? null;
  const activeFaceArea = areas[activeFace] ?? null;

  // ── 段・配管条件の操作 ──────────────────────────────────
  const addRow = (face: HandholeFace) =>
    setFaceRows(prev => ({ ...prev, [face]: [...prev[face], { runs: [] }] }));

  const removeRow = (face: HandholeFace, rowIdx: number) =>
    setFaceRows(prev => ({ ...prev, [face]: prev[face].filter((_, i) => i !== rowIdx) }));

  const addRunToRow = (face: HandholeFace, rowIdx: number) => {
    if (addCount <= 0) return;
    setFaceRows(prev => ({
      ...prev,
      [face]: prev[face].map((r, i) =>
        i === rowIdx ? { runs: [...r.runs, { brand: addBrand, fepSize: addFep, count: addCount }] } : r,
      ),
    }));
  };

  const removeRunFromRow = (face: HandholeFace, rowIdx: number, runIdx: number) =>
    setFaceRows(prev => ({
      ...prev,
      [face]: prev[face].map((r, i) => (i === rowIdx ? { runs: r.runs.filter((_, j) => j !== runIdx) } : r)),
    }));

  const reset = () => setFaceRows(emptyFaceRows());

  // 発注図面(DXF)ダウンロード可否。配置済みの穴が1件以上あり、
  // 未配置の穴が無い場合のみ許可する（穴が足りないまま発注してしまう事故を防ぐ）。
  const canDownloadDxf = result.placedHoles.length > 0 && result.unplacedHoles.length === 0;

  const downloadOrderDxf = async () => {
    if (!canDownloadDxf) return;
    setDxfBusy(true);
    setDxfError(null);
    try {
      const res = await fetch(KKE450_TEMPLATE_URL);
      if (!res.ok) {
        throw new Error(`テンプレートDXFの取得に失敗しました（HTTP ${res.status}）。`);
      }
      const templateText = await res.text();
      const dxfText = generateHandholeOrderDxf(templateText, result.placedHoles, width);
      downloadDxfText(dxfText, `KKE${width}_B75_発注図面_${new Date().toISOString().slice(0, 10)}.dxf`);
    } catch (e) {
      setDxfError(e instanceof HandholeDxfExportError ? e.message : `発注図面の生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDxfBusy(false);
    }
  };

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
            型式・サイズを選び、面(A/B/C/D)ごとに「段」を足して配管条件を入れると、北関東工業への発注仕様
            （加工可能エリア内のコネクター配置・穴一覧）を作ります。面も段もここで選んだ通りに配置します（自動では動かしません）。
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
        {!allFacesUnconfirmed ? (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
            <div className="font-bold">加工可能エリア（面・段はここでは自動で動かしません。下で面と段を選んで配管条件を入れてください）</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {HANDHOLE_FACE_ORDER.map(f => {
                const a = areas[f];
                return (
                  <span key={f}>
                    {FACE_LABELS[f]}:{' '}
                    {a ? (
                      <>幅{a.workableWidthMm}×高さ{a.workableHeightMm}mm{a.keepOutZones.length > 0 ? '（⊗マーク回避あり）' : ''}</>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-bold">未確認</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              このサイズ（{width}）は加工可能エリアの実寸が全4面（A〜D）とも<span className="font-bold">未確認</span>です。
              自動配置は行わず、穴一覧のみを参考値として出します。発注前に必ず北関東工業へ現物の加工図面を確認してください。
            </span>
          </div>
        )}
      </div>

      {/* 面タブ＋段カード */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-xs font-semibold text-slate-500 block">面・段ごとの配管条件</label>
          <div className="flex flex-wrap gap-2">
            {HANDHOLE_FACE_ORDER.map(f => {
              const fr = result.faces.find(x => x.face === f);
              const count = fr?.placedHoles.length ?? 0;
              const rowCount = faceRows[f].length;
              return (
                <button key={f} onClick={() => setActiveFace(f)} className={chip(activeFace === f) + ' !text-sm'}>
                  {FACE_LABELS[f]}
                  {rowCount > 0 && <span className={`ml-1 ${activeFace === f ? 'text-blue-100' : 'text-slate-400'}`}>({rowCount}段{count > 0 ? `・${count}穴` : ''})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {activeFaceArea == null && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{FACE_LABELS[activeFace]}は加工可能エリアの実寸が未確認です。段を足して配管条件を入れることはできますが、自動配置はされず参考値の一覧のみになります。</span>
          </div>
        )}

        {/* 段カード（配列の並び順＝下から1段目、2段目…） */}
        {faceRows[activeFace].map((row, rowIdx) => {
          const rowNum = rowIdx + 1;
          const rowResult = activeFaceResult?.rows.find(r => r.row === rowNum) ?? null;
          return (
            <div key={rowIdx} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/60 dark:bg-slate-800/30">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${rowResult && !rowResult.fits ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {FACE_LABELS[activeFace]} {rowNum}段目
                </span>
                <button onClick={() => removeRow(activeFace, rowIdx)} className="text-xs font-bold text-slate-400 hover:text-red-500 px-2 py-1">
                  この段を消す
                </button>
              </div>

              {/* 入っている配管条件。ラッパーは常に描画し、中身だけ切り替える
                  （空div→中身ありdivのように兄弟要素そのものが出たり消えたりすると、
                  「使用幅」表示の出現と同時タイミングでReactのDOM差分計算が混乱し、
                  本番ビルドで insertBefore の例外が起きたため、常設のラッパーに変更した。
                  2026-09-16 実際にクラッシュを再現して確認済み）。 */}
              <div className="flex flex-wrap gap-2 empty:hidden">
                {row.runs.map((r, ri) => (
                  <button
                    key={`${r.brand}-${r.fepSize}-${ri}`}
                    onClick={() => removeRunFromRow(activeFace, rowIdx, ri)}
                    className="group flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/30 border border-slate-200 dark:border-slate-700"
                  >
                    {CONNECTOR_BRAND_LABELS[r.brand]} FEP{r.fepSize} × {r.count}
                    <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500" />
                  </button>
                ))}
              </div>

              {/* 埋まり具合（面の実寸が確認できている場合のみ）。同上の理由で常設ラッパー。 */}
              <div className="empty:hidden">
                {activeFaceArea && rowResult && (
                  <p className={`text-[11px] ${rowResult.fits ? 'text-slate-400' : 'text-red-600 dark:text-red-400 font-bold'}`}>
                    この段の使用幅: 約{Math.ceil(rowResult.usedWidthMm)}mm / 横幅{activeFaceArea.workableWidthMm}mm
                    {!rowResult.fits && '（面に収まりません。下の警告を確認してください）'}
                  </p>
                )}
              </div>

              {/* 配管条件を足す */}
              <div className="space-y-2 pt-1">
                <label className="text-[11px] font-semibold text-slate-400 block">コネクター銘柄</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CONNECTOR_BRAND_ORDER.map(b => (
                    <button key={b} onClick={() => setAddBrand(b)} className={chip(addBrand === b) + ' !text-xs'}>
                      {CONNECTOR_BRAND_LABELS[b]}
                    </button>
                  ))}
                </div>
                <label className="text-[11px] font-semibold text-slate-400 block">FEP呼び径</label>
                <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
                  {FEP_SIZES.map(f => (
                    <button key={f} onClick={() => setAddFep(f)} className={chip(addFep === f) + ' !text-sm'}>
                      {f}
                    </button>
                  ))}
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
                    onClick={() => addRunToRow(activeFace, rowIdx)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    この段に追加
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <button
          onClick={() => addRow(activeFace)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 hover:border-blue-400 hover:text-blue-600"
        >
          <Plus className="w-4 h-4" />
          {FACE_LABELS[activeFace]}に段を足す（面の中で一番上に追加されます）
        </button>
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

      {/* 工具用の追加離隔 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-2">
        <label className="text-xs font-semibold text-slate-500 block">工具用の追加離隔（mm、既定0）</label>
        <div className="flex items-center gap-2">
          <input
            type="number" inputMode="numeric" min={0} value={extraClearanceMm}
            onChange={e => setExtraClearanceMm(Math.max(Number(e.target.value) || 0, 0))}
            className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
          />
          <span className="text-xs text-slate-400">mm（メーカー規定の10mm/30mmに上乗せ）</span>
        </div>
        <p className="text-[11px] text-slate-400">
          大径のコネクターは手締めでは締まらず、ベルトレンチ等の工具が必要になる場合があります。
          工具を使うための追加スペースはメーカー資料に定めが無いため、既定値は0（メーカー規定通り）です。
          現場の判断で必要な分をここで上乗せしてください。
        </p>
      </div>

      {/* 図（面ごとにタブ切り替え） */}
      {totalHoles > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
          <span className="text-xs font-semibold text-slate-500">加工図（発注仕様・実寸比）</span>
          <div className="flex flex-wrap gap-2">
            {HANDHOLE_FACE_ORDER.map(f => {
              const fr = result.faces.find(x => x.face === f);
              const count = fr?.placedHoles.length ?? 0;
              return (
                <button key={f} onClick={() => setActiveFace(f)} className={chip(activeFace === f) + ' !text-sm'}>
                  {FACE_LABELS[f]}
                  {count > 0 && <span className={`ml-1 ${activeFace === f ? 'text-blue-100' : 'text-slate-400'}`}>({count})</span>}
                </button>
              );
            })}
          </div>
          <HandholeDrawing
            area={activeFaceResult?.area ?? null}
            placedHoles={activeFaceResult?.placedHoles ?? []}
            rows={activeFaceResult?.rows ?? []}
          />
          {result.unplacedHoles.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <div className="text-xs font-bold text-red-700 dark:text-red-300 mb-1.5">未配置（面・段の指定にエラーがあるか、面の実寸が未確認です）</div>
              <div className="flex flex-wrap gap-2">
                {result.unplacedHoles.map(h => (
                  <span key={h.id} className="text-[11px] px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-bold">
                    {FACE_LABELS[h.face]}{h.row}段目 φ{h.diameterMm} {h.label}
                  </span>
                ))}
              </div>
            </div>
          )}
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

      {/* 発注図面(DXF)ダウンロード */}
      {totalHoles > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
          <label className="text-xs font-semibold text-slate-500 block">発注図面（DXF）</label>
          {allFacesUnconfirmed ? (
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                このサイズ（{width}）は加工図面への自動書き込みに<span className="font-bold">未対応</span>です
                （加工可能エリアの実寸がKK-E型450サイズ以外は未確認のため）。450サイズのみ対応しています。
              </span>
            </div>
          ) : result.unplacedHoles.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                配置できなかった穴が{result.unplacedHoles.length}件あるため、発注図面はダウンロードできません。
                上の警告を確認し、段の配管を減らすか、別の面・段を選び直してから再度お試しください。
              </span>
            </div>
          ) : null}
          <button
            onClick={downloadOrderDxf}
            disabled={!canDownloadDxf || dxfBusy}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
              canDownloadDxf && !dxfBusy
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            {dxfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            発注図面をダウンロード(DXF)
          </button>
          {dxfError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{dxfError}</span>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            北関東工業の空白発注図面（KKE450_B75.dxf・A/B/C/D 4面）に、配置済みの穴を面ごとに正しい位置へ
            CIRCLE・TEXTとして書き込みます。既存の図面データは変更しません。
          </p>
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
            <div className="text-xs font-semibold text-slate-500 mb-3">配置座標一覧（各面の加工可能エリア左下が原点）</div>
            {!allFacesUnconfirmed ? (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left py-1.5 font-semibold">穴</th>
                      <th className="text-center font-semibold">面</th>
                      <th className="text-center font-semibold">段</th>
                      <th className="text-right font-semibold">X</th>
                      <th className="text-right font-semibold">Y</th>
                      <th className="text-right font-semibold">径</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.placedHoles.map(h => (
                      <tr key={h.id} className="border-b border-slate-50 dark:border-slate-800/60">
                        <td className="py-1.5 text-slate-700 dark:text-slate-200">{h.label}</td>
                        <td className="text-center font-bold text-blue-600 dark:text-blue-400">{FACE_LABELS[h.face]}</td>
                        <td className="text-center tabular-nums text-slate-700 dark:text-slate-200">{h.row}</td>
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
          ユーザー自身が穴を開けるのではなく、ここで決めた配置（どの面の何段目のどこに何径の穴を、どのコネクター銘柄で）を
          北関東工業に伝えて加工してもらいます。
        </p>
        <p>
          <span className="font-semibold">面(A/B/C/D)と段は自動では動かしません。</span>
          面の中で「段」を足すと、その段は面の中で一番上に積まれます（1段目が一番下）。段の中の配管の左右の並びだけは、
          径の大きい順・離隔をグリッドに切り上げる方式で自動計算します。段の配管が面の横幅に収まらない・段を積み上げた高さが
          面の高さを超える・⊗マークと重なる、のいずれかに該当する場合は、他の面・段へは動かさずその場でエラーとして表示します。
        </p>
        <p>
          穴径は「配管のFEP呼び径×使用するコネクター銘柄」の2軸で決まります。出典は北関東工業のカタログ・コネクター一覧（2026-09-15確認）。
        </p>
        <p>
          コネクター同士の離隔は最低10mm以上（コネクターを使わない「穴のみ」加工は30mm以上）。中心位置は5mmまたは10mm刻みに丸めて配置します。
        </p>
        <p>
          <span className="font-semibold">加工可能エリアの実寸はKK-E型450サイズ（品名規格「450E-750」）のA/B/C/D全4面が確認できています。</span>
          A面・C面には⊗マーク（内部インサート）があり、この位置に穴を置こうとするとエラーになります（B面・D面には⊗マークはありません）。
          それ以外のサイズ（600・800・900・1000・1200・1500・1800・2000）は加工可能エリアの実寸が未確認のため、
          自動配置は行わず穴の一覧のみを参考値として出します。450サイズの比率をそのまま他サイズへ流用・外挿することはしていません
          （サイズごとに比率が異なる可能性が高いため）。発注前に必ず北関東工業へ現物の加工図面を確認してください。
        </p>
        <p>
          KK-R型・国交省型は今回未対応です（型だけ用意し、データは投入していません）。
        </p>
        <p>
          <span className="font-semibold">離隔10mm/30mmは、あくまでコネクター同士が机上で干渉しないための最小値です。</span>
          大径のコネクター（KKフィットの場合FEP100以上等）は、メーカー資料でも手締めでは不十分で
          工具（ベルトレンチ等）を使う運用が前提になっていますが、工具を使うための追加スペースは
          どのメーカー資料にも定めがありません。この計算には反映されていないため、該当する配管が
          あるときは警告を出します。必要な余裕は上の「工具用の追加離隔」で現場判断により上乗せしてください。
        </p>
      </div>
    </div>
  );
}
