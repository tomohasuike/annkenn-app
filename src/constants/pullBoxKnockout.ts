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

/** 扱う電線管の種別 */
export type ConduitKind = 'C' | 'E' | 'G';

export const CONDUIT_KIND_LABELS: Record<ConduitKind, string> = {
  C: '薄鋼電線管',
  E: 'ねじなし電線管',
  G: '厚鋼電線管',
};

/** 種別ごとの呼び径。ノック穴径が確認できているサイズのみを載せる。 */
export const CONDUIT_SIZES: Record<ConduitKind, number[]> = {
  C: [19, 25, 31, 39, 51, 63, 75],
  E: [19, 25, 31, 39, 51, 63, 75],
  G: [16, 22, 28, 36, 42, 54, 70, 82, 92, 104],
};

/**
 * ボックスコネクタのおねじ部の外径(mm)。穴径の本当の根拠はこれ。
 * パナソニック公式FAQ a_id/105516「ねじの基準寸法」表より（厚鋼CTG／薄鋼CTC）。
 * ねじなし電線管(E)用コネクタのねじ部は薄鋼電線管ねじ(CTC)と同じなので C と同値。
 */
const THREAD_OD_MM: Record<ConduitKind, Record<number, number>> = {
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
const KNOCKOUT_MM: Record<ConduitKind, Record<number, number>> = {
  C: { 19: 19.6, 25: 26.1, 31: 32.5, 39: 39, 51: 52, 63: 65, 75: 77 },
  E: { 19: 19.6, 25: 26.1, 31: 32.5, 39: 39, 51: 52, 63: 65, 75: 77 },
  G: { 16: 21.5, 22: 27.1, 28: 34, 36: 43, 42: 49, 54: 61, 70: 76, 82: 89, 92: 102, 104: 115 },
};

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

/** 電線管1本を指す識別子。種別＋呼び径。 */
export interface ConduitRef {
  kind: ConduitKind;
  size: number;
}

export function conduitLabel(c: ConduitRef): string {
  return `${c.kind}${c.size}`;
}

// conduitSpecReference 側の表名。外径はここから引く（二重管理を避けるため）。
const SPEC_TABLE_NAME: Record<ConduitKind, string> = {
  E: 'ねじなし電線管(EMT)',
  C: '薄鋼電線管(CP)',
  G: '厚鋼電線管(CP)',
};

// 起動時に1回だけ Record<種別, Record<呼び径, 外径>> に畳んでおく。
const OUTER_DIAMETER: Record<ConduitKind, Record<number, number>> = (() => {
  const out = { C: {}, E: {}, G: {} } as Record<ConduitKind, Record<number, number>>;
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

/** 適合ノック穴径(mm)。あける穴の直径。 */
export function knockoutDiameter(c: ConduitRef): number | null {
  return KNOCKOUT_MM[c.kind]?.[c.size] ?? null;
}

/** ボックスコネクタのおねじ部の外径(mm)。穴径の根拠として画面に出す。 */
export function connectorThreadDiameter(c: ConduitRef): number | null {
  return THREAD_OD_MM[c.kind]?.[c.size] ?? null;
}

/** 支持クリップ。E管はC管と同径なのでC管の表を使う。 */
export function clipSpec(c: ConduitRef): ClipSpec | null {
  if (c.kind === 'G') return CLIP_G[c.size] ?? null;
  return CLIP_C[c.size] ?? null;
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
const HITEC_HOLE_MM: Record<ConduitKind, Record<number, number>> = {
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
  const notes: string[] = [];
  const saw = HITEC_HOLE_MM[c.kind]?.[c.size];

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
