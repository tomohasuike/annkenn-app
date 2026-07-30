// src/constants/conduitFillStandards.ts
// 出典: 内線規程 JEAC 8001-2016 (弊社保有の内線規程2016年版 3編1章 3110節・3115節)
// 電線管(金属管・合成樹脂管)への電線収容本数の選定基準

export type ConduitCategory = 'metal' | 'pvc';

export type MetalConduitType = 'thick' | 'thin' | 'thinless'; // 厚鋼電線管 / 薄鋼電線管 / ねじなし電線管
export type PvcConduitType = 'rigid' | 'pf_cd'; // 硬質ビニル管 / PF管・CD管

export type WireGauge = {
  // 単線はmm、より線はmm2。表示用ラベルは label を使う。
  label: string; // 例: "1.6", "2.0", "5.5", "100"
  isStranded: boolean;
};

// ------------------------------------------------------------------
// 1. 管の寸法 (3110-1表 / 3115-1〜3表)
// ------------------------------------------------------------------

export const METAL_CONDUIT_SIZES: Record<MetalConduitType, { size: string; outerDiameterMm: number; thicknessMm: number }[]> = {
  thick: [
    { size: '16', outerDiameterMm: 21.0, thicknessMm: 2.3 },
    { size: '22', outerDiameterMm: 26.5, thicknessMm: 2.3 },
    { size: '28', outerDiameterMm: 33.3, thicknessMm: 2.5 },
    { size: '36', outerDiameterMm: 41.9, thicknessMm: 2.5 },
    { size: '42', outerDiameterMm: 47.8, thicknessMm: 2.5 },
    { size: '54', outerDiameterMm: 59.6, thicknessMm: 2.8 },
    { size: '70', outerDiameterMm: 75.2, thicknessMm: 2.8 },
    { size: '82', outerDiameterMm: 87.9, thicknessMm: 2.8 },
    { size: '92', outerDiameterMm: 100.7, thicknessMm: 3.5 },
    { size: '104', outerDiameterMm: 113.4, thicknessMm: 3.5 },
  ],
  thin: [
    { size: '19', outerDiameterMm: 19.1, thicknessMm: 1.6 },
    { size: '25', outerDiameterMm: 25.4, thicknessMm: 1.6 },
    { size: '31', outerDiameterMm: 31.8, thicknessMm: 1.6 },
    { size: '39', outerDiameterMm: 38.1, thicknessMm: 1.6 },
    { size: '51', outerDiameterMm: 50.8, thicknessMm: 1.6 },
    { size: '63', outerDiameterMm: 63.5, thicknessMm: 2.0 },
    { size: '75', outerDiameterMm: 76.2, thicknessMm: 2.0 },
  ],
  thinless: [
    { size: 'E19', outerDiameterMm: 19.1, thicknessMm: 1.2 },
    { size: 'E25', outerDiameterMm: 25.4, thicknessMm: 1.2 },
    { size: 'E31', outerDiameterMm: 31.8, thicknessMm: 1.4 },
    { size: 'E39', outerDiameterMm: 38.1, thicknessMm: 1.4 },
    { size: 'E51', outerDiameterMm: 50.8, thicknessMm: 1.4 },
    { size: 'E63', outerDiameterMm: 63.5, thicknessMm: 1.6 },
    { size: 'E75', outerDiameterMm: 76.2, thicknessMm: 1.8 },
  ],
};

export const PVC_CONDUIT_SIZES: Record<PvcConduitType, { size: string; outerDiameterMm: number; innerDiameterMm?: number; thicknessMm?: number }[]> = {
  rigid: [
    { size: '14', outerDiameterMm: 18, thicknessMm: 2.0 },
    { size: '16', outerDiameterMm: 22, thicknessMm: 2.0 },
    { size: '22', outerDiameterMm: 26, thicknessMm: 2.0 },
    { size: '28', outerDiameterMm: 34, thicknessMm: 3.0 },
    { size: '36', outerDiameterMm: 42, thicknessMm: 3.5 },
    { size: '42', outerDiameterMm: 48, thicknessMm: 4.0 },
    { size: '54', outerDiameterMm: 60, thicknessMm: 4.5 },
    { size: '70', outerDiameterMm: 76, thicknessMm: 4.5 },
    { size: '82', outerDiameterMm: 89, thicknessMm: 5.9 },
  ],
  pf_cd: [
    // PF管(可とう)とCD管は寸法がほぼ共通のため呼び方基準で統一。内径は小さい方(CD管)を採用し安全側。
    { size: '14', outerDiameterMm: 21.5, innerDiameterMm: 14.0 },
    { size: '16', outerDiameterMm: 23.0, innerDiameterMm: 16.0 },
    { size: '22', outerDiameterMm: 30.5, innerDiameterMm: 22.0 },
    { size: '28', outerDiameterMm: 36.5, innerDiameterMm: 28.0 },
    { size: '36', outerDiameterMm: 45.5, innerDiameterMm: 36.0 },
    { size: '42', outerDiameterMm: 52.0, innerDiameterMm: 42.0 },
  ],
};

// ------------------------------------------------------------------
// 2. 同一太さの電線を収める場合の管の太さ選定表 (10本以下)
//    3110-2〜4表 (金属管) / 3115-4〜5表 (合成樹脂管)
//    行: 電線太さ(単線mm or より線mm2), 列: 電線本数(1〜10), 値: 最小管サイズ
// ------------------------------------------------------------------

export type WireRow = { gauge: string; isStranded: boolean };

const WIRE_ROWS: WireRow[] = [
  { gauge: '1.6', isStranded: false },
  { gauge: '2.0', isStranded: false },
  { gauge: '2.6', isStranded: false },
  { gauge: '3.2', isStranded: false },
  { gauge: '5.5', isStranded: true },
  { gauge: '8', isStranded: true },
  { gauge: '14', isStranded: true },
  { gauge: '22', isStranded: true },
  { gauge: '38', isStranded: true },
  { gauge: '60', isStranded: true },
  { gauge: '100', isStranded: true },
  { gauge: '150', isStranded: true },
  { gauge: '200', isStranded: true },
  { gauge: '250', isStranded: true },
];

// 表の値は 電線太さ(単線mm/より線mm2) 単位で共通化。本数1〜10列。
// 出典: 3110-2表(厚鋼) 3110-3表(薄鋼) 3110-4表(ねじなし)
export const METAL_SAME_GAUGE_TABLE: Record<MetalConduitType, Record<string, (string | null)[]>> = {
  thick: {
    '1.6': ['16', '16', '16', '16', '22', '22', '22', '28', '28', '28'],
    '2.0': ['16', '16', '16', '22', '22', '22', '22', '28', '28', '28'],
    '2.6': ['16', '16', '22', '22', '22', '28', '28', '28', '36', '36'],
    '3.2': ['16', '22', '22', '22', '28', '28', '28', '36', '36', '36'],
    '14': ['16', '22', '28', '28', '36', '36', '42', '42', '54', '54'],
    '22': ['16', '28', '28', '36', '36', '42', '54', '54', '54', '70'],
    '38': ['22', '36', '36', '42', '54', '54', '54', '70', '70', '70'],
    '60': ['22', '42', '54', '54', '70', '70', '70', '82', '82', '82'],
    '100': ['28', '54', '54', '70', '70', '82', '82', '92', '104', '104'],
    '150': ['36', '70', '70', '82', '92', '92', '104', null, null, null],
    '200': ['36', '70', '82', '92', '92', '104', null, null, null, null],
    '250': ['42', '82', '82', '92', '104', null, null, null, null, null],
  },
  thin: {
    '1.6': ['19', '19', '19', '25', '25', '25', '25', '31', '31', '31'],
    '2.0': ['19', '19', '19', '25', '25', '25', '31', '31', '31', '31'],
    '2.6': ['19', '19', '25', '25', '31', '31', '31', '39', '39', '39'],
    '3.2': ['19', '25', '25', '31', '31', '31', '39', '39', '39', '51'],
    '14': ['19', '25', '31', '39', '39', '51', '51', '51', '51', '63'],
    '22': ['19', '31', '39', '39', '51', '51', '51', '63', '63', '63'],
    '38': ['25', '39', '51', '51', '63', '63', '63', '75', '75', '75'],
    '60': ['25', '51', '51', '63', '63', '75', '75', '75', null, null],
    '100': ['31', '63', '63', '75', '75', null, null, null, null, null],
    '150': ['39', '63', '75', null, null, null, null, null, null, null],
    '200': ['51', '75', '75', null, null, null, null, null, null, null],
  },
  thinless: {
    '1.6': ['E19', 'E19', 'E19', 'E19', 'E25', 'E25', 'E25', 'E31', 'E31', 'E31'],
    '2.0': ['E19', 'E19', 'E19', 'E25', 'E25', 'E25', 'E31', 'E31', 'E31', 'E31'],
    '2.6': ['E19', 'E19', 'E25', 'E25', 'E31', 'E31', 'E31', 'E39', 'E39', 'E39'],
    '3.2': ['E19', 'E25', 'E25', 'E31', 'E31', 'E39', 'E39', 'E39', 'E51', 'E51'],
    '14': ['E19', 'E25', 'E31', 'E31', 'E39', 'E51', 'E51', 'E51', 'E51', 'E63'],
    '22': ['E19', 'E31', 'E31', 'E39', 'E51', 'E51', 'E51', 'E63', 'E63', 'E63'],
    '38': ['E25', 'E39', 'E51', 'E51', 'E63', 'E63', 'E63', 'E75', 'E75', 'E75'],
    '60': ['E25', 'E51', 'E51', 'E63', 'E63', 'E75', 'E75', 'E75', null, null],
    '100': ['E31', 'E63', 'E63', 'E75', 'E75', null, null, null, null, null],
    '150': ['E39', 'E63', 'E75', null, null, null, null, null, null, null],
  },
};

// 出典: 3115-4表(硬質ビニル管) 3115-5表(PF管・CD管)
export const PVC_SAME_GAUGE_TABLE: Record<PvcConduitType, Record<string, (string | null)[]>> = {
  rigid: {
    '1.6': ['14', '14', '14', '16', '16', '22', '22', '28', '28', '28'],
    '2.0': ['14', '16', '16', '16', '22', '22', '28', '28', '28', '36'],
    '2.6': ['14', '16', '16', '22', '28', '28', '28', '36', '36', '36'],
    '3.2': ['14', '22', '22', '28', '28', '36', '36', '36', '42', '42'],
    '14': ['14', '22', '28', '28', '36', '36', '42', '42', '54', '54'],
    '22': ['16', '28', '36', '36', '42', '42', '54', '54', '54', '70'],
    '38': ['16', '36', '42', '54', '54', '54', '70', '70', '70', '70'],
    '60': ['22', '42', '54', '54', '70', '70', '82', '82', null, null],
    '100': ['28', '54', '70', '70', '82', '82', null, null, null, null],
    '150': ['36', '70', '70', '82', null, null, null, null, null, null],
    '200': ['42', '70', '82', null, null, null, null, null, null, null],
    '250': ['42', '82', null, null, null, null, null, null, null, null],
  },
  pf_cd: {
    '1.6': ['14', '14', '14', '14', '16', '16', '22', '22', '22', '22'],
    '2.0': ['14', '14', '14', '16', '16', '22', '22', '28', '28', '28'],
    '2.6': ['14', '14', '16', '22', '22', '22', '28', '28', '28', '36'],
    '3.2': ['14', '22', '22', '22', '28', '28', '36', '36', '42', '42'],
    '14': ['14', '22', '28', '28', '36', '36', '42', '42', null, null],
    '22': ['16', '28', '36', '36', '42', '42', null, null, null, null],
    '38': ['16', '36', '42', '42', null, null, null, null, null, null],
    '60': ['22', '42', null, null, null, null, null, null, null, null],
    '100': ['28', null, null, null, null, null, null, null, null, null],
  },
};

// ------------------------------------------------------------------
// 3. 屈曲が少なく容易に引替えできる場合の最大電線本数 (10本超で使用)
//    3110-6表 (金属管) / 3115-7表 (合成樹脂管)
// ------------------------------------------------------------------
export const EASY_PULL_MAX_WIRES: {
  gauge: string;
  isStranded: boolean;
  metal: Partial<Record<MetalConduitType, Record<string, number>>>; // conduitType -> size -> maxCount
  pvc: Partial<Record<PvcConduitType, Record<string, number>>>;
}[] = [
  {
    gauge: '1.6', isStranded: false,
    metal: { thick: { '16': 6, '22': 11 }, thin: { '19': 5, '25': 11 }, thinless: { E19: 6, E25: 12 } },
    pvc: { rigid: { '14': 4, '16': 7, '22': 11 }, pf_cd: { '16': 9, '22': 17 } },
  },
  {
    gauge: '2.0', isStranded: false,
    metal: { thick: { '16': 5, '22': 9 }, thin: { '19': 4, '25': 9 }, thinless: { E19: 5, E25: 9 } },
    pvc: { rigid: { '14': 3, '16': 6, '22': 9 }, pf_cd: { '16': 7, '22': 14 } },
  },
  {
    gauge: '2.6 (5.5)', isStranded: true,
    metal: { thick: { '16': 4, '22': 7 }, thin: { '19': 3, '25': 7 }, thinless: { E19: 4, E25: 8 } },
    pvc: { rigid: { '14': 3, '16': 5, '22': 7 }, pf_cd: { '16': 4, '22': 9 } },
  },
  {
    gauge: '3.2 (8)', isStranded: true,
    metal: { thick: { '16': 3, '22': 5 }, thin: { '19': 2, '25': 5 }, thinless: { E19: 3, E25: 5 } },
    pvc: { rigid: { '14': 2, '16': 3, '22': 5 }, pf_cd: { '16': 3, '22': 6 } },
  },
];

// ------------------------------------------------------------------
// 4. 電線の断面積 (被覆絶縁物を含む) 3110-7表 (合成樹脂管も共用: 3115節注記より)
// ------------------------------------------------------------------
export const WIRE_CROSS_SECTION_MM2: Record<string, number> = {
  '1.6': 8,
  '2.0': 10,
  '2.6': 20, // 5.5sq
  '3.2': 28, // 8sq
  '14': 45,
  '22': 66,
  '38': 104,
  '60': 154,
  '100': 227,
  '150': 346,
  '200': 415,
  '250': 531,
};

// ------------------------------------------------------------------
// 5. 異なる太さの電線を収める場合の補正係数 3110-8表(金属管) / 3115-8表(合成樹脂管)
// ------------------------------------------------------------------
export const CORRECTION_FACTOR = {
  metal: {
    small: 2.0, // 1.6, 2.0mm
    medium: 1.2, // 2.6/5.5, 3.2/8mm
    large: 1.0, // 14sq以上
  },
  pvc: {
    rigid: { small: 2.0, medium: 1.2, large: 1.0 },
    pf_cd: { small: 1.3, medium: 1.0, large: 1.0 },
  },
};

export const getCorrectionFactor = (category: ConduitCategory, pvcType: PvcConduitType | undefined, gaugeKey: '1.6' | '2.0' | '2.6' | '3.2' | 'large'): number => {
  const bucket = gaugeKey === '1.6' || gaugeKey === '2.0' ? 'small' : gaugeKey === 'large' ? 'large' : 'medium';
  if (category === 'metal') return CORRECTION_FACTOR.metal[bucket];
  return CORRECTION_FACTOR.pvc[pvcType ?? 'rigid'][bucket];
};

// ------------------------------------------------------------------
// 6. 管の内断面積の32%(通常)・48%(容易な引替え可の場合) 早見表
//    3110-9〜11表(金属管) / 3115-9〜10表(合成樹脂管)
// ------------------------------------------------------------------
export const METAL_INNER_AREA_TABLE: Record<MetalConduitType, Record<string, { area32: number; area48: number }>> = {
  thick: {
    '16': { area32: 67, area48: 101 }, '22': { area32: 120, area48: 180 }, '28': { area32: 201, area48: 301 },
    '36': { area32: 342, area48: 513 }, '42': { area32: 460, area48: 690 }, '54': { area32: 732, area48: 1098 },
    '70': { area32: 1216, area48: 1825 }, '82': { area32: 1701, area48: 2552 }, '92': { area32: 2205, area48: 3308 },
    '104': { area32: 2843, area48: 4265 },
  },
  thin: {
    '19': { area32: 63, area48: 95 }, '25': { area32: 123, area48: 185 }, '31': { area32: 205, area48: 308 },
    '51': { area32: 569, area48: 853 }, '63': { area32: 889, area48: 1333 }, '75': { area32: 1309, area48: 1964 },
  },
  thinless: {
    E19: { area32: 70, area48: 105 }, E25: { area32: 132, area48: 199 }, E31: { area32: 211, area48: 316 },
    E39: { area32: 313, area48: 469 }, E51: { area32: 578, area48: 868 }, E63: { area32: 913, area48: 1370 },
    E75: { area32: 1324, area48: 1986 },
  },
};

export const PVC_INNER_AREA_TABLE: Record<PvcConduitType, Record<string, { area32: number; area48: number }>> = {
  rigid: {
    '14': { area32: 49, area48: 73 }, '16': { area32: 81, area48: 122 }, '22': { area32: 121, area48: 182 },
    '28': { area32: 196, area48: 295 }, '36': { area32: 307, area48: 461 }, '42': { area32: 401, area48: 602 },
    '54': { area32: 653, area48: 980 }, '70': { area32: 1127, area48: 1691 }, '82': { area32: 1497, area48: 2245 },
  },
  pf_cd: {
    '14': { area32: 49, area48: 73 }, '16': { area32: 64, area48: 96 }, '22': { area32: 121, area48: 182 },
    '28': { area32: 196, area48: 295 }, '36': { area32: 325, area48: 488 }, '42': { area32: 443, area48: 664 },
  },
};

export const WIRE_ROWS_LIST = WIRE_ROWS;
