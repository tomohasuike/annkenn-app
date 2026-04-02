// src/constants/wiringStandards.ts

export type StartingMethod = 'direct' | 'star_delta' | 'inverter';
export type WireType = 'cv' | 'conduit';

// 三相200V モーターの標準定格電流（A）と分岐ブレーカ容量（A）
// 参照: 内線規程 3705節
export const MOTOR_STANDARDS_200V = [
  { kw: 0.2, currentA: 1.8, breakerDirect: 15, breakerStarDelta: null },
  { kw: 0.4, currentA: 3.2, breakerDirect: 15, breakerStarDelta: null },
  { kw: 0.75, currentA: 4.6, breakerDirect: 15, breakerStarDelta: null },
  { kw: 1.5, currentA: 8.0, breakerDirect: 15, breakerStarDelta: null },
  { kw: 2.2, currentA: 11.1, breakerDirect: 20, breakerStarDelta: null },
  { kw: 3.7, currentA: 16.8, breakerDirect: 30, breakerStarDelta: null },
  { kw: 5.5, currentA: 24.6, breakerDirect: 40, breakerStarDelta: 30 },
  { kw: 7.5, currentA: 34.0, breakerDirect: 50, breakerStarDelta: 40 },
  { kw: 11.0, currentA: 48.0, breakerDirect: 75, breakerStarDelta: 60 },
  { kw: 15.0, currentA: 64.0, breakerDirect: 100, breakerStarDelta: 75 },
  { kw: 18.5, currentA: 79.0, breakerDirect: 125, breakerStarDelta: 100 },
  { kw: 22.0, currentA: 92.0, breakerDirect: 150, breakerStarDelta: 100 },
  { kw: 30.0, currentA: 124.0, breakerDirect: 200, breakerStarDelta: 150 },
  { kw: 37.0, currentA: 152.0, breakerDirect: 225, breakerStarDelta: 175 },
];

/**
 * 幹線の許容電流 (Iw) の計算
 * @param im モーター負荷電流の合計(A) ※需要率考慮後
 * @param ih 一般負荷電流の合計(A) ※需要率考慮後
 * @returns 必要な幹線の許容電流値(A)
 */
export const calculateTrunkAllowableCurrent = (im: number, ih: number): number => {
  if (im <= ih) {
    return im + ih;
  }
  // im > ih の場合
  if (im <= 50) {
    return 1.25 * im + ih;
  }
  return 1.1 * im + ih;
};

/**
 * 主幹ブレーカー (Ib) の選定上限値
 * @param im モーター負荷電流(A)
 * @param ih 一般負荷電流(A)
 * @param iw 選定した電線の許容電流(A)
 * @returns 遮断器の最大許容電流(A)
 */
export const calculateMainBreakerLimit = (im: number, ih: number, iw: number): number => {
  const basicLimit = 3 * im + ih;
  const wireProtectionLimit = 2.5 * iw;
  return Math.min(basicLimit, wireProtectionLimit);
};
