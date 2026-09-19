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
//
// 自由配置・ドラッグ（2026-09-18追加）:
// 「手でドラックで移動できるといいんだけどね。直感操作みたいな。グリッドで動かして、
//  後から寸法をつけるみたいな感じ」という社長ご要望への対応。
// AskUserQuestionで確定した2つの設計方針:
//   1) ドラッグは既存の自動配置結果を並び替えるもの（面・段の枠組み自体は変えない）
//   2) ルール違反（離隔不足・⊗マーク重なり等）はドラッグ自体を止めず、色で知らせるだけ
// onHoleMoveが渡された穴だけdraggableにする。Groupをx=0,y=0固定（controlled）にし、
// ドラッグ中はKonva内部状態だけがずれ、onDragEndで穴のmm座標に変換して親へ通知→
// 親が状態を更新して再描画されると、Groupのx/y propが0に戻り（＝押し戻され）、
// 子要素(cx/cy)側が新しいmm座標を反映するので二重にズレない。
// dragBoundFunc内でgridMm単位に丸めて返すことで、ドラッグ中からグリッドにスナップする
// （プルボックス計算エンジンの丸め方針＝ceilToとは異なり、ここは自由配置なので単純に最も近い
// グリッド線に丸める＝Math.round）。
// violatingHoleIdsは呼び出し側(HandholeKnockoutCalc.tsx)がcheckPlacementViolations()で
// 計算した「現在違反している穴のID」の集合。ドラッグを止める判定には使わず、あくまで
// 縁の色を変えるだけ（方針2）。
//
// グルーピング（複数穴の一体ドラッグ）・高さ整列スナップ（2026-09-18追加）:
// ドラッグ機能を実際に触った社長から「グルーピングしたものは両方一緒に動くっていう前提で、
// 横方向の高さがカチッと揃う時が分かるといいなと思ってて。これでは（選択→均等割付けボタンでは）
// グルーピングの意味がない、ただ単に離隔距離が取れますよっていうだけになっちゃってる」との
// フィードバック。selectedHoleIdsで渡された穴の集合を「グループ」とみなし、そのうちの1つを
// ドラッグすると他の全メンバーも同じ量だけ剛体移動する（相対位置を保ったまま一緒に動く）。
// 実装は、ドラッグ中のリーダーのGroupノードのx/y(px)を、他メンバーのGroupノードにも
// 命令的（node.x()/node.y()）にそのままコピーするだけ＝全員x=0,y=0起点で子要素が絶対座標
// なので、同じオフセットを与えれば同じ量の平行移動になる。ドラッグ終了時にまとめて
// onHoleGroupMoveへ通知し、各メンバーのノードもリーダーと同様に0へ戻す
// （次の再描画でx={0}固定propが効くのでズレは残らない）。
// 高さ整列スナップは、グループの有無に関わらず全ドラッグに効く：ドラッグ中の穴(リーダー)の
// yが、グループ外の他の穴のyとALIGN_SNAP_MM以内に近づいたら、その値へ厳密にスナップし、
// ガイド線（マゼンタの破線）を描いて「揃いました」を視覚的に示す。
//
// 穴の直接クリック選択（2026-09-19追加）:
// グルーピング機能を追加した直後、社長が「選択ができない」と報告。原因を調べたところバグでは
// なく、選択手段が加工図の下にあるチップ一覧のタップしか無く、社長は加工図の穴そのものを
// クリックして選ぼうとしていて機能が存在しなかったことが判明（「配管を選択したくてもできない。
// 一個ずつしか動かせない。チップは関係ない」）。そこで、穴を直接クリック/タップしても
// selectedHoleIdsに追加・削除できるようにonToggleHoleSelectを追加した。Konvaはdraggableな
// 要素でも、ドラッグ判定の閾値を超える移動が無ければclick/tapイベントを発火する仕組みなので、
// 「動かす」ドラッグと「選ぶ」クリックは同じ丸に対して自然に両立する。チップ一覧は選択状態を
// 見比べる一覧としてそのまま残す（同じselectedHoleIds stateを共有）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Group } from 'react-konva';
import type Konva from 'konva';
import { connectorOuterDiameterFor, footprintDiameterFor, type MachinableArea } from '../../constants/handholeKitakanto';
import type { FaceRowResult, PlacedHole } from '../../utils/handholeLayoutEngine';

const MARGIN = { top: 40, right: 24, bottom: 30, left: 60 };
const MAX_DRAW_H = 420;
/** ドラッグ中の穴のyが他の穴のyとこの範囲(mm)以内に近づいたら、高さを揃えてスナップする。 */
const ALIGN_SNAP_MM = 5;

export default function HandholeDrawing({
  area,
  placedHoles,
  rows = [],
  onHoleMove,
  onHoleGroupMove,
  onToggleHoleSelect,
  selectedHoleIds,
  violatingHoleIds,
  gridMm = 5,
}: {
  area: MachinableArea | null;
  placedHoles: PlacedHole[];
  /** 段の区切り線を描くための段ごとの結果（省略時は区切り線を描かない）。 */
  rows?: FaceRowResult[];
  /** 渡すと穴がドラッグ移動できるようになる。単独（グループに属さない）穴のドラッグ終了時に通知する。 */
  onHoleMove?: (holeId: string, xMm: number, yMm: number) => void;
  /** selectedHoleIdsで2件以上まとまっている穴をドラッグした時、グループ全体の移動量(mm)を通知する。 */
  onHoleGroupMove?: (holeIds: string[], dxMm: number, dyMm: number) => void;
  /** 渡すと穴を直接クリック/タップして選択状態をトグルできるようになる（ドラッグとは独立）。 */
  onToggleHoleSelect?: (holeId: string) => void;
  /** 選択中（グループ化対象）の穴ID。1件以上あれば縁を青くする。2件以上ある時、そのうち1つを
      ドラッグすると全員が一緒に動く。 */
  selectedHoleIds?: Set<string>;
  /** checkPlacementViolations()で違反ありと判定された穴のID一覧。渡された穴は縁を赤くする。 */
  violatingHoleIds?: Set<string>;
  /** ドラッグ中の中心位置をこの単位(mm)でスナップする。省略時5mm。 */
  gridMm?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(760);
  const [isDark, setIsDark] = useState(false);
  // ドラッグ中の高さ整列ガイド線のy(px)。揃っていない時はnull。
  const [alignGuideYPx, setAlignGuideYPx] = useState<number | null>(null);
  // 穴ID→Konva Groupノード。グループドラッグでリーダー以外のメンバーを命令的に追従させるために使う。
  const holeNodeRefs = useRef<Map<string, Konva.Group>>(new Map());

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

          {/* 配置済みの穴（実線＝穴/ビット径）＋コネクター外径（破線、定義がある銘柄のみ）
              onHoleMoveが渡された場合はドラッグで移動できる（Groupはx=0,y=0固定＝controlled、
              子要素は現在のh.x/h.yから計算した絶対座標。ファイル冒頭コメント参照）。
              selectedHoleIdsに2件以上入っている穴どうしは「グループ」として一緒にドラッグされる。 */}
          {placedHoles.map(h => {
            const cx = areaLeftPx + h.x * scale;
            const cy = areaBottomPx - h.y * scale;
            const r = Math.max((h.diameterMm / 2) * scale, 3);
            const outerDiameterMm = connectorOuterDiameterFor(h.brand, h.fepSize);
            const rOuter = outerDiameterMm != null ? Math.max((outerDiameterMm / 2) * scale, r) : null;
            const violating = violatingHoleIds?.has(h.id) ?? false;
            // 選択中かどうか（1件でも選ばれていれば見た目に反映＝クリックした瞬間に分かるように）。
            const isMember = selectedHoleIds?.has(h.id) ?? false;
            const strokeColor = violating ? '#dc2626' : isMember ? '#2563eb' : '#16a34a';

            // このグループのメンバー（自分含む）。2件以上選ばれている時だけ「グループドラッグ」の対象になる
            // （1件だけ選んだ状態でドラッグしても、単独ドラッグと同じ挙動でよい）。
            const groupIds = isMember && (selectedHoleIds?.size ?? 0) > 1
              ? placedHoles.filter(x => selectedHoleIds!.has(x.id)).map(x => x.id)
              : [h.id];
            const companionIds = groupIds.filter(id => id !== h.id);
            // 高さ整列スナップの比較対象＝グループの外にある穴（自分たちの高さが動くたびズレるのを避ける）。
            const otherHolesForAlign = placedHoles.filter(o => !groupIds.includes(o.id));
            const findAlignYMm = (candidateYMm: number): number | null => {
              for (const o of otherHolesForAlign) {
                if (Math.abs(o.y - candidateYMm) <= ALIGN_SNAP_MM) return o.y;
              }
              return null;
            };

            const dragBoundFunc = (pos: { x: number; y: number }) => {
              // posはGroupの親(Layer)座標系での提案位置。Groupは常にx=0,y=0起点なので
              // posそのものがドラッグ量(px)にあたる。mmに変換してグリッドへスナップしてから
              // px量に戻す（pyはmmが増えるほど画面yが減る向きなので符号を反転）。
              const dxMm = pos.x / scale;
              const dyMm = -pos.y / scale;
              const rawYMm = h.y + dyMm;
              const snappedXMm = Math.round((h.x + dxMm) / gridMm) * gridMm;
              const alignYMm = findAlignYMm(rawYMm);
              const snappedYMm = alignYMm ?? Math.round(rawYMm / gridMm) * gridMm;
              return {
                x: (snappedXMm - h.x) * scale,
                y: -(snappedYMm - h.y) * scale,
              };
            };

            const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
              const dxPx = e.target.x();
              const dyPx = e.target.y();
              // グループの他メンバーへ、リーダーと同じpxオフセットをそのまま与えると
              // 相対位置を保った剛体移動になる（全員x=0,y=0起点で子要素が絶対座標のため）。
              companionIds.forEach(id => {
                const node = holeNodeRefs.current.get(id);
                if (node) { node.x(dxPx); node.y(dyPx); }
              });
              e.target.getLayer()?.batchDraw();
              const dyMm = -dyPx / scale;
              const alignYMm = findAlignYMm(h.y + dyMm);
              setAlignGuideYPx(alignYMm != null ? areaBottomPx - alignYMm * scale : null);
            };

            const resetNode = (id: string) => {
              const node = id === h.id ? undefined : holeNodeRefs.current.get(id);
              if (node) { node.x(0); node.y(0); }
            };

            const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
              const dxMm = e.target.x() / scale;
              const dyMm = -e.target.y() / scale;
              setAlignGuideYPx(null);
              if (companionIds.length > 0 && onHoleGroupMove) {
                onHoleGroupMove(groupIds, dxMm, dyMm);
              } else {
                onHoleMove?.(h.id, h.x + dxMm, h.y + dyMm);
              }
              // 次の再描画でGroupのx/y propが0に戻るまでの間、見た目がズレないよう
              // ノード自体も明示的に0へ戻しておく（親の状態更新が同フレームで反映されない場合の保険）。
              e.target.x(0);
              e.target.y(0);
              companionIds.forEach(resetNode);
            };

            const handleToggleSelect = onToggleHoleSelect ? () => onToggleHoleSelect(h.id) : undefined;

            return (
              <Group
                key={h.id}
                x={0}
                y={0}
                ref={node => { if (node) holeNodeRefs.current.set(h.id, node); }}
                draggable={!!onHoleMove}
                dragBoundFunc={onHoleMove ? dragBoundFunc : undefined}
                onDragMove={onHoleMove ? handleDragMove : undefined}
                onDragEnd={onHoleMove ? handleDragEnd : undefined}
                onClick={handleToggleSelect}
                onTap={handleToggleSelect}
              >
                {rOuter != null && (
                  <Circle x={cx} y={cy} radius={rOuter} stroke="#0891b2" strokeWidth={1.1} dash={[4, 3]} opacity={0.7} />
                )}
                <Circle x={cx} y={cy} radius={r} fill={c.hole} stroke={strokeColor} strokeWidth={violating || isMember ? 2.2 : 1.6} />
                <Text x={cx - 40} y={cy - (rOuter ?? r) - 24} width={80} align="center" text={`φ${h.diameterMm}`} fontSize={10} fontStyle="bold" fill="#15803d" />
                <Text x={cx - 40} y={cy - (rOuter ?? r) - 12} width={80} align="center" text={h.label} fontSize={8} fill={c.sub} />
                {outerDiameterMm != null && (
                  <Text x={cx - 40} y={cy + (rOuter ?? r) + 2} width={80} align="center" text={`外径φ${outerDiameterMm}`} fontSize={8} fill="#0891b2" />
                )}
                {violating && (
                  <Text x={cx - 40} y={cy + (rOuter ?? r) + (outerDiameterMm != null ? 14 : 2)} width={80} align="center" text="要確認（重なり等）" fontSize={8} fontStyle="bold" fill="#dc2626" />
                )}
              </Group>
            );
          })}
          {/* 高さ整列ガイド線（ドラッグ中、他の穴と高さ(y)がALIGN_SNAP_MM以内に揃った時だけ表示）。 */}
          {alignGuideYPx != null && (
            <Line points={[areaLeftPx, alignGuideYPx, areaLeftPx + areaWidthPx, alignGuideYPx]}
              stroke="#db2777" strokeWidth={1.5} dash={[6, 3]} />
          )}
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

              // 2つの穴の間に⊗マーク等の避けるべき領域があると、この「すき間」は本来の隣接ペアの
              // 間隔ではなく、間の穴が⊗マークと重なって配置できなかった結果の見せかけの空きになる
              // （2026-09-18、実機確認：4本要求→中央2本が⊗マークと重なり除外→残った両端2本の間に
              // 実際の何倍もの隙間ができ、その隙間線・数値が⊗マークの真上に重なって描かれ読みにくい
              // 状態になっていた）。この場合はすき間線・数値を描かず、⊗マークの表示を優先する。
              const zoneBetween = area.keepOutZones.some(z =>
                z.xMm > Math.min(h.x, next.x) && z.xMm < Math.max(h.x, next.x) &&
                Math.abs(z.yMm - h.y) < z.radiusMm + Math.max(hFoot, nextFoot) / 2,
              );
              if (zoneBetween) return null;

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
      {onHoleMove && (
        <p className="text-[11px] text-slate-400 mt-1">
          穴をドラッグすると位置を微調整できます（{gridMm}mm刻みにスナップ）。
          {onToggleHoleSelect && '穴をクリック（タップ）すると縁が青くなり選択できます。'}
          2つ以上選んだ状態でそのうちの1つをドラッグすると、選んだ穴が全部一緒に動きます。他の穴と高さ(y)が揃うと
          マゼンタのガイド線が出てピタッと吸着します。離隔不足や⊗マークと重なる位置に置くと、その穴の縁が赤くなります
          （移動自体は止めません。発注前に位置を直してください）。
        </p>
      )}
    </div>
  );
}
