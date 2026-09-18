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
  heightVariantsFor,
  defaultHeightVariantFor,
  HANDHOLE_FACE_ORDER,
  FACE_LABELS,
  FACE_OPPOSITE,
  type ConnectorBrand,
  type FepSize,
  type KkEWidth,
  type PlacementGridMm,
  type HandholeFace,
} from '../../constants/handholeKitakanto';
import {
  computeHandholeLayout,
  summarizeOrder,
  suggestConduitRuns,
  checkPlacementViolations,
  type ConduitRun,
  type ConduitRequest,
  type UnallocatedGroup,
  type PositionedHole,
} from '../../utils/handholeLayoutEngine';
import { generateHandholeOrderDxf, downloadDxfText, HandholeDxfExportError } from '../../utils/handholeDxfExport';
import HandholeDrawing from './HandholeDrawing';
import HandholePlanView from './HandholePlanView';

const KKE450_TEMPLATE_URL = '/handhole-templates/KKE450_B75.dxf';

/** 1段ぶんの入力：この段に足した配管条件の一覧。段番号はブロック内配列の並び順(index+1)で決まる。 */
interface RowInput {
  runs: { brand: ConnectorBrand; fepSize: FepSize; count: number }[];
}

/**
 * 面ごとの「ブロックの配列」。ブロック番号は配列index+1（1ブロック目＝面の中で一番下）。
 * 450・600E-600のようにブロックが1つしか無い面は常にblocks[0]だけを使う。
 * 600E-1200のように複数ブロックある面では、UIがブロックタブを出して選ばせる
 * （2026-09-18、北関東工業の「分割式」構造への対応）。
 */
type FaceRowsState = Record<HandholeFace, RowInput[][]>;

const emptyFaceRows = (): FaceRowsState => ({ A: [[{ runs: [] }]], B: [[]], C: [[]], D: [[]] });

/** face配下のblockIdxのRowInput配列を取得する。まだ無ければ空配列（ブロックを増やした直後等）。 */
const blockRowsOf = (faceRows: FaceRowsState, face: HandholeFace, blockIdx: number): RowInput[] =>
  faceRows[face][blockIdx] ?? [];

/**
 * suggestConduitRuns()が返したConduitRun[]（面・ブロック・段を指定済み）を、UIが持つ
 * FaceRowsState（面→ブロック配列→段配列）に変換する。「おすすめ割り付け」を実行した結果を
 * 面・段カードのUIにそのまま反映し、その後は普通に手で編集・上書きできるようにするため
 * （2026-09-18、社長ご要望「配管の太さと本数を入れたら勝手に割り付けてほしい」への対応）。
 */
/**
 * 配置済みの穴一覧に、ドラッグで手動調整した位置(manualPositions、穴IDキー)があれば
 * x/yを上書きする。手動調整していない穴はそのまま。
 */
function applyManualPositions<T extends { id: string; x: number; y: number }>(
  holes: T[],
  manualPositions: Record<string, { x: number; y: number }>,
): T[] {
  return holes.map(h => {
    const p = manualPositions[h.id];
    return p ? { ...h, x: p.x, y: p.y } : h;
  });
}

function runsToFaceRows(runs: ConduitRun[]): FaceRowsState {
  const result: FaceRowsState = { A: [], B: [], C: [], D: [] };
  for (const run of runs) {
    const blockIdx = (run.block ?? 1) - 1;
    const rowIdx = run.row - 1;
    const blocks = result[run.face];
    while (blocks.length <= blockIdx) blocks.push([]);
    while (blocks[blockIdx].length <= rowIdx) blocks[blockIdx].push({ runs: [] });
    blocks[blockIdx][rowIdx].runs.push({ brand: run.brand, fepSize: run.fepSize, count: run.count });
  }
  return result;
}

export default function HandholeKnockoutCalc() {
  const [width, setWidth] = useState<KkEWidth>(450);
  // 内空高さバリエーション（品名規格の末尾。北関東工業の「分割式」構造により、同じwidthでも
  // 組み合わせ次第で加工可能エリアのブロック構成が変わる。2026-09-18対応）。
  const [heightVariantCode, setHeightVariantCode] = useState<string>(() => defaultHeightVariantFor(450)?.code ?? '');
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
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);

  // ── おすすめ割り付け（2026-09-18 社長ご要望） ──────────────────────
  // 「配管の太さと本数だけ入力して、面・段はプログラムに割り付けさせたい」という要望への対応。
  // ここで作ったリクエスト一覧はUI専用の入力用状態で、実際の計算はsuggestConduitRuns()に委ねる。
  // 結果は面・段カードのfaceRowsにそのまま書き込むので、実行後は普通に手で調整できる
  // （ブラックボックスの自動配置ではなく、あくまで叩き台）。
  const [suggestRequests, setSuggestRequests] = useState<ConduitRequest[]>([]);
  const [suggestBrand, setSuggestBrand] = useState<ConnectorBrand>('kkfit');
  const [suggestFep, setSuggestFep] = useState<FepSize>(50);
  const [suggestCount, setSuggestCount] = useState(1);
  const [suggestUnallocated, setSuggestUnallocated] = useState<UnallocatedGroup[] | null>(null);

  // ── 自由配置（ドラッグでの微調整、2026-09-18） ──────────────────────
  // 「手でドラックで移動できるといいんだけどね。グリッドで動かして、後から寸法をつけるみたいな
  // 感じ」への対応。AskUserQuestionで確定した方針により、これは自動配置の結果を「並び替える」
  // ものであって、面・段の枠組み自体を作り直す独立モードではない。そのため、ここではrunsや
  // faceRowsは一切変えず、穴ID→ドラッグ後のmm座標のオーバーライドだけを別に持つ。
  // 穴IDが安定していること（requiredHoleId、handholeLayoutEngine.ts参照）が前提。
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});

  const handleHoleMove = (holeId: string, xMm: number, yMm: number) => {
    setManualPositions(prev => ({ ...prev, [holeId]: { x: xMm, y: yMm } }));
  };

  // グループドラッグ（2026-09-18 社長ご指摘「グルーピングしたものは一緒に動くという前提」への
  // 対応）。選択中の穴のうち1つをドラッグすると、選んだ穴全員が同じ移動量(dxMm,dyMm)だけ動く。
  // 各穴の「現在表示中の位置」（既存のmanualPositionsオーバーライドを含む）を起点に加算するため、
  // 個別ドラッグ(handleHoleMove)と挙動が揃う。
  const handleHoleGroupMove = (holeIds: string[], dxMm: number, dyMm: number) => {
    if (!displayedFaceResult) return;
    setManualPositions(prev => {
      const next = { ...prev };
      holeIds.forEach(id => {
        const current = displayedFaceResult.placedHoles.find(h => h.id === id);
        if (!current) return;
        next[id] = { x: current.x + dxMm, y: current.y + dyMm };
      });
      return next;
    });
  };

  // ── 複数選択→まとめて並べる（2026-09-18 社長ご要望） ──────────────────
  // 「それぞれ一個一個動かすのは難しい。グルーピングで均等割付け・指定割り付けができるといい」
  // への対応。選択自体は穴IDの集合(selectedHoleIds)を持つだけで、実際の並べ替えは
  // manualPositionsへのまとめ書き込みとして実装する（ドラッグ1本と仕組みは同じ）。
  // 穴IDに面が含まれるため、面をまたいだ選択が残っても実害は無い（表示中の面のチップにしか
  // 現れず、実行対象も表示中の面の穴に絞って計算する）。
  const [selectedHoleIds, setSelectedHoleIds] = useState<Set<string>>(new Set());
  const [pitchInputMm, setPitchInputMm] = useState(0);

  const toggleHoleSelect = (holeId: string) => {
    setSelectedHoleIds(prev => {
      const next = new Set(prev);
      if (next.has(holeId)) next.delete(holeId); else next.add(holeId);
      return next;
    });
  };

  // 選択した穴のうち、両端(現在の左端・右端の中心)はそのままに、間を等間隔に並べ直す。
  // CADの「均等割付け」と同じ考え方：端は動かさず、間だけ均す。
  const distributeSelectedEvenly = () => {
    if (!displayedFaceResult) return;
    const selected = displayedFaceResult.placedHoles.filter(h => selectedHoleIds.has(h.id));
    if (selected.length < 2) return;
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const maxX = sorted[sorted.length - 1].x;
    const step = (maxX - minX) / (sorted.length - 1);
    setManualPositions(prev => {
      const next = { ...prev };
      sorted.forEach((h, i) => {
        const xMm = Math.round((minX + step * i) / gridMm) * gridMm;
        next[h.id] = { x: xMm, y: h.y };
      });
      return next;
    });
  };

  // 選択した穴を、現在の中心位置を保ったまま指定ピッチ(mm)で並べ直す（中心から左右に展開）。
  // 実際の削孔図でもC面・D面に左右対称配置する例が複数確認できているため（2026-09-18調査）、
  // 左端基準ではなく中心基準にしている。
  const distributeSelectedWithPitch = () => {
    if (!displayedFaceResult || pitchInputMm <= 0) return;
    const selected = displayedFaceResult.placedHoles.filter(h => selectedHoleIds.has(h.id));
    if (selected.length < 2) return;
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const n = sorted.length;
    const centerX = (sorted[0].x + sorted[n - 1].x) / 2;
    const startX = centerX - (pitchInputMm * (n - 1)) / 2;
    setManualPositions(prev => {
      const next = { ...prev };
      sorted.forEach((h, i) => {
        const xMm = Math.round((startX + pitchInputMm * i) / gridMm) * gridMm;
        next[h.id] = { x: xMm, y: h.y };
      });
      return next;
    });
  };

  const heightVariants = useMemo(() => heightVariantsFor(width), [width]);
  const areas = useMemo(() => machinableAreasFor(width, heightVariantCode), [width, heightVariantCode]);
  const allFacesUnconfirmed = HANDHOLE_FACE_ORDER.every(f => areas[f] == null);
  const anyMultiBlock = HANDHOLE_FACE_ORDER.some(f => (areas[f]?.blocks.length ?? 1) > 1);

  // サイズを切り替えたら、そのサイズの既定バリエーションに戻す（サイズごとにバリエーションの
  // 品名規格コードが違うため、前のサイズのコードを引き継ぐと必ず未確認扱いになってしまう）。
  useEffect(() => {
    setHeightVariantCode(defaultHeightVariantFor(width)?.code ?? '');
  }, [width]);

  // 面ごとのブロック配列(faceRows)を、計算エンジンが受け取るフラットなConduitRun[]に変換する。
  // ブロック番号・段番号はUI側の配列index+1（1ブロック目・1段目＝一番下）。
  const runs = useMemo<ConduitRun[]>(() => {
    const out: ConduitRun[] = [];
    HANDHOLE_FACE_ORDER.forEach(face => {
      faceRows[face].forEach((blockRows, blockIdx) => {
        blockRows.forEach((row, rowIdx) => {
          row.runs.forEach(r => {
            if (r.count > 0) {
              out.push({ face, block: blockIdx + 1, row: rowIdx + 1, brand: r.brand, fepSize: r.fepSize, count: r.count });
            }
          });
        });
      });
    });
    return out;
  }, [faceRows]);

  const result = useMemo(
    () => computeHandholeLayout({ width, heightVariantCode, runs, gridMm, extraClearanceMm }),
    [width, heightVariantCode, runs, gridMm, extraClearanceMm],
  );
  const orderLines = useMemo(() => summarizeOrder(result), [result]);
  const totalHoles = result.requiredHoles.length;

  const errors = result.warnings.filter(w => w.level === 'error');
  const warns = result.warnings.filter(w => w.level === 'warn');

  // サイズ・高さバリエーションを切り替えた時など、選択中の面が確認できない面になっていたら、
  // 確認できている最初の面（無ければA面）に戻す。
  useEffect(() => {
    if (areas[activeFace] == null) {
      const firstConfirmed = HANDHOLE_FACE_ORDER.find(f => areas[f] != null);
      setActiveFace(firstConfirmed ?? 'A');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, heightVariantCode]);

  const activeFaceResult = result.faces.find(f => f.face === activeFace) ?? null;
  const activeFaceArea = areas[activeFace] ?? null;
  const activeBlockCount = activeFaceArea?.blocks.length ?? 1;

  // ドラッグで手動調整した位置を反映した表示用の結果。runs・faceRows自体は変えないので、
  // 面・段の切り替えやリロード後は自動配置の結果に戻る（manualPositionsはこの面の表示専用）。
  const displayedFaceResult = useMemo(() => {
    if (!activeFaceResult) return null;
    return {
      ...activeFaceResult,
      placedHoles: applyManualPositions(activeFaceResult.placedHoles, manualPositions),
      rows: activeFaceResult.rows.map(r => ({ ...r, placedHoles: applyManualPositions(r.placedHoles, manualPositions) })),
    };
  }, [activeFaceResult, manualPositions]);

  // ドラッグ・均等割付け・指定ピッチで調整した位置を反映した、全面ぶんの配置済み穴一覧。
  // 「配置座標一覧」表・発注図面(DXF)は見た目のプレビューではなく実際に工場へ渡す仕様なので、
  // 調整結果を反映しないと「画面では直したのに発注データは古いまま」という事故になる
  // （2026-09-18、社長の「一個一個動かすのは難しい」フィードバックへの対応中に気づいた
  // 設計漏れ。ドラッグ機能を追加した直後は画面表示だけに反映していた）。
  const displayedPlacedHoles = useMemo(
    () => applyManualPositions(result.placedHoles, manualPositions),
    [result.placedHoles, manualPositions],
  );

  // 全面ぶんの、離隔不足・⊗マーク重なり・エリア外等の違反一覧（面をまたいで集計）。
  // ドラッグ自体は止めず、違反している穴だけ縁を赤くする（AskUserQuestionで確定した方針
  // 「色で知らせるだけ」）が、発注図面(DXF)は違反が残っている間はダウンロードさせない
  // （画面上の警告を見落としたまま工場に送ってしまう事故を防ぐため）。
  const allFaceViolations = useMemo(() => {
    const out: { face: HandholeFace; holeId: string; reasons: string[] }[] = [];
    HANDHOLE_FACE_ORDER.forEach(face => {
      const area = areas[face];
      const faceResult = result.faces.find(f => f.face === face);
      if (!area || !faceResult) return;
      const positioned: PositionedHole[] = applyManualPositions(faceResult.placedHoles, manualPositions).map(h => ({
        id: h.id, label: h.label, x: h.x, y: h.y, footprintDiameterMm: h.footprintDiameterMm, clearanceMm: h.clearanceMm,
      }));
      checkPlacementViolations(positioned, area).forEach(v => out.push({ face, ...v }));
    });
    return out;
  }, [areas, result.faces, manualPositions]);

  const violatingHoleIds = useMemo(
    () => new Set(allFaceViolations.filter(v => v.face === activeFace).map(v => v.holeId)),
    [allFaceViolations, activeFace],
  );

  // 選択中の面・バリエーションでブロック数が減った（例：ブロック2を選んだ状態で450に切り替えた）
  // 場合、存在するブロックへ戻す。
  useEffect(() => {
    if (activeBlockIndex > activeBlockCount - 1) setActiveBlockIndex(Math.max(activeBlockCount - 1, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFace, activeBlockCount]);

  // ── ブロック・段・配管条件の操作 ──────────────────────────────────
  const addRow = (face: HandholeFace, blockIdx: number) =>
    setFaceRows(prev => {
      const blocks = [...prev[face]];
      while (blocks.length <= blockIdx) blocks.push([]);
      blocks[blockIdx] = [...blocks[blockIdx], { runs: [] }];
      return { ...prev, [face]: blocks };
    });

  const removeRow = (face: HandholeFace, blockIdx: number, rowIdx: number) =>
    setFaceRows(prev => {
      const blocks = [...prev[face]];
      blocks[blockIdx] = (blocks[blockIdx] ?? []).filter((_, i) => i !== rowIdx);
      return { ...prev, [face]: blocks };
    });

  const addRunToRow = (face: HandholeFace, blockIdx: number, rowIdx: number) => {
    if (addCount <= 0) return;
    setFaceRows(prev => {
      const blocks = [...prev[face]];
      blocks[blockIdx] = (blocks[blockIdx] ?? []).map((r, i) =>
        i === rowIdx ? { runs: [...r.runs, { brand: addBrand, fepSize: addFep, count: addCount }] } : r,
      );
      return { ...prev, [face]: blocks };
    });
  };

  const removeRunFromRow = (face: HandholeFace, blockIdx: number, rowIdx: number, runIdx: number) =>
    setFaceRows(prev => {
      const blocks = [...prev[face]];
      blocks[blockIdx] = (blocks[blockIdx] ?? []).map((r, i) => (i === rowIdx ? { runs: r.runs.filter((_, j) => j !== runIdx) } : r));
      return { ...prev, [face]: blocks };
    });

  const reset = () => {
    setFaceRows(emptyFaceRows());
    setSuggestRequests([]);
    setSuggestUnallocated(null);
    setManualPositions({});
    setSelectedHoleIds(new Set());
  };

  // サイズ・高さバリエーションを切り替えると加工可能エリア自体が変わり、ドラッグで
  // 調整した位置の意味が無くなる（面の大きさ・⊗マーク位置が違うため）ので、都度クリアする。
  useEffect(() => {
    setManualPositions({});
    setSelectedHoleIds(new Set());
  }, [width, heightVariantCode]);

  // ── おすすめ割り付けの操作 ──────────────────────────────────
  const addSuggestRequest = () => {
    if (suggestCount <= 0) return;
    setSuggestRequests(prev => [...prev, { brand: suggestBrand, fepSize: suggestFep, count: suggestCount }]);
  };

  const removeSuggestRequest = (idx: number) =>
    setSuggestRequests(prev => prev.filter((_, i) => i !== idx));

  const applySuggestion = () => {
    if (suggestRequests.length === 0) return;
    const result = suggestConduitRuns({ width, heightVariantCode, requests: suggestRequests, gridMm, extraClearanceMm });
    setFaceRows(runsToFaceRows(result.runs));
    setSuggestUnallocated(result.unallocated);
    const firstFace = HANDHOLE_FACE_ORDER.find(f => result.runs.some(r => r.face === f));
    if (firstFace) {
      setActiveFace(firstFace);
      setActiveBlockIndex(0);
    }
  };

  // 発注図面(DXF)ダウンロード可否。配置済みの穴が1件以上あり、未配置の穴が無く、
  // ドラッグ等での調整後に離隔不足・⊗マーク重なり等の違反が残っていない場合のみ許可する
  // （穴が足りない・重なったまま発注してしまう事故を防ぐ）。
  // 発注図面(DXF)への自動書き込みはKK-E型450サイズのテンプレートのみ用意されている
  // （handholeDxfExport.tsのgenerateHandholeOrderDxfが450以外を明示的に拒否する）。
  // 600等は加工可能エリア自体は実装済みでもDXFテンプレートが無いため、widthで別途ガードする。
  const canDownloadDxf = width === 450 && result.placedHoles.length > 0
    && result.unplacedHoles.length === 0 && allFaceViolations.length === 0;

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
      const dxfText = generateHandholeOrderDxf(templateText, displayedPlacedHoles, width);
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

        {/* 内空高さバリエーション（品名規格の末尾）。北関東工業の「分割式」構造により、同じ幅でも
            組み合わせ次第で加工可能エリアのブロック構成が変わるため、バリエーションが2つ以上ある
            サイズだけ選ばせる（1つしか無いサイズでは表示しない）。 */}
        {heightVariants.length > 1 && (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-slate-500 block">内空高さ（分割ピースの組み合わせ）</label>
            <div className="flex flex-wrap gap-2">
              {heightVariants.map(v => (
                <button key={v.code} onClick={() => setHeightVariantCode(v.code)} className={chip(heightVariantCode === v.code) + ' !text-xs'}>
                  {v.innerHeightMm}mm（{v.pieceCombo}）
                </button>
              ))}
            </div>
          </div>
        )}

        {!allFacesUnconfirmed ? (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
            <div className="font-bold">加工可能エリア（面・ブロック・段はここでは自動で動かしません。下で選んで配管条件を入れてください）</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {HANDHOLE_FACE_ORDER.map(f => {
                const a = areas[f];
                return (
                  <span key={f}>
                    {FACE_LABELS[f]}:{' '}
                    {a ? (
                      <>
                        幅{a.workableWidthMm}×高さ{a.workableHeightMm}mm
                        {a.blocks.length > 1 ? `（${a.blocks.length}ブロック構成）` : ''}
                        {a.keepOutZones.length > 0 ? '（⊗マーク回避あり）' : ''}
                      </>
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

      {/* おすすめ割り付け（配管の太さ・本数だけ入れて自動で割り付ける） */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
        <label className="text-xs font-semibold text-slate-500 block">配管本数から自動割り付け（おすすめ）</label>
        <p className="text-[11px] text-slate-400">
          面・ブロック・段を決めずに、配管の銘柄・FEP呼び径・本数だけ入れると、プログラムが空いている面・段に
          自動で詰めます。実行すると下の「面・段ごとの配管条件」が上書きされますが、その後は普通に手で調整できます
          （面の順番はA→B→C→Dの固定です。配管ルートの都合で特定の面を避けたい場合は、実行後に手で移動してください）。
        </p>

        <div className="flex flex-wrap gap-2 empty:hidden">
          {suggestRequests.map((r, i) => (
            <button
              key={`${r.brand}-${r.fepSize}-${i}`}
              onClick={() => removeSuggestRequest(i)}
              className="group flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/30 border border-slate-200 dark:border-slate-700"
            >
              {CONNECTOR_BRAND_LABELS[r.brand]} FEP{r.fepSize} × {r.count}
              <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500" />
            </button>
          ))}
        </div>

        <div className="space-y-2 pt-1">
          <label className="text-[11px] font-semibold text-slate-400 block">コネクター銘柄</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CONNECTOR_BRAND_ORDER.map(b => (
              <button key={b} onClick={() => setSuggestBrand(b)} className={chip(suggestBrand === b) + ' !text-xs'}>
                {CONNECTOR_BRAND_LABELS[b]}
              </button>
            ))}
          </div>
          <label className="text-[11px] font-semibold text-slate-400 block">FEP呼び径</label>
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
            {FEP_SIZES.map(f => (
              <button key={f} onClick={() => setSuggestFep(f)} className={chip(suggestFep === f) + ' !text-sm'}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">本数</span>
              <input
                type="number" inputMode="numeric" min={1} value={suggestCount}
                onChange={e => setSuggestCount(Math.max(Number(e.target.value) || 0, 0))}
                className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
              />
            </div>
            <button
              onClick={addSuggestRequest}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold transition-colors"
            >
              <Plus className="w-4 h-4" />
              リクエストに追加
            </button>
            <button
              onClick={applySuggestion}
              disabled={suggestRequests.length === 0}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                suggestRequests.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              おすすめ割り付けを作成（下を上書き）
            </button>
          </div>
        </div>

        {suggestUnallocated != null && (
          <div className="empty:hidden">
            {suggestUnallocated.length > 0 ? (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  どの面・ブロックにも入りきらなかった分:{' '}
                  {suggestUnallocated.map(u => `${CONNECTOR_BRAND_LABELS[u.brand]} FEP${u.fepSize} × ${u.count}本`).join('、')}。
                  本数を減らすか、サイズ・高さバリエーションを見直してください。
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">全て割り付けられました。</p>
            )}
          </div>
        )}
      </div>

      {/* 面タブ＋ブロックタブ＋段カード */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          {/* 平面図（真上から見た模式図）で面を選ぶ。2026-09-18 社長ご指摘：「A/B/C/D面は
              基準の取り方で変わるので平面図が重要」「ハンドホールは直進が多いのでA⇔C・B⇔Dが
              対になっていることも考慮」への対応。実際の削孔図（オーイケ製16基）でも面ごとの
              使い方に偏りがある実例が確認できている（HandholePlanView.tsx冒頭コメント参照）。 */}
          <HandholePlanView
            activeFace={activeFace}
            onSelectFace={setActiveFace}
            faceHoleCounts={Object.fromEntries(
              HANDHOLE_FACE_ORDER.map(f => [f, result.faces.find(x => x.face === f)?.placedHoles.length ?? 0]),
            )}
          />
          <div className="flex-1 min-w-0 space-y-2 w-full">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-semibold text-slate-500 block">面・段ごとの配管条件</label>
              <div className="flex flex-wrap gap-2">
                {HANDHOLE_FACE_ORDER.map(f => {
                  const fr = result.faces.find(x => x.face === f);
                  const count = fr?.placedHoles.length ?? 0;
                  const rowCount = faceRows[f].reduce((sum, block) => sum + block.length, 0);
                  return (
                    <button key={f} onClick={() => setActiveFace(f)} className={chip(activeFace === f) + ' !text-sm'}>
                      {FACE_LABELS[f]}
                      {rowCount > 0 && <span className={`ml-1 ${activeFace === f ? 'text-blue-100' : 'text-slate-400'}`}>({rowCount}段{count > 0 ? `・${count}穴` : ''})</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              配管は直進して反対側の面から出ることが多いため、{FACE_LABELS[activeFace]}を選んだ場合、
              対辺は{FACE_LABELS[FACE_OPPOSITE[activeFace]]}になります（左の模式図で水色表示）。
              L字に曲げる場合は隣り合う面（{FACE_LABELS[activeFace]}以外）を選んでください。
            </p>
          </div>
        </div>

        {activeFaceArea == null && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{FACE_LABELS[activeFace]}は加工可能エリアの実寸が未確認です。段を足して配管条件を入れることはできますが、自動配置はされず参考値の一覧のみになります。</span>
          </div>
        )}

        {/* ブロックタブ（北関東工業の「分割式」構造で、面の中の加工可能エリアが上下複数ブロックに
            分かれる場合のみ表示。ブロック間はピースの接合部で加工不可のため、段はブロックをまたいで
            積み上がらない。ブロックが1つしかない面（450・600E-600等）ではタブ自体を出さない。 */}
        {activeBlockCount > 1 && (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: activeBlockCount }, (_, blockIdx) => {
              const rowCount = blockRowsOf(faceRows, activeFace, blockIdx).length;
              const blockHeightMm = activeFaceArea?.blocks[blockIdx]?.heightMm;
              return (
                <button key={blockIdx} onClick={() => setActiveBlockIndex(blockIdx)} className={chip(activeBlockIndex === blockIdx) + ' !text-xs'}>
                  ブロック{blockIdx + 1}（{blockIdx === 0 ? '下' : blockIdx === activeBlockCount - 1 ? '上' : '中'}
                  {blockHeightMm != null ? `・高さ${blockHeightMm}mm` : ''}）
                  {rowCount > 0 && <span className={activeBlockIndex === blockIdx ? 'text-blue-100' : 'text-slate-400'}> {rowCount}段</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* 段カード（配列の並び順＝下から1段目、2段目…） */}
        {blockRowsOf(faceRows, activeFace, activeBlockIndex).map((row, rowIdx) => {
          const rowNum = rowIdx + 1;
          const blockNum = activeBlockIndex + 1;
          const rowResult = activeFaceResult?.rows.find(r => r.block === blockNum && r.row === rowNum) ?? null;
          return (
            <div key={rowIdx} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/60 dark:bg-slate-800/30">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${rowResult && !rowResult.fits ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {FACE_LABELS[activeFace]} {activeBlockCount > 1 ? `ブロック${blockNum} ` : ''}{rowNum}段目
                </span>
                <button onClick={() => removeRow(activeFace, activeBlockIndex, rowIdx)} className="text-xs font-bold text-slate-400 hover:text-red-500 px-2 py-1">
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
                    onClick={() => removeRunFromRow(activeFace, activeBlockIndex, rowIdx, ri)}
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
                    {!rowResult.fits && `（配置できなかった穴が${rowResult.requiredHoles.length - rowResult.placedHoles.length}本あります。下の警告を確認してください）`}
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
                    onClick={() => addRunToRow(activeFace, activeBlockIndex, rowIdx)}
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
          onClick={() => addRow(activeFace, activeBlockIndex)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 hover:border-blue-400 hover:text-blue-600"
        >
          <Plus className="w-4 h-4" />
          {FACE_LABELS[activeFace]}{activeBlockCount > 1 ? `のブロック${activeBlockIndex + 1}` : ''}に段を足す（一番上に追加されます）
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
            placedHoles={displayedFaceResult?.placedHoles ?? []}
            rows={displayedFaceResult?.rows ?? []}
            onHoleMove={handleHoleMove}
            onHoleGroupMove={handleHoleGroupMove}
            selectedHoleIds={selectedHoleIds}
            violatingHoleIds={violatingHoleIds}
            gridMm={gridMm}
          />

          {/* 複数選択→グループ化（2026-09-18 社長ご要望）。
              最初は「選択→均等割付け／指定ピッチ」ボタンだけで実装したが、社長から
              「俺が言ってるグルーピングは、グルーピングしたものは一緒に動くという前提。
              これではグルーピングの意味がない、ただ離隔距離が取れますよというだけになってる」
              とのご指摘を受け、選択＝グループとして「上の加工図で1つドラッグすると選んだ穴が
              全部一緒に動く」機能をHandholeDrawing側に追加した（onHoleGroupMove）。
              均等割付け・指定ピッチのボタンは、グループを整列させる別の手段として残している。 */}
          {displayedFaceResult && displayedFaceResult.placedHoles.length >= 2 && (() => {
            const selectedInFace = displayedFaceResult.placedHoles.filter(h => selectedHoleIds.has(h.id));
            return (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-slate-50/60 dark:bg-slate-800/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-semibold text-slate-500 block">複数の穴を選んでグループ化</label>
                  {selectedInFace.length > 0 && (
                    <button
                      onClick={() => setSelectedHoleIds(new Set())}
                      className="text-xs font-bold text-slate-400 hover:text-red-500"
                    >
                      選択を解除
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {displayedFaceResult.placedHoles.map(h => (
                    <button
                      key={h.id}
                      onClick={() => toggleHoleSelect(h.id)}
                      className={chip(selectedHoleIds.has(h.id)) + ' !text-xs'}
                    >
                      {h.label}（x={Math.round(h.x)}）
                    </button>
                  ))}
                </div>
                {selectedInFace.length < 2 ? (
                  <p className="text-[11px] text-slate-400">2つ以上選ぶとグループになり、上の加工図でそのうちの1つをドラッグすると全部一緒に動きます（均等割付け・指定ピッチも使えるようになります）。</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={distributeSelectedEvenly}
                      className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
                    >
                      均等割付け（両端はそのまま、間を均等に）
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">指定ピッチ(mm)</span>
                      <input
                        type="number" inputMode="numeric" min={0} value={pitchInputMm}
                        onChange={e => setPitchInputMm(Math.max(Number(e.target.value) || 0, 0))}
                        className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
                      />
                      <button
                        onClick={distributeSelectedWithPitch}
                        disabled={pitchInputMm <= 0}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                          pitchInputMm > 0
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        このピッチで並べる
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-slate-400">
                  選んだ穴は上の加工図で縁が青くなり、1つをドラッグすると選んだ穴全部が同じ量だけ一緒に動きます
                  （相対位置は保ったまま平行移動）。均等割付け・指定ピッチのボタンは中心位置(x)だけを並べ替えます
                  （yは変えません）。グリッド単位に丸めるため、ピッチがグリッドの倍数でない場合はわずかにずれる
                  ことがあります。離隔不足・⊗マーク重なりが出た場合は上の図で穴の縁が赤くなるので確認してください。
                </p>
              </div>
            );
          })()}

          {result.unplacedHoles.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <div className="text-xs font-bold text-red-700 dark:text-red-300 mb-1.5">未配置（面・段の指定にエラーがあるか、面の実寸が未確認です）</div>
              <div className="flex flex-wrap gap-2">
                {result.unplacedHoles.map(h => {
                  const showBlock = (areas[h.face]?.blocks.length ?? 1) > 1;
                  return (
                    <span key={h.id} className="text-[11px] px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-bold">
                      {FACE_LABELS[h.face]}{showBlock ? `ブロック${h.block} ` : ''}{h.row}段目 φ{h.diameterMm} {h.label}
                    </span>
                  );
                })}
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
          {width !== 450 ? (
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                このサイズ（{width}）は加工図面への自動書き込みに<span className="font-bold">未対応</span>です
                （北関東工業の空白発注図面テンプレートはKK-E型450サイズぶんしか用意していないため）。
                {!allFacesUnconfirmed && '加工可能エリアの計算・図の表示・穴一覧は使えます。'}450サイズのみDXF自動生成に対応しています。
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
          ) : allFaceViolations.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                ドラッグ・均等割付け等で調整した位置に、離隔不足や⊗マーク重なりなどの問題が
                {new Set(allFaceViolations.map(v => v.face)).size}面に残っているため、発注図面はダウンロードできません
                （{Array.from(new Set(allFaceViolations.map(v => v.face))).map(f => FACE_LABELS[f]).join('・')}）。
                加工図で縁が赤い穴を確認し、位置を直してから再度お試しください。
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
                      {anyMultiBlock && <th className="text-center font-semibold">ブロック</th>}
                      <th className="text-center font-semibold">段</th>
                      <th className="text-right font-semibold">X</th>
                      <th className="text-right font-semibold">Y</th>
                      <th className="text-right font-semibold">径</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPlacedHoles.map(h => {
                      const violating = allFaceViolations.some(v => v.holeId === h.id);
                      return (
                        <tr key={h.id} className={`border-b border-slate-50 dark:border-slate-800/60 ${violating ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                          <td className="py-1.5 text-slate-700 dark:text-slate-200">{h.label}{violating && <span className="ml-1 text-red-600 dark:text-red-400 font-bold">要確認</span>}</td>
                          <td className="text-center font-bold text-blue-600 dark:text-blue-400">{FACE_LABELS[h.face]}</td>
                          {anyMultiBlock && <td className="text-center tabular-nums text-slate-700 dark:text-slate-200">{h.block}</td>}
                          <td className="text-center tabular-nums text-slate-700 dark:text-slate-200">{h.row}</td>
                          <td className="text-right tabular-nums text-slate-700 dark:text-slate-200">{h.x}</td>
                          <td className="text-right tabular-nums text-slate-700 dark:text-slate-200">{h.y}</td>
                          <td className="text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">φ{h.diameterMm}</td>
                        </tr>
                      );
                    })}
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
          <span className="font-semibold">面(A/B/C/D)・ブロック・段は自動では動かしません。</span>
          面の中で「段」を足すと、その段は（選んでいるブロックの中で）一番上に積まれます（1段目が一番下）。段の中の配管の左右の並びだけは、
          径の大きい順・離隔をグリッドに切り上げる方式で自動計算します。並べた位置が⊗マーク等の避けるべき領域と重なる場合は、その領域の
          先まで自動で位置をずらして配置し直します（2026-09-18対応。以前はその穴を諦めるだけでしたが、動かせる範囲があれば動かします）。
          ずらした結果も含めて、段の配管がブロックの横幅に収まらない・段を積み上げた高さがブロックの高さを超える場合は、その穴だけを
          配置対象外にします（他の穴は影響を受けず配置されたままになります）。段全体・他の面・ブロックへは動かしません。
        </p>
        <p>
          <span className="font-semibold">「ブロック」とは何か:</span> 北関東工業のKK-E型は「分割式」（縁塊+スラブ+継胴+ベースを上下に
          積み重ねる構造。大型ラフタークレーンが不要になる標準仕様）で、サイズ・内空高さの組み合わせによっては、面の中の加工可能エリア自体が
          上下複数の「ブロック」に分かれ、ブロック同士の接合部（ピースの継ぎ目）は加工不可になります。段はブロックをまたいで積み上がりません。
          ブロックが1つしかない面（450・600E-600等）ではブロック選択自体を表示しません。
        </p>
        <p>
          穴径は「配管のFEP呼び径×使用するコネクター銘柄」の2軸で決まります。出典は北関東工業のカタログ・コネクター一覧（2026-09-15確認）。
        </p>
        <p>
          コネクター同士の離隔は最低10mm以上（コネクターを使わない「穴のみ」加工は30mm以上）。中心位置は5mmまたは10mm刻みに丸めて配置します。
        </p>
        <p>
          <span className="font-semibold">加工可能エリアの実寸が確認できているのは、KK-E型450サイズ「450E-750」（単一ブロック）、
          600サイズ「600E-600」（S15+B45、単一ブロック）・「600E-1200」（S45+B75、上下2ブロック）、
          900サイズ「900E-900」（S45+B45、上下2ブロック）・「900E-1200」（S45+B75、上下2ブロック）の5バリエーションのみです。</span>
          A面・C面には⊗マーク（内部インサート）があり、この位置に穴を置こうとするとエラーになります（B面・D面には⊗マークはありません）。
          <span className="font-semibold">実際の発注データ調査（PLANEST-EF拾いデータ＋栃木県内9自治体の入札設計書、2026-09-18）では
          900×900×900mm・900×900×1200mmが最も多く使われており、450サイズの実績はほぼ確認できませんでした。</span>
          上記以外のサイズ・高さバリエーション（800・1000・1200・1500・1800・2000サイズ、および600・900サイズの残りの高さバリエーション）
          は加工可能エリアの実寸が未確認のため、自動配置は行わず穴の一覧のみを参考値として出します。確認済みバリエーションの比率をそのまま
          他へ流用・外挿することはしていません（サイズ・高さ構成ごとに比率が異なる可能性が高いため）。発注前に必ず北関東工業へ現物の加工図面を確認してください。
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
