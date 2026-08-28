// src/utils/cableConduitLookupEngine.ts
// 「ケーブル用配管早見表」ツールのルックアップロジック。
// 出典: ㈱榊井設備設計システムズ作成「ケーブル用配管早見表」
//
// ケーブル種別(cableType)・構成区分(coreConfig)・電圧区分(voltageClass, CV系のみ)・
// サイズ(sizeLabel)を指定すると、該当する行(8種類の配管の推奨呼び径)を返す。
// 占積率計算(48%/32%ルール)は行わない。早見表に記載されている値をそのまま参照するのみ。

import {
  CABLE_CONDUIT_LOOKUP_TABLES,
  type CableConduitLookupTable,
  type CableConduitLookupRow,
  type CvVoltageClass,
} from '../constants/cableConduitLookup';

/** UIのStep2で選ぶ「構成バリエーション」1つ分。CV系はcoreConfig+voltageClassの組、それ以外はcoreConfigのみで一意。 */
export interface CableVariant {
  table: CableConduitLookupTable;
  coreConfig: string;
  voltageClass?: CvVoltageClass;
}

/** 指定したcableTypeに属する構成バリエーション一覧を返す(データ出現順)。 */
export function getVariantsForCableType(cableType: string): CableVariant[] {
  return CABLE_CONDUIT_LOOKUP_TABLES
    .filter(t => t.cableType === cableType)
    .map(t => ({ table: t, coreConfig: t.coreConfig, voltageClass: t.voltageClass }));
}

/**
 * cableType・coreConfig・voltageClassから該当テーブルを1つ特定する。
 * voltageClassが無いケーブル種別ではundefinedのまま照合する。
 */
export function findTable(
  cableType: string,
  coreConfig: string,
  voltageClass?: CvVoltageClass
): CableConduitLookupTable | undefined {
  return CABLE_CONDUIT_LOOKUP_TABLES.find(
    t => t.cableType === cableType && t.coreConfig === coreConfig && t.voltageClass === voltageClass
  );
}

/** テーブル内のサイズラベル一覧を、表内の掲載順のまま返す。 */
export function getSizeLabels(table: CableConduitLookupTable): string[] {
  return table.rows.map(r => r.sizeLabel);
}

/** テーブルと sizeLabel から該当行を取得する。 */
export function findRow(table: CableConduitLookupTable, sizeLabel: string): CableConduitLookupRow | undefined {
  return table.rows.find(r => r.sizeLabel === sizeLabel);
}

/**
 * cableType・coreConfig・voltageClass・sizeLabelを指定して該当行を直接取得するショートカット。
 * 該当なしの場合は undefined。
 */
export function lookupCableConduitRow(
  cableType: string,
  coreConfig: string,
  sizeLabel: string,
  voltageClass?: CvVoltageClass
): CableConduitLookupRow | undefined {
  const table = findTable(cableType, coreConfig, voltageClass);
  if (!table) return undefined;
  return findRow(table, sizeLabel);
}
