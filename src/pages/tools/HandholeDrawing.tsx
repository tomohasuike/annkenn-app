// src/pages/tools/HandholeDrawing.tsx
// ハンドホール加工図（発注仕様の原寸イメージ）。1面ぶんを描画する。4面ある場合は
// 呼び出し側（HandholeKnockoutCalc.tsx）がタブ等でこのコンポーネントを面ごとに切り替えて使う。
//
//   px = margin + mm * scale
//   Y は下から上（原点＝加工可能エリアの左下）。画面座標とは上下が逆なので py() で反転する。
//
// プルボックスの加工図(PullBoxDrawing.tsx)と同じ考え方：実寸「比」で見た目が分かればよい。
// 面の全体（totalWidth×totalHeight）を外枠として描き、その中に加工可能エリアを破線で示し、
// ⊗マーク等の避けるべき領域があれば斜線の円で示し、配置できた穴は塗って表示する。
//
// 段（2026-09-16追加）: rowsが渡されたら、各段の境界（bandBottomMm）に横の区切り線を引き、
// 「N段目」ラベルを出す。横幅・高さ超過でその段が配置できなかった場合(fits=false)は
// 区切り線とラベルを赤くして、どの段が問題かひと目で分かるようにする。
//
// ブロック（2026-09-18追加）: 北関東工業のKK-E型は「分割式」（縁塊+スラブ+継胴+ベースを
// 上下に積み重ねる構造）で、600E-1200等サイズによっては加工可能エリアが上下複数「ブロック」に
// 分かれ、ブロック間の接合部（ピースの継ぎ目）は加工不可（handholeKitakanto.tsのMachinableArea
// 参照）。area.blocks/gapsMm/blockBottomsMmを使い、ブロック間の隙間を加工不可帯として描画し、
// 段ラベルにもブロック番号を出す（ブロックが1つしか無い面では従来通りブロック番号は省略）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Group } from 'react-konva';
import { connectorOuterDiameterFor, footprintDiameterFor, type MachinableArea } from '../../constants/handholeKitakanto';
import type { FaceRowResult, PlacedHole } from '../../utils/handholeLayoutEngine';

const MARGIN = { top: 40, right: 24, bottom: 30, left: 60 };
const MAX_DRAW_H = 420;

export default function HandholeDrawing({
  area,
  placedHoles,
  rows = [],
}: {
  area: MachinableArea | null;
  placedHoles: PlacedHole[];
  /** 段の区切り線を描くための段ごとの結果（省略時は区切り線を描かない）。 */
  rows?: FaceRowResult[];
}) {
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
    ? { paper: '#0f172a', ink: '#e2e8f0', sub: '#94a3b8', line: '#475569', area: '#1e293b', hole: '#1e293b', keepout: '#7f1d1d' }
    : { paper: '#ffffff', ink: '#1e293b', sub: '#64748b', line: '#cbd5e1', area: '#eff6ff', hole: '#f8fafc', keepout: '#fee2e2' };

  const geom = useMemo(() => {
    if (!area) return null;
    const availW = Math.max(wrapWidth - MARGIN.left - MARGIN.right, 120);
    const scale = Math.min(availW / area.totalWidthMm, MAX_DRAW_H / area.totalHeightMm);
    const drawW = area.totalWidthMm * scale;
    const drawH = area.totalHeightMm * scale;
    return {
      scale, drawW, drawH,
      stageW: drawW + MARGIN.left + MARGIN.right,
      stageH: drawH + MARGIN.top + MARGIN.bottom,
      // 【2026-09-16 修正】左右の余白((totalWidthMm-workableWidthMm)/2＝90mm)にscaleを
      // 掛け忘れており、mm単位の数値をそのままpx扱いしていたため横方向にもズレていた
      // （社長の実機報告で発覚。縦方向のpy()修正と同種のミス）。
      px: (mm: number) => MARGIN.left + ((area.totalWidthMm - area.workableWidthMm) / 2) * scale + mm * scale,
      // ローカルy(加工可能エリア左下=0)を画面Yへ変換する。
      // 【2026-09-16 修正】以前は `MARGIN.top + drawH - mm*scale` としており、これだと
      // 下端除外帯(bottomExcludeMm)を無視して「エリア下端=面の絶対下端」として描画してしまい、
      // 加工可能エリアの矩形・穴が実際より下端除外ぶん下にズレて表示されていた
      // （上端に不要な空白ができ、下端は「加工不可」帯と重なって見えた。社長の実機報告で発覚）。
      // 上端除外(topExcludeMm)ぶんフレーム上端から下げた位置を「エリア上端」の基準にすることで、
      // エリアが上下の加工不可帯の間に正しく収まるようにする。
      py: (mm: number) => MARGIN.top + (area.topExcludeMm + area.workableHeightMm - mm) * scale,
    };
  }, [area, wrapWidth]);

  if (!area || !geom) {
    return (
      <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6 text-center text-sm text-amber-800 dark:text-amber-300">
        この面は加工可能エリアの実寸が未確認のため、図は作成できません。
      </div>
    );
  }

  const { scale, drawW, drawH, stageW, stageH, px, py } = geom;
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

          {/* ブロック間の隙間（分割ピースの接合部＝加工不可帯。600E-1200等の複数ブロック構成のみ）。
              area.blockBottomsMm[i]はi番目ブロックの下端(area全体ローカル)、その上端は
              +blocks[i].heightMmで求まる。隙間はその上端からgapsMm[i]ぶん。 */}
          {area.gapsMm.map((gap, i) => {
            const gapBottomMm = area.blockBottomsMm[i] + area.blocks[i].heightMm;
            const gapTopPx = py(gapBottomMm + gap);
            const gapBottomPx = py(gapBottomMm);
            return (
              <Group key={`gap-block-${i}`}>
                <Rect x={areaLeftPx} y={gapTopPx} width={areaWidthPx} height={gapBottomPx - gapTopPx}
                  fill={isDark ? '#1e293b' : '#f1f5f9'} opacity={0.7}
                  stroke={c.line} strokeWidth={0.8} dash={[3, 2]} />
                <Text x={areaLeftPx + 4} y={gapTopPx + 4} text={`接合部(加工不可) ${gap}mm`} fontSize={9} fill={c.sub} />
              </Group>
            );
          })}

          {/* 避けるべき領域（⊗マーク＝内部インサート等） */}
          {area.keepOutZones.map((z, i) => {
            const zx = areaLeftPx + z.xMm * scale;
            const zy = areaBottomPx - z.yMm * scale;
            const zr = Math.max(z.radiusMm * scale, 3);
            return (
              <Group key={i}>
                <Circle x={zx} y={zy} radius={zr} fill={c.keepout} opacity={0.5} stroke="#dc2626" strokeWidth={1.2} dash={[3, 2]} />
                <Line points={[zx - zr * 0.7, zy - zr * 0.7, zx + zr * 0.7, zy + zr * 0.7]} stroke="#dc2626" strokeWidth={1.2} />
                <Line points={[zx - zr * 0.7, zy + zr * 0.7, zx + zr * 0.7, zy - zr * 0.7]} stroke="#dc2626" strokeWidth={1.2} />
                <Text x={zx - 50} y={zy + zr + 4} width={100} align="center" text={z.label} fontSize={8} fill="#dc2626" />
              </Group>
            );
          })}

          {/* 段の区切り線・ラベル。ブロックが複数ある面（600E-1200等）ではブロック番号も表示する。
              各ブロックの一番下の段（bandBottomMmがそのブロックの下端と一致）は区切り線を引かず
              ラベルだけ表示する（下端は既に面の外枠かブロック間隙間の枠で示されているため）。 */}
          {rows.map(r => {
            const blockBottomMm = area.blockBottomsMm[r.block - 1] ?? 0;
            const isBlockBottom = Math.abs(r.bandBottomMm - blockBottomMm) < 1e-6;
            const lineY = areaBottomPx - r.bandBottomMm * scale;
            const col = r.fits ? '#2563eb' : '#dc2626';
            const labelPrefix = area.blocks.length > 1 ? `ブロック${r.block} ` : '';
            return (
              <Group key={`row-${r.block}-${r.row}`}>
                {!isBlockBottom && (
                  <Line points={[areaLeftPx, lineY, areaLeftPx + areaWidthPx, lineY]}
                    stroke={col} strokeWidth={1} dash={[5, 3]} opacity={0.65} />
                )}
                <Text x={areaLeftPx + 4} y={lineY - 13} text={`${labelPrefix}${r.row}段目${r.fits ? '' : '（エラー）'}`}
                  fontSize={9} fontStyle="bold" fill={col} />
              </Group>
            );
          })}

          {/* 配置済みの穴（実線＝穴/ビット径）＋コネクター外径（破線、定義がある銘柄のみ） */}
          {placedHoles.map(h => {
            const cx = areaLeftPx + h.x * scale;
            const cy = areaBottomPx - h.y * scale;
            const r = Math.max((h.diameterMm / 2) * scale, 3);
            const outerDiameterMm = connectorOuterDiameterFor(h.brand, h.fepSize);
            const rOuter = outerDiameterMm != null ? Math.max((outerDiameterMm / 2) * scale, r) : null;
            return (
              <Group key={h.id}>
                {rOuter != null && (
                  <Circle x={cx} y={cy} radius={rOuter} stroke="#0891b2" strokeWidth={1.1} dash={[4, 3]} opacity={0.7} />
                )}
                <Circle x={cx} y={cy} radius={r} fill={c.hole} stroke="#16a34a" strokeWidth={1.6} />
                <Text x={cx - 40} y={cy - (rOuter ?? r) - 24} width={80} align="center" text={`φ${h.diameterMm}`} fontSize={10} fontStyle="bold" fill="#15803d" />
                <Text x={cx - 40} y={cy - (rOuter ?? r) - 12} width={80} align="center" text={h.label} fontSize={8} fill={c.sub} />
                {outerDiameterMm != null && (
                  <Text x={cx - 40} y={cy + (rOuter ?? r) + 2} width={80} align="center" text={`外径φ${outerDiameterMm}`} fontSize={8} fill="#0891b2" />
                )}
              </Group>
            );
          })}
          {/* 段内で隣り合うコネクターどうしの実際のすき間(mm)を数字で表示。
              北関東工業自身の配置例図(drawing_howto.pdf)も、円と円の間に赤字で
              すき間の数値を書き込むスタイルになっている。「見た目が近く見える」という
              指摘（社長）に対して、実測値を直接読めるようにすることで確認できるようにする。
              すき間はコネクター外径（無ければ穴径）の縁から縁まで。 */}
          {rows.flatMap(r => {
            const sorted = [...r.placedHoles].sort((a, b) => a.x - b.x);
            return sorted.slice(0, -1).map((h, i) => {
              const next = sorted[i + 1];
              const hFoot = footprintDiameterFor(h.brand, h.fepSize) ?? h.diameterMm;
              const nextFoot = footprintDiameterFor(next.brand, next.fepSize) ?? next.diameterMm;
              const gapMm = Math.round(((next.x - h.x) - (hFoot / 2 + nextFoot / 2)) * 10) / 10;
              const y = areaBottomPx - h.y * scale;
              const fromPx = areaLeftPx + (h.x + hFoot / 2) * scale;
              const toPx = areaLeftPx + (next.x - nextFoot / 2) * scale;
              // 本来アルゴリズム上10mm(穴のみは30mm)を下回ることは無いはずだが、
              // 目視で確認できるよう万一下回っていた場合は赤で強調する。
              const tight = gapMm < (h.clearanceMm - 1e-6) || gapMm < (next.clearanceMm - 1e-6);
              const col = tight ? '#dc2626' : '#0891b2';
              return (
                <Group key={`gap-${r.row}-${h.id}`}>
                  <Line points={[fromPx, y - 5, fromPx, y + 5]} stroke={col} strokeWidth={1} />
                  <Line points={[toPx, y - 5, toPx, y + 5]} stroke={col} strokeWidth={1} />
                  <Line points={[fromPx, y, toPx, y]} stroke={col} strokeWidth={1.4} />
                  <Text x={(fromPx + toPx) / 2 - 24} y={y - 15} width={48} align="center"
                    text={`${gapMm}`} fontSize={9} fontStyle="bold" fill={col} />
                </Group>
              );
            });
          })}
        </Layer>
      </Stage>
    </div>
  );
}
