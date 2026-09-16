// src/utils/handholeLayoutEngine.ts
// ハンドホール（北関東工業）穴あけ発注仕様の計算エンジン。UIから独立した純粋関数。
//
// プルボックスの計算（現場でホールソーを開ける位置を出す）とは目的が違う。こちらは
// 「発注時にコネクター図を加工可能エリアのどこへ置くか」という発注仕様を組み立てる。
//
// 面・段の選び方（2026-09-16 社長ご指摘で「段」対応化）:
//   以前は「A面がいっぱいになったら自動でB面へ、C面へ…」という完全自動振り分けだったが、
//   「FEP100なら何段詰まるかを見せて、上段/中段/下段のどこに置くかを選べるようにしたい」という
//   要望を受け、面（A/B/C/D）に加えて面の中の「段」もユーザーが明示的に選ぶ方式に変更した。
//   配管条件(ConduitRun)は必ずどの面(face)・何段目(row。1始まり、1段目=一番下)かを持つ。
//   段の中の配置（左から右に何個並ぶか）だけは今まで通り自動（径・離隔からピッチを計算し、
//   グリッドに丸める＝プルボックス計算エンジンの丸め方針と同じ考え方）。
//
// 配置アルゴリズム:
//   1. 面ごとに、その面に割り当てられた配管をさらに段番号でグループ化する。
//   2. 段は面の中で1段目から順に下から積み上げる（段の高さ＝その段の中の一番大きい径。
//      次の段との間の隙間＝その段とその上の段の中の最大離隔）。プルボックス計算エンジンの
//      「行（棚詰め）」ロジックと同じ考え方を、自動で次の行へ回すのではなく
//      ユーザーが選んだ段番号ごとに適用する。
//   3. 段の中の左右位置は、径の大きい順に並べ、中心間ピッチ＝(径A+径B)/2+離隔を
//      「切り上げ」でグリッドに丸めて計算する（切り捨てると離隔が指定値を下回るため）。
//   4. 面・段はユーザーが選んだ以上、自動で他の面・段へ逃がさない。
//      次のいずれかに該当する場合は、その場でエラーとして返す（呼び出し側は必ず表示すること）：
//        - その段の配管が面の横幅に収まらない
//        - 段を積み上げた高さが面の縦方向の加工可能エリアを超える
//        - 配置した穴が⊗マーク等の避けるべき領域(keepOutZones)と重なる
//      面の実寸が未確認（machinableAreasForがnullを返す面）を選んだ場合は、これまで通り
//      警告(warn)を出して配置対象外にする（エラーではなく警告のまま。データが無いだけで
//      ユーザーの選択ミスではないため）。
//
// 検証: handholeLayoutEngine.verify.ts（npx tsx で実行）

import {
  holeDiameterFor,
  footprintDiameterFor,
  minClearanceFor,
  likelyNeedsTightenToolFor,
  machinableAreasFor,
  HANDHOLE_FACE_ORDER,
  FACE_LABELS,
  type ConnectorBrand,
  type FepSize,
  type KkEWidth,
  type MachinableArea,
  type HandholeFace,
  type PlacementGridMm,
  DEFAULT_PLACEMENT_GRID_MM,
  CONNECTOR_BRAND_LABELS,
} from '../constants/handholeKitakanto';

/** 配管条件1行分：この面・この段に、この銘柄・このFEP呼び径の配管が何本あるか。 */
export interface ConduitRun {
  face: HandholeFace;
  /** 段番号。1始まり。1段目＝その面の中で一番下。 */
  row: number;
  brand: ConnectorBrand;
  fepSize: FepSize;
  count: number;
}

export interface HandholeLayoutInput {
  width: KkEWidth;
  runs: ConduitRun[];
  /** 中心位置の丸め単位(mm)。既定5mm。 */
  gridMm?: PlacementGridMm;
  /**
   * メーカー規定の離隔(10mm/30mm)に上乗せする、現場判断の追加マージン(mm)。既定0。
   * 大径コネクターは締め付けにベルトレンチ等の工具が要る場合があり、その作業スペースは
   * メーカー資料に定めが無い（likelyNeedsTightenToolForのコメント参照）。数値の根拠が
   * 無い以上ツール側で勝手に補正しないため、必要な余裕は現場を知るユーザーがここで指定する。
   * 横方向のピッチ・段と段の間の両方に同じ値を加える。
   */
  extraClearanceMm?: number;
}

/** 発注に必要な穴1つ分の仕様（配置前）。面・段はユーザーが選んだ通り、既に確定している。 */
export interface RequiredHole {
  id: string;
  label: string;
  brand: ConnectorBrand;
  fepSize: FepSize;
  /** 実際に開ける穴の大きさ(mm)＝ビット径。発注仕様・DXFの表示に使う（配置判定には使わない）。 */
  diameterMm: number;
  /**
   * 配置・離隔・⊗マーク干渉判定に使う実効直径(mm)。
   * コネクター本体の外径が定義されていればそれ、無ければ（穴のみ等）diameterMmと同じ値。
   * 北関東工業の実物資料により、離隔ルールは穴径ではなくコネクター外径基準と判明したため
   * （2026-09-16、footprintDiameterFor参照）。
   */
  footprintDiameterMm: number;
  /** この穴が要求する最低離隔(mm)。隣の穴との実際の離隔判定は両者のmaxを取る。 */
  clearanceMm: number;
  face: HandholeFace;
  row: number;
}

/** 配置済みの穴。x/yはその面（face）の加工可能エリアの左下を原点とした中心位置(mm)。 */
export interface PlacedHole extends RequiredHole {
  x: number;
  y: number;
}

/** 1段ぶんの配置結果。 */
export interface FaceRowResult {
  row: number;
  /** この段に割り当てられた配管（配置できたかどうかに関わらず全件）。 */
  requiredHoles: RequiredHole[];
  /** この段で実際に配置できた穴。 */
  placedHoles: PlacedHole[];
  /** この段の配管を左から並べたときに使う横幅(mm)。面の横幅を超えていても参考値として出す。 */
  usedWidthMm: number;
  /** この段の高さ帯の下端(mm)。面の加工可能エリア左下からの高さ。 */
  bandBottomMm: number;
  /** この段の高さ帯の上端(mm)＝この段の一番大きい径の穴の上端。 */
  bandTopMm: number;
  /** false＝横幅超過または高さ超過でこの段は配置できなかった（エラーがwarningsに入っている）。 */
  fits: boolean;
}

/** 面ごとの配置結果。areaがnull＝その面は未確認のため配置対象外。 */
export interface FaceLayoutResult {
  face: HandholeFace;
  area: MachinableArea | null;
  /** 段ごとの結果。段番号の昇順（1段目→2段目→…）。 */
  rows: FaceRowResult[];
  /** rows[].placedHolesの合算。 */
  placedHoles: PlacedHole[];
}

export type WarningLevel = 'error' | 'warn';

export interface LayoutWarning {
  level: WarningLevel;
  message: string;
}

export interface HandholeLayoutResult {
  width: KkEWidth;
  gridMm: PlacementGridMm;
  /** 発注に必要な穴の一覧（配置できたかどうかに関わらず全件）。 */
  requiredHoles: RequiredHole[];
  /** 面ごとの配置結果。常にA/B/C/Dの4件（HANDHOLE_FACE_ORDER順）。 */
  faces: FaceLayoutResult[];
  /** 配置できた穴をまとめたもの（faces[].placedHolesの合算）。 */
  placedHoles: PlacedHole[];
  /** 配置できなかった穴（面の実寸未確認・横幅超過・高さ超過・⊗マーク重複・データ欠落など）。 */
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
    // 穴径(diameter)が取れている以上、footprintDiameterForは必ず非null（コネクター外径が
    // 無ければ穴径そのものにフォールバックするため）。念のためdiameterへのフォールバックを残す。
    const footprintDiameter = footprintDiameterFor(run.brand, run.fepSize) ?? diameter;
    for (let n = 0; n < run.count; n++) {
      holes.push({
        id: `r${ri}-${n}`,
        label: holeLabel(run.brand, run.fepSize),
        brand: run.brand,
        fepSize: run.fepSize,
        diameterMm: diameter,
        footprintDiameterMm: footprintDiameter,
        clearanceMm,
        face: run.face,
        row: run.row,
      });
    }
  });
  return holes;
}

interface RowXPlacement {
  hole: RequiredHole;
  x: number;
  rightEdge: number;
}

/**
 * 段内の横方向の位置を「幅の制限なし」で計算する（実効直径の大きい順に、中心間ピッチを
 * グリッドに切り上げて並べる）。実際に面の横幅に収まるかどうかは呼び出し側で判定する
 * （収まらない場合にどこまで必要幅になるか＝usedWidthMmを見せるため、先に全部計算する）。
 *
 * ピッチ・並び順・右端(rightEdge)は、いずれも穴径(diameterMm)ではなく実効直径
 * (footprintDiameterMm＝コネクター外径があればそれ、無ければ穴径)を基準にする。
 * 離隔ルールがコネクター本体の外径基準であることが北関東工業の実物資料で確定したため
 * （2026-09-16）。穴自体の大きさ(diameterMm)は発注仕様の表示にのみ使う。
 */
function layoutRowX(holes: RequiredHole[], gridMm: number, extraClearanceMm: number): RowXPlacement[] {
  const sorted = [...holes].sort((a, b) => b.footprintDiameterMm - a.footprintDiameterMm);
  const out: RowXPlacement[] = [];
  sorted.forEach((h, i) => {
    let centerX: number;
    if (i === 0) {
      centerX = ceilTo(h.footprintDiameterMm / 2, gridMm);
    } else {
      const prev = sorted[i - 1];
      const gap = Math.max(h.clearanceMm, prev.clearanceMm) + extraClearanceMm;
      const pitch = ceilTo((prev.footprintDiameterMm + h.footprintDiameterMm) / 2 + gap, gridMm);
      centerX = out[i - 1].x + pitch;
    }
    out.push({ hole: h, x: centerX, rightEdge: centerX + h.footprintDiameterMm / 2 });
  });
  return out;
}

/** 面ごとの警告（未確認面の扱い）を積む。全4面未確認なら1つにまとめ、一部だけなら面ごとに出す。 */
function pushUnconfirmedFaceWarnings(
  width: KkEWidth,
  areasByFace: Record<HandholeFace, MachinableArea | null>,
  warnings: LayoutWarning[],
): void {
  const unconfirmedFaces = HANDHOLE_FACE_ORDER.filter(f => areasByFace[f] == null);
  if (unconfirmedFaces.length === HANDHOLE_FACE_ORDER.length) {
    warnings.push({
      level: 'warn',
      message:
        `KK-E型${width}サイズは全4面（A〜D）とも加工可能エリアの実寸が未確認です。配置は行わず、穴一覧のみを参考値として出しています。` +
        `発注前に必ず北関東工業へ現物の加工図面を確認してください。`,
    });
  } else {
    for (const f of unconfirmedFaces) {
      warnings.push({
        level: 'warn',
        message: `KK-E型${width}サイズの${FACE_LABELS[f]}は加工可能エリアの実寸が未確認のため、配置対象から除外します。`,
      });
    }
  }
}

/** 1面ぶんの配置。段番号ごとに下から積み上げ、段内はlayoutRowXで横方向を計算する。 */
function computeFaceLayout(
  face: HandholeFace,
  area: MachinableArea,
  faceHoles: RequiredHole[],
  gridMm: number,
  extraClearanceMm: number,
  warnings: LayoutWarning[],
): { rows: FaceRowResult[]; placedHoles: PlacedHole[] } {
  const rowNumbers = [...new Set(faceHoles.map(h => h.row))].sort((a, b) => a - b);
  const rows: FaceRowResult[] = [];
  const placedHoles: PlacedHole[] = [];
  let rowBaseY = 0;

  for (const rowNum of rowNumbers) {
    const rowHoles = faceHoles.filter(h => h.row === rowNum);
    if (rowHoles.length === 0) continue;

    // 段の高さ(bandTopMm)は、段の中の最大の「実効直径」(footprintDiameterMm)で決める
    // （穴径ではなくコネクター外径基準。2026-09-16、実物資料で確定）。
    const rowMaxFootprint = Math.max(...rowHoles.map(h => h.footprintDiameterMm));
    const rowMaxClearance = Math.max(...rowHoles.map(h => h.clearanceMm));
    const centerYOffset = ceilTo(rowMaxFootprint / 2, gridMm);
    const bandBottomMm = rowBaseY;
    const absCenterY = rowBaseY + centerYOffset;
    const bandTopMm = absCenterY + rowMaxFootprint / 2;

    let fits = true;
    if (bandTopMm > area.workableHeightMm + 1e-9) {
      fits = false;
      warnings.push({
        level: 'error',
        message:
          `${FACE_LABELS[face]} ${rowNum}段目: 積み上げた高さ${bandTopMm}mmが加工可能エリアの高さ${area.workableHeightMm}mmを超えます。` +
          `段数を減らすか、より下の段の配管径を小さくしてください。`,
      });
    }

    const rowLayout = layoutRowX(rowHoles, gridMm, extraClearanceMm);
    const usedWidthMm = rowLayout.length > 0 ? Math.max(...rowLayout.map(r => r.rightEdge)) : 0;
    const overflow = rowLayout.find(r => r.rightEdge > area.workableWidthMm + 1e-9);
    if (overflow) {
      fits = false;
      warnings.push({
        level: 'error',
        message:
          `${FACE_LABELS[face]} ${rowNum}段目: ${overflow.hole.label}を含む配管が、加工可能エリアの横幅${area.workableWidthMm}mmに` +
          `収まりません（この段に必要な幅は約${Math.ceil(usedWidthMm)}mm）。本数を減らすか、径の小さい配管に変更してください。`,
      });
    }

    const rowPlaced: PlacedHole[] = [];
    if (fits) {
      for (const r of rowLayout) {
        // ⊗マーク(内部インサート)との干渉判定も実効直径(コネクター外径基準)で行う。
        const rad = r.hole.footprintDiameterMm / 2;
        const conflict = area.keepOutZones.find(
          z => Math.hypot(r.x - z.xMm, absCenterY - z.yMm) < rad + z.radiusMm,
        );
        if (conflict) {
          warnings.push({
            level: 'error',
            message:
              `${FACE_LABELS[face]} ${rowNum}段目: ${r.hole.label}(x=${r.x}, y=${absCenterY})が${conflict.label}と重なります。` +
              `段内の配管の並び順・本数を変えて、この位置を避けてください。`,
          });
          continue;
        }
        rowPlaced.push({ ...r.hole, x: r.x, y: absCenterY });
      }
    }

    placedHoles.push(...rowPlaced);
    rows.push({ row: rowNum, requiredHoles: rowHoles, placedHoles: rowPlaced, usedWidthMm, bandBottomMm, bandTopMm, fits });

    rowBaseY = ceilTo(bandTopMm + rowMaxClearance + extraClearanceMm, gridMm);
  }

  return { rows, placedHoles };
}

export function computeHandholeLayout(input: HandholeLayoutInput): HandholeLayoutResult {
  const { width, runs, gridMm = DEFAULT_PLACEMENT_GRID_MM, extraClearanceMm = 0 } = input;
  const warnings: LayoutWarning[] = [];
  const requiredHoles = buildRequiredHoles(runs, warnings);
  const areasByFace = machinableAreasFor(width);

  pushUnconfirmedFaceWarnings(width, areasByFace, warnings);

  // 大径コネクター（現状確認できているのはKKフィットFEP100以上）は、メーカー資料上も
  // 手締めだけでなく工具（ベルトレンチ等）を使う運用が前提になっている。しかし北関東工業の
  // どの資料にも工具使用時の追加離隔の定めが無いため、ツール側で数値を補正せず、
  // 現場での確認を促す注意喚起にとどめる（likelyNeedsTightenToolForのコメント参照）。
  if (requiredHoles.some(h => likelyNeedsTightenToolFor(h.brand, h.fepSize)) && extraClearanceMm === 0) {
    warnings.push({
      level: 'warn',
      message:
        '大径のコネクター（KKフィットFEP100以上等）が含まれています。メーカー資料でも手締めでは' +
        '不十分で工具（ベルトレンチ等）を使う場合があるとされていますが、工具使用時に周囲へどれだけ' +
        '追加でスペースが必要かはメーカー資料に定めが無く、この計算には反映されていません。' +
        '現場で工具が使えるスペースがあるか確認するか、下の「工具用の追加離隔」を設定してください。',
    });
  }

  const faces: FaceLayoutResult[] = HANDHOLE_FACE_ORDER.map(face => {
    const area = areasByFace[face];
    const faceHoles = requiredHoles.filter(h => h.face === face);
    if (area == null) {
      return { face, area: null, rows: [], placedHoles: [] };
    }
    const { rows, placedHoles } = computeFaceLayout(face, area, faceHoles, gridMm, extraClearanceMm, warnings);
    return { face, area, rows, placedHoles };
  });

  const placedHoles = faces.flatMap(f => f.placedHoles);
  const placedIds = new Set(placedHoles.map(h => h.id));
  const unplacedHoles = requiredHoles.filter(h => !placedIds.has(h.id));

  return {
    width, gridMm, requiredHoles, faces, placedHoles, unplacedHoles, warnings,
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
