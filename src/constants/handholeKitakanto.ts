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
  /**
   * 上端からの加工不可帯(mm)。100+120。
   * 【450専用の単純化】450サイズは分割ピースが1枚扱いのため単一の除外帯で表現できているが、
   * 600以上・ピラ用等の複数ピース構成では、この「単一のtop/bottomExclude」という形のまま
   * 拡張しないこと。ピースごと（縁塊/スラブ/継胴/ベース、組み合わせ次第で個数も変わる）に
   * 除外帯・接合部の離隔が異なりうる（2026-09-17、社長ご指摘）。将来600以上を実装する際は、
   * この2フィールドを「ブロックの配列（各ブロックが自分のtop/bottomExclude・高さを持つ）」に
   * 置き換え、決め打ちの単一定数にしないこと。machinableAreasFor直上のコメントも参照。
   */
  topExcludeMm: number;
  /** 下端からの加工不可帯(mm)。上記topExcludeMmの注記と同じ制約が適用される。 */
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
 *
 * 【重要・450以外を実装する前に必ず読むこと（2026-09-17、社長ご指摘・サブエージェント調査）】
 * 北関東工業のKK-E型は「分割式」（縁塊+スラブ+継胴+ベース、最大4ピースを上下に積み重ねる構造。
 * カタログ本文いわく「分割式であるため、大型ラフタークレーンが不要」）が標準仕様。450サイズは
 * 組み合わせ表が無い単純構成のため、たまたま「加工可能エリア＝単一矩形」というこの
 * `MachinableArea`のデータモデルで表現できているだけ。
 *
 * 実際にピラ用1000サイズ（KK-E型ピラ用ハンドホール 1000E-900）の加工図面PDFを直接確認したところ、
 * A〜D面すべてで加工可能エリアが**上下2ブロックに分かれ、ピース同士の接合部（製品情報プレート
 * 位置）は加工不可**という構造だった。600以上の標準ラインも同様に縁塊+スラブ+継胴+ベースの
 * 組み合わせ表を持つため、選んだ高さ構成によってブロック数・各ブロックの寸法が変わる可能性が高い。
 *
 * つまり600以上を実装する際は、「450の比率を外挿しない」というこれまでの注意に加えて、
 * **`MachinableArea`を単一矩形のままにせず、複数ブロック（gapを挟んだ配列）に対応する
 * データモデルへ拡張する必要がある**（そうしないと実物の接合部を加工可能領域に含めてしまう）。
 * 高さ構成（縁塊+スラブ+継胴+ベースの組み合わせ）ごとに個別の加工図面PDFが用意されているため、
 * サイズ×高さ構成の組み合わせごとに実物図面を確認しないと正しいブロック配置は分からない。
 *
 * 【設計指針（2026-09-17、社長ご指摘）】ブロックごとの上下除外帯・ブロック間の離隔（接合部の
 * 幅）は、450のtopExcludeMm/bottomExcludeMmのような「サイズ全体で共通の単一定数」にせず、
 * ブロックごとに個別の値を持てる構造にすること。組み合わせ（P/B/S/Tの選び方）によって
 * ピース数・各ピースの高さ・接合部の位置が変わるため、単一値に決め打ちすると別の組み合わせで
 * 破綻する。実装イメージ：`blocks: { heightMm: number; topExcludeMm: number; bottomExcludeMm:
 * number; keepOutZones: FaceKeepOutZone[] }[]` のような、ブロックごとに閉じたレコードの配列。
 * 詳細はObsidianメモ project_handhole_knockout_app.md 参照。
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
