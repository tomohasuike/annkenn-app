// src/constants/cableConduitLookup.ts
// 出典: ㈱榊井設備設計システムズ作成「ケーブル用配管早見表」(PDF原本)
// PDFの罫線検出+複数エージェントによるクロスチェックで読み取った実データ(43表・391行)を
// cableConduitLookup.data.json にそのまま格納し、ここでは型定義と参照用ヘルパーのみを提供する。
// 数値・null値は絶対に手を加えず、JSONの値をそのまま使用すること。

import rawData from './cableConduitLookup.data.json';

// ------------------------------------------------------------------
// 配管種別
// ------------------------------------------------------------------
export type ConduitTypeKey = 'E' | 'thinSteel' | 'thickSteel' | 'PF' | 'VE' | 'FEP' | 'SGP' | 'F2';

export const CONDUIT_TYPE_ORDER: ConduitTypeKey[] = ['E', 'thinSteel', 'thickSteel', 'PF', 'VE', 'FEP', 'SGP', 'F2'];

// 早見表原本では PF は「CD管」表記だが、社長の指示によりPF管として扱う。
export const CONDUIT_TYPE_LABELS: Record<ConduitTypeKey, string> = {
  E: 'ねじなし電線管',
  thinSteel: '薄鋼電線管',
  thickSteel: '厚鋼電線管',
  PF: 'PF管',
  VE: 'VE管(硬質ビニル電線管)',
  FEP: '波付ポリエチレン管(地中埋設用)',
  SGP: '配管用炭素鋼鋼管',
  F2: 'フレキシブル管等',
};

export const CONDUIT_TYPE_SHORT_LABELS: Record<ConduitTypeKey, string> = {
  E: 'E管',
  thinSteel: '薄鋼',
  thickSteel: '厚鋼',
  PF: 'PF管',
  VE: 'VE管',
  FEP: 'FEP管',
  SGP: 'SGP管',
  F2: 'F2',
};

// ------------------------------------------------------------------
// メインデータ型
// ------------------------------------------------------------------
export type ConduitSizeBySize = Record<ConduitTypeKey, string | null>;

export interface CableConduitLookupRow {
  sizeLabel: string;
  cableOuterDiameterMm: number;
  cableCrossSectionMm2: number;
  conduit: ConduitSizeBySize;
}

export type CvVoltageClass = '600V' | '6KV';

export interface CableConduitLookupTable {
  cableType: string;
  coreConfig: string;
  voltageClass?: CvVoltageClass;
  sourcePrintedPage: string;
  uncertainCells?: string[];
  rows: CableConduitLookupRow[];
}

/** 早見表の全43表・391行。JSON原本の値をそのまま型付けしたもの。 */
export const CABLE_CONDUIT_LOOKUP_TABLES = rawData as unknown as CableConduitLookupTable[];

// ------------------------------------------------------------------
// 表示用ラベル(ケーブル種別・CV系の構成区分)
// ------------------------------------------------------------------

/** ケーブル種別(cableType)の日本語表示名。ここに無い種別は cableType をそのまま表示する。 */
export const CABLE_TYPE_LABELS: Record<string, string> = {
  CV: 'CVケーブル',
  VVF: 'VVFケーブル(平形)',
  SV: 'SVケーブル(丸形)',
  CVV: 'CVVケーブル(制御用)',
  FP: 'FPケーブル(耐火ケーブル)',
  HP: 'HPケーブル(耐熱ケーブル)',
  AE: 'AEケーブル(警報用ケーブル)',
  CPEV: 'CPEVケーブル(市内用)',
  PEV: 'PEVケーブル(構内用)',
  CCP: 'CCPケーブル(市内用)',
  'CCP-AP': 'CCP-APケーブル(市内用)',
  ECX: 'ECX(高周波同軸ケーブル)',
};

/** CV系(coreConfigが 1C/2C/3C/4C/T/D/Q 形式)の構成区分の表示名。 */
export const CV_CORE_CONFIG_LABELS: Record<string, string> = {
  '1C': '単心 (1C)',
  '2C': '2心 (2C)',
  '3C': '3心 (3C)',
  '4C': '4心 (4C)',
  T: 'トリプレックス形 (T)',
  D: 'ダブレット形 (D)',
  Q: 'クインテット形 (Q)',
};

/** cableType一覧をデータ出現順(≒早見表原本の掲載順)で取得する。 */
export function getAllCableTypes(): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const t of CABLE_CONDUIT_LOOKUP_TABLES) {
    if (!seen.has(t.cableType)) {
      seen.add(t.cableType);
      order.push(t.cableType);
    }
  }
  return order;
}

/** 指定したcableTypeに属するテーブル一覧を取得する(データ出現順)。 */
export function getTablesForCableType(cableType: string): CableConduitLookupTable[] {
  return CABLE_CONDUIT_LOOKUP_TABLES.filter(t => t.cableType === cableType);
}

/** CV系かどうか(coreConfigが短い記号+voltageClassを持つ形式かどうか)を判定する。 */
export function isCvSeries(cableType: string): boolean {
  return cableType === 'CV';
}
