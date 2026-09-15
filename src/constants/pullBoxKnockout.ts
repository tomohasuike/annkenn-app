// src/constants/pullBoxKnockout.ts
// プルボックス穴あけ計算用の基礎データ。
//
// 電線管の外径は新たに持たず、既存の conduitSpecReference（原本PDFと照合済み）から引く。
// このファイルが持つのは「ダクターチャンネルの高さ」「支持クリップのA寸法」「ノック穴径」の3つ。
//
// 出典:
//   ダクター高さ … ネグロス電工 総合カタログ ハンガー・サポートシステム p.420（D1/D2/D3）
//                  および公式商品情報サイトの寸法図（D15/D20）。幅40・開口20は全形式共通。
//   クリップA寸法 … ネグロス電工 電設資材カタログ p.505 電線管支持クリップ（DCシリーズ）
//                  A＝ダクター天端から金具頂部までの全高。管の芯高さではない点に注意。
//   おねじ外径   … パナソニック公式FAQ a_id/105516「厚鋼／薄鋼電線管ねじの基準寸法」
//   ノック穴径   … パナソニック公式FAQ a_id/105518 品番別「適合ノックアウト径」
//
// 検証記録: hitec-ai-team/reports/プルボックス穴あけアプリ_計画_2026-09-15/

import { CONDUIT_SPEC_REFERENCE_TABLES } from './conduitSpecReference';

/** ダクターチャンネルの形式 */
export type DucterType = 'D15' | 'D20' | 'D1' | 'D2' | 'D3';

/** ダクターチャンネルの断面高さ(mm)。芯高さ計算の起点になる。 */
export const DUCTER_HEIGHT_MM: Record<DucterType, number> = {
  D15: 15,
  D20: 20,
  D1: 30,
  D2: 45,
  D3: 75,
};

export const DUCTER_ORDER: DucterType[] = ['D15', 'D20', 'D1', 'D2', 'D3'];

/** ダクターチャンネルの幅・開口幅(mm)。全形式共通。作図に使う。 */
export const DUCTER_WIDTH_MM = 40;
export const DUCTER_OPENING_MM = 20;

/** 扱う電線管の種別。VE・PF/CD・プリカ(F2)は2026-09-15にHITECの調査で追加。 */
export type ConduitKind = 'C' | 'E' | 'G' | 'VE' | 'PFCD' | 'F2';

/** ねじ・ノック穴径のデータを昔ながらの管種別テーブルで持っている3種（鋼製管）。 */
type SteelConduitKind = 'C' | 'E' | 'G';

export const CONDUIT_KIND_LABELS: Record<ConduitKind, string> = {
  C: '薄鋼電線管',
  E: 'ねじなし電線管',
  G: '厚鋼電線管',
  VE: 'VE管（硬質ビニル）',
  PFCD: 'PF・CD管',
  F2: 'プリカチューブ(F2)',
};

/**
 * 種別ごとの呼び径。ノック穴径・外径の両方が確認できているサイズのみを載せる。
 *
 * VE呼び10・100、PF・CD呼び36/42/54は、ねじ呼び対応（後述のTHREAD_OPTIONS）は判明しているが、
 * 電線管そのものの外径の出典が無いためここには含めていない
 * （外径が無いと芯高さ・横の割り付けが計算できないため）。
 * 出典が見つかったらTHREAD_OPTIONSと一緒にここへ追加すること。
 */
export const CONDUIT_SIZES: Record<ConduitKind, number[]> = {
  C: [19, 25, 31, 39, 51, 63, 75],
  E: [19, 25, 31, 39, 51, 63, 75],
  G: [16, 22, 28, 36, 42, 54, 70, 82, 92, 104],
  VE: [14, 16, 22, 28, 36, 42, 54, 70, 82],
  PFCD: [14, 16, 22, 28],
  F2: [17, 24, 30, 38, 50, 63, 76],
};

/**
 * ボックスコネクタのおねじ部の外径(mm)。穴径の本当の根拠はこれ。
 * パナソニック公式FAQ a_id/105516「ねじの基準寸法」表より（厚鋼CTG／薄鋼CTC）。
 * ねじなし電線管(E)用コネクタのねじ部は薄鋼電線管ねじ(CTC)と同じなので C と同値。
 */
const THREAD_OD_MM: Record<SteelConduitKind, Record<number, number>> = {
  C: { 19: 19.1, 25: 25.4, 31: 31.8, 39: 38.1, 51: 50.8, 63: 63.5, 75: 76.2 },
  E: { 19: 19.1, 25: 25.4, 31: 31.8, 39: 38.1, 51: 50.8, 63: 63.5, 75: 76.2 },
  G: {
    16: 20.955, 22: 26.441, 28: 33.249, 36: 41.91, 42: 47.803,
    54: 59.614, 70: 75.184, 82: 87.884, 92: 100.33, 104: 113.03,
  },
};

/**
 * 適合ノックアウト径(mm)。あける穴そのものの直径。
 *
 * パナソニック公式FAQ a_id/105518 の品番別「適合ノックアウト径」表を正とする。
 * 同 a_id/105516 の「【参考】ノックアウト径」は整数に丸めた値で、
 * G22（27 対 27.1）と C25（26 対 26.1）の2件だけ**丸めたほうが小さい**。
 * 穴が小さいとコネクタが入らないので、丸めていない品番別の値を採用する。
 *
 * 公式の開口ルールは「おねじ外径＋約1〜2mm」（a_id/105518 本文）。
 */
const KNOCKOUT_MM: Record<SteelConduitKind, Record<number, number>> = {
  C: { 19: 19.6, 25: 26.1, 31: 32.5, 39: 39, 51: 52, 63: 65, 75: 77 },
  E: { 19: 19.6, 25: 26.1, 31: 32.5, 39: 39, 51: 52, 63: 65, 75: 77 },
  G: { 16: 21.5, 22: 27.1, 28: 34, 36: 43, 42: 49, 54: 61, 70: 76, 82: 89, 92: 102, 104: 115 },
};

// ── ねじ呼び→穴径（1箇所に集約） ──────────────────────────────
//
// 「プルボックスに開ける穴の径は管の太さではなくボックスコネクタのねじ呼びで決まる」
// というHITEC確定ルールを、ここ1箇所にまとめる。VE・PF/CD・プリカ(F2)はここを見て穴径を決める。
// 鋼製管(C/E/G)は上のTHREAD_OD_MM/KNOCKOUT_MM/HITEC_HOLE_MMという既存の検証済みテーブルを
// そのまま使い続けるが（数値を触って17件の検証を壊さないため）、値そのものは同じ出典・同じ数字。
//
// 厚鋼電線管の呼び番号(16/22/28/36/42/54/70/82/92/104)は、そのままねじ呼びの
// 系列番号と一致する（G16=G1/2、G22=G3/4、G28=G1、G36=G1 1/4…）ため、
// 下のTHREAD_SPECの値は上のG用テーブルと同じ数字の再掲になっている。
//
// 出典: hitec-ai-team/reference/reference_conduit_connector_knockout.md
//       （パナソニック公式FAQ a_id/105516・105518、社長の現場実績値）
export type ThreadSize =
  | 'G1/2' | 'G3/4' | 'G1' | 'G1 1/4' | 'G1 1/2' | 'G2' | 'G2 1/2' | 'G3' | 'G4';

export interface ThreadSpec {
  /** ボックスコネクタのおねじ外径(mm)。 */
  threadOdMm: number;
  /** HITEC実績のホールソー径(mm)。nullなら常備ホールソー(φ21/27/33)では足りず、パンチャー。 */
  sawMm: number | null;
  /** パンチャーで抜く場合の目安径(mm)。パナソニック公式FAQの品番別適合ノック径（参考値）。 */
  punchMm: number | null;
}

export const THREAD_SPEC: Record<ThreadSize, ThreadSpec> = {
  'G1/2':   { threadOdMm: 20.955, sawMm: 21,   punchMm: 21.5 },
  'G3/4':   { threadOdMm: 26.441, sawMm: 27,   punchMm: 27.1 },
  'G1':     { threadOdMm: 33.249, sawMm: 33,   punchMm: 34 },
  'G1 1/4': { threadOdMm: 41.91,  sawMm: null, punchMm: 43 },
  'G1 1/2': { threadOdMm: 47.803, sawMm: null, punchMm: 49 },
  'G2':     { threadOdMm: 59.614, sawMm: null, punchMm: 61 },
  'G2 1/2': { threadOdMm: 75.184, sawMm: null, punchMm: 76 },
  'G3':     { threadOdMm: 87.884, sawMm: null, punchMm: 89 },
  'G4':     { threadOdMm: 113.03, sawMm: null, punchMm: 115 },
};

/** 1つの呼び径に複数のねじ呼び候補がありうる管種（VE・PF/CD・プリカ）。 */
export type ThreadOptionKind = 'VE' | 'PFCD' | 'F2';

export function isThreadOptionKind(kind: ConduitKind): kind is ThreadOptionKind {
  return kind === 'VE' || kind === 'PFCD' || kind === 'F2';
}

export interface ThreadOption {
  /** 同じ呼び径に複数の接続方法がある場合の識別子。省略時はその呼び径唯一の選択肢。 */
  variant?: string;
  /** UIに出す接続方法の名前（例: "Sタイプ", "標準", "BG17"）。 */
  variantLabel: string;
  /** 図・一覧に出すラベルを変えたい場合（プリカのBG/BC表記など）。省略時は種別+呼び径(+接続方法)。 */
  displayLabel?: string;
  thread: ThreadSize;
}

/**
 * 呼び径→ねじ呼び候補。複数候補があるものは全部載せる（決め打ちにしない）。
 * どれを使うかは「既にある穴を使うか使わないか」等、現場の判断で決まる。
 *
 * PF管とCD管はねじ呼び対応表が完全に同一（未来工業・古河電工とも一致）なので、
 * 社長の指示によりUI上は「PF・CD管」1つの管種としてまとめている（PFCD）。
 *
 * 出典: hitec-ai-team/reference/reference_conduit_connector_knockout.md
 */
export const THREAD_OPTIONS: Record<ThreadOptionKind, Record<number, ThreadOption[]>> = {
  VE: {
    10: [{ variantLabel: 'Sタイプ', thread: 'G1/2' }],
    14: [
      { variant: 'S', variantLabel: 'Sタイプ', thread: 'G1/2' },
      { variant: '標準', variantLabel: '標準', thread: 'G3/4' },
    ],
    16: [
      { variant: 'S', variantLabel: 'Sタイプ', thread: 'G1/2' },
      { variant: '標準', variantLabel: '標準', thread: 'G3/4' },
    ],
    22: [{ variantLabel: '標準', thread: 'G3/4' }],
    28: [{ variantLabel: '標準', thread: 'G1' }],
    36: [{ variantLabel: '標準', thread: 'G1 1/4' }],
    42: [{ variantLabel: '標準', thread: 'G1 1/2' }],
    54: [{ variantLabel: '標準', thread: 'G2' }],
    70: [{ variantLabel: '標準', thread: 'G2 1/2' }],
    82: [{ variantLabel: '標準', thread: 'G3' }],
    100: [{ variantLabel: '標準', thread: 'G4' }],
  },
  PFCD: {
    14: [{ variantLabel: '標準', thread: 'G1/2' }],
    16: [
      { variant: 'S', variantLabel: 'Sタイプ', thread: 'G1/2' },
      { variant: '標準', variantLabel: '標準', thread: 'G3/4' },
    ],
    22: [{ variantLabel: '標準', thread: 'G3/4' }],
    28: [{ variantLabel: '標準', thread: 'G1' }],
    36: [{ variantLabel: '標準', thread: 'G1 1/4' }],
    42: [{ variantLabel: '標準', thread: 'G1 1/2' }],
    54: [{ variantLabel: '標準', thread: 'G2' }],
  },
  F2: {
    17: [
      { variant: 'BG', variantLabel: 'BG17', displayLabel: 'BG17', thread: 'G1/2' },
      { variant: 'BG-22', variantLabel: 'BG17-22', displayLabel: 'BG17-22', thread: 'G3/4' },
      { variant: 'BC', variantLabel: 'BC17', displayLabel: 'BC17', thread: 'G1/2' },
    ],
    24: [
      { variant: 'BG', variantLabel: 'BG24', displayLabel: 'BG24', thread: 'G3/4' },
      { variant: 'BC', variantLabel: 'BC24', displayLabel: 'BC24', thread: 'G3/4' },
    ],
    30: [
      { variant: 'BG', variantLabel: 'BG30', displayLabel: 'BG30', thread: 'G1' },
      { variant: 'BC', variantLabel: 'BC30', displayLabel: 'BC30', thread: 'G1' },
    ],
    38: [
      { variant: 'BG', variantLabel: 'BG38', displayLabel: 'BG38', thread: 'G1 1/4' },
      { variant: 'BC', variantLabel: 'BC38', displayLabel: 'BC38', thread: 'G1 1/4' },
    ],
    50: [
      { variant: 'BG', variantLabel: 'BG50', displayLabel: 'BG50', thread: 'G1 1/2' },
      { variant: 'BC', variantLabel: 'BC50', displayLabel: 'BC50', thread: 'G1 1/2' },
    ],
    63: [{ variant: 'BC', variantLabel: 'BC63', displayLabel: 'BC63', thread: 'G2' }],
    76: [{ variant: 'BC', variantLabel: 'BC76', displayLabel: 'BC76', thread: 'G2 1/2' }],
  },
};

/** ある呼び径のねじ呼び候補一覧。無ければ空配列。 */
export function threadOptionsFor(kind: ConduitKind, size: number): ThreadOption[] {
  if (!isThreadOptionKind(kind)) return [];
  return THREAD_OPTIONS[kind][size] ?? [];
}

/**
 * ConduitRefからねじ呼び候補を1つに決める。
 * 候補が1つしかなければvariant指定が無くてもそれを使う。
 * 候補が複数あるのにvariant未指定、または一致するvariantが無ければnull
 * （呼び出し側の計算エンジンは「対応表に無い呼び径」として扱う）。
 */
export function resolveThreadOption(c: ConduitRef): ThreadOption | null {
  const options = threadOptionsFor(c.kind, c.size);
  if (options.length === 0) return null;
  if (c.variant != null) return options.find(o => o.variant === c.variant) ?? null;
  return options.length === 1 ? options[0] : null;
}

/** 支持クリップ。A＝ダクター天端から金具頂部までの全高(mm)。 */
interface ClipSpec {
  model: string;
  heightMm: number;
}

const CLIP_C: Record<number, ClipSpec> = {
  19: { model: 'DC19', heightMm: 36 },
  25: { model: 'DC25DC22', heightMm: 43 },
  31: { model: 'DC31DC28', heightMm: 50 },
  39: { model: 'DC39', heightMm: 55 },
  51: { model: 'DC51', heightMm: 67 },
  63: { model: 'DC63', heightMm: 81 },
  75: { model: 'DC75DC70', heightMm: 93 },
};

const CLIP_G: Record<number, ClipSpec> = {
  16: { model: 'DC16', heightMm: 37 },
  22: { model: 'DC25DC22', heightMm: 43 },
  28: { model: 'DC31DC28', heightMm: 50 },
  36: { model: 'DC36', heightMm: 59 },
  42: { model: 'DC42', heightMm: 65 },
  54: { model: 'DC54', heightMm: 76 },
  70: { model: 'DC75DC70', heightMm: 93 },
  82: { model: 'DC82', heightMm: 105 },
  92: { model: 'DC92', heightMm: 118 },
  104: { model: 'DC104', heightMm: 131 },
};

// 出典: ネグロス電工「電設資材カタログ2026/27A」P.479（電子版 negurosu.meclib.jp で現物確認、2026-09-15）。
// CLIP_C/CLIP_G は旧版(P.505)の数値のまま据え置き（既存17件の検証済み値を変更しないため）。
// 現行版とは一部±1mmの差があるが、新規追加分(VE/PFCD/F2)は社長確認のうえ現行版で統一する。
// 呼び14はダクタークリップのラインナップ自体に存在しないため未掲載（clipSpec()はnullを返す）。
const CLIP_VE: Record<number, ClipSpec> = {
  16: { model: 'DC16', heightMm: 38 },
  22: { model: 'DC25DC22', heightMm: 43 },
  28: { model: 'DC31DC28', heightMm: 50 },
  36: { model: 'DC36', heightMm: 60 },
  42: { model: 'DC42', heightMm: 65 },
  54: { model: 'DC54', heightMm: 77 },
  70: { model: 'DC75DC70', heightMm: 93 },
  82: { model: 'DC82', heightMm: 105 },
};

// 出典: 同カタログP.482「PF管支持クリップ(PFDCシリーズ)」。
// CD管への適合はカタログに明記が無く未確認だが、PF管とCD管は外径規格(JIS C8411)が同一のため
// 社長確認のうえ流用する（2026-09-15合意）。呼び14はラインナップ自体に存在しないため未掲載。
const CLIP_PFCD: Record<number, ClipSpec> = {
  16: { model: 'PFDC16', heightMm: 37 },
  22: { model: 'PFDC22', heightMm: 45 },
  28: { model: 'PFDC28', heightMm: 51 },
};

// 出典: 同カタログP.480「防水金属製可とう電線管支持クリップ」(2種金属可とう電線管=F2用)。
// HITEC側の呼び径表記(17/24/30/38/50/63/76)と型番の対応をカタログ現物で確認済み。
const CLIP_F2: Record<number, ClipSpec> = {
  17: { model: 'DC16', heightMm: 38 },
  24: { model: 'DC24BP', heightMm: 46 },
  30: { model: 'DC30BP', heightMm: 53 },
  38: { model: 'DC36', heightMm: 60 },
  50: { model: 'DC50BP', heightMm: 73 },
  63: { model: 'DC63BP', heightMm: 88 },
  76: { model: 'DC76BP', heightMm: 102 },
};

/** 電線管1本を指す識別子。種別＋呼び径。 */
export interface ConduitRef {
  kind: ConduitKind;
  size: number;
  /** 同じ呼び径に複数の接続方法がある管種でだけ使う（例: PF16のSタイプ/標準、プリカ17のBG/BC）。 */
  variant?: string;
}

export function conduitLabel(c: ConduitRef): string {
  if (isThreadOptionKind(c.kind)) {
    const opt = resolveThreadOption(c);
    if (opt?.displayLabel) return opt.displayLabel;
    const prefix = c.kind === 'PFCD' ? 'PF/CD' : c.kind;
    return opt ? `${prefix}${c.size}(${opt.variantLabel})` : `${prefix}${c.size}`;
  }
  return `${c.kind}${c.size}`;
}

// conduitSpecReference 側の表名。外径はここから引く（二重管理を避けるため）。
// VE・PF/CD・プリカ(F2)も同じ参照表（原本PDF照合済み）に載っているものを流用する。
// PF管とCD管はねじ呼び対応表が完全に同一のため1管種(PFCD)として扱うので、
// 外径もCD管の表を共用する（呼び14/16/22/28のみ。36/42/54は表に無いためCONDUIT_SIZESで対象外）。
const SPEC_TABLE_NAME: Record<ConduitKind, string> = {
  E: 'ねじなし電線管(EMT)',
  C: '薄鋼電線管(CP)',
  G: '厚鋼電線管(CP)',
  VE: '硬質ビニル電線管・波付硬質ビニル電線管(VE・HIVE)',
  PFCD: 'CD管(CD)',
  F2: '2種金属可とう電線管(F2)',
};

// 起動時に1回だけ Record<種別, Record<呼び径, 外径>> に畳んでおく。
const OUTER_DIAMETER: Record<ConduitKind, Record<number, number>> = (() => {
  const out = { C: {}, E: {}, G: {}, VE: {}, PFCD: {}, F2: {} } as Record<ConduitKind, Record<number, number>>;
  (Object.keys(SPEC_TABLE_NAME) as ConduitKind[]).forEach(kind => {
    const table = CONDUIT_SPEC_REFERENCE_TABLES.find(t => t.coreConfig === SPEC_TABLE_NAME[kind]);
    if (!table) return;
    table.rows.forEach(row => {
      // ねじなしは "E19"、薄鋼・厚鋼は "19" のように表記が違うので数字だけ取る
      const size = Number(row.nominalSize.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(size)) out[kind][size] = row.outerDiameterMm;
    });
  });
  return out;
})();

/** 外径(mm)。取れなければ null（呼び出し側で必ず握りつぶさず扱うこと） */
export function outerDiameter(c: ConduitRef): number | null {
  return OUTER_DIAMETER[c.kind]?.[c.size] ?? null;
}

/** 適合ノック穴径(mm)。あける穴の直径（パンチャーで抜く場合の目安）。 */
export function knockoutDiameter(c: ConduitRef): number | null {
  const { kind, size } = c;
  if (isThreadOptionKind(kind)) {
    const opt = resolveThreadOption(c);
    if (!opt) return null;
    const spec = THREAD_SPEC[opt.thread];
    return spec.punchMm ?? spec.sawMm ?? null;
  }
  return KNOCKOUT_MM[kind]?.[size] ?? null;
}

/** ボックスコネクタのおねじ部の外径(mm)。穴径の根拠として画面に出す。 */
export function connectorThreadDiameter(c: ConduitRef): number | null {
  const { kind, size } = c;
  if (isThreadOptionKind(kind)) {
    const opt = resolveThreadOption(c);
    return opt ? THREAD_SPEC[opt.thread].threadOdMm : null;
  }
  return THREAD_OD_MM[kind]?.[size] ?? null;
}

/**
 * 支持クリップ。E管はC管と同径なのでC管の表を使う。
 * VE・PF/CD・プリカ(F2)はネグロス電工カタログ2026/27A P.479/482/480で確認済み（2026-09-15）。
 * 各表に無い呼び径（VE14・PF/CD14など、ラインナップ自体が存在しない）は null。
 * null の場合、呼び出し側（計算エンジン）はクリップ頂部を「不明・目安」として扱うこと
 * （od/knock/threadと違い、clipが無くても穴自体は開けられるので必須にはしない）。
 */
export function clipSpec(c: ConduitRef): ClipSpec | null {
  if (c.kind === 'G') return CLIP_G[c.size] ?? null;
  if (c.kind === 'C' || c.kind === 'E') return CLIP_C[c.size] ?? null;
  if (c.kind === 'VE') return CLIP_VE[c.size] ?? null;
  if (c.kind === 'PFCD') return CLIP_PFCD[c.size] ?? null;
  if (c.kind === 'F2') return CLIP_F2[c.size] ?? null;
  return null;
}


/**
 * HITECが常備しているホールソーの径(mm)。2026-09-15 社長確認。
 * これで足りない穴はノックアウトパンチャーで抜く。
 */
export const HOLE_SAW_SIZES_MM = [21, 27, 33];

/**
 * HITECの現場で決まっている穴径(mm)。2026-09-15 社長より。
 *
 * メーカーの適合ノック径やおねじ外径の計算より、**こちらを正とする**。
 * 現場で実際にその径で開けて通っている、という実績が根拠。
 * 厚鋼と薄鋼が対になっている（16↔19、22↔25、28↔31）。
 * ここに無いサイズは常備のホールソーで足りないのでノックアウトパンチャー。
 */
const HITEC_HOLE_MM: Record<SteelConduitKind, Record<number, number>> = {
  G: { 16: 21, 22: 27, 28: 33 },
  C: { 19: 21, 25: 27, 31: 33 },
  E: { 19: 21, 25: 27, 31: 33 },
};

export interface DrillingMethod {
  tool: 'ホールソー' | 'パンチャー';
  /** ホールソーの場合に使う径(mm)。パンチャーなら null */
  sawMm: number | null;
  /** 実際に開ける径とコネクタのおねじ外径のすきま(mm) */
  clearanceMm: number | null;
  notes: string[];
}

/**
 * その穴をどう開けるかを決める。
 *
 * 1. HITECで決まっている径があればそれを使う（最優先）
 * 2. 無ければノックアウトパンチャー
 *
 * メーカーの「適合ノック径」は既製ボックスのノック穴に合わせた推奨値であり、
 * 実際にコネクタが通る最小径はおねじ外径。現場はその間の値で開けている。
 */
export function drillingMethod(c: ConduitRef, threadOdMm: number): DrillingMethod {
  const { kind, size } = c;
  const notes: string[] = [];
  let saw: number | null | undefined;
  if (isThreadOptionKind(kind)) {
    const opt = resolveThreadOption(c);
    saw = opt ? THREAD_SPEC[opt.thread].sawMm : null;
  } else {
    saw = HITEC_HOLE_MM[kind]?.[size];
  }

  if (saw == null) {
    return { tool: 'パンチャー', sawMm: null, clearanceMm: null, notes };
  }

  const clearance = saw - threadOdMm;
  if (clearance < 0) {
    notes.push(
      `コネクタのおねじ外径 φ${threadOdMm} に対して ${Math.abs(clearance).toFixed(2)}mm 小さい。` +
        `刃の実切削径で入る前提の値`,
    );
  } else if (clearance < 0.3) {
    notes.push(`すきまが${clearance.toFixed(2)}mmしかなく、ほぼぴったり`);
  }
  return { tool: 'ホールソー', sawMm: saw, clearanceMm: clearance, notes };
}

/** 管と管のあき(mm)の既定値。内線規程に規定はなく、施工スペース確保のための実務慣行値。 */
export const DEFAULT_PIPE_GAP_MM = 30;

/** 段間クリアランスの選択肢(mm)。1段目のクリップ頂部から2段目ダクター下端までのあき。 */
export const CLEARANCE_OPTIONS_MM = [0, 5, 10, 15, 20];

/**
 * ボックス接続部からの支持点までの距離の上限(mm)。
 * 内線規程 3110-7条3項〔注2〕および3110-4図。図面上は「500mm以下」。
 * （支持点間隔そのものは2m以下が望ましい、と規定されている）
 */
export const SUPPORT_FROM_BOX_MAX_MM = 500;
