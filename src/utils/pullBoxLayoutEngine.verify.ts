// src/utils/pullBoxLayoutEngine.verify.ts
//
// プルボックス穴あけ計算の検証。実行:  npx tsx src/utils/pullBoxLayoutEngine.verify.ts
//
// 芯高さは公開されている「支持材別開口寸法表」の実測値と、
// 横の割り付け・二段の高さは計画時に手計算で確かめた値と突き合わせる。
// 数値を触ったら必ずこれを通してから出すこと。
// 根拠: hitec-ai-team/reports/プルボックス穴あけアプリ_計画_2026-09-15/
import { computeLayout, summarizeParts } from './pullBoxLayoutEngine';
import { outerDiameter, clipSpec, knockoutDiameter, connectorThreadDiameter, DUCTER_HEIGHT_MM, type ConduitRef } from '../constants/pullBoxKnockout';

const C = (size: number): ConduitRef => ({ kind: 'C', size });
const G = (size: number): ConduitRef => ({ kind: 'G', size });
const E = (size: number): ConduitRef => ({ kind: 'E', size });
let ng = 0;
const eq = (name: string, got: number, want: number, tol = 0.001) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) ng++;
  console.log(`  ${ok ? 'OK ' : 'NG '} ${name}: got=${got} want=${want}`);
};

console.log('■ 1段目の芯高さ（公開「支持材別開口寸法表」との突き合わせ）');
const expect1: [ConduitRef, 'D1' | 'D2', number][] = [
  [C(19), "D1", 39.5], [C(25), 'D1', 42.5], [C(31), 'D1', 46], [C(39), 'D1', 49],
  [C(51), 'D1', 55.5], [C(75), 'D1', 68],
  [G(16), 'D1', 40.5], [G(22), 'D1', 43], [G(28), 'D1', 46.5], [G(36), 'D1', 51],
  [G(42), 'D1', 54], [G(54), 'D1', 60], [G(70), 'D1', 67.5], [G(104), 'D1', 86.5],
  [C(19), 'D2', 54.5], [C(51), 'D2', 70.5], [G(104), 'D2', 101.5],
];
for (const [pipe, duct, want] of expect1) {
  const r = computeLayout({ boxWidthMm: 600, boxHeightMm: 400, tiers: [{ ducter: duct, pipes: [pipe] }], clearancesMm: [] });
  eq(`${duct}+${pipe.kind}${pipe.size}`, r.tiers[0].holes[0].y, want);
}

console.log('\n■ クリップは管を持ち上げないか（A - 外径 がほぼ一定＝17mm前後）');
for (const p of [C(19), C(51), C(75), G(16), G(104)]) {
  const od = outerDiameter(p)!, clip = clipSpec(p)!;
  console.log(`  ${p.kind}${p.size}: 外径${od} クリップ${clip.model} A=${clip.heightMm} → 出っ張り ${(clip.heightMm - od).toFixed(1)}mm`);
}

console.log('\n■ 横の割り付け（W=400・中央振り分け・1mm丸め）Python検証値と一致するか');
const expectX: [ConduitRef[], number[]][] = [
  [[C(51), C(51)], [159, 240]],
  [[C(51), C(31)], [164, 236]],
  [[C(39), C(39), C(39)], [131, 200, 269]],
  [[C(25), C(31), C(39), C(51)], [100, 159, 224, 299]],
  [[C(63), C(63), C(63)], [106, 200, 294]],
  [[C(19), C(19), C(19), C(19), C(19)], [100, 150, 200, 250, 300]],
];
for (const [pipes, want] of expectX) {
  const r = computeLayout({ boxWidthMm: 400, boxHeightMm: 400, tiers: [{ ducter: 'D1', pipes }], clearancesMm: [] });
  const got = r.tiers[0].holes.map(h => h.x);
  const ok = got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) < 0.001);
  if (!ok) ng++;
  console.log(`  ${ok ? 'OK ' : 'NG '} ${pipes.map(p => p.kind + p.size).join('+')}: got=[${got}] want=[${want}]`);
}

console.log('\n■ あき30mmを割っていないか（警告が出ないこと）');
for (const [pipes] of expectX) {
  const r = computeLayout({ boxWidthMm: 400, boxHeightMm: 400, tiers: [{ ducter: 'D1', pipes }], clearancesMm: [] });
  const w = r.warnings.filter(x => x.message.includes('あき'));
  if (w.length) { ng++; console.log(`  NG  ${pipes.map(p => p.kind + p.size).join('+')}: ${w.map(x => x.message).join(' / ')}`); }
  else console.log(`  OK  ${pipes.map(p => p.kind + p.size).join('+')}`);
}

console.log('\n■ 二段（1段目D1:C51,C39 / 2段目D1:C31,C25）クリアランス別');
for (const cl of [0, 10, 20]) {
  const r = computeLayout({
    boxWidthMm: 400, boxHeightMm: 400,
    tiers: [{ ducter: 'D1', pipes: [C(51), C(39)] }, { ducter: 'D1', pipes: [C(31), C(25)] }],
    clearancesMm: [cl],
  });
  console.log(`  クリアランス${cl}mm:`);
  r.tiers.forEach((t, i) => {
    console.log(`    ${i + 1}段目 ${t.ducter} 下端${t.ducterBottomMm} 天端${t.ducterTopMm} クリップ頂部${t.clipTopMm}`);
    t.holes.forEach(h => console.log(`       ${h.label} X=${h.x} Y=${h.y} φ${h.knockoutMm} ${h.clipModel}`));
  });
}
// 期待値：1段目クリップ頂部 = 30 + max(DC51=67, DC39=55) = 97
//         クリアランス10 → 2段目下端107, 天端137, C31の芯 137+15.9=152.9→153.0
const t2 = computeLayout({
  boxWidthMm: 400, boxHeightMm: 400,
  tiers: [{ ducter: 'D1', pipes: [C(51), C(39)] }, { ducter: 'D1', pipes: [C(31), C(25)] }],
  clearancesMm: [10],
});
eq('1段目クリップ頂部', t2.tiers[0].clipTopMm, 97);
eq('2段目ダクター天端', t2.tiers[1].ducterTopMm, 137);
eq('2段目C31の芯', t2.tiers[1].holes[0].y, 153);

console.log('\n■ 適合ノック穴径（パナソニック公式FAQ a_id/105518 の品番別表と突き合わせ）');
{
  const want: [ConduitRef, number][] = [
    [C(19), 19.6], [C(25), 26.1], [C(31), 32.5], [C(39), 39], [C(51), 52], [C(63), 65], [C(75), 77],
    [G(16), 21.5], [G(22), 27.1], [G(28), 34], [G(36), 43], [G(42), 49],
    [G(54), 61], [G(70), 76], [G(82), 89], [G(92), 102], [G(104), 115],
  ];
  for (const [p, w] of want) eq(`${p.kind}${p.size} ノック穴`, knockoutDiameter(p)!, w);
  // 公式ルール「おねじ外径＋約1〜2mm」を満たしているか
  for (const [p] of want) {
    const k = knockoutDiameter(p)!, t = connectorThreadDiameter(p)!;
    const d = k - t;
    const ok = d > 0 && d <= 2.2;
    if (!ok) ng++;
    console.log(`  ${ok ? 'OK ' : 'NG '} ${p.kind}${p.size}: 穴${k} - おねじ${t} = ${d.toFixed(3)}mm`);
  }
}

console.log('\n■ 図・一覧に出す径と、実際に使う工具の径が一致しているか');
// 2026-09-15 Codexのレビューで見つかったP0の再発防止。
// 工具判定をHITECの実績値に変えたとき、図と一覧はメーカー推奨値のままだった。
// 図面どおりに開けると指定と違う径になるため、現場で実害が出る。
{
  const r = computeLayout({
    boxWidthMm: 800, boxHeightMm: 500,
    tiers: [
      { ducter: 'D1', pipes: [C(19), C(25), C(31), C(39)] },
      { ducter: 'D1', pipes: [G(16), G(22), G(28), G(36)] },
    ],
    clearancesMm: [10],
  });
  r.tiers.forEach(t => t.holes.forEach(h => {
    const expect = h.drilling.sawMm ?? h.knockoutMm;
    const ok = h.actualHoleMm === expect;
    if (!ok) ng++;
    console.log(`  ${ok ? 'OK ' : 'NG '} ${h.label}: 図と一覧に出す径=${h.actualHoleMm} / 工具=${
      h.drilling.tool === 'ホールソー' ? 'ホールソーφ' + h.drilling.sawMm : 'パンチャーφ' + h.knockoutMm}`);
  }));
}

console.log('\n■ 端寄せのとき、指定した「端のあき」がそのまま実際のあきになるか');
// 2026-09-15 社長の指摘で、端の指定を「芯まで」から「管の外面までのあき」に変更した。
// 現場で測れるのは管の外面まで。芯は見えない。
{
  for (const align of ['left', 'right'] as const) {
    for (const gap of [30, 50, 80]) {
      const r = computeLayout({
        boxWidthMm: 400, boxHeightMm: 300,
        tiers: [{ ducter: 'D1', pipes: [E(19), E(25), E(31)] }], clearancesMm: [],
        alignment: align, edgeGapMm: gap,
      });
      const t = r.tiers[0];
      const got = (align === 'left' ? t.leftClearanceMm : t.rightClearanceMm)!;
      const ok = Math.abs(got - gap) < 0.51; // 1mm丸めの範囲に収まっていること
      if (!ok) ng++;
      console.log(`  ${ok ? 'OK ' : 'NG '} ${align} 指定${gap} → 実際 ${got.toFixed(2)}`);
    }
  }
}

console.log('\n■ 拾い出し集計');
console.log(' ', JSON.stringify(summarizeParts(t2)));

console.log(`\n${ng === 0 ? '✅ 全件一致' : `❌ 不一致 ${ng} 件`}`);
if (ng > 0) throw new Error(`プルボックス計算の検証に失敗: 不一致 ${ng} 件`);
