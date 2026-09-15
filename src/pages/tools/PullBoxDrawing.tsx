// src/pages/tools/PullBoxDrawing.tsx
// プルボックス加工図。
//
//   px = margin + mm * scale
//   Y は下から上（基準線＝プルボックスの下端）。画面座標とは上下が逆なので py() で反転する。
//
// 方針（2026-09-15 社長）：「実寸比じゃなくてもいい。見た目で分かれば。」
//   箱が大きいと管が下に固まり、上が大きく余って肝心の穴が読めなくなる。
//   そこで、上の何も無い部分は破断線で省く。
//   ただし縦横の倍率は必ず揃える。縦だけ伸ばすと管がダクターの上に浮いて見え、
//   「管がダクターに乗っている」という図の一番大事なところが壊れるため。
//
//   あわせて「間がいくつ空いているか」を図の中に出す。管の外面どうし・管と箱の端。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Group } from 'react-konva';
import type { LayoutResult } from '../../utils/pullBoxLayoutEngine';
import { DEFAULT_PIPE_GAP_MM, DUCTER_HEIGHT_MM } from '../../constants/pullBoxKnockout';

/** 段ごとの色。罫書きの順番と対応させる。 */
export const TIER_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea'];

export type DimensionMode = 'cumulative' | 'serial';

interface Props {
  boxWidthMm: number;
  boxHeightMm: number;
  result: LayoutResult;
  dimensionMode: DimensionMode;
  /** 選択中の穴 "段index-穴index"。タップで拡大表示する。 */
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

const MARGIN = { top: 42, right: 24, bottom: 46, left: 80 };
/** 芯寸法の行とあき寸法の行、2行ぶん使う */
const DIM_ROW_H = 34;
const GAP_ROW_H = 30;
const MAX_DRAW_H = 400;
/** 芯高さラベルの最小行間(px)。これを下回ると読めなくなるので縦にずらす。 */
const LABEL_MIN_GAP = 13;
/** 中身の上にこれだけ余白を残す(mm)。それより上が余っていたら破断する。 */
const HEAD_ROOM_MM = 25;

interface YLabel {
  anchorY: number;
  y: number;
  text: string;
  color: string;
  bold: boolean;
}

/**
 * 芯高さラベルが重ならないように縦へ散らす。
 * 上から順に見て、前のラベルと近すぎたら下へ押し下げる。
 * ずらした分は呼び出し側で引き出し線を描いて対応を保つこと。
 */
function spreadLabels(labels: YLabel[], minY: number, maxY: number): YLabel[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < LABEL_MIN_GAP) {
      sorted[i] = { ...sorted[i], y: sorted[i - 1].y + LABEL_MIN_GAP };
    }
  }
  // 下にはみ出したら全体を持ち上げ、さらに上にはみ出す分は詰める（Codex P1）
  const overflow = sorted.length > 0 ? sorted[sorted.length - 1].y - maxY : 0;
  if (overflow > 0) sorted.forEach((l, i) => (sorted[i] = { ...l, y: l.y - overflow }));
  if (sorted.length > 0 && sorted[0].y < minY) {
    const shift = minY - sorted[0].y;
    sorted.forEach((l, i) => (sorted[i] = { ...l, y: l.y + shift }));
  }
  return sorted;
}

export default function PullBoxDrawing({
  boxWidthMm,
  boxHeightMm,
  result,
  dimensionMode,
  selectedKey,
  onSelect,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(760);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWrapWidth(w);
    });
    ro.observe(el);
    setWrapWidth(el.clientWidth || 760);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setIsDark(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const c = isDark
    ? { paper: '#0f172a', ink: '#e2e8f0', sub: '#94a3b8', line: '#475569', ducter: '#334155', hole: '#1e293b' }
    : { paper: '#ffffff', ink: '#1e293b', sub: '#64748b', line: '#cbd5e1', ducter: '#e2e8f0', hole: '#f8fafc' };

  const tierCount = Math.max(result.tiers.length, 1);
  const geom = useMemo(() => {
    // 中身が収まる高さ。ここより上が空いていれば破断して省く。
    const contentTop = result.tiers.reduce((m, t) => {
      const holeTop = t.holes.reduce((n, h) => Math.max(n, h.y + h.actualHoleMm / 2), 0);
      return Math.max(m, t.clipTopMm, holeTop);
    }, 0);
    const wanted = contentTop + HEAD_ROOM_MM;
    const cropped = wanted < boxHeightMm * 0.85 && contentTop > 0;
    const drawTopMm = cropped ? wanted : boxHeightMm;

    const availW = Math.max(wrapWidth - MARGIN.left - MARGIN.right, 120);
    // 縦横は同じ倍率。高さが伸びすぎる場合だけ全体を縮める。
    const scale = Math.min(availW / Math.max(boxWidthMm, 1), MAX_DRAW_H / Math.max(drawTopMm, 1));
    const vScale = scale;
    const drawW = boxWidthMm * scale;
    const drawH = drawTopMm * scale;

    const dimH = tierCount * (DIM_ROW_H + GAP_ROW_H);
    return {
      scale, vScale, drawW, drawH, drawTopMm, cropped,
      stageW: drawW + MARGIN.left + MARGIN.right,
      stageH: drawH + MARGIN.top + MARGIN.bottom + dimH,
      px: (mm: number) => MARGIN.left + mm * scale,
      py: (mm: number) => MARGIN.top + (drawTopMm - mm) * vScale,
    };
  }, [wrapWidth, boxWidthMm, boxHeightMm, tierCount, result]);

  const { scale, vScale, drawW, drawH, drawTopMm, cropped, stageW, stageH, px, py } = geom;
  const baselineY = py(0);

  const yLabels = useMemo(() => {
    const raw: YLabel[] = [];
    result.tiers.forEach((tier, ti) => {
      const color = TIER_COLORS[ti % TIER_COLORS.length];
      tier.holes.forEach((h, hi) => {
        if (raw.some(r => r.text === `${h.y}` && r.color === color)) return;
        raw.push({ anchorY: py(h.y), y: py(h.y), text: `${h.y}`, color, bold: selectedKey === `${ti}-${hi}` });
      });
    });
    return spreadLabels(raw, MARGIN.top, MARGIN.top + drawH);
  }, [result, py, selectedKey, drawH]);

  /** あき寸法の1本。管の外面どうし、または管と箱の端。 */
  const gapMark = (fromMm: number, toMm: number, rowY: number, color: string, key: string) => {
    const a = px(fromMm);
    const b = px(toMm);
    const v = toMm - fromMm;
    const tight = v < DEFAULT_PIPE_GAP_MM;
    const col = tight ? '#d97706' : color;
    return (
      <Group key={key}>
        <Line points={[a, rowY - 4, a, rowY + 4]} stroke={col} strokeWidth={1} />
        <Line points={[b, rowY - 4, b, rowY + 4]} stroke={col} strokeWidth={1} />
        <Line points={[a, rowY, b, rowY]} stroke={col} strokeWidth={tight ? 1.8 : 1.1} />
        <Text
          x={(a + b) / 2 - 30}
          y={rowY - 14}
          width={60}
          align="center"
          text={`${Math.round(v * 10) / 10}`}
          fontSize={tight ? 11 : 10}
          fontStyle="bold"
          fill={col}
        />
      </Group>
    );
  };

  return (
    <div ref={wrapRef} className="w-full overflow-x-auto">
      <Stage
        width={stageW}
        height={stageH}
        onMouseDown={e => { if (e.target === e.target.getStage() || e.target.name() === 'bg') onSelect(null); }}
        onTouchStart={e => { if (e.target === e.target.getStage() || e.target.name() === 'bg') onSelect(null); }}
      >
        <Layer>
          {/* 用紙。ここを触ったら選択解除（Codex P3） */}
          <Rect name="bg" x={0} y={0} width={stageW} height={stageH} fill={c.paper} />

          {/* プルボックスの外形 */}
          <Rect
            x={MARGIN.left} y={MARGIN.top} width={drawW} height={drawH}
            stroke={c.ink} strokeWidth={1.6} fill={isDark ? '#111c30' : '#fdfdfe'}
          />

          {/* 上を省いた印（破断線） */}
          {cropped && (
            <>
              <Line
                points={Array.from({ length: 21 }, (_, i) => [
                  MARGIN.left + (drawW * i) / 20,
                  MARGIN.top + (i % 2 === 0 ? 0 : 6),
                ]).flat()}
                stroke={c.paper}
                strokeWidth={7}
              />
              <Line
                points={Array.from({ length: 21 }, (_, i) => [
                  MARGIN.left + (drawW * i) / 20,
                  MARGIN.top + (i % 2 === 0 ? 0 : 6),
                ]).flat()}
                stroke={c.sub}
                strokeWidth={1}
              />
              <Text
                x={MARGIN.left} y={MARGIN.top - 15} width={drawW} align="center"
                text={`ここから上は省略`}
                fontSize={10} fill={c.sub}
              />
            </>
          )}

          {/* 基準線（下端） */}
          <Line points={[MARGIN.left - 40, baselineY, MARGIN.left + drawW + 8, baselineY]} stroke="#dc2626" strokeWidth={1.8} />
          <Text x={0} y={baselineY - 14} width={MARGIN.left - 6} align="right" text="基準線 0" fontSize={10} fontStyle="bold" fill="#dc2626" />

          {/* 段ごと */}
          {result.tiers.map((tier, ti) => {
            const color = TIER_COLORS[ti % TIER_COLORS.length];
            const dTop = py(tier.ducterTopMm);
            const dBottom = py(tier.ducterBottomMm);
            return (
              <Group key={`tier-${ti}`}>
                <Rect
                  x={MARGIN.left} y={dTop} width={drawW} height={Math.max(dBottom - dTop, 1)}
                  fill={c.ducter} stroke={c.line} strokeWidth={1}
                />
                <Text
                  x={MARGIN.left + 4} y={dTop - 13}
                  text={`${tier.ducter}（高さ${DUCTER_HEIGHT_MM[tier.ducter]}）`}
                  fontSize={10} fill={color} fontStyle="bold"
                />

                {result.tiers.length > 1 && (
                  <>
                    <Line points={[MARGIN.left, py(tier.clipTopMm), MARGIN.left + drawW, py(tier.clipTopMm)]}
                      stroke={color} strokeWidth={1} dash={[3, 3]} opacity={0.55} />
                    <Text x={MARGIN.left + drawW - 96} y={py(tier.clipTopMm) - 12}
                      text={`クリップ頂部 ${tier.clipTopMm}${tier.clipTopUncertain ? '?' : ''}`} fontSize={9} fill={color} opacity={0.9} />
                  </>
                )}

                {tier.holes.map((h, hi) => {
                  const key = `${ti}-${hi}`;
                  const sel = selectedKey === key;
                  const cx = px(h.x);
                  const cy = py(h.y);
                  // 縦横で倍率が違うので、丸は横方向の実寸比に合わせる（太さの比較が目的）
                  const rHole = (h.actualHoleMm / 2) * scale;
                  const rPipe = (h.outerDiameterMm / 2) * scale;
                  return (
                    <Group key={key}
                      onMouseDown={() => onSelect(sel ? null : key)}
                      onTouchStart={() => onSelect(sel ? null : key)}>
                      <Circle x={cx} y={cy} radius={rHole} fill={c.hole} stroke={color} strokeWidth={sel ? 3 : 1.8} />
                      <Circle x={cx} y={cy} radius={rPipe} stroke={color} strokeWidth={0.9} dash={[3, 2]} opacity={0.65} />
                      <Line points={[cx - rHole - 5, cy, cx + rHole + 5, cy]} stroke={color} strokeWidth={0.8} opacity={0.8} />
                      <Line points={[cx, cy - rHole - 5, cx, cy + rHole + 5]} stroke={color} strokeWidth={0.8} opacity={0.8} />
                      <Text x={cx - 30} y={rHole > 17 ? cy - 13 : cy - rHole - 26} width={60} align="center"
                        text={h.label} fontSize={sel ? 13 : 11} fontStyle="bold" fill={color} />
                      <Text x={cx - 30} y={rHole > 17 ? cy + 1 : cy - rHole - 14} width={60} align="center"
                        text={`φ${h.actualHoleMm}`} fontSize={sel ? 12 : 10} fill={sel ? color : c.sub} />
                      <Line points={[MARGIN.left, cy, cx - rHole, cy]} stroke={color} strokeWidth={0.6} dash={[2, 3]} opacity={0.5} />
                    </Group>
                  );
                })}
              </Group>
            );
          })}

          {/* 芯高さラベル（左） */}
          {yLabels.map((l, i) => (
            <Group key={`yl-${i}`}>
              <Line points={[MARGIN.left - 42, l.y + 6, MARGIN.left - 6, l.anchorY, MARGIN.left, l.anchorY]}
                stroke={l.color} strokeWidth={0.7} opacity={0.65} />
              <Text x={0} y={l.y} width={MARGIN.left - 44} align="right" text={l.text}
                fontSize={l.bold ? 13 : 11} fontStyle="bold" fill={l.color} />
            </Group>
          ))}

          {/* 段ごとの寸法：上段＝芯、下段＝あき */}
          {result.tiers.map((tier, ti) => {
            const color = TIER_COLORS[ti % TIER_COLORS.length];
            const base = MARGIN.top + drawH + 18 + ti * (DIM_ROW_H + GAP_ROW_H);
            const rowY = base;
            const gapY = base + GAP_ROW_H;
            if (tier.holes.length === 0) return null;
            return (
              <Group key={`dim-${ti}`}>
                <Line points={[MARGIN.left, rowY, MARGIN.left + drawW, rowY]} stroke={color} strokeWidth={0.8} opacity={0.45} />
                <Text x={4} y={rowY - 5} width={MARGIN.left - 10} align="right" text={`${ti + 1}段目 芯`} fontSize={10} fontStyle="bold" fill={color} />
                <Line points={[MARGIN.left, rowY - 5, MARGIN.left, rowY + 5]} stroke={color} strokeWidth={1} />
                {tier.holes.map((h, hi) => {
                  const x = px(h.x);
                  if (dimensionMode === 'cumulative') {
                    const prevX = hi > 0 ? px(tier.holes[hi - 1].x) : -999;
                    const stagger = x - prevX < 46 ? 1 : 0;
                    return (
                      <Group key={`c${hi}`}>
                        <Line points={[x, rowY - 5, x, rowY + 5]} stroke={color} strokeWidth={1} />
                        <Text x={x - 34} y={rowY + 7 + stagger * 11} width={68} align="center"
                          text={`${h.x}`} fontSize={10} fontStyle="bold" fill={color} />
                      </Group>
                    );
                  }
                  const from = hi === 0 ? MARGIN.left : px(tier.holes[hi - 1].x);
                  return (
                    <Group key={`s${hi}`}>
                      <Line points={[x, rowY - 5, x, rowY + 5]} stroke={color} strokeWidth={1} />
                      <Line points={[from, rowY, x, rowY]} stroke={color} strokeWidth={1.6} />
                      <Text x={(from + x) / 2 - 34} y={rowY + 7} width={68} align="center"
                        text={`${Math.round((h.x - (hi === 0 ? 0 : tier.holes[hi - 1].x)) * 10) / 10}`}
                        fontSize={10} fontStyle="bold" fill={color} />
                    </Group>
                  );
                })}

                {/* あき（管の外面どうし・管と箱の端） */}
                <Text x={4} y={gapY - 5} width={MARGIN.left - 10} align="right" text="あき" fontSize={10} fontStyle="bold" fill={c.sub} />
                {gapMark(0, tier.holes[0].x - tier.holes[0].outerDiameterMm / 2, gapY, color, `gl${ti}`)}
                {tier.holes.slice(0, -1).map((h, i) =>
                  gapMark(
                    h.x + h.outerDiameterMm / 2,
                    tier.holes[i + 1].x - tier.holes[i + 1].outerDiameterMm / 2,
                    gapY, color, `gm${ti}-${i}`,
                  ),
                )}
                {gapMark(
                  tier.holes[tier.holes.length - 1].x + tier.holes[tier.holes.length - 1].outerDiameterMm / 2,
                  boxWidthMm, gapY, color, `gr${ti}`,
                )}
              </Group>
            );
          })}

          <Text x={MARGIN.left} y={6} width={drawW} align="center"
            text={`W ${boxWidthMm} × H ${boxHeightMm}`}
            fontSize={11} fontStyle="bold" fill={c.sub} />
        </Layer>
      </Stage>
    </div>
  );
}
