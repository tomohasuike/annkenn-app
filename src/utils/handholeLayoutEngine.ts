// src/utils/handholeLayoutEngine.ts
// ハンドホール（北関東工業）穴あけ発注仕様の計算エンジン。UIから独立した純粋関数。
//
// プルボックスの計算（現場でホールソーを開ける位置を出す）とは目的が違う。こちらは
// 「発注時にコネクター図を加工可能エリアのどこへ置くか」という発注仕様を組み立てる。
//
// 配置アルゴリズム（シェルフ＝棚詰め方式）:
//   1. 穴を径の大きい順に並べる。
//   2. 加工可能エリアの左下を原点(0,0)として、行（横並び）に入るだけ詰める。
//      行内の中心間ピッチ = (径A+径B)/2 + 離隔 を「切り上げ」でグリッドに丸める。
//      切り捨てると離隔が指定値を下回る恐れがあるため、必ず切り上げる
//      （プルボックス計算エンジンの丸め方針と同じ考え方）。
//   3. 1行に入りきらない穴は次の行へ。行の高さはその行の最大径で決め、次の行との間には
//      その行の最大離隔ぶんの隙間を空ける。
//   4. 加工可能エリアをはみ出す穴は配置せず、エラーとして返す（呼び出し側は必ず表示すること）。
//
// 加工可能エリアが未確認のサイズ（450以外）は、配置計算自体を行わずnullを返す。
// 呼び出し側は「配置なし・穴一覧のみ参考値」として扱うこと。
//
// 検証: handholeLayoutEngine.verify.ts（npx tsx で実行）

import {
  holeDiameterFor,
  minClearanceFor,
  machinableAreaFor,
  type ConnectorBrand,
  type FepSize,
  type KkEWidth,
  type MachinableArea,
  type PlacementGridMm,
  DEFAULT_PLACEMENT_GRID_MM,
  CONNECTOR_BRAND_LABELS,
} from '../constants/handholeKitakanto';

/** 配管条件1行分：この銘柄・このFEP呼び径の配管が何本あるか。 */
export interface ConduitRun {
  brand: ConnectorBrand;
  fepSize: FepSize;
  count: number;
}

export interface HandholeLayoutInput {
  width: KkEWidth;
  runs: ConduitRun[];
  /** 中心位置の丸め単位(mm)。既定5mm。 */
  gridMm?: PlacementGridMm;
}

/** 発注に必要な穴1つ分の仕様（配置前）。 */
export interface RequiredHole {
  id: string;
  label: string;
  brand: ConnectorBrand;
  fepSize: FepSize;
  diameterMm: number;
  /** この穴が要求する最低離隔(mm)。隣の穴との実際の離隔判定は両者のmaxを取る。 */
  clearanceMm: number;
}

/** 配置済みの穴。x/yは加工可能エリアの左下を原点とした中心位置(mm)。 */
export interface PlacedHole extends RequiredHole {
  x: number;
  y: number;
}

export type WarningLevel = 'error' | 'warn';

export interface LayoutWarning {
  level: WarningLevel;
  message: string;
}

export interface HandholeLayoutResult {
  width: KkEWidth;
  /** 加工可能エリア。未確認サイズはnull。 */
  area: MachinableArea | null;
  gridMm: PlacementGridMm;
  /** 発注に必要な穴の一覧（配置できたかどうかに関わらず全件）。 */
  requiredHoles: RequiredHole[];
  /** 加工可能エリア内に自動配置できた穴。 */
  placedHoles: PlacedHole[];
  /** エリア外・エリア未確認・データ欠落などで配置できなかった穴。 */
  unplacedHoles: RequiredHole[];
  warnings: LayoutWarning[];
}

/** step単位に切り上げる。丸めで離隔・境界の条件を絶対に下回らないよう、常に大きい方に寄せる。 */
function ceilTo(v: number, step: number): number {
  return step > 0 ? Math.ceil(v / step - 1e-9) * step : v;
}

function holeLabel(brand: ConnectorBrand, fep: FepSize): string {
  return `${CONNECTOR_BRAND_LABELS[brand]} FEP${fep}`;
}

/** 配管条件から、発注に必要な穴の一覧を作る（銘柄×FEP呼び径のデータが無いものは警告してスキップ）。 */
function buildRequiredHoles(runs: ConduitRun[], warnings: LayoutWarning[]): RequiredHole[] {
  const holes: RequiredHole[] = [];
  runs.forEach((run, ri) => {
    if (run.count <= 0) return;
    const diameter = holeDiameterFor(run.brand, run.fepSize);
    if (diameter == null) {
      warnings.push({
        level: 'error',
        message: `${CONNECTOR_BRAND_LABELS[run.brand]} × FEP${run.fepSize} は穴径データがありません（北関東工業カタログに記載が無い組み合わせです）。`,
      });
      return;
    }
    const clearanceMm = minClearanceFor(run.brand);
    for (let n = 0; n < run.count; n++) {
      holes.push({
        id: `r${ri}-${n}`,
        label: holeLabel(run.brand, run.fepSize),
        brand: run.brand,
        fepSize: run.fepSize,
        diameterMm: diameter,
        clearanceMm,
      });
    }
  });
  return holes;
}

/**
 * シェルフ（棚詰め）方式で穴を加工可能エリアに詰める。
 * 径の大きい順に詰めることで、行内の余りスペースを減らす一般的なヒューリスティック。
 */
function packHoles(
  holes: RequiredHole[],
  areaWidthMm: number,
  areaHeightMm: number,
  gridMm: number,
): { placed: PlacedHole[]; unplaced: RequiredHole[] } {
  const sorted = [...holes].sort((a, b) => b.diameterMm - a.diameterMm);
  const placed: PlacedHole[] = [];
  const unplaced: RequiredHole[] = [];

  let rowBaseY = 0; // このタイミングでの「次の行の下端」の目安(mm)
  let i = 0;

  while (i < sorted.length) {
    const rowHoles: RequiredHole[] = [];
    const xs: number[] = [];
    let j = i;

    while (j < sorted.length) {
      const h = sorted[j];
      let centerX: number;
      if (rowHoles.length === 0) {
        centerX = ceilTo(h.diameterMm / 2, gridMm);
      } else {
        const prev = rowHoles[rowHoles.length - 1];
        const gap = Math.max(h.clearanceMm, prev.clearanceMm);
        const pitch = ceilTo((prev.diameterMm + h.diameterMm) / 2 + gap, gridMm);
        centerX = xs[xs.length - 1] + pitch;
      }
      const rightEdge = centerX + h.diameterMm / 2;
      if (rightEdge > areaWidthMm + 1e-9) break; // この行にはもう入らない
      rowHoles.push(h);
      xs.push(centerX);
      j++;
    }

    if (rowHoles.length === 0) {
      // 1個も入らない＝この穴は単体でも幅方向に収まらない
      unplaced.push(sorted[i]);
      i++;
      continue;
    }

    const rowMaxDiameter = Math.max(...rowHoles.map(h => h.diameterMm));
    const centerYOffset = ceilTo(rowMaxDiameter / 2, gridMm);
    const absCenterY = rowBaseY + centerYOffset;
    const rowTopEdge = absCenterY + rowMaxDiameter / 2;

    if (rowTopEdge > areaHeightMm + 1e-9) {
      // この行は高さ方向に収まらない。以降の行も詰むほど高くなるので全部配置不可。
      for (let k = i; k < sorted.length; k++) unplaced.push(sorted[k]);
      break;
    }

    rowHoles.forEach((h, k) => placed.push({ ...h, x: xs[k], y: absCenterY }));

    const rowMaxClearance = Math.max(...rowHoles.map(h => h.clearanceMm));
    rowBaseY = ceilTo(rowTopEdge + rowMaxClearance, gridMm);
    i = j;
  }

  return { placed, unplaced };
}

export function computeHandholeLayout(input: HandholeLayoutInput): HandholeLayoutResult {
  const { width, runs, gridMm = DEFAULT_PLACEMENT_GRID_MM } = input;
  const warnings: LayoutWarning[] = [];
  const requiredHoles = buildRequiredHoles(runs, warnings);
  const area = machinableAreaFor(width);

  if (area == null) {
    warnings.push({
      level: 'warn',
      message:
        `KK-E型${width}サイズは加工可能エリアの実寸が未確認です。自動配置は行わず、穴一覧のみを参考値として出しています。` +
        `発注前に必ず北関東工業へ現物の加工図面を確認してください。`,
    });
    return {
      width, area: null, gridMm,
      requiredHoles, placedHoles: [], unplacedHoles: requiredHoles, warnings,
    };
  }

  const { placed, unplaced } = packHoles(requiredHoles, area.workableWidthMm, area.workableHeightMm, gridMm);

  if (unplaced.length > 0) {
    warnings.push({
      level: 'error',
      message: `${unplaced.length}個の穴が${area.faceLabel}の加工可能エリア（幅${area.workableWidthMm}×高さ${area.workableHeightMm}mm）に収まりません。本数を減らすか、サイズの大きいハンドホールを検討してください。`,
    });
  }

  return {
    width, area, gridMm,
    requiredHoles, placedHoles: placed, unplacedHoles: unplaced, warnings,
  };
}

/** 発注仕様として出す集計：銘柄×FEP呼び径×穴径ごとの本数。 */
export interface OrderLine {
  brand: ConnectorBrand;
  fepSize: FepSize;
  diameterMm: number;
  count: number;
}

export function summarizeOrder(result: HandholeLayoutResult): OrderLine[] {
  const m = new Map<string, OrderLine>();
  result.requiredHoles.forEach(h => {
    const key = `${h.brand}-${h.fepSize}`;
    const cur = m.get(key);
    if (cur) cur.count++;
    else m.set(key, { brand: h.brand, fepSize: h.fepSize, diameterMm: h.diameterMm, count: 1 });
  });
  return [...m.values()].sort((a, b) => a.fepSize - b.fepSize || a.brand.localeCompare(b.brand));
}
