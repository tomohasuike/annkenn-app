// src/utils/pullBoxLayoutEngine.ts
// プルボックス穴あけ位置の計算エンジン。UIから独立した純粋関数。
//
// 高さの基準線は「プルボックスの下端（底の外面）」。Yはすべてそこからの高さ(mm)。
// Xはプルボックス左端からの距離(mm)。
//
// 芯高さの式:   Y = ダクターの高さ + 電線管の外径 / 2
//   公開されている「支持材別開口寸法表」17件と突き合わせて検証済み（丸め規則を特定し17件すべて一致）。
//   さらに支持クリップの実寸（A - 外径 が全型番で約17mm一定）から、
//   クリップは管を持ち上げないことを確認済み。
//
// 二段以降:  2段目ダクター下端 = 1段目のクリップ頂部 + クリアランス
//            2段目ダクター天端 = その下端 + 2段目ダクター自身の高さ
//   クリップは管の天端より16〜18mm上に出るため、管天端を基準にすると干渉する。
//
// 検証記録: hitec-ai-team/reports/プルボックス穴あけアプリ_計画_2026-09-15/

import {
  DUCTER_HEIGHT_MM,
  DEFAULT_PIPE_GAP_MM,
  clipSpec,
  connectorThreadDiameter,
  drillingMethod,
  type DrillingMethod,
  conduitLabel,
  knockoutDiameter,
  outerDiameter,
  type ConduitRef,
  type DucterType,
} from '../constants/pullBoxKnockout';

/** 横方向の寄せ方 */
export type Alignment = 'center' | 'left' | 'right';

export interface TierInput {
  ducter: DucterType;
  pipes: ConduitRef[];
}

export interface LayoutInput {
  boxWidthMm: number;
  boxHeightMm: number;
  tiers: TierInput[];
  /** 段間のクリアランス(mm)。長さは tiers.length - 1。足りない分は0扱い。 */
  clearancesMm: number[];
  gapMm?: number;
  /** X座標の丸め単位(mm)。社長決定により既定1mm。 */
  snapMm?: number;
  alignment?: Alignment;
  /**
   * alignment が left/right のときの、箱の端から一番端の管の**外面**までのあき(mm)。
   * 芯までの距離ではない。現場で測れるのは管の外面までなので（2026-09-15 社長）。
   */
  edgeGapMm?: number;
}

export interface Hole {
  label: string;
  conduit: ConduitRef;
  /** 左端からの芯位置(mm) */
  x: number;
  /** 下端からの芯高さ(mm) */
  y: number;
  outerDiameterMm: number;
  /** メーカーの推奨ノック径(mm)。参考値。 */
  knockoutMm: number;
  /** **実際に開ける径(mm)**。図・一覧・帳票はすべてこれを出すこと。
   *  ホールソーならその径、パンチャーならメーカー推奨ノック径。 */
  actualHoleMm: number;
  /** コネクタのおねじ外径(mm)。実際に通る最小径。 */
  threadOdMm: number;
  /** null＝支持クリップのカタログ未確認（VE・PF/CD・プリカ管）。現場で選定する必要がある。 */
  clipModel: string | null;
  /** その穴をホールソーで開けるかパンチャーで抜くか */
  drilling: DrillingMethod;
}

export interface TierResult {
  ducter: DucterType;
  /** ダクター天端の高さ(mm)。芯高さの起点。 */
  ducterTopMm: number;
  /** ダクター下端の高さ(mm) */
  ducterBottomMm: number;
  /** この段で一番高いクリップの頂部(mm)。次の段はここを基準に積む。 */
  clipTopMm: number;
  /** trueなら、この段に支持クリップの高さが不明な管が混ざっている（clipTopMmはその分を見ていない下限値）。 */
  clipTopUncertain: boolean;
  holes: Hole[];
  /** 左端から1本目の管の外面まで(mm)。管が無ければ null */
  leftClearanceMm: number | null;
  /** 最後の管の外面から右端まで(mm) */
  rightClearanceMm: number | null;
  /** 隣り合う管どうしのあき(mm)。左から順。 */
  gapsMm: number[];
}

export type WarningLevel = 'error' | 'warn';

export interface LayoutWarning {
  level: WarningLevel;
  message: string;
  tierIndex?: number;
}

export interface LayoutResult {
  tiers: TierResult[];
  warnings: LayoutWarning[];
  /** 一番上のクリップ頂部(mm)。蓋との干渉確認に使う。 */
  topOfAssemblyMm: number;
}

/**
 * step単位に丸める。ちょうど半分のときは「下」に落とす。
 *
 * 公開されている「支持材別開口寸法表」17件の丸め規則を特定した結果がこれ。
 * 通常の四捨五入（半分を上げる）だと C63 と G22 の2件が表と食い違うが、
 * 半分を下げる規則なら17件すべてが完全一致する。
 * X方向（割り付け）にも同じ規則を使い、エンジン全体で丸め方を1つに統一する。
 */
function snapHalfDown(v: number, step: number): number {
  if (step <= 0) return v;
  return Math.ceil(v / step - 0.5 - 1e-9) * step;
}

/** 芯高さ用。業界の開口寸法表と同じ0.5mm精度。 */
function roundHalf(v: number): number {
  return snapHalfDown(v, 0.5);
}

function snapTo(v: number, step: number): number {
  return snapHalfDown(v, step);
}

function ceilTo(v: number, step: number): number {
  return step > 0 ? Math.ceil(v / step - 1e-9) * step : v;
}

/**
 * 段内の横方向の芯位置を出す。
 *
 * 丸めは「隣り合う芯々ピッチを切り上げてから全体を配置」の順で行う。
 * 芯を先に丸めると、切り捨て方向に振れたときに管どうしのあきが 30mm を割るため。
 */
function computeXs(
  boxWidthMm: number,
  ods: number[],
  gapMm: number,
  snapMm: number,
  alignment: Alignment,
  edgeGapMm: number,
): number[] {
  if (ods.length === 0) return [];
  // 端のあきは管の外面まで。芯位置にするため半径を足す。
  if (ods.length === 1) {
    if (alignment === 'left') return [snapTo(edgeGapMm + ods[0] / 2, snapMm)];
    if (alignment === 'right') return [snapTo(boxWidthMm - edgeGapMm - ods[0] / 2, snapMm)];
    return [snapTo(boxWidthMm / 2, snapMm)];
  }

  const pitches = ods.slice(0, -1).map((od, i) => ceilTo((od + ods[i + 1]) / 2 + gapMm, snapMm));
  const span = pitches.reduce((a, b) => a + b, 0);

  let first: number;
  if (alignment === 'left') {
    first = snapTo(edgeGapMm + ods[0] / 2, snapMm);
  } else if (alignment === 'right') {
    const last = boxWidthMm - edgeGapMm - ods[ods.length - 1] / 2;
    first = snapTo(last - span, snapMm);
  } else {
    first = snapTo((boxWidthMm - span) / 2, snapMm);
  }

  const xs = [first];
  pitches.forEach(p => xs.push(xs[xs.length - 1] + p));
  return xs;
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const {
    boxWidthMm,
    boxHeightMm,
    tiers,
    clearancesMm,
    gapMm = DEFAULT_PIPE_GAP_MM,
    snapMm = 1,
    alignment = 'center',
    edgeGapMm = DEFAULT_PIPE_GAP_MM,
  } = input;

  const warnings: LayoutWarning[] = [];
  const results: TierResult[] = [];
  let prevClipTop: number | null = null;

  tiers.forEach((tier, ti) => {
    const ducterHeight = DUCTER_HEIGHT_MM[tier.ducter];

    // ── 段の高さを決める ────────────────────────────────
    let ducterBottom: number;
    if (ti === 0) {
      ducterBottom = 0; // 1段目はプルボックス下端に合わせて取り付ける
    } else {
      const clearance = clearancesMm[ti - 1] ?? 0;
      ducterBottom = (prevClipTop ?? 0) + clearance;
    }
    const ducterTop = ducterBottom + ducterHeight;

    // ── 段内の管を検証しつつ寸法を集める ──────────────────
    // clip（支持クリップ）だけは無くても穴は開けられるので、od/knock/threadと違い必須にしない。
    // VE・PF/CD・プリカ(F2)は支持クリップのカタログを未確認（2026-09-15時点）で、clipSpec()がnullを返す。
    const valid: {
      conduit: ConduitRef; od: number; knock: number; thread: number;
      clip: { model: string; heightMm: number } | null;
    }[] = [];
    tier.pipes.forEach(c => {
      const od = outerDiameter(c);
      const knock = knockoutDiameter(c);
      const thread = connectorThreadDiameter(c);
      if (od == null || knock == null || thread == null) {
        warnings.push({
          level: 'error',
          tierIndex: ti,
          message: `${conduitLabel(c)} は寸法データを持っていません。対応表に無い呼び径です。`,
        });
        return;
      }
      valid.push({ conduit: c, od, knock, thread, clip: clipSpec(c) });
    });

    const ods = valid.map(v => v.od);
    const xs = computeXs(boxWidthMm, ods, gapMm, snapMm, alignment, edgeGapMm);

    const holes: Hole[] = valid.map((v, i) => {
      const drilling = drillingMethod(v.conduit, v.thread);
      return {
        label: conduitLabel(v.conduit),
        conduit: v.conduit,
        x: xs[i],
        y: roundHalf(ducterTop + v.od / 2),
        outerDiameterMm: v.od,
        knockoutMm: v.knock,
        // 図も一覧も帳票も、現場が実際に開ける径を出す。
        // ここを推奨ノック径のままにすると、図面どおりに開けた穴が指定と違う径になる。
        actualHoleMm: drilling.sawMm ?? v.knock,
        threadOdMm: v.thread,
        clipModel: v.clip?.model ?? null,
        drilling,
      };
    });

    // クリップ高さが分からない管が混じっていたら、頂部は「その分を見ていない下限値」になる。
    const hasUnknownClip = valid.some(v => v.clip == null);
    const clipTop = valid.length > 0
      ? ducterTop + Math.max(0, ...valid.filter(v => v.clip).map(v => v.clip!.heightMm))
      : ducterTop;
    if (hasUnknownClip) {
      warnings.push({
        level: 'warn',
        tierIndex: ti,
        message:
          `${ti + 1}段目に支持クリップの型番・高さが分かっていない管があります` +
          `（VE・PF/CD・プリカ管は支持クリップのカタログを未確認）。` +
          `クリップ頂部 ${clipTop}mm はその管のぶんを見ていない下限値です。` +
          `上に段を重ねる場合や蓋との干渉は必ず現場で確認してください。`,
      });
    }

    // ── あきを出す（警告の有無にかかわらず、常に数字で見せる） ──
    const gapsMm = holes.slice(0, -1).map(
      (h, i) => holes[i + 1].x - h.x - (h.outerDiameterMm + holes[i + 1].outerDiameterMm) / 2,
    );
    const leftClearanceMm = holes.length > 0 ? holes[0].x - holes[0].outerDiameterMm / 2 : null;
    const rightClearanceMm =
      holes.length > 0
        ? boxWidthMm - holes[holes.length - 1].x - holes[holes.length - 1].outerDiameterMm / 2
        : null;

    results.push({
      ducter: tier.ducter, ducterTopMm: ducterTop, ducterBottomMm: ducterBottom,
      clipTopMm: clipTop, clipTopUncertain: hasUnknownClip,
      holes, leftClearanceMm, rightClearanceMm, gapsMm,
    });
    prevClipTop = clipTop;

    // ── 検算：管どうしのあき ────────────────────────────
    for (let i = 0; i < holes.length - 1; i++) {
      const clear = gapsMm[i];
      if (clear < gapMm - 1e-6) {
        warnings.push({
          level: 'warn',
          tierIndex: ti,
          message:
            `${ti + 1}段目 ${holes[i].label}〜${holes[i + 1].label} のあきが ${clear.toFixed(1)}mm で、` +
            `${gapMm}mm を下回ります。コネクタが締められない恐れがあります。`,
        });
      }
    }

    // ── 検算：箱の端とのあき ────────────────────────────
    if (holes.length > 0) {
      // 穴径が管の外径より大きいので、はみ出し判定は穴で見る
      const first = holes[0];
      const last = holes[holes.length - 1];
      const leftClear = first.x - Math.max(first.outerDiameterMm, first.actualHoleMm) / 2;
      const rightClear = boxWidthMm - last.x - Math.max(last.outerDiameterMm, last.actualHoleMm) / 2;
      if (leftClear < 0 || rightClear < 0) {
        warnings.push({
          level: 'error',
          tierIndex: ti,
          message: `${ti + 1}段目の穴がプルボックスの幅に収まりません。幅を大きくするか本数を減らしてください。`,
        });
      } else if (Math.min(leftClear, rightClear) < gapMm - 1e-6) {
        warnings.push({
          level: 'warn',
          tierIndex: ti,
          message:
            `${ti + 1}段目の端あきが ${Math.min(leftClear, rightClear).toFixed(1)}mm で、${gapMm}mm を下回ります。`,
        });
      }
    }
  });

  // ── 検算：高さ方向 ──────────────────────────────────
  const topOfAssembly = results.length > 0 ? results[results.length - 1].clipTopMm : 0;
  results.forEach((t, ti) => {
    t.holes.forEach(h => {
      if (h.y + h.actualHoleMm / 2 > boxHeightMm) {
        warnings.push({
          level: 'error',
          tierIndex: ti,
          message: `${ti + 1}段目 ${h.label} の穴がプルボックスの高さ(${boxHeightMm}mm)を超えます。`,
        });
      }
    });
  });
  if (topOfAssembly > boxHeightMm) {
    warnings.push({
      level: 'warn',
      message:
        `一番上のクリップ頂部が ${topOfAssembly.toFixed(1)}mm で、プルボックスの高さ(${boxHeightMm}mm)を超えます。` +
        `蓋と干渉しないか確認してください。`,
    });
  }

  return { tiers: results, warnings, topOfAssemblyMm: topOfAssembly };
}

/** 拾い出し用：使うホールソー径とクリップ型番を集計する。 */
export function summarizeParts(result: LayoutResult): {
  knockouts: { diameterMm: number; count: number }[];
  clips: { model: string; count: number }[];
  /** 使う工具の集計。ホールソーは径ごと、パンチャーは適合ノック径ごと。 */
  tools: { label: string; count: number; isPunch: boolean }[];
} {
  const k = new Map<number, number>();
  const c = new Map<string, number>();
  const tool = new Map<string, { count: number; isPunch: boolean; key: number }>();
  result.tiers.forEach(t =>
    t.holes.forEach(h => {
      k.set(h.actualHoleMm, (k.get(h.actualHoleMm) ?? 0) + 1);
      const clipKey = h.clipModel ?? '（現場選定・カタログ未確認）';
      c.set(clipKey, (c.get(clipKey) ?? 0) + 1);
      const isPunch = h.drilling.tool === 'パンチャー';
      const label = isPunch ? `パンチャー φ${h.actualHoleMm}` : `ホールソー φ${h.drilling.sawMm}`;
      const cur = tool.get(label);
      tool.set(label, { count: (cur?.count ?? 0) + 1, isPunch, key: h.actualHoleMm });
    }),
  );
  return {
    knockouts: [...k.entries()].sort((a, b) => a[0] - b[0]).map(([diameterMm, count]) => ({ diameterMm, count })),
    clips: [...c.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([model, count]) => ({ model, count })),
    tools: [...tool.entries()]
      .sort((a, b) => Number(a[1].isPunch) - Number(b[1].isPunch) || a[1].key - b[1].key)
      .map(([label, v]) => ({ label, count: v.count, isPunch: v.isPunch })),
  };
}
