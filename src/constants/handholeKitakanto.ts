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
 * コネクター本体の外径（mm）＝ FEP呼び径 × コネクター銘柄 の2軸テーブル。
 * null＝そのFEP呼び径にその銘柄の設定が無い（HOLE_DIAMETER_MMのnullと一致するはず）。
 *
 * 【重要・設計変更の根拠】離隔ルール「コネクター同士の離隔は最低10mm以上」は、
 * 穴径（ビット径）ではなく、この「コネクター本体の外径」を基準にしている。
 * 北関東工業の実物資料で確定的に裏付け済み（2026-09-16 社長ご指摘・再調査）:
 *
 *   - drawing_howto.pdf の配置例図：「なんでも継手」FEP100(外径φ150)とFEP65(外径φ110)を
 *     隣接配置した箇所に、赤字で離隔「10」・中心間距離「140」の寸法線がある。
 *     150/2 + 110/2 + 10 = 75 + 55 + 10 = 140 と完全一致する
 *     （穴径＝ビット径ではFEP100=φ120, FEP65=φ90であり、この数字には絶対にならない）。
 *   - connector_list.pdf にも「最小離隔（縦横時）：なんでも継手の外寸でとる事！」
 *     「最小離隔（斜め時）：角型継手の外寸でとる事！」と明記されている。
 *
 * 出典: 北関東工業 connector_list.pdf（26版：2023年12月14日、ベクターPDFを
 * pdftotext -layout で直接抽出・検算済み。2026-09-16確認）。捏造禁止・原本の数値そのまま。
 *
 * 【確定】kkfit（KKフィット）FEP100の外径は182で確定。当初、北関東工業の本社カタログp.114の
 * 低解像度画像では「162」とも読めて未確定だったが、KKフィット単体の専用技術資料
 * （https://kitakanto.co.jp/ 「KKフィット」ページのPDF、「構成・寸法」表、2022.5版）を
 * 別途発見して直接確認した結果、KKF-100の外径はA=φ182と明記されており確定した
 * （2026-09-16）。同資料の「E：推奨値」列（推奨コア径）が、下のHOLE_DIAMETER_MM(kkfit)の
 * 全8サイズと完全一致することも確認済みで、ビット径データの独立した裏付けにもなっている。
 *
 * holeonly（穴のみ）はコネクター本体が存在しないため外径の概念が無く、全てnull。
 * その場合は離隔・配置判定は従来通り穴径（ビット径）ベースにフォールバックする
 * （footprintDiameterFor参照）。
 */
export const CONNECTOR_OUTER_DIAMETER_MM: Record<ConnectorBrand, Record<FepSize, number | null>> = {
  nandemo:    { 30: 65, 40: 75, 50: 95, 65: 110, 80: 125, 100: 150, 125: 195, 150: 220, 200: null },
  // kkfit FEP100=182は確定済み（KKフィット専用技術資料「構成・寸法」表で直接確認、上記コメント参照）。
  kkfit:      { 30: 74, 40: 89, 50: 98, 65: 123, 80: 138, 100: 182, 125: 212, 150: 240, 200: null },
  kmm_eflex:  { 30: 75, 40: 80, 50: 100, 65: 120, 80: 135, 100: 164, 125: 218, 150: 218, 200: null },
  kmm_tac:    { 30: 75, 40: 80, 50: 100, 65: 120, 80: 135, 100: 164, 125: 218, 150: 218, 200: null },
  pljoint_s:  { 30: 74, 40: 89, 50: 98, 65: 123, 80: 138, 100: 182, 125: 213, 150: 241, 200: null },
  kmf:        { 30: 75, 40: 85, 50: 110, 65: 129, 80: 153, 100: 185, 125: 218, 150: 246, 200: null },
  // 穴のみ：コネクター本体が存在しないため外径の概念そのものが無い（全てnull＝データ欠落ではない）。
  holeonly:   { 30: null, 40: null, 50: null, 65: null, 80: null, 100: null, 125: null, 150: null, 200: null },
};

/** コネクター本体の外径(mm)。テーブルに無ければ（またはholeonly等で概念が無ければ）null。 */
export function connectorOuterDiameterFor(brand: ConnectorBrand, fep: FepSize): number | null {
  return CONNECTOR_OUTER_DIAMETER_MM[brand]?.[fep] ?? null;
}

/**
 * 配置・離隔・⊗マーク干渉判定に使う「実効直径」(mm)。
 * 考え方：コネクター外径が定義されていればそれを使う（実物の離隔ルールは外径基準のため）。
 * 定義が無い場合（＝"穴のみ"のようにコネクター本体そのものが存在しない加工）は、
 * 従来通り穴径（ビット径）にフォールバックする。
 * 穴径自体がテーブルに無い（=データ欠落）場合はnullを返す。この場合の扱いは
 * 呼び出し側の既存のエラー経路（「穴径データがありません」）に委ねる。
 *
 * 注意：ここで返す値はあくまで「配置・離隔判定用」。発注仕様・DXFに書き込む
 * 「実際に開ける穴の大きさ」は引き続きholeDiameterForの値（diameterMm）を使うこと。
 */
export function footprintDiameterFor(brand: ConnectorBrand, fep: FepSize): number | null {
  const outer = connectorOuterDiameterFor(brand, fep);
  if (outer != null) return outer;
  return holeDiameterFor(brand, fep);
}

/**
 * コネクター同士の最低離隔(mm)。「穴のみ」加工は30mm以上、それ以外は10mm以上。
 * 出典: 北関東工業 加工図面の注記（2026-09-15確認）。
 */
export function minClearanceFor(brand: ConnectorBrand): number {
  return brand === 'holeonly' ? 30 : 10;
}

/**
 * 【重要な限界】この10mm/30mmという離隔ルールは、あくまで北関東工業の資料が定める
 * 「コネクター同士が机上で干渉しないための最小値」であり、実際に施工者が現場で
 * 締め付け作業をするための工具スペースは考慮されていない（2026-09-16、社長ご指摘・
 * サブエージェント調査で確認）。
 *
 * 根拠：KKフィット専用技術資料（KKfit_dedicated_brochure.pdf）注意事項に
 * 「FEP管は手締めしてください。工具は使用しないでください。※サイズ100,125,150は
 * 工具もご使用可能です。（工具を使用する場合は手締め後25°まで）」とあり、大径サイズは
 * 手締めだけでは不十分で工具（ベルトレンチ等。北関東工業自身は工具名を明記していないが、
 * 同じ用途の他社製品＝立基「PLジョイント/Stype」の施工要領書ではΦ125・Φ150で
 * 「締め具（別売品）もしくはベルトレンチ」と明記されている）を使う運用が前提になっている。
 * しかし北関東工業のどの資料にも「工具使用時に周囲へ追加で何mm空けるか」という定めは無い
 * （drawing_howto.pdf・connector_list.pdfとも、サイズによらず離隔は一律10mmのまま）。
 *
 * つまり「メーカー資料通りに実装すると、大径コネクターの工具アクセス性までは保証できない」
 * という、実装ではなく元資料側の限界。数値化された基準が無い以上、この関数で勝手に
 * 補正値を追加することはしない（捏造にあたるため）。判断はツール側の`extraClearanceMm`
 * オプション（handholeLayoutEngine.ts）でユーザー（現場を知る人間）に委ねる。
 *
 * 【実務知見（2026-09-16、社長指示によるサブエージェント4体でのYouTube等実写調査）】
 * 公式な数値基準は日本語圏・英語圏いずれの映像にも存在しなかったが、質的な裏付けは得られた。
 * 同用途の他社品・立基「PLジョイント/Stype」施工動画では、字幕で明確にサイズによる
 * 工具要否の分岐が示されている：「Φ125・Φ150に関しては締め具（別売品）、もしくはベルトレンチを
 * ご使用下さい」（実際にベルト状工具を巻き付けて締める映像あり）／それ以外のサイズは
 * 「特別な工具は不要です」「全サイズ手で締め込んでください」。北関東工業自身のKKフィット公式
 * 施工動画は見つからなかったが、この他社実例は「大径のみ工具が要る」という本関数の前提を
 * 独立に裏付けるものと言える。また共栄ハンドホール工業の電動ドリルドライバ式継手のように、
 * 工具の種類によって必要なクリアランスの向き（ベルトレンチ＝周方向のスイング空間、
 * 電動ドライバ＝軸方向のアクセス空間）が異なる実例もあり、`extraClearanceMm`は
 * 「一律の追加半径」という単純化である点も踏まえて現場判断に委ねる。
 * 詳細はObsidianメモ project_handhole_knockout_app.md 参照。
 */
export function likelyNeedsTightenToolFor(brand: ConnectorBrand, fep: FepSize): boolean {
  // 確認が取れているのはKKフィットのFEP100以上のみ（上記コメント参照）。
  // 他銘柄は北関東工業の資料に記載が無く「不明」であり、falseは「工具不要」を意味しない。
  return brand === 'kkfit' && fep >= 100;
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

// ── 内空高さバリエーション（品名規格の末尾。縁塊+スラブ+継胴+ベースの組み合わせ） ──────
//
// 北関東工業のKK-E型は「分割式」（縁塊+スラブ+継胴+ベース、最大4ピースを上下に積み重ねる構造。
// カタログ本文いわく「分割式であるため、大型ラフタークレーンが不要」）が標準仕様。同じ内空幅
// (width)でも、この組み合わせ（品名規格の末尾。例:"600E-1200"）によって内空高さ・ピース構成・
// 加工可能エリアのブロック構造が変わる（2026-09-17/18、社長ご指摘・実物図面調査で判明）。
//
// 出典: https://kitakanto.co.jp/pages/1292/ （2026-09-18確認、「縁塊付き」のみ）。
// 600サイズはこのページで6つの高さバリエーションを確認したが、実際に加工図面をDXF解析して
// 加工可能エリアを確定できたのは600E-600と600E-1200の2つのみ。残り4つ（750/900mm×2通り/
// 1050mm、いずれも「縁塊付き」）は一覧の存在だけ確認し、正確な品名規格コード・加工可能エリアの
// 実寸は未確認のため、ここには載せない（それらしいコードを補って埋めることは捏造にあたる）。
// 「角枠付き」「化粧蓋付き」等リッド種別違いの高さバリエーションも未調査。
//
// 900サイズ（2026-09-18追加）: 実発注データ調査（PLANEST-EF拾いデータ＋栃木県内9自治体の
// 実際の入札設計書、多数案件を実際に読んで抽出）で「900×900×900mm」「900×900×1200mm」が
// 実務で圧倒的に多く使われていることが判明したため、450/600に続いて実物図面調査を実施した。
// https://kitakanto.co.jp/pages/1333/#block1161 で900E-600/900E-900(S15+B75)/
// 900E-900(S45+B45)/900E-1000/900E-1200/900E-1300/900E-1500の7バリエーション存在を確認、
// このうち900E-900(S45+B45)と900E-1200(S45+B75)の2つを実際にDXF解析した。
// 900mmには構成の異なる組み合わせが2通り存在する（S15+B75とS45+B45、どちらも内空高さ900mm）。
// 今回実際にDXFを解析したのはS45+B45の方のみで、そのDXFタイトルは"９００Ｅ-９００"だった
// （S15+B75の方は未解析・タイトル表記も未確認。もし同じ"900E-900"という品名規格になるなら
// 2つの物理的に異なる構造が同じコードを共有してしまう可能性があるが、今回はS15+B75を
// 開いていないため確認できていない）。以下の`code: '900E-900'`のデータはS45+B45の実測値である。
export interface KkEHeightVariant {
  /** 品名規格（例:"600E-1200"）。加工図面のタイトル注記に実在する文字列そのもの。machinableAreasForに渡すキー。 */
  code: string;
  width: KkEWidth;
  /** 内空高さ(mm)。 */
  innerHeightMm: number;
  /** ピース構成（縁塊+スラブ+継胴+ベースの組み合わせ）。参考表示用。 */
  pieceCombo: string;
}

export const KKE_HEIGHT_VARIANTS: Record<KkEWidth, KkEHeightVariant[]> = {
  450: [{ code: '450E-750', width: 450, innerHeightMm: 750, pieceCombo: '(未確認)' }],
  600: [
    { code: '600E-600', width: 600, innerHeightMm: 600, pieceCombo: 'S15+B45' },
    { code: '600E-1200', width: 600, innerHeightMm: 1200, pieceCombo: 'S45+B75' },
  ],
  900: [
    { code: '900E-900', width: 900, innerHeightMm: 900, pieceCombo: 'S45+B45' },
    { code: '900E-1200', width: 900, innerHeightMm: 1200, pieceCombo: 'S45+B75' },
  ],
  800: [], 1000: [], 1200: [], 1500: [], 1800: [], 2000: [],
};

/** widthの高さバリエーション一覧（実寸確認済みのものだけ）。無ければ空配列。 */
export function heightVariantsFor(width: KkEWidth): KkEHeightVariant[] {
  return KKE_HEIGHT_VARIANTS[width];
}

/** widthの既定バリエーション（一覧の先頭）。1件も無ければnull。 */
export function defaultHeightVariantFor(width: KkEWidth): KkEHeightVariant | null {
  return KKE_HEIGHT_VARIANTS[width][0] ?? null;
}

// ── 加工可能エリア（発注時にコネクター図を配置できる範囲） ──────────────
//
// **確認できているのは以下3バリエーションのA/B/C/D全4面のみ**（他は加工可能エリアの実寸が
// 未確認）。450サイズの比率を他サイズへ流用・外挿することは行わない（サイズ・高さ構成ごとに
// 比率が異なる可能性が高いため、それは捏造にあたる、と社長より厳命）。
//
// 【450E-750】単一ブロック。全幅530mm中、加工可能エリア幅350mm（左右各90mmは加工不可）。
//   高さは、DXF実物（KKE450_B75.dxf、2026-09-15にDXFプロトタイプ検証で解析）内に
//   「加工可能エリア」として明示的に描画されている矩形そのものの寸法を直接採用：600mm。
//   この600mmは、上端からの寸法チェーン 100+120+600+100=920mm（DXFのDIMENSIONエンティティの
//   実測値と完全一致）の中央区間そのもの。上端除外220mm(=100+120)、下端除外100mm、
//   合計920mmの中の可動域600mmという、単一の寸法チェーンで自己整合する値。
//   B/C/D面もA面と同一形状の矩形・外枠ジオメトリが独立して描画されていることを確認済み
//   （面ラベルMTEXTで裏取り。B/D面はA面からX+1350mm、C/D面はA面からY-1237.5mmの位置）。
//   ⊗マーク（内部インサート、タイトル注記「※AC面にあるこのマークは外側にあるインサートです。
//   このインサートで吊らないでください。」）はA面・C面のみ、ローカル(175,274)半径22.5mm。
//
//   【訂正履歴】当初は「内空高さ750mm（品名規格の末尾"-750"）を全高とみなし、
//   上端100+120mm・下端70+100mmを除外」として360mmと計算していたが、この「70mm」は
//   実際には別系統の寸法チェーン（100+750+70=920、750は内空高さそのものを示す別の注記）から
//   誤って混同したものだった。DXFに直接描画された矩形（動かぬ証拠）で確認したところ600mmが正しく、
//   360mmは誤りだったため訂正した。
//
// 【600E-600（S15+B45、最も単純な高さ組み合わせ）】単一ブロック。全幅680mm中、加工可能エリア幅
//   450mm。全高840mm、上端除外395mm(100+220+75)、下端除外125mm、可動域320mm。
//   ⊗マークはA/C面のみ、ブロックローカル(225,65)半径22.5mm（450と同じ半径）。
//
// 【600E-1200（S45+B75）】上下2ブロック。全幅680mm・可動域450mmは600E-600と同じ。全高1440mm、
//   上端除外320mm(100+220)、下端除外125mm。下ブロック(index0)450×620mm、接合部
//   （継胴/ベースの接合部＝製品情報プレート位置、加工不可）150mm、上ブロック(index1)450×225mm。
//   ⊗マークは下ブロックのみ（A/C面）、ブロックローカル(225,199)半径22.5mm。上ブロックには無し。
//   タイトル注記は450と共通（「ABCD面及びステップの位置は変更出来ません」「加工可能エリア外の
//   加工についてはご相談ください」等）。
//
//   自己整合チェック（buildMachinableAreaの計算と一致することを手計算でも確認済み）:
//     600E-600:  395(top) + 320(block) + 125(bottom) = 840 ✓
//     600E-1200: 320(top) + 225(上block) + 150(gap) + 620(下block) + 125(bottom) = 1440 ✓
//
// 出典: 北関東工業 KK-E型ハンドホール加工図面（HP掲載）実物DXF解析
//       （scratchpad: KKE450_B75.dxf 2026-09-15、KKE600_S15B45.dxf/KKE600_S45B75.dxf 2026-09-18）。
export interface FaceKeepOutZone {
  /** UI表示用ラベル。 */
  label: string;
  /** 中心のローカル座標(mm)。定義元のブロックの左下を原点とする（buildMachinableAreaが全体座標に変換する）。 */
  xMm: number;
  yMm: number;
  /** 避けるべき半径(mm)。DXF実測（⊗マークの対角線の半分）。 */
  radiusMm: number;
  /** 出典・注記。 */
  sourceNote: string;
}

/** 1つの分割ピース（縁塊/スラブ/継胴/ベース等）に対応する加工可能エリアの矩形1つぶん。 */
export interface MachinableBlock {
  /** このブロックの加工可能高さ(mm)。 */
  heightMm: number;
  /** ブロック内の避けるべき領域。ローカル座標(yMmはこのブロックの下端を0とする)。 */
  keepOutZones: FaceKeepOutZone[];
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
  /** この寸法チェーンの全高(mm)。 */
  totalHeightMm: number;
  /** 面の上端から一番上のブロックの上端までの加工不可帯(mm)。 */
  topExcludeMm: number;
  /** 一番下のブロックの下端から面の下端までの加工不可帯(mm)。 */
  bottomExcludeMm: number;
  /**
   * ブロック一覧。先頭(index 0)＝一番下のブロック（段番号の「1段目＝一番下」と同じ向き）。
   * 450やシンプルな600E-600のように分割ピースの接合部が加工可能エリアに掛からない場合は
   * 要素数1。600E-1200のように接合部が加工可能エリアの途中に来る場合は要素数2以上になり、
   * ブロックとブロックの間はgapsMmぶん加工不可（コネクター配置不可）になる。
   */
  blocks: MachinableBlock[];
  /** ブロック間の隙間(mm)＝ピース接合部の加工不可帯。長さ=blocks.length-1。 */
  gapsMm: number[];
  /**
   * blocksの合計高さ+ブロック間の隙間(mm)＝一番下のブロック下端から一番上のブロック上端まで。
   * buildMachinableAreaが自動計算する。段(row)の積み上げ判定・図面描画の座標系の上限として使う
   * （blocks.length===1の場合は単にそのブロックの高さと同じ）。
   */
  workableHeightMm: number;
  /**
   * 各ブロックのkeepOutZoneを、このMachinableArea全体のローカル座標(y=0が一番下のブロックの
   * 下端)に変換して1つにまとめたもの。buildMachinableAreaが自動計算する。描画・簡易表示用。
   * 段の配置判定(computeFaceLayout)は隙間をまたいだ誤判定を避けるため、この配列ではなく
   * 個別ブロックのblocks[i].keepOutZones（ブロックローカル座標）を使うこと。
   */
  keepOutZones: FaceKeepOutZone[];
  /** blocks[i]のこのMachinableArea全体でのローカル下端(mm)。buildMachinableAreaが自動計算。 */
  blockBottomsMm: number[];
  /** 出典・注記。UIにそのまま出す。 */
  sourceNote: string;
}

/**
 * blocks/gapsMmから、workableHeightMm・keepOutZones（全体ローカル座標に変換済み）・
 * blockBottomsMmを自動計算する。面ごとのデータは必ずこの関数を通して組み立てること
 * （手計算で埋めるとブロック数・寸法を変えた時に食い違いが起きるため）。
 */
function buildMachinableArea(
  input: Omit<MachinableArea, 'workableHeightMm' | 'keepOutZones' | 'blockBottomsMm'>,
): MachinableArea {
  const blockBottomsMm: number[] = [];
  let cursor = 0;
  input.blocks.forEach((b, i) => {
    blockBottomsMm.push(cursor);
    cursor += b.heightMm;
    if (i < input.gapsMm.length) cursor += input.gapsMm[i];
  });
  const keepOutZones = input.blocks.flatMap((b, i) =>
    b.keepOutZones.map(z => ({ ...z, yMm: z.yMm + blockBottomsMm[i] })),
  );
  return { ...input, workableHeightMm: cursor, keepOutZones, blockBottomsMm };
}

function insertMarkZone(xMm: number, yMm: number, sourceNote: string): FaceKeepOutZone {
  return { label: '⊗マーク（内部インサート）', xMm, yMm, radiusMm: 22.5, sourceNote };
}

const KKE_450_INSERT_MARK_SOURCE_NOTE =
  '北関東工業 KK-E型ハンドホール 450E-750 加工図面DXF実物解析（2026-09-15）。' +
  '⊗マーク（内部インサート）の対角線2本（レイヤーD-STR-STR5）を実測。' +
  'タイトル注記「※AC面にあるこのマークは外側にあるインサートです。このインサートで吊らないでください。' +
  '（干渉しないように削孔させていただきます。）」の裏付けあり。';

const KKE_450_SOURCE_NOTE_COMMON =
  '北関東工業 KK-E型ハンドホール 450E-750の加工図面DXF実物解析による実測値' +
  '（2026-09-15、加工可能エリアの描画矩形そのものを各面ごとに直接測定。' +
  '450以外のサイズ・450の別の深さ（-500/-1000等）は加工可能エリア未確認のため、この数値は流用しないこと。';

const KKE_450_MACHINABLE_AREA_A: MachinableArea = buildMachinableArea({
  face: 'A',
  faceLabel: 'A面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  blocks: [{ heightMm: 600, keepOutZones: [insertMarkZone(175, 274, KKE_450_INSERT_MARK_SOURCE_NOTE)] }],
  gapsMm: [],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' A面は加工可能エリア矩形に加え、920mm寸法チェーン（DIMENSIONエンティティ）も直接確認済み。訂正履歴ありコード上部コメント参照。',
});

const KKE_450_MACHINABLE_AREA_B: MachinableArea = buildMachinableArea({
  face: 'B',
  faceLabel: 'B面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  blocks: [{ heightMm: 600, keepOutZones: [] }],
  gapsMm: [],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' B面は加工可能エリア矩形(350×600mm)を直接測定。920mm寸法チェーンの数値注記(DIMENSION)はこの図面ではA面にしか描かれていないが、' +
    '注記が紐付く外枠ジオメトリ自体がB面の位置にも同一形状で独立して描画されていることを確認済み。⊗マークは無し（実測で確認済み）。',
});

const KKE_450_MACHINABLE_AREA_C: MachinableArea = buildMachinableArea({
  face: 'C',
  faceLabel: 'C面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  blocks: [{ heightMm: 600, keepOutZones: [insertMarkZone(175, 274, KKE_450_INSERT_MARK_SOURCE_NOTE)] }],
  gapsMm: [],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' C面は加工可能エリア矩形(350×600mm)を直接測定。920mm寸法チェーンの数値注記(DIMENSION)はこの図面ではA面にしか描かれていないが、' +
    '注記が紐付く外枠ジオメトリ自体がC面の位置にも同一形状で独立して描画されていることを確認済み。⊗マークあり（A面と同じくローカル(175,274)に実測）。',
});

const KKE_450_MACHINABLE_AREA_D: MachinableArea = buildMachinableArea({
  face: 'D',
  faceLabel: 'D面',
  totalWidthMm: 530,
  workableWidthMm: 350,
  totalHeightMm: 920,
  topExcludeMm: 100 + 120,
  bottomExcludeMm: 100,
  blocks: [{ heightMm: 600, keepOutZones: [] }],
  gapsMm: [],
  sourceNote:
    KKE_450_SOURCE_NOTE_COMMON +
    ' D面は加工可能エリア矩形(350×600mm)を直接測定。920mm寸法チェーンの数値注記(DIMENSION)はこの図面ではA面にしか描かれていないが、' +
    '注記が紐付く外枠ジオメトリ自体がD面の位置にも同一形状で独立して描画されていることを確認済み。⊗マークは無し（実測で確認済み）。',
});

const KKE600_SOURCE_NOTE_COMMON =
  '北関東工業 KK-E型ハンドホール600サイズの加工図面DXF実物解析による実測値（2026-09-18、' +
  'サブエージェントがezdxfでブロック参照を再帰explodeし座標・寸法エンティティ・PDFテキスト層から' +
  '直接抽出。全高＝上端除外+ブロック高さ+隙間+下端除外の自己整合を検算済み）。' +
  '600の他の高さバリエーション（750/900mm×2通り/1050mm）は未確認のため流用しないこと。';

const KKE600_600_SOURCE_NOTE =
  KKE600_SOURCE_NOTE_COMMON + ' 品名規格「ＫＫ-Ｅ型ハンドホール　６００Ｅ-６００」（S15+B45、単一ブロック）。' +
  '出典ファイル: KKE600_S15B45.dxf（元ファイル名202512150829306474.dxf）、' +
  'https://kitakanto.co.jp/pages/1329/#block1157-4117';

const KKE600_1200_SOURCE_NOTE =
  KKE600_SOURCE_NOTE_COMMON + ' 品名規格「ＫＫ-Ｅ型ハンドホール　６００Ｅ-１２００」（S45+B75、上下2ブロック）。' +
  '出典ファイル: KKE600_S45B75.dxf（元ファイル名202512150911265534.dxf）、' +
  'https://kitakanto.co.jp/pages/1329/#block1157-4122';

function build600_600Area(face: HandholeFace, faceLabel: MachinableArea['faceLabel'], hasInsertMark: boolean): MachinableArea {
  return buildMachinableArea({
    face,
    faceLabel,
    totalWidthMm: 680,
    workableWidthMm: 450,
    totalHeightMm: 840,
    topExcludeMm: 395,
    bottomExcludeMm: 125,
    blocks: [{ heightMm: 320, keepOutZones: hasInsertMark ? [insertMarkZone(225, 65, KKE600_600_SOURCE_NOTE)] : [] }],
    gapsMm: [],
    sourceNote: KKE600_600_SOURCE_NOTE + ` ${faceLabel}は加工可能エリア矩形(450×320mm)を直接測定。`,
  });
}

function build600_1200Area(face: HandholeFace, faceLabel: MachinableArea['faceLabel'], hasInsertMark: boolean): MachinableArea {
  return buildMachinableArea({
    face,
    faceLabel,
    totalWidthMm: 680,
    workableWidthMm: 450,
    totalHeightMm: 1440,
    topExcludeMm: 320,
    bottomExcludeMm: 125,
    // index0=下ブロック(620mm、⊗マークがあればここ)、index1=上ブロック(225mm、⊗マーク無し)。
    blocks: [
      { heightMm: 620, keepOutZones: hasInsertMark ? [insertMarkZone(225, 199, KKE600_1200_SOURCE_NOTE)] : [] },
      { heightMm: 225, keepOutZones: [] },
    ],
    gapsMm: [150],
    sourceNote: KKE600_1200_SOURCE_NOTE + ` ${faceLabel}は加工可能エリアが上下2ブロック(下620mm/接合部150mm/上225mm)に分かれる。`,
  });
}

const KKE600_600_AREA: Record<HandholeFace, MachinableArea> = {
  A: build600_600Area('A', 'A面', true),
  B: build600_600Area('B', 'B面', false),
  C: build600_600Area('C', 'C面', true),
  D: build600_600Area('D', 'D面', false),
};

const KKE600_1200_AREA: Record<HandholeFace, MachinableArea> = {
  A: build600_1200Area('A', 'A面', true),
  B: build600_1200Area('B', 'B面', false),
  C: build600_1200Area('C', 'C面', true),
  D: build600_1200Area('D', 'D面', false),
};

const KKE900_SOURCE_NOTE_COMMON =
  '北関東工業 KK-E型ハンドホール900サイズの加工図面DXF実物解析による実測値（2026-09-18、' +
  '実発注データ調査で900×900が最頻出サイズと判明したため調査。ezdxfでブロック参照を再帰explodeし' +
  '座標・寸法エンティティ・PDFテキスト層から直接抽出。全高＝上端除外+ブロック高さ+隙間+下端除外の' +
  '自己整合を検算済み）。900の他の高さバリエーション（600/900mm(S15+B75)/1000/1300/1500）は' +
  '未確認のため流用しないこと。';

const KKE900_900_SOURCE_NOTE =
  KKE900_SOURCE_NOTE_COMMON + ' 品名規格「ＫＫ-Ｅ型ハンドホール　９００Ｅ-９００」（S45+B45、上下2ブロック。' +
  '900mmのもう一方の組み合わせS15+B75は未解析）。' +
  '出典ファイル: 900_S45B45.dxf（元ファイル名202512160847074509.dxf）、' +
  'https://kitakanto.co.jp/pages/1333/#block1161';

const KKE900_1200_SOURCE_NOTE =
  KKE900_SOURCE_NOTE_COMMON + ' 品名規格「ＫＫ-Ｅ型ハンドホール　９００Ｅ-１２００」（S45+B75、上下2ブロック）。' +
  '出典ファイル: 1200_S45B75.dxf（元ファイル名202512160854236681.dxf）、' +
  'https://kitakanto.co.jp/pages/1333/#block1161';

/**
 * 900E-900（S45+B45）。600E-1200と縦方向の内訳（上端除外320・接合部150・下端除外125）が
 * 完全に一致する（幅・下ブロック高さのみ異なる）。「S/Bピースの高さ構成は幅サイズに依存せず
 * 一定」という仮説を裏付ける結果だが、他サイズでの検証はまだ行っていない（2026-09-18確認）。
 */
function build900_900Area(face: HandholeFace, faceLabel: MachinableArea['faceLabel'], hasInsertMark: boolean): MachinableArea {
  return buildMachinableArea({
    face,
    faceLabel,
    totalWidthMm: 1000,
    workableWidthMm: 750,
    totalHeightMm: 1140,
    topExcludeMm: 320,
    bottomExcludeMm: 125,
    // index0=下ブロック(320mm、⊗マークがあればここ)、index1=上ブロック(225mm、⊗マーク無し)。
    blocks: [
      { heightMm: 320, keepOutZones: hasInsertMark ? [insertMarkZone(375, 53, KKE900_900_SOURCE_NOTE)] : [] },
      { heightMm: 225, keepOutZones: [] },
    ],
    gapsMm: [150],
    sourceNote: KKE900_900_SOURCE_NOTE + ` ${faceLabel}は加工可能エリアが上下2ブロック(下320mm/接合部150mm/上225mm)に分かれる。`,
  });
}

function build900_1200Area(face: HandholeFace, faceLabel: MachinableArea['faceLabel'], hasInsertMark: boolean): MachinableArea {
  return buildMachinableArea({
    face,
    faceLabel,
    totalWidthMm: 1000,
    workableWidthMm: 750,
    totalHeightMm: 1440,
    topExcludeMm: 320,
    bottomExcludeMm: 125,
    // index0=下ブロック(620mm、⊗マークがあればここ)、index1=上ブロック(225mm、⊗マーク無し)。
    // 600E-1200と縦方向の内訳が完全に一致（下ブロック620mmまで同値）。
    blocks: [
      { heightMm: 620, keepOutZones: hasInsertMark ? [insertMarkZone(375, 190, KKE900_1200_SOURCE_NOTE)] : [] },
      { heightMm: 225, keepOutZones: [] },
    ],
    gapsMm: [150],
    sourceNote: KKE900_1200_SOURCE_NOTE + ` ${faceLabel}は加工可能エリアが上下2ブロック(下620mm/接合部150mm/上225mm)に分かれる。`,
  });
}

const KKE900_900_AREA: Record<HandholeFace, MachinableArea> = {
  A: build900_900Area('A', 'A面', true),
  B: build900_900Area('B', 'B面', false),
  C: build900_900Area('C', 'C面', true),
  D: build900_900Area('D', 'D面', false),
};

const KKE900_1200_AREA: Record<HandholeFace, MachinableArea> = {
  A: build900_1200Area('A', 'A面', true),
  B: build900_1200Area('B', 'B面', false),
  C: build900_1200Area('C', 'C面', true),
  D: build900_1200Area('D', 'D面', false),
};

/**
 * サイズ(width)×高さバリエーション(heightVariantCode)ごとの面別加工可能エリア。
 * heightVariantCodeを省略した場合はそのwidthの既定バリエーション（KKE_HEIGHT_VARIANTSの先頭）を使う。
 * 該当データが無い（未確認の組み合わせ、または存在しないコードを渡した）場合は4面ともnullを返す。
 * 呼び出し側（計算エンジン・UI）は必ずnullを「未確認」として扱い、それらしい値で埋めないこと。
 *
 * 【確認済みデータ】上のコメント（加工可能エリアのセクション）参照。
 * - 450 (既定"450E-750"): 単一ブロック。
 * - 600 "600E-600"（既定、S15+B45）: 単一ブロック、可動域450×320mm。
 * - 600 "600E-1200"（S45+B75）: 上下2ブロック、⊗マークは下ブロックのみ。
 * - 900 "900E-900"（既定、S45+B45）: 上下2ブロック、可動域750×(320+150+225)mm。
 * - 900 "900E-1200"（S45+B75）: 上下2ブロック、可動域750×(620+150+225)mm。
 * それ以外のwidth・heightVariantCodeは未確認。450/600/900の比率を他へ流用・外挿することはしない。
 */
export function machinableAreasFor(
  width: KkEWidth,
  heightVariantCode?: string,
): Record<HandholeFace, MachinableArea | null> {
  const code = heightVariantCode ?? defaultHeightVariantFor(width)?.code;
  if (code === '450E-750') {
    return { A: KKE_450_MACHINABLE_AREA_A, B: KKE_450_MACHINABLE_AREA_B, C: KKE_450_MACHINABLE_AREA_C, D: KKE_450_MACHINABLE_AREA_D };
  }
  if (code === '600E-600') {
    return { ...KKE600_600_AREA };
  }
  if (code === '600E-1200') {
    return { ...KKE600_1200_AREA };
  }
  if (code === '900E-900') {
    return { ...KKE900_900_AREA };
  }
  if (code === '900E-1200') {
    return { ...KKE900_1200_AREA };
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
