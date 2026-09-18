// src/pages/tools/HandholePlanView.tsx
// ハンドホールの平面図（真上から見た模式図）。A/B/C/D面をクリックで選べるようにする。
//
// 2026-09-18、社長ご指摘への対応:
// 「A面・B面・C面・D面ってどこを基準にするかによっても変わってくるんだけど…加工によって
//  変わってしまうので、平面図って結構重要だと思うので、その平面図を見せて、どこの面に
//  つけますかみたいなのをやった方がいいと思うんだよね」
// 「だいたいハンドホールは直線に使う場合が多いので、直線に抜けていくの…A面に使ったらC面、
//  B面に使ったらD面という風に直線上に抜けていくと思うので、そこら辺も考慮して作るといい」
//
// 実際に現場で使われた削孔図16基（オーイケ製、削孔図フォルダ調査 2026-09-18）でも、
// 「A面は16基すべてで削孔ゼロ」「B/D面またはC/D面に集中」という実例が確認できており、
// 面ごとに用途の偏りがあることが裏付けられている。
//
// 対辺（A⇔C、B⇔D）の仮定について: 北関東工業のDXF実物解析（KKE_450_FACE_DXF_ORIGIN）では、
// シート上でA/B面が同じY座標（横に並ぶ）・C/D面が同じY座標（横に並ぶ）・A/C面が同じX座標
// （縦に並ぶ）ことを実測済みだが、これは「図面用紙上の並べ方」であり、実物の箱を4面時計回りに
// A→B→C→Dと呼ぶ一般的な命名規則そのものを直接証明するものではない（北関東工業の資料に
// 「時計回り/反時計回り」の明記は無い）。この模式図は、社長の実務知見（直進の相手はA⇔C・B⇔D）
// をそのまま採用したものであり、将来メーカー資料で矛盾する記載が見つかった場合は要修正。

import { useEffect, useState } from 'react';
import { FACE_OPPOSITE, type HandholeFace } from '../../constants/handholeKitakanto';

interface FaceRegion {
  face: HandholeFace;
  points: string;
  labelX: number;
  labelY: number;
}

const FACE_REGIONS: FaceRegion[] = [
  { face: 'A', points: '4,4 196,4 100,100', labelX: 100, labelY: 30 },
  { face: 'B', points: '196,4 196,196 100,100', labelX: 168, labelY: 100 },
  { face: 'C', points: '196,196 4,196 100,100', labelX: 100, labelY: 170 },
  { face: 'D', points: '4,196 4,4 100,100', labelX: 32, labelY: 100 },
];

export default function HandholePlanView({
  activeFace,
  onSelectFace,
  faceHoleCounts,
}: {
  activeFace: HandholeFace;
  onSelectFace: (face: HandholeFace) => void;
  /** 面ごとの配置済み穴数（バッジ表示用）。省略可。 */
  faceHoleCounts?: Partial<Record<HandholeFace, number>>;
}) {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setIsDark(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const c = isDark
    ? { border: '#475569', axis: '#64748b', activeFill: '#2563eb', oppositeFill: '#1e3a5f', idleFill: '#0f172a', idleHover: '#1e293b', activeText: '#ffffff', idleText: '#cbd5e1' }
    : { border: '#cbd5e1', axis: '#94a3b8', activeFill: '#2563eb', oppositeFill: '#dbeafe', idleFill: '#ffffff', idleHover: '#f1f5f9', activeText: '#ffffff', idleText: '#475569' };

  const opposite = FACE_OPPOSITE[activeFace];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 200 200" className="w-36 h-36 sm:w-44 sm:h-44">
        <rect x={2} y={2} width={196} height={196} rx={6} fill={c.idleFill} stroke={c.border} strokeWidth={2} />
        {/* 直進(A⇔C, B⇔D)の軸を示す破線 */}
        <line x1={100} y1={10} x2={100} y2={190} stroke={c.axis} strokeWidth={1} strokeDasharray="4 3" />
        <line x1={10} y1={100} x2={190} y2={100} stroke={c.axis} strokeWidth={1} strokeDasharray="4 3" />
        {FACE_REGIONS.map(r => {
          const isActive = r.face === activeFace;
          const isOpposite = r.face === opposite;
          const fill = isActive ? c.activeFill : isOpposite ? c.oppositeFill : c.idleFill;
          const count = faceHoleCounts?.[r.face] ?? 0;
          return (
            <g key={r.face} onClick={() => onSelectFace(r.face)} style={{ cursor: 'pointer' }}>
              <polygon points={r.points} fill={fill} stroke={c.border} strokeWidth={1} />
              <text
                x={r.labelX} y={r.labelY}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={13} fontWeight="bold" fill={isActive ? c.activeText : c.idleText}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {r.face}面{count > 0 ? `(${count})` : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-slate-400 text-center max-w-[200px]">
        真上から見た模式図（クリックで面を選択）。配管は直進して反対側から出ることが多いため、
        {activeFace}面を選ぶと対辺の{opposite}面が水色で示されます。
      </p>
    </div>
  );
}
