// src/utils/conduitFillCalcEngine.ts
// 電線管の占積率計算エンジン
// 出典: 内線規程 JEAC 8001-2016 3編1章 3110節(金属管)・3115節(合成樹脂管)
//
// 2つの選定ロジックを提供する:
//  1) selectSameGaugeConduit  … 同一太さの電線をN本(1〜10本)収める場合。3110-2〜4表 / 3115-4〜5表 を直接参照。
//     11本以上の場合はテーブルに無いため、断面積ベースの計算(2)にフォールバックする。
//  2) selectMixedGaugeConduit … 異なる太さが混在する場合、または11本以上の場合。
//     各電線の断面積(被覆絶縁物を含む)の合計に補正係数を乗じた「計算断面積」が、
//     管の内断面積の32%(通常)以下となる最小の管サイズを選定する。
//     (3110-7表 脚注の計算例と同じロジック)

import {
  METAL_SAME_GAUGE_TABLE,
  PVC_SAME_GAUGE_TABLE,
  WIRE_CROSS_SECTION_MM2,
  METAL_INNER_AREA_TABLE,
  PVC_INNER_AREA_TABLE,
  METAL_CONDUIT_SIZES,
  PVC_CONDUIT_SIZES,
  getCorrectionFactor,
  type ConduitCategory,
  type MetalConduitType,
  type PvcConduitType,
} from '../constants/conduitFillStandards';

export type ConduitSelectionMethod = 'same_gauge_table' | 'area_calc';

export type WireInput = {
  gauge: string; // WIRE_CROSS_SECTION_MM2 のキー ('1.6' | '2.0' | '2.6' | '3.2' | '14' | '22' | '38' | '60' | '100' | '150' | '200' | '250')
  count: number;
};

export type ConduitSelectionResult = {
  /** 選定された管サイズ。選定不可の場合は null */
  size: string | null;
  /** 使用した選定方式 */
  method: ConduitSelectionMethod;
  /** 参考: 管の内断面積(32%早見値)に対する使用率(%) */
  usageRatePercent: number | null;
  /** 選定不可・入力不正の場合のエラーメッセージ */
  error?: string;
};

type GaugeBucketKey = '1.6' | '2.0' | '2.6' | '3.2' | 'large';

// 電線太さを 補正係数の区分(小/中/大) にマッピングするためのキーへ変換
function getGaugeBucketKey(gauge: string): GaugeBucketKey {
  if (gauge === '1.6' || gauge === '2.0' || gauge === '2.6' || gauge === '3.2') return gauge;
  return 'large';
}

function getAreaTable(category: ConduitCategory, conduitType: MetalConduitType | PvcConduitType) {
  return category === 'metal'
    ? METAL_INNER_AREA_TABLE[conduitType as MetalConduitType]
    : PVC_INNER_AREA_TABLE[conduitType as PvcConduitType];
}

function getSizeOrder(category: ConduitCategory, conduitType: MetalConduitType | PvcConduitType): string[] {
  return category === 'metal'
    ? METAL_CONDUIT_SIZES[conduitType as MetalConduitType].map(s => s.size)
    : PVC_CONDUIT_SIZES[conduitType as PvcConduitType].map(s => s.size);
}

// 参考使用率(%)を計算(補正係数なしの生の断面積合計 ÷ 内断面積32%早見値)
function calcRawUsageRatePercent(
  category: ConduitCategory,
  conduitType: MetalConduitType | PvcConduitType,
  size: string,
  wires: WireInput[]
): number | null {
  const areaTable = getAreaTable(category, conduitType);
  const entry = areaTable?.[size];
  if (!entry) return null;
  const rawArea = wires.reduce((sum, w) => sum + (WIRE_CROSS_SECTION_MM2[w.gauge] || 0) * w.count, 0);
  return (rawArea / entry.area32) * 100;
}

/**
 * 同一太さの電線をN本(1〜10本)収める場合の最小管サイズを選定する。
 * 3110-2〜4表(金属管) / 3115-4〜5表(合成樹脂管) を直接参照。
 * 11本以上、またはテーブルに規定が無い(null)場合は断面積ベースの計算にフォールバックする。
 */
export function selectSameGaugeConduit(
  category: ConduitCategory,
  conduitType: MetalConduitType | PvcConduitType,
  gauge: string,
  count: number
): ConduitSelectionResult {
  if (!Number.isFinite(count) || count < 1) {
    return { size: null, method: 'same_gauge_table', usageRatePercent: null, error: '本数は1以上を指定してください。' };
  }
  if (WIRE_CROSS_SECTION_MM2[gauge] === undefined) {
    return { size: null, method: 'same_gauge_table', usageRatePercent: null, error: '電線太さの指定が不正です。' };
  }

  if (count <= 10) {
    const table = category === 'metal'
      ? METAL_SAME_GAUGE_TABLE[conduitType as MetalConduitType]
      : PVC_SAME_GAUGE_TABLE[conduitType as PvcConduitType];
    const row = table?.[gauge];
    if (row) {
      const size = row[count - 1];
      if (size) {
        const usageRatePercent = calcRawUsageRatePercent(category, conduitType, size, [{ gauge, count }]);
        return { size, method: 'same_gauge_table', usageRatePercent };
      }
    }
  }

  // 11本以上、またはテーブルに規定が無い場合は断面積ベースの計算にフォールバック
  return selectMixedGaugeConduit(category, conduitType, [{ gauge, count }]);
}

/**
 * 異なる太さの電線が混在する場合(または11本以上の場合)の最小管サイズを選定する。
 * 各電線の断面積(被覆絶縁物を含む)の合計 × 補正係数 = 計算断面積 とし、
 * 計算断面積が管の内断面積32%早見値以下となる最小の管サイズを選定する。
 */
export function selectMixedGaugeConduit(
  category: ConduitCategory,
  conduitType: MetalConduitType | PvcConduitType,
  wires: WireInput[]
): ConduitSelectionResult {
  const validWires = wires.filter(w => w.count > 0 && WIRE_CROSS_SECTION_MM2[w.gauge] !== undefined);
  if (validWires.length === 0) {
    return { size: null, method: 'area_calc', usageRatePercent: null, error: '電線情報を1本以上入力してください。' };
  }

  // 電線太さごとに本数を合算してから、太さごとの断面積合計に「その太さの」補正係数を乗じ、
  // 最後に計算断面積を合算する(3110-7表脚注の使用例と同じ手順。太さをまたいで単一の補正係数をまとめて掛けてはならない)。
  const rawAreaByGauge = new Map<string, number>();
  for (const w of validWires) {
    rawAreaByGauge.set(w.gauge, (rawAreaByGauge.get(w.gauge) || 0) + WIRE_CROSS_SECTION_MM2[w.gauge] * w.count);
  }

  const pvcType = category === 'pvc' ? (conduitType as PvcConduitType) : undefined;
  const computedArea = [...rawAreaByGauge.entries()].reduce((sum, [gauge, area]) => {
    const bucket = getGaugeBucketKey(gauge);
    const factor = getCorrectionFactor(category, pvcType, bucket);
    return sum + area * factor;
  }, 0);

  const areaTable = getAreaTable(category, conduitType);
  const sizeOrder = getSizeOrder(category, conduitType);

  for (const size of sizeOrder) {
    const entry = areaTable[size];
    if (entry && computedArea <= entry.area32) {
      return {
        size,
        method: 'area_calc',
        usageRatePercent: (computedArea / entry.area32) * 100,
      };
    }
  }

  return {
    size: null,
    method: 'area_calc',
    usageRatePercent: null,
    error: '規定の管サイズ範囲では収容できません。管を分割するか、より太い管径をご検討ください。',
  };
}
