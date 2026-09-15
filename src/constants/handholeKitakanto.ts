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

// ── 加工可能エリア（発注時にコネクター図を配置できる範囲） ──────────────
//
// **確認できているのはKK-E型450（品名規格「450E-750」＝内空高さ750mm）のA面のみ。**
// それ以外のサイズ（600/800/900/1000/1200/1500/1800/2000）は加工可能エリアの実寸が未確認。
// 450サイズの比率を他サイズへ流用・外挿することは行わない（サイズごとに比率が異なる可能性が
// 高いため、それは捏造にあたる、と社長より厳命）。
//
// 450E-750のA面:
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
// 出典: 北関東工業 KK-E型ハンドホール 450E-750 加工図面（HP掲載）実物DXF解析
//       （scratchpad: KKE450_B75.dxf、2026-09-15）。
export interface MachinableArea {
  /** どの面のデータか（今回はA面のみ） */
  faceLabel: string;
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
  /** 出典・注記。UIにそのまま出す。 */
  sourceNote: string;
}

const KKE_450_MACHINABLE_AREA_A: MachinableArea = {
  faceLabel: 'A面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  workableHeightMm: 920 - (100 + 120) - 100,
  sourceNote:
    '北関東工業 KK-E型ハンドホール 450E-750の加工図面DXF実物解析による実測値' +
    '（2026-09-15、加工可能エリアの描画矩形そのものを直接測定。訂正履歴あり、コード上部コメント参照）。' +
    '450以外のサイズ・450の別の深さ（-500/-1000等）は加工可能エリア未確認のため、この数値は流用しないこと。',
};

/**
 * サイズごとの加工可能エリア（A面）。450以外はnull＝未確認。
 * 呼び出し側（計算エンジン・UI）は必ずnullを「未確認」として扱い、それらしい値で埋めないこと。
 */
export function machinableAreaFor(width: KkEWidth): MachinableArea | null {
  return width === 450 ? KKE_450_MACHINABLE_AREA_A : null;
}
