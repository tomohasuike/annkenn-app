// src/utils/handholeLayoutEngine.ts
// ハンドホール（北関東工業）穴あけ発注仕様の計算エンジン。UIから独立した純粋関数。
//
// プルボックスの計算（現場でホールソーを開ける位置を出す）とは目的が違う。こちらは
// 「発注時にコネクター図を加工可能エリアのどこへ置くか」という発注仕様を組み立てる。
//
// 面・ブロック・段の選び方（2026-09-16「段」対応化、2026-09-18「ブロック」対応化）:
//   以前は「A面がいっぱいになったら自動でB面へ、C面へ…」という完全自動振り分けだったが、
//   「FEP100なら何段詰まるかを見せて、上段/中段/下段のどこに置くかを選べるようにしたい」という
//   要望を受け、面（A/B/C/D）に加えて面の中の「段」もユーザーが明示的に選ぶ方式に変更した。
//   さらに北関東工業のKK-E型が「分割式」（縁塊+スラブ+継胴+ベースを上下に積み重ねる構造）だと
//   判明し、600E-1200等では面の中の加工可能エリア自体が上下複数「ブロック」に分かれ、ブロックの
//   接合部（ピースの継ぎ目）は加工不可であることが実物図面調査で確定した（handholeKitakanto.ts
//   のMachinableArea/machinableAreasForのコメント参照）。そのため配管条件(ConduitRun)は
//   面(face)・ブロック番号(block。1始まり、1ブロック目=面の中で一番下)・段番号(row。1始まり、
//   1段目=そのブロックの中で一番下)の3つを持つ。ブロックが1つしか無い面（450・600E-600等）では
//   block=1固定でよく、UIもブロック選択を表示しない。
//   段の中の配置（左から右に何個並ぶか）だけは今まで通り自動（径・離隔からピッチを計算し、
//   グリッドに丸める＝プルボックス計算エンジンの丸め方針と同じ考え方）。
//
// 配置アルゴリズム:
//   1. 面ごとに、その面に割り当てられた配管をさらにブロック番号→段番号でグループ化する。
//   2. 段はブロックの中で1段目から順に下から積み上げる（段の高さ＝その段の中の一番大きい径。
//      次の段との間の隙間＝その段とその上の段の中の最大離隔）。ブロックをまたいだ積み上げは
//      しない（ブロック間の隙間＝ピース接合部は加工不可のため）。プルボックス計算エンジンの
//      「行（棚詰め）」ロジックと同じ考え方を、自動で次の行へ回すのではなく
//      ユーザーが選んだブロック番号・段番号ごとに適用する。
//   3. 段の中の左右位置は、径の大きい順に並べ、中心間ピッチ＝(径A+径B)/2+離隔を
//      「切り上げ」でグリッドに丸めて計算する（切り捨てると離隔が指定値を下回るため）。
//   4. 面・ブロック・段はユーザーが選んだ以上、自動で他の面・ブロック・段へ逃がさない。
//      次のいずれかに該当する場合は、その場でエラーとして返す（呼び出し側は必ず表示すること）：
//        - その段の配管がブロックの横幅に収まらない
//        - 段を積み上げた高さがそのブロックの縦方向の加工可能高さを超える
//        - 配置した穴が⊗マーク等の避けるべき領域(keepOutZones)と重なる
//        - 存在しないブロック番号が指定された（そのareaのblocks配列の範囲外）
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
  type MachinableBlock,
  type FaceKeepOutZone,
  type HandholeFace,
  type PlacementGridMm,
  DEFAULT_PLACEMENT_GRID_MM,
  CONNECTOR_BRAND_LABELS,
} from '../constants/handholeKitakanto';

/** 配管条件1行分：この面・このブロック・この段に、この銘柄・このFEP呼び径の配管が何本あるか。 */
export interface ConduitRun {
  face: HandholeFace;
  /** ブロック番号。1始まり。1ブロック目＝その面の中で一番下のブロック。省略時は1（ブロックが1つしか無い面向けの既定値）。 */
  block?: number;
  /** 段番号。1始まり。1段目＝そのブロックの中で一番下。 */
  row: number;
  brand: ConnectorBrand;
  fepSize: FepSize;
  count: number;
}

export interface HandholeLayoutInput {
  width: KkEWidth;
  /**
   * 内空高さバリエーション（品名規格の末尾。例:"600E-1200"）。省略時はwidthの既定バリエーション
   * （KKE_HEIGHT_VARIANTSの先頭）を使う。450のようにバリエーションが1つしか無いサイズでは
   * 省略してよい（既存の呼び出し元コード・検証スクリプトの互換性のため）。
   */
  heightVariantCode?: string;
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
  /** ブロック番号。1始まり、1=面の中で一番下のブロック。 */
  block: number;
  row: number;
}

/** 配置済みの穴。x/yはその面（face）の加工可能エリアの左下を原点とした中心位置(mm)。 */
export interface PlacedHole extends RequiredHole {
  x: number;
  y: number;
}

/** 1段ぶんの配置結果。 */
export interface FaceRowResult {
  /** ブロック番号。1始まり、1=面の中で一番下のブロック。 */
  block: number;
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
        block: run.block ?? 1,
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
 * centerX(半径radiusMm)が、高さcenterYの位置で⊗マーク等の避けるべき領域(zones、ブロック
 * ローカル座標)と重なる場合、その領域の右端の少し先までcenterXを押し出す(グリッドに切り上げ)。
 * 複数の領域がある場合は、押し出した先でも別の領域と重ならなくなるまで繰り返す
 * （領域は有限個・毎回xは単調に増加するため必ず有限回で収束する。念のため上限回数も設ける）。
 *
 * 2026-09-18、社長ご指摘で追加：「⊗マークと重なるからその穴は諦める」のではなく
 * 「重なった穴をマークの先まで動かして配置し直す」方式に変更した。左には動かさない
 * （常に大きい方＝右に寄せる、というこのファイルの丸め方針＝ceilToと同じ考え方）。
 */
function avoidKeepOutZones(
  centerX: number,
  radiusMm: number,
  centerY: number,
  zones: FaceKeepOutZone[],
  gridMm: number,
): number {
  let x = centerX;
  for (let guard = 0; guard < zones.length + 10; guard++) {
    let moved = false;
    for (const z of zones) {
      const threshold = radiusMm + z.radiusMm;
      const dy = centerY - z.yMm;
      if (Math.abs(dy) >= threshold - 1e-9) continue; // この高さでは重ならない
      const halfWidth = Math.sqrt(Math.max(threshold * threshold - dy * dy, 0));
      const forbiddenMin = z.xMm - halfWidth;
      const forbiddenMax = z.xMm + halfWidth;
      if (x > forbiddenMin - 1e-9 && x < forbiddenMax + 1e-9) {
        let pushed = ceilTo(forbiddenMax, gridMm);
        if (pushed <= forbiddenMax + 1e-9) pushed += gridMm; // ちょうど境界上に丸まった場合の保険
        x = pushed;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return x;
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
 *
 * 2026-09-18、⊗マーク等の避けるべき領域(keepOutZones)を渡すと、ナイーブに計算した位置が
 * 領域と重なる場合はavoidKeepOutZonesで領域の先まで押し出す。押し出した結果、面の横幅を
 * 超える場合の扱いは呼び出し側(computeBlockLayout)が個別に判定する。
 */
function layoutRowX(
  holes: RequiredHole[],
  gridMm: number,
  extraClearanceMm: number,
  absCenterY: number,
  keepOutZones: FaceKeepOutZone[],
): RowXPlacement[] {
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
    centerX = avoidKeepOutZones(centerX, h.footprintDiameterMm / 2, absCenterY, keepOutZones, gridMm);
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

/**
 * 1ブロックぶんの配置。段番号ごとに下から積み上げ、段内はlayoutRowXで横方向を計算する。
 * y座標はすべて「ブロックローカル」（0=このブロックの下端）で計算し、呼び出し側
 * (computeFaceLayout)がarea.blockBottomsMmで面全体のローカル座標へ変換する。
 */
function computeBlockLayout(
  face: HandholeFace,
  blockNum: number,
  block: MachinableBlock,
  workableWidthMm: number,
  blockHoles: RequiredHole[],
  gridMm: number,
  extraClearanceMm: number,
  warnings: LayoutWarning[],
): { rows: Omit<FaceRowResult, 'block'>[]; placedHoles: PlacedHole[] } {
  const rowNumbers = [...new Set(blockHoles.map(h => h.row))].sort((a, b) => a - b);
  const rows: Omit<FaceRowResult, 'block'>[] = [];
  const placedHoles: PlacedHole[] = [];
  const blockLabel = `${FACE_LABELS[face]} ブロック${blockNum}`;
  let rowBaseY = 0;

  for (const rowNum of rowNumbers) {
    const rowHoles = blockHoles.filter(h => h.row === rowNum);
    if (rowHoles.length === 0) continue;

    // 段の高さ(bandTopMm)は、段の中の最大の「実効直径」(footprintDiameterMm)で決める
    // （穴径ではなくコネクター外径基準。2026-09-16、実物資料で確定）。
    const rowMaxFootprint = Math.max(...rowHoles.map(h => h.footprintDiameterMm));
    const rowMaxClearance = Math.max(...rowHoles.map(h => h.clearanceMm));
    const centerYOffset = ceilTo(rowMaxFootprint / 2, gridMm);
    const bandBottomMm = rowBaseY;
    const absCenterY = rowBaseY + centerYOffset;
    const bandTopMm = absCenterY + rowMaxFootprint / 2;

    // 段の高さ（ブロックの縦方向の加工可能高さ）を超える場合だけは、段全体を丸ごと
    // 配置対象外にする（段の途中の高さで一部だけ有効、ということはあり得ないため）。
    const heightOk = bandTopMm <= block.heightMm + 1e-9;
    if (!heightOk) {
      warnings.push({
        level: 'error',
        message:
          `${blockLabel} ${rowNum}段目: 積み上げた高さ${bandTopMm}mmがこのブロックの加工可能高さ${block.heightMm}mmを超えます。` +
          `段数を減らすか、より下の段の配管径を小さくしてください。`,
      });
    }

    // 2026-09-18、社長ご指摘で変更：横方向は「⊗マーク等の避けるべき領域に当たった穴を
    // その場で諦める」のではなく、layoutRowX内のavoidKeepOutZonesで領域の先まで押し出して
    // 配置し直す。押し出した結果それでも面の横幅を超える穴だけを、この穴単位で配置対象外にする
    // （以前は「1本でも横幅を超えたら段全体を丸ごと配置しない」だったが、押し出しで空いたはずの
    // 場所まで無駄にしてしまうため、⊗マーク重複判定と同じ「その穴だけ諦める」方式に統一した）。
    const rowLayout = heightOk
      ? layoutRowX(rowHoles, gridMm, extraClearanceMm, absCenterY, block.keepOutZones)
      : [];
    const usedWidthMm = rowLayout.length > 0 ? Math.max(...rowLayout.map(r => r.rightEdge)) : 0;

    const rowPlaced: PlacedHole[] = [];
    if (heightOk) {
      for (const r of rowLayout) {
        if (r.rightEdge > workableWidthMm + 1e-9) {
          warnings.push({
            level: 'error',
            message:
              `${blockLabel} ${rowNum}段目: ${r.hole.label}(x=${r.x})が加工可能エリアの横幅${workableWidthMm}mmを` +
              `超えてはみ出すため配置できません（⊗マーク等を避けて押し出した結果を含みます）。本数を減らすか、配置順・径を変えてください。`,
          });
          continue;
        }
        // ⊗マーク(内部インサート)との干渉判定（保険。avoidKeepOutZonesで回避済みのはずだが、
        // 複数領域が絡む複雑な配置での取りこぼしに備えて残す）。
        const rad = r.hole.footprintDiameterMm / 2;
        const conflict = block.keepOutZones.find(
          z => Math.hypot(r.x - z.xMm, absCenterY - z.yMm) < rad + z.radiusMm,
        );
        if (conflict) {
          warnings.push({
            level: 'error',
            message:
              `${blockLabel} ${rowNum}段目: ${r.hole.label}(x=${r.x}, y=${absCenterY})が${conflict.label}と重なります。` +
              `段内の配管の並び順・本数を変えて、この位置を避けてください。`,
          });
          continue;
        }
        rowPlaced.push({ ...r.hole, x: r.x, y: absCenterY });
      }
    }

    // このrowの`fits`は「要求した穴が1本残らず配置できたか」を表す（高さ超過・横幅超過・
    // ⊗マーク重複のいずれかで1本でも欠けたらfalse）。UI側の色分け・警告表示に使う。
    const fits = heightOk && rowPlaced.length === rowHoles.length;

    placedHoles.push(...rowPlaced);
    rows.push({ row: rowNum, requiredHoles: rowHoles, placedHoles: rowPlaced, usedWidthMm, bandBottomMm, bandTopMm, fits });

    rowBaseY = ceilTo(bandTopMm + rowMaxClearance + extraClearanceMm, gridMm);
  }

  return { rows, placedHoles };
}

/**
 * 1面ぶんの配置。ブロック番号ごとにグループ化し、ブロックごとにcomputeBlockLayoutを呼ぶ。
 * ブロックローカルで計算された段のy座標(bandBottomMm/bandTopMm/穴のy)は、
 * area.blockBottomsMm[blockIdx]を足して面全体のローカル座標（＝area.workableHeightMmの
 * 座標系。HandholeDrawing.tsx・handholeDxfExport.tsが前提とする座標系と同じ）に変換する。
 * 存在しないブロック番号（そのareaのblocks配列の範囲外）が指定された場合はエラーにする。
 */
function computeFaceLayout(
  face: HandholeFace,
  area: MachinableArea,
  faceHoles: RequiredHole[],
  gridMm: number,
  extraClearanceMm: number,
  warnings: LayoutWarning[],
): { rows: FaceRowResult[]; placedHoles: PlacedHole[] } {
  const blockNumbers = [...new Set(faceHoles.map(h => h.block))].sort((a, b) => a - b);
  const rows: FaceRowResult[] = [];
  const placedHoles: PlacedHole[] = [];

  for (const blockNum of blockNumbers) {
    const blockHoles = faceHoles.filter(h => h.block === blockNum);
    const blockIdx = blockNum - 1;
    const block = area.blocks[blockIdx];
    if (!block) {
      warnings.push({
        level: 'error',
        message:
          `${FACE_LABELS[face]} ブロック${blockNum}: このブロックは存在しません（${FACE_LABELS[face]}は` +
          `${area.blocks.length}ブロック構成です）。ブロック番号を選び直してください。`,
      });
      continue;
    }

    const blockBaseY = area.blockBottomsMm[blockIdx];
    const { rows: blockRows, placedHoles: blockPlaced } = computeBlockLayout(
      face, blockNum, block, area.workableWidthMm, blockHoles, gridMm, extraClearanceMm, warnings,
    );

    for (const r of blockRows) {
      rows.push({
        ...r,
        block: blockNum,
        bandBottomMm: blockBaseY + r.bandBottomMm,
        bandTopMm: blockBaseY + r.bandTopMm,
        placedHoles: r.placedHoles.map(h => ({ ...h, y: blockBaseY + h.y })),
      });
    }
    placedHoles.push(...blockPlaced.map(h => ({ ...h, y: blockBaseY + h.y })));
  }

  return { rows, placedHoles };
}

export function computeHandholeLayout(input: HandholeLayoutInput): HandholeLayoutResult {
  const { width, heightVariantCode, runs, gridMm = DEFAULT_PLACEMENT_GRID_MM, extraClearanceMm = 0 } = input;
  const warnings: LayoutWarning[] = [];
  const requiredHoles = buildRequiredHoles(runs, warnings);
  const areasByFace = machinableAreasFor(width, heightVariantCode);

  pushUnconfirmedFaceWarnings(width, areasByFace, warnings);

  // 大径コネクター（現状確認できているのはKKフィットFEP100以上）は、メーカー資料上も
  // 手締めだけでなく工具（ベルトレンチ等）を使う運用が前提になっている。しかし北関東工業の
  // どの資料にも工具使用時の追加離隔の定めが無いため、ツール側で数値を補正せず、
  // 現場での確認を促す注意喚起にとどめる（likelyNeedsTightenToolForのコメント参照。
  // 2026-09-16の実写調査で、同用途の他社品でも大径サイズのみベルトレンチ等を使う
  // 運用が映像で裏付けられている）。
  if (requiredHoles.some(h => likelyNeedsTightenToolFor(h.brand, h.fepSize)) && extraClearanceMm === 0) {
    warnings.push({
      level: 'warn',
      message:
        '大径のコネクター（KKフィットFEP100以上等）が含まれています。メーカー資料でも手締めでは' +
        '不十分で工具（ベルトレンチ等）を使う場合があるとされており、同用途の他社品の施工動画でも' +
        '大径サイズのみ工具を使う様子が確認できています。ただし工具使用時に周囲へどれだけ追加で' +
        'スペースが必要かはどの資料にも定めが無く、この計算には反映されていません。' +
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
