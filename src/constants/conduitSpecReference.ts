// src/constants/conduitSpecReference.ts
// 出典: ㈱榊井設備設計システムズ作成「ケーブル用配管早見表」内の電線管規格表(9表)
// 呼び径ごとの外径・内径・内断面積、および充填率20/25/32/44.4%時の許容断面積。
//
// 現時点ではUIには組み込んでいない参考データ。将来「占積率計算」を早見表ベースで
// 再実装する際に使用する想定のため、型定義とともにそのまま保存しておく。

import rawData from './conduitSpecReference.data.json';

export interface ConduitSpecRow {
  nominalSize: string;
  outerDiameterMm: number;
  innerDiameterMm: number;
  innerAreaMm2: number;
  fillArea20pct: number;
  fillArea25pct: number;
  fillArea32pct: number;
  fillArea444pct: number;
}

export interface ConduitSpecTable {
  cableType: string;
  coreConfig: string;
  sourcePrintedPage: string;
  schemaNote: string;
  rows: ConduitSpecRow[];
}

/** 配管規格表(9表)。JSON原本の値をそのまま型付けしたもの。UI未使用の参考データ。 */
export const CONDUIT_SPEC_REFERENCE_TABLES = rawData as unknown as ConduitSpecTable[];
