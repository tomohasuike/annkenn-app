// src/constants/handholeKitakanto.ts
// ハンドホール穴あけ（北関東工業・発注仕様モード）用の基礎データ。
//
// プルボックス（鋼板・現場でホールソーを使う）とは違い、北関東工業のハンドホール（コンクリート製）は
// 工場発注が本命ルート。HITECが「型式・サイズ」「配管条件（本数・呼び径・コネクター銘柄）」を決め、
// 北関東工業の空白加工図面の「加工可能エリア」内にコネクター図を配置して発注する。
// このファイルはその発注仕様を組み立てるための基礎データだけを持つ。計算・配置ロジックは
// handholeLayoutEngine.ts、UIはHandholeKnockoutCalc.tsx / HandholeDrawing.tsxに分離する。
//
// 出典: 北関東工業 公式カタログ・加工図面（2026-09-15 HITEC調査済み）。
// 数値の捏造は厳禁。特に「加工可能エリア実寸」はKK-E型450サイズ（品名規格 450E-750）以外
// 未確認であり、他サイズへの比率流用・外挿は行わない（サイズごとに比率が異なる可能性が高いため）。

/**
 * コネクター銘柄。「穴のみ」はコネクターを使わず離隔30mm以上を確保して穴を開けるだけの加工。
 */
export type ConnectorBrand =
  | 'nandemo' // なんでも継手（共和ゴム）
  | 'kkfit' // KKフィット（北関東工業自社品）
  | 'kmm_eflex' // KMM（エフレックス用）
  | 'kmm_tac' // KMM（TAC/タイレックス用）
  | 'pljoint_s' // PLジョイント/Sタイプ
  | 'kmf' // KMF（未来工業OEM/ミラレックスF用）
  | 'holeonly'; // 穴のみ（コネクター無し・離隔30mm以上）

export const CONNECTOR_BRAND_LABELS: Record<ConnectorBrand, string> = {
  nandemo: 'なんでも継手（共和ゴム）',
  kkfit: 'KKフィット（北関東工業自社品）',
  kmm_eflex: 'KMM（エフレックス用）',
  kmm_tac: 'KMM（TAC/タイレックス用）',
  pljoint_s: 'PLジョイント/Sタイプ',
  kmf: 'KMF（未来工業OEM/ミラレックスF用）',
  holeonly: '穴のみ（コネクター無し）',
};

export const CONNECTOR_BRAND_ORDER: ConnectorBrand[] = [
  'nandemo', 'kkfit', 'kmm_eflex', 'kmm_tac', 'pljoint_s', 'kmf', 'holeonly',
];

/** 配管のFEP呼び径(mm)。北関東工業のコネクター適合表の列見出しそのまま。 */
export type FepSize = 30 | 40 | 50 | 65 | 80 | 100 | 125 | 150 | 200;

export const FEP_SIZES: FepSize[] = [30, 40, 50, 65, 80, 100, 125, 150, 200];

/**
 * 穴径（ビット径, mm）＝ FEP呼び径 × コネクター銘柄 の2軸テーブル。
 * null＝そのFEP呼び径にその銘柄の設定が無い（北関東工業カタログに記載なし）。
 *
 * 出典: 北関東工業 加工図面・コネクター一覧（HP掲載, 2026-09-15確認）。捏造禁止・原本の数値そのまま。
 */
export const HOLE_DIAMETER_MM: Record<ConnectorBrand, Record<FepSize, number | null>> = {
  nandemo:    { 30: 46, 40: 56, 50: 66, 65: 85, 80: 100, 100: 120, 125: 150, 150: 180, 200: null },
  kkfit:      { 30: 45, 40: 60, 50: 70, 65: 90, 80: 105, 100: 135, 125: 165, 150: 196, 200: null },
  kmm_eflex:  { 30: 55, 40: 60, 50: 75, 65: 90, 80: 105, 100: 130, 125: 180, 150: 180, 200: null },
  kmm_tac:    { 30: 55, 40: 60, 50: 75, 65: 90, 80: 105, 100: 130, 125: 180, 150: 180, 200: null },
  pljoint_s:  { 30: 45, 40: 60, 50: 70, 65: 90, 80: 105, 100: 135, 125: 170, 150: 205, 200: null },
  kmf:        { 30: 55, 40: 66, 50: 85, 65: 100, 80: 120, 100: 150, 125: 180, 150: 180, 200: null },
  holeonly:   { 30: 45, 40: 60, 50: 70, 65: 90, 80: 110, 100: 135, 125: 170, 150: 196, 200: 265 },
};

/** 穴径(mm)。テーブルに無ければnull（呼び出し側は必ず握りつぶさず扱うこと）。 */
export function holeDiameterFor(brand: ConnectorBrand, fep: FepSize): number | null {
  return HOLE_DIAMETER_MM[brand]?.[fep] ?? null;
}

/**
 * コネクター同士の最低離隔(mm)。「穴のみ」加工は30mm以上、それ以外は10mm以上。
 * 出典: 北関東工業 加工図面の注記（2026-09-15確認）。
 */
export function minClearanceFor(brand: ConnectorBrand): number {
  return brand === 'holeonly' ? 30 : 10;
}

/** コネクター中心位置の丸め単位(mm)。現場運用は5mmまたは10mm刻み。既定は5mm。 */
export const PLACEMENT_GRID_OPTIONS_MM = [5, 10] as const;
export type PlacementGridMm = (typeof PLACEMENT_GRID_OPTIONS_MM)[number];
export const DEFAULT_PLACEMENT_GRID_MM: PlacementGridMm = 5;

// ── 型式・サイズ ──────────────────────────────────────────────
//
// 今回実装するのはKK-E型のみ。KK-R型・国交省型は将来拡張用に型だけ用意し、データは投入しない
// （社長の指示：型定義だけ用意、今回はデータ未投入でよい）。
export type HandholeSeries = 'KK-E' | 'KK-R' | 'MLIT';

export const HANDHOLE_SERIES_LABELS: Record<HandholeSeries, string> = {
  'KK-E': 'KK-E型',
  'KK-R': 'KK-R型（未対応・将来拡張）',
  MLIT: '国交省型（未対応・将来拡張）',
};

/** 現時点でデータが入っている型式。UIの選択肢はここだけを出す。 */
export const IMPLEMENTED_SERIES: HandholeSeries[] = ['KK-E'];

/** KK-E型の内空幅(mm)。カタログの型式サイズ表そのまま。 */
export type KkEWidth = 450 | 600 | 800 | 900 | 1000 | 1200 | 1500 | 1800 | 2000;

export const KKE_WIDTHS: KkEWidth[] = [450, 600, 800, 900, 1000, 1200, 1500, 1800, 2000];

export interface KkEOuterSpec {
  /** 外形（正方形、1辺mm） */
  outerMm: number;
  /** 蓋開口の種類 */
  lidOpening: string;
  /** 壁厚(mm) */
  wallThicknessMm: number;
}

/**
 * KK-E型 外形寸法表。
 * 出典: 北関東工業カタログ「KK-E型ハンドホール」外形寸法表（2026-09-15確認）。
 */
export const KKE_OUTER_SPEC: Record<KkEWidth, KkEOuterSpec> = {
  450: { outerMm: 600, lidOpening: '丸蓋', wallThicknessMm: 75 },
  600: { outerMm: 680, lidOpening: 'φ870/φ600', wallThicknessMm: 40 },
  800: { outerMm: 890, lidOpening: 'φ870/φ600', wallThicknessMm: 45 },
  900: { outerMm: 1000, lidOpening: 'φ870/φ600', wallThicknessMm: 50 },
  1000: { outerMm: 1100, lidOpening: 'φ870/φ600', wallThicknessMm: 50 },
  1200: { outerMm: 1320, lidOpening: 'φ870/φ600', wallThicknessMm: 60 },
  1500: { outerMm: 1640, lidOpening: 'φ870/φ600', wallThicknessMm: 70 },
  1800: { outerMm: 2040, lidOpening: 'φ870/φ600', wallThicknessMm: 120 },
  2000: { outerMm: 2240, lidOpening: 'φ870/φ600', wallThicknessMm: 120 },
};

// ── 面（A/B/C/D） ─────────────────────────────────────────────
//
// 北関東工業のハンドホールは4面（A/B/C/D）に加工可能エリアがあり、発注時は配管条件に応じて
// A面から順にB→C→D面へ穴を振り分けて考える必要がある（2026-09-15 社長ご指摘）。
// 「※ABCD面及びステップの位置は変更出来ません。」（KKE450_B75.dxf タイトル注記より）。
export type HandholeFace = 'A' | 'B' | 'C' | 'D';

/** 面を振り分ける際の優先順（A面から詰めて、入りきらない分をB→C→D面へ）。 */
export const HANDHOLE_FACE_ORDER: HandholeFace[] = ['A', 'B', 'C', 'D'];

export const FACE_LABELS: Record<HandholeFace, 'A面' | 'B面' | 'C面' | 'D面'> = {
  A: 'A面', B: 'B面', C: 'C面', D: 'D面',
};

// ── 加工可能エリア（発注時にコネクター図を配置できる範囲） ──────────────
//
// **確認できているのはKK-E型450（品名規格「450E-750」＝内空高さ750mm）のA/B/C/D全4面。**
// それ以外のサイズ（600/800/900/1000/1200/1500/1800/2000）は加工可能エリアの実寸が未確認。
// 450サイズの比率を他サイズへ流用・外挿することは行わない（サイズごとに比率が異なる可能性が
// 高いため、それは捏造にあたる、と社長より厳命）。
//
// 450E-750のA面（最初に確認済みだった面）:
//   全幅530mm中、加工可能エリア幅350mm（左右各90mmは加工不可）。
//   高さは、DXF実物（KKE450_B75.dxf、2026-09-15にDXFプロトタイプ検証で解析）内に
//   「加工可能エリア」として明示的に描画されている矩形そのものの寸法を直接採用：600mm。
//   この600mmは、上端からの寸法チェーン 100+120+600+100=920mm（DXFのDIMENSIONエンティティの
//   実測値と完全一致）の中央区間そのもの。上端除外220mm(=100+120)、下端除外100mm、
//   合計920mmの中の可動域600mmという、単一の寸法チェーンで自己整合する値。
//
//   【訂正履歴】当初は「内空高さ750mm（品名規格の末尾"-750"）を全高とみなし、
//   上端100+120mm・下端70+100mmを除外」として360mmと計算していたが、この「70mm」は
//   実際には別系統の寸法チェーン（100+750+70=920、750は内空高さそのものを示す別の注記）から
//   誤って混同したものだった。DXFに直接描画された矩形（動かぬ証拠）で確認したところ600mmが正しく、
//   360mmは誤りだったため訂正した。
//
// 450E-750のB/C/D面（2026-09-15、4面対応化にあたって追加調査）:
//   KKE450_B75.dxf 1ファイルの中に、A面と全く同じ「加工可能エリア」矩形（レイヤーD-STR-STR5の
//   LINE4本）が、シート上でB面・C面・D面それぞれの位置にも独立して描画されていることを確認した。
//   各面の位置は、面ラベルMTEXT（'A'/'B'/'C'/'D'、レイヤーD-STR-TXT）が各矩形の直上に実在すること
//   で直接裏取りした（推測ではない）。4面とも矩形の実寸は幅350mm×高さ600mmで完全に一致する
//   （各面ごとに個別に実測した結果であり、A面の値を外挿したものではない）。
//   さらに、A面の920mm寸法チェーンが紐付く外枠ジオメトリ（レイヤーD-STR、ステップ形状含む）も、
//   B/C/D面の位置に同一形状のまま独立して描画されていることを確認した（B/D面はA面から
//   X+1350mm、C/D面はA面からY-1237.5mmの位置に、寸法チェーンの数値注記こそ無いが同一形状の
//   図形が存在する）。よって全高920mm・上端除外220mm・下端除外100mmという内訳も4面共通と
//   判断できる（＝図面内で複製されている同一図形を機械的に確認したものであり、異なる製品規格間
//   の比率流用とは性質が異なる）。
//
//   ⊗マーク（内部インサート。工場が「干渉しないように削孔」する避けるべき位置。KKE450_B75.dxf
//   タイトル注記「※AC面にあるこのマークは外側にあるインサートです。このインサートで吊らないで
//   ください。」より）は、A面とC面の加工可能エリア内（レイヤーD-STR-STR5の対角線2本）にのみ
//   存在し、B面・D面には存在しないことを実測で確認済み（B/D面の同レイヤーには矩形4本のLINEしか
//   無く、対角線が無いことを確認した）。位置はA面・C面とも加工可能エリア左下から
//   ローカル座標(175, 274)、対角線の半分＝22.5mmを半径とする円で近似。
//
// 出典: 北関東工業 KK-E型ハンドホール 450E-750 加工図面（HP掲載）実物DXF解析
//       （scratchpad: KKE450_B75.dxf、2026-09-15）。
export interface FaceKeepOutZone {
  /** UI表示用ラベル。 */
  label: string;
  /** 中心のローカル座標(mm)。加工可能エリア左下を原点とする。 */
  xMm: number;
  yMm: number;
  /** 避けるべき半径(mm)。DXF実測（⊗マークの対角線の半分）。 */
  radiusMm: number;
  /** 出典・注記。 */
  sourceNote: string;
}

export interface MachinableArea {
  /** どの面のデータか。 */
  face: HandholeFace;
  /** UI表示用ラベル（'A面'等）。 */
  faceLabel: 'A面' | 'B面' | 'C面' | 'D面';
  /** 面の全幅(mm) */
  totalWidthMm: number;
  /** 加工可能エリアの幅(mm) */
  workableWidthMm: number;
  /** この寸法チェーンの全高(mm)。DXF実物のDIMENSIONエンティティが示す920mm（内空高さ750mmとは別系統）。 */
  totalHeightMm: number;
  /** 上端からの加工不可帯(mm)。100+120。 */
  topExcludeMm: number;
  /** 下端からの加工不可帯(mm)。 */
  bottomExcludeMm: number;
  /** 加工可能エリアの高さ(mm)。totalHeightMm - topExcludeMm - bottomExcludeMm。 */
  workableHeightMm: number;
  /** 避けるべき領域（⊗マーク＝内部インサート等）。無い面は空配列。 */
  keepOutZones: FaceKeepOutZone[];
  /** 出典・注記。UIにそのまま出す。 */
  sourceNote: string;
}

const KKE_450_INSERT_MARK_SOURCE_NOTE =
  '北関東工業 KK-E型ハンドホール 450E-750 加工図面DXF実物解析（2026-09-15）。' +
  '⊗マーク（内部インサート）の対角線2本（レイヤーD-STR-STR5）を実測。' +
  'タイトル注記「※AC面にあるこのマークは外側にあるインサートです。このインサートで吊らないでください。' +
  '（干渉しないように削孔させていただきます。）」の裏付けあり。';

function insertMarkZone(): FaceKeepOutZone {
  return {
    label: '⊗マーク（内部インサート）',
    xMm: 175,
    yMm: 274,
    radiusMm: 22.5,
    sourceNote: KKE_450_INSERT_MARK_SOURCE_NOTE,
  };
}

const KKE_450_SOURCE_NOTE_COMMON =
  '北関東工業 KK-E型ハンドホール 450E-750の加工図面DXF実物解析による実測値' +
  '（2026-09-15、加工可能エリアの描画矩形そのものを各面ごとに直接測定。' +
  '450以外のサイズ・450の別の深さ（-500/-1000等）は加工可能エリア未確認のため、この数値は流用しないこと。';

const KKE_450_MACHINABLE_AREA_A: MachinableArea = {
  face: 'A',
  faceLabel: 'A面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  workableHeightMm: 920 - (100 + 120) - 100,
  keepOutZones: [insertMarkZone()],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' A面は加工可能エリア矩形に加え、920mm寸法チェーン（DIMENSIONエンティティ）も直接確認済み。訂正履歴ありコード上部コメント参照。',
};

const KKE_450_MACHINABLE_AREA_B: MachinableArea = {
  face: 'B',
  faceLabel: 'B面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  workableHeightMm: 600,
  keepOutZones: [],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' B面は加工可能エリア矩形(350×600mm)を直接測定。920mm寸法チェーンの数値注記(DIMENSION)はこの図面ではA面にしか描かれていないが、' +
    '注記が紐付く外枠ジオメトリ自体がB面の位置にも同一形状で独立して描画されていることを確認済み。⊗マークは無し（実測で確認済み）。',
};

const KKE_450_MACHINABLE_AREA_C: MachinableArea = {
  face: 'C',
  faceLabel: 'C面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  workableHeightMm: 600,
  keepOutZones: [insertMarkZone()],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' C面は加工可能エリア矩形(350×600mm)を直接測定。920mm寸法チェーンの数値注記(DIMENSION)はこの図面ではA面にしか描かれていないが、' +
    '注記が紐付く外枠ジオメトリ自体がC面の位置にも同一形状で独立して描画されていることを確認済み。⊗マークあり（A面と同じくローカル(175,274)に実測）。',
};

const KKE_450_MACHINABLE_AREA_D: MachinableArea = {
  face: 'D',
  faceLabel: 'D面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  workableHeightMm: 600,
  keepOutZones: [],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' D面は加工可能エリア矩形(350×600mm)を直接測定。920mm寸法チェーンの数値注記(DIMENSION)はこの図面ではA面にしか描かれていないが、' +
    '注記が紐付く外枠ジオメトリ自体がD面の位置にも同一形状で独立して描画されていることを確認済み。⊗マークは無し（実測で確認済み）。',
};

/**
 * サイズ×面ごとの加工可能エリア。450以外はnull＝未確認。
 * 呼び出し側（計算エンジン・UI）は必ずnullを「未確認」として扱い、それらしい値で埋めないこと。
 */
export function machinableAreasFor(width: KkEWidth): Record<HandholeFace, MachinableArea | null> {
  if (width === 450) {
    return { A: KKE_450_MACHINABLE_AREA_A, B: KKE_450_MACHINABLE_AREA_B, C: KKE_450_MACHINABLE_AREA_C, D: KKE_450_MACHINABLE_AREA_D };
  }
  return { A: null, B: null, C: null, D: null };
}

/**
 * 各面の「加工可能エリア左下」を原点としたローカルmm座標から、KKE450_B75.dxf実物の
 * 絶対座標へ変換するためのオフセット。DXF内のDIMENSIONエンティティ実測値・および
 * D-STR-STR5レイヤーに実際に描画されている矩形の絶対座標から、面ごとに個別に確定した
 * （A面はプロトタイプ検証で確定済み、B/C/D面は2026-09-15の4面対応調査で確定）。
 * スケール1:1、回転・反転なし（4面とも同じ向き）。数値は実測値そのものなので変更しないこと。
 */
export const KKE_450_FACE_DXF_ORIGIN: Record<HandholeFace, { dxfOriginX: number; dxfOriginY: number }> = {
  A: { dxfOriginX: 1995.959259451858, dxfOriginY: 1964.301545107644 },
  B: { dxfOriginX: 3345.959259451859, dxfOriginY: 1964.301545107644 },
  C: { dxfOriginX: 1995.959259451858, dxfOriginY: 726.8011701076509 },
  D: { dxfOriginX: 3345.959259451859, dxfOriginY: 726.8011701076509 },
};
