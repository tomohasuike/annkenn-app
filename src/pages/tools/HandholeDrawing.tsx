// src/pages/tools/HandholeDrawing.tsx
// ハンドホール加工図（発注仕様の原寸イメージ）。
//
//   px = margin + mm * scale
//   Y は下から上（原点＝加工可能エリアの左下）。画面座標とは上下が逆なので py() で反転する。
//
// プルボックスの加工図(PullBoxDrawing.tsx)と同じ考え方：実寸「比」で見た目が分かればよい。
// 面の全体（totalWidth×totalHeight）を外枠として描き、その中に加工可能エリアを破線で示し、
// 配置できた穴は塗り、配置できなかった穴は右側に「未配置」として別枠で並べる。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Group } from 'react-konva';
import type { HandholeLayoutResult } from '../../utils/handholeLayoutEngine';

const MARGIN = { top: 40, right: 24, bottom: 30, left: 60 };
const MAX_DRAW_H = 420;
const UNPLACED_COL_W = 150;

export default function HandholeDrawing({ result }: { result: HandholeLayoutResult }) {
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
    ? { paper: '#0f172a', ink: '#e2e8f0', sub: '#94a3b8', line: '#475569', area: '#1e293b', hole: '#1e293b', unplaced: '#7f1d1d' }
    : { paper: '#ffffff', ink: '#1e293b', sub: '#64748b', line: '#cbd5e1', area: '#eff6ff', hole: '#f8fafc', unplaced: '#fee2e2' };

  const { area } = result;

  const geom = useMemo(() => {
    if (!area) return null;
    const hasUnplaced = result.unplacedHoles.length > 0;
    const extraRight = hasUnplaced ? UNPLACED_COL_W : 0;
    const availW = Math.max(wrapWidth - MARGIN.left - MARGIN.right - extraRight, 120);
    const scale = Math.min(availW / area.totalWidthMm, MAX_DRAW_H / area.totalHeightMm);
    const drawW = area.totalWidthMm * scale;
    const drawH = area.totalHeightMm * scale;
    return {
      scale, drawW, drawH,
      stageW: drawW + MARGIN.left + MARGIN.right + extraRight,
      stageH: drawH + MARGIN.top + MARGIN.bottom,
      px: (mm: number) => MARGIN.left + (area.totalWidthMm - area.workableWidthMm) / 2 + mm * scale,
      py: (mm: number) => MARGIN.top + drawH - mm * scale,
      extraRight,
    };
  }, [area, wrapWidth, result.unplacedHoles.length]);

  if (!area || !geom) {
    return (
      <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6 text-center text-sm text-amber-800 dark:text-amber-300">
        このサイズは加工可能エリアの実寸が未確認のため、図は作成できません。穴の一覧（参考値）のみ下に表示しています。
      </div>
    );
  }

  const { scale, drawW, drawH, stageW, stageH, px, py, extraRight } = geom;
  // 加工可能エリアの左下(area座標 0,0)の画面位置
  const areaLeftPx = px(0);
  const areaBottomPx = py(0);
  const areaTopPx = py(area.workableHeightMm);
  const areaWidthPx = area.workableWidthMm * scale;

  return (
    <div ref={wrapRef} className="w-full overflow-x-auto">
      <Stage width={stageW} height={stageH}>
        <Layer>
          <Rect x={0} y={0} width={stageW} height={stageH} fill={c.paper} />

          {/* 面の外枠 */}
          <Rect x={MARGIN.left} y={MARGIN.top} width={drawW} height={drawH} stroke={c.ink} strokeWidth={1.6} fill={isDark ? '#111c30' : '#fdfdfe'} />
          <Text x={MARGIN.left} y={MARGIN.top - 18} width={drawW} align="center"
            text={`${area.faceLabel}　全幅${area.totalWidthMm}×全高${area.totalHeightMm}mm`}
            fontSize={11} fontStyle="bold" fill={c.sub} />

          {/* 上端・下端の加工不可帯 */}
          <Rect x={MARGIN.left} y={MARGIN.top} width={drawW} height={area.topExcludeMm * scale} fill={isDark ? '#1e293b' : '#f1f5f9'} opacity={0.7} />
          <Text x={MARGIN.left + 4} y={MARGIN.top + 4} text={`加工不可 ${area.topExcludeMm}`} fontSize={9} fill={c.sub} />
          <Rect x={MARGIN.left} y={MARGIN.top + drawH - area.bottomExcludeMm * scale} width={drawW} height={area.bottomExcludeMm * scale} fill={isDark ? '#1e293b' : '#f1f5f9'} opacity={0.7} />
          <Text x={MARGIN.left + 4} y={MARGIN.top + drawH - area.bottomExcludeMm * scale + 4} text={`加工不可 ${area.bottomExcludeMm}`} fontSize={9} fill={c.sub} />

          {/* 加工可能エリア */}
          <Rect x={areaLeftPx} y={areaTopPx} width={areaWidthPx} height={areaBottomPx - areaTopPx}
            stroke="#2563eb" strokeWidth={1.2} dash={[5, 4]} fill={c.area} opacity={0.5} />
          <Text x={areaLeftPx} y={areaTopPx - 14} width={areaWidthPx} align="center"
            text={`加工可能エリア ${area.workableWidthMm}×${area.workableHeightMm}mm`}
            fontSize={10} fontStyle="bold" fill="#2563eb" />

          {/* 配置済みの穴 */}
          {result.placedHoles.map(h => {
            const cx = areaLeftPx + h.x * scale;
            const cy = areaBottomPx - h.y * scale;
            const r = Math.max((h.diameterMm / 2) * scale, 3);
            return (
              <Group key={h.id}>
                <Circle x={cx} y={cy} radius={r} fill={c.hole} stroke="#16a34a" strokeWidth={1.6} />
                <Text x={cx - 40} y={cy - r - 24} width={80} align="center" text={`φ${h.diameterMm}`} fontSize={10} fontStyle="bold" fill="#15803d" />
                <Text x={cx - 40} y={cy - r - 12} width={80} align="center" text={h.label} fontSize={8} fill={c.sub} />
              </Group>
            );
          })}

          {/* 未配置の穴（エリア外・右側に別枠で並べて注意喚起） */}
          {result.unplacedHoles.length > 0 && (
            <Group>
              <Rect x={MARGIN.left + drawW + 10} y={MARGIN.top} width={extraRight - 16} height={drawH} fill={c.unplaced} opacity={0.35} stroke="#dc2626" dash={[4, 3]} />
              <Text x={MARGIN.left + drawW + 14} y={MARGIN.top + 4} width={extraRight - 24} text="未配置（収まりません）" fontSize={9} fontStyle="bold" fill="#dc2626" />
              {result.unplacedHoles.slice(0, 14).map((h, i) => (
                <Text key={h.id} x={MARGIN.left + drawW + 14} y={MARGIN.top + 22 + i * 16} width={extraRight - 24}
                  text={`φ${h.diameterMm} ${h.label}`} fontSize={9} fill="#b91c1c" />
              ))}
              {result.unplacedHoles.length > 14 && (
                <Text x={MARGIN.left + drawW + 14} y={MARGIN.top + 22 + 14 * 16} width={extraRight - 24}
                  text={`他 ${result.unplacedHoles.length - 14}件`} fontSize={9} fontStyle="bold" fill="#b91c1c" />
              )}
            </Group>
          )}
        </Layer>
      </Stage>
    </div>
  );
}
