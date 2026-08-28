// src/constants/specialSchemaCableTables.ts
// 出典: ㈱榊井設備設計システムズ作成「ケーブル用配管早見表」内の特殊表構造データ(9表)
// EBT・TIV・TIVF・MVVS(通信・警報用ケーブル)。
//
// これらの表は「サイズ→配管」形式ではなく「配管サイズごとの収容可能本数」という
// 別形式(段(tier)ごとに、配管種別ごとの{呼び径, 最大収容本数}のペアを持つ)のため、
// 今回の「ケーブル用配管早見表」ツールのスコープ外。型定義とともにデータのみ保存し、
// UIには組み込まない(将来別ツールとして実装予定)。

import rawData from './specialSchemaCableTables.data.json';

import type { ConduitTypeKey } from './cableConduitLookup';

export interface SpecialSchemaConduitCell {
  size: string;
  maxCount: number;
}

export type SpecialSchemaConduitBySize = Record<ConduitTypeKey, SpecialSchemaConduitCell>;

export interface SpecialSchemaTier {
  tier: number;
  conduit: SpecialSchemaConduitBySize;
}

export interface SpecialSchemaCableTable {
  cableType: string;
  coreConfig: string;
  sourcePrintedPage: string;
  cableOuterDiameterMm: number;
  cableCrossSectionMm2: number;
  schemaNote: string;
  rows: SpecialSchemaTier[];
}

/** 特殊表構造データ(EBT・TIV・TIVF・MVVS等、9表)。UI未使用・将来の別ツール用。 */
export const SPECIAL_SCHEMA_CABLE_TABLES = rawData as unknown as SpecialSchemaCableTable[];
