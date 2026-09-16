// src/utils/handholeLayoutEngine.verify.ts
//
// ハンドホール穴あけ計算の検証。実行:  npx tsx src/utils/handholeLayoutEngine.verify.ts
//
// 2026-09-16 面・段ベースのAPI（社長ご指摘「FEP100なら何段詰まるかを見せて、上段/中段/下段の
// どこに置くかを選べるようにしたい」）に合わせて全面的に書き換え。
// プルボックスと違い「支持材別開口寸法表」のような外部の正解値表は無いため、
// テーブル値の引き当てと、配置アルゴリズムが守るべき不変条件（離隔・エリア内・
// エリア外はエラー・⊗マーク回避）をプログラムで検証する。
// 根拠: hitec-ai-team（社長指示 2026-09-15/09-16、北関東工業カタログ・加工図面）
import { computeHandholeLayout, summarizeOrder, type ConduitRun } from './handholeLayoutEngine';
import {
  HOLE_DIAMETER_MM, holeDiameterFor, minClearanceFor, machinableAreasFor,
  HANDHOLE_FACE_ORDER, KKE_450_FACE_DXF_ORIGIN,
  KKE_OUTER_SPEC, type ConnectorBrand, type FepSize, type HandholeFace,
} from '../constants/handholeKitakanto';

let ng = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) ng++;
  console.log(`  ${ok ? 'OK ' : 'NG '} ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};
const ok_ = (name: string, cond: boolean, detail = '') => {
  if (!cond) ng++;
  console.log(`  ${cond ? 'OK ' : 'NG '} ${name}${detail ? ' — ' + detail : ''}`);
};

console.log('■ 穴径テーブル（銘柄×FEP呼び径）が問題文の表と一致するか');
{
  const want: [ConnectorBrand, FepSize, number | null][] = [
    ['nandemo', 30, 46], ['nandemo', 150, 180], ['nandemo', 200, null],
    ['kkfit', 30, 45], ['kkfit', 150, 196], ['kkfit', 200, null],
    ['kmm_eflex', 50, 75], ['kmm_eflex', 125, 180],
    ['kmm_tac', 50, 75], ['kmm_tac', 125, 180],
    ['pljoint_s', 80, 105], ['pljoint_s', 150, 205],
    ['kmf', 65, 100], ['kmf', 125, 180],
    ['holeonly', 30, 45], ['holeonly', 100, 135], ['holeonly', 200, 265],
  ];
  for (const [brand, fep, want1] of want) {
    eq(`${brand} FEP${fep}`, holeDiameterFor(brand, fep), want1);
  }
  // 表の総数チェック（7銘柄×9呼び径）
  const brands = Object.keys(HOLE_DIAMETER_MM) as ConnectorBrand[];
  ok_('銘柄数は7', brands.length === 7, `${brands.length}`);
}

console.log('\n■ 離隔ルール（穴のみ=30mm以上、それ以外=10mm以上）');
{
  eq("nandemoの離隔", minClearanceFor('nandemo'), 10);
  eq("holeonlyの離隔", minClearanceFor('holeonly'), 30);
}

console.log('\n■ KK-E型 外形寸法表（型式・サイズ）');
{
  eq('450の外形', KKE_OUTER_SPEC[450].outerMm, 600);
  eq('450の壁厚', KKE_OUTER_SPEC[450].wallThicknessMm, 75);
  eq('2000の外形', KKE_OUTER_SPEC[2000].outerMm, 2240);
  eq('2000の壁厚', KKE_OUTER_SPEC[2000].wallThicknessMm, 120);
}

console.log('\n■ 加工可能エリア：450はA/B/C/D全4面に値がある／それ以外は未確認(null)');
{
  const areas450 = machinableAreasFor(450);
  for (const face of HANDHOLE_FACE_ORDER) {
    const a = areas450[face];
    ok_(`450 ${face}面の加工可能エリアが取れる`, a != null);
    if (a) {
      eq(`450 ${face}面 全幅`, a.totalWidthMm, 530);
      eq(`450 ${face}面 加工可能幅`, a.workableWidthMm, 350);
      eq(`450 ${face}面 全高(寸法チェーン)`, a.totalHeightMm, 920);
      eq(`450 ${face}面 上端除外`, a.topExcludeMm, 220);
      eq(`450 ${face}面 下端除外`, a.bottomExcludeMm, 100);
      eq(`450 ${face}面 加工可能高さ(DXF実測)`, a.workableHeightMm, 600);
    }
  }
  // ⊗マーク(keepOutZone)はA面・C面のみに存在し、B面・D面には無いこと(DXF実測)。
  ok_('450 A面に⊗マークのkeepOutZoneがある', (areas450.A?.keepOutZones.length ?? 0) === 1);
  ok_('450 C面に⊗マークのkeepOutZoneがある', (areas450.C?.keepOutZones.length ?? 0) === 1);
  ok_('450 B面に⊗マークは無い', (areas450.B?.keepOutZones.length ?? 0) === 0);
  ok_('450 D面に⊗マークは無い', (areas450.D?.keepOutZones.length ?? 0) === 0);

  // 面ごとのDXF座標変換オフセットが4面とも異なる(=同じ場所を指していない)こと。
  const origins = HANDHOLE_FACE_ORDER.map(f => KKE_450_FACE_DXF_ORIGIN[f]);
  const originKeys = new Set(origins.map(o => `${o.dxfOriginX},${o.dxfOriginY}`));
  ok_('450 4面のDXF原点はすべて異なる', originKeys.size === 4, `${[...originKeys].join(' / ')}`);

  for (const w of [600, 800, 900, 1000, 1200, 1500, 1800, 2000] as const) {
    const areas = machinableAreasFor(w);
    ok_(`${w}サイズは4面とも加工可能エリア未確認(null)`, HANDHOLE_FACE_ORDER.every(f => areas[f] === null));
  }
}

console.log('\n■ 450サイズ以外は自動配置せず「未確認」警告になること（面・段を指定していても）');
{
  const runs: ConduitRun[] = [{ face: 'A', row: 1, brand: 'kkfit', fepSize: 50, count: 2 }];
  for (const w of [600, 900, 1800] as const) {
    const r = computeHandholeLayout({ width: w, runs });
    ok_(`${w}: 4面ともareaはnull`, r.faces.every(f => f.area === null));
    ok_(`${w}: 配置0件`, r.placedHoles.length === 0);
    ok_(`${w}: 未配置に全穴が入る`, r.unplacedHoles.length === r.requiredHoles.length && r.requiredHoles.length === 2);
    const hasWarn = r.warnings.some(w2 => w2.level === 'warn' && w2.message.includes('未確認'));
    ok_(`${w}: 未確認の警告が出る`, hasWarn);
  }
}

/** 配置結果の不変条件を検査：エリア内に収まっているか、離隔を守っているか。 */
function checkInvariants(
  label: string,
  placed: { x: number; y: number; diameterMm: number; clearanceMm: number }[],
  areaW: number,
  areaH: number,
) {
  let allInBounds = true;
  for (const h of placed) {
    const r = h.diameterMm / 2;
    if (h.x - r < -1e-6 || h.x + r > areaW + 1e-6 || h.y - r < -1e-6 || h.y + r > areaH + 1e-6) {
      allInBounds = false;
      console.log(`    はみ出し: x=${h.x} y=${h.y} r=${r} area=${areaW}x${areaH}`);
    }
  }
  ok_(`${label}: 全穴がエリア内`, allInBounds);

  let allClear = true;
  for (let i = 0; i < placed.length; i++) {
    for (let k = i + 1; k < placed.length; k++) {
      const a = placed[i], b = placed[k];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const edgeGap = dist - a.diameterMm / 2 - b.diameterMm / 2;
      const required = Math.max(a.clearanceMm, b.clearanceMm);
      if (edgeGap < required - 1e-6) {
        allClear = false;
        console.log(`    離隔不足: edgeGap=${edgeGap.toFixed(2)} required=${required}`);
      }
    }
  }
  ok_(`${label}: 全穴ペアが離隔を満たす`, allClear);
}

console.log('\n■ 450サイズ：1つの面・1つの段の中で、左から順に自動配置され、離隔・エリア内を満たす');
{
  const runs: ConduitRun[] = [
    { face: 'B', row: 1, brand: 'kkfit', fepSize: 30, count: 3 },
    { face: 'B', row: 1, brand: 'nandemo', fepSize: 50, count: 2 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceB = r.faces.find(f => f.face === 'B')!;
  ok_('B面areaが取れる', faceB.area != null);
  ok_('B面の段は1つだけ', faceB.rows.length === 1, `${faceB.rows.length}`);
  ok_('1段目に5個配置できる', faceB.rows[0]?.placedHoles.length === 5, `${faceB.rows[0]?.placedHoles.length}`);
  ok_('1段目は面の中で一番下(bandBottomMm=0)', faceB.rows[0]?.bandBottomMm === 0);
  if (faceB.area) checkInvariants('B面1段目', faceB.rows[0].placedHoles, faceB.area.workableWidthMm, faceB.area.workableHeightMm);
  const errorWarn = r.warnings.some(w => w.level === 'error');
  ok_('エラー警告は出ない', !errorWarn);
}

console.log('\n■ 450サイズ：段は面の中で1段目(下)→2段目(上)の順に積み上がる');
{
  const runs: ConduitRun[] = [
    { face: 'A', row: 1, brand: 'kmf', fepSize: 65, count: 1 }, // 径100
    { face: 'A', row: 2, brand: 'kmf', fepSize: 65, count: 1 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceA = r.faces.find(f => f.face === 'A')!;
  ok_('段は2つ', faceA.rows.length === 2, `${faceA.rows.length}`);
  const row1 = faceA.rows.find(x => x.row === 1)!;
  const row2 = faceA.rows.find(x => x.row === 2)!;
  ok_('1段目が2段目より下(bandBottomMm)', row1.bandBottomMm < row2.bandBottomMm, `${row1.bandBottomMm} / ${row2.bandBottomMm}`);
  ok_('2段目の下端は1段目の上端+離隔以上', row2.bandBottomMm >= row1.bandTopMm, `${row2.bandBottomMm} / ${row1.bandTopMm}`);
  ok_('1段目の穴のyが2段目の穴のyより小さい', (row1.placedHoles[0]?.y ?? 0) < (row2.placedHoles[0]?.y ?? 0));
}

console.log('\n■ 450サイズ：段の配管が面の横幅(350mm)を超えるとエラーになり、その段は配置されないこと');
{
  // φ180(kmf FEP150)を1段に2個。ピッチ190のため2個目の右端が350mmを超える。
  const runs: ConduitRun[] = [{ face: 'D', row: 1, brand: 'kmf', fepSize: 150, count: 2 }];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceD = r.faces.find(f => f.face === 'D')!;
  const row1 = faceD.rows.find(x => x.row === 1)!;
  ok_('横幅超過でfits=false', row1.fits === false);
  ok_('この段は1個も配置されない', row1.placedHoles.length === 0, `${row1.placedHoles.length}`);
  ok_('未配置に2個とも入る', r.unplacedHoles.length === 2, `${r.unplacedHoles.length}`);
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('D面') && w.message.includes('横幅'));
  ok_('D面1段目の横幅超過エラーが出る', hasError, r.warnings.map(w => w.message).join(' | '));
}

console.log('\n■ 450サイズ：段を積み上げすぎて面の高さ(600mm)を超えるとエラーになること');
{
  // φ180(kmf FEP150)を1個ずつ4段。3段目までは600mm以内、4段目で超える想定。
  const runs: ConduitRun[] = [1, 2, 3, 4].map(row => ({ face: 'B', row, brand: 'kmf', fepSize: 150, count: 1 } as ConduitRun));
  const r = computeHandholeLayout({ width: 450, runs });
  const faceB = r.faces.find(f => f.face === 'B')!;
  ok_('段は4つ', faceB.rows.length === 4, `${faceB.rows.length}`);
  const badRows = faceB.rows.filter(x => !x.fits);
  ok_('高さ超過の段が少なくとも1つある', badRows.length > 0, `fits=${faceB.rows.map(x => x.fits).join(',')} bandTop=${faceB.rows.map(x => x.bandTopMm).join(',')}`);
  ok_('高さ超過より下の段はfitsのまま配置できている', faceB.rows[0].fits && faceB.rows[0].placedHoles.length === 1);
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('B面') && w.message.includes('高さ'));
  ok_('B面の高さ超過エラーが出る', hasError, r.warnings.map(w => w.message).join(' | '));
}

console.log('\n■ 450サイズ：A面の⊗マーク（内部インサート、ローカル175,274・半径22.5）と重なる穴だけ配置されないこと');
{
  // kkfit FEP30(径45・離隔10)を5段(1〜4段目は1個ずつ・5段目は4個)積むと、
  // 5段目の中心Yが約265になり、⊗マークの位置(175,274)近辺と一部の穴が重なる。
  const runs: ConduitRun[] = [
    { face: 'A', row: 1, brand: 'kkfit', fepSize: 30, count: 1 },
    { face: 'A', row: 2, brand: 'kkfit', fepSize: 30, count: 1 },
    { face: 'A', row: 3, brand: 'kkfit', fepSize: 30, count: 1 },
    { face: 'A', row: 4, brand: 'kkfit', fepSize: 30, count: 1 },
    { face: 'A', row: 5, brand: 'kkfit', fepSize: 30, count: 4 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceA = r.faces.find(f => f.face === 'A')!;
  const row5 = faceA.rows.find(x => x.row === 5)!;
  ok_('5段目は横幅・高さは問題ない(fits=true)', row5.fits === true, `bandTopMm=${row5.bandTopMm}`);
  ok_('5段目は4個要求', row5.requiredHoles.length === 4);
  ok_('5段目は一部が⊗マークと重なり配置されない', row5.placedHoles.length > 0 && row5.placedHoles.length < 4,
    `placed=${row5.placedHoles.length}`);
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('A面') && w.message.includes('⊗マーク'));
  ok_('A面の⊗マーク重複エラーが出る', hasError, r.warnings.map(w => w.message).join(' | '));
  ok_('未配置がある', r.unplacedHoles.length > 0, `${r.unplacedHoles.length}`);
  if (faceA.area) checkInvariants('A面全体(配置できた分)', faceA.placedHoles, faceA.area.workableWidthMm, faceA.area.workableHeightMm);
}

console.log('\n■ 5mm/10mmグリッドに丸められているか（x・yとも）');
{
  const runs: ConduitRun[] = [
    { face: 'C', row: 1, brand: 'kkfit', fepSize: 65, count: 2 },
    { face: 'C', row: 1, brand: 'nandemo', fepSize: 80, count: 2 },
  ];
  for (const grid of [5, 10] as const) {
    const r = computeHandholeLayout({ width: 450, runs, gridMm: grid });
    const allSnapped = r.placedHoles.every(h => Math.abs(h.x % grid) < 1e-6 && Math.abs(h.y % grid) < 1e-6);
    ok_(`grid=${grid}mmで中心座標が丸められている`, allSnapped);
  }
}

console.log('\n■ カタログに無い銘柄×呼び径の組み合わせはエラーになること（FEP200×コネクター銘柄は全滅のはず）');
{
  const runs: ConduitRun[] = [{ face: 'A', row: 1, brand: 'kkfit', fepSize: 200, count: 1 }];
  const r = computeHandholeLayout({ width: 450, runs });
  ok_('要求穴0件（データ欠落でスキップ）', r.requiredHoles.length === 0);
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('穴径データがありません'));
  ok_('データ欠落エラーが出る', hasError);
}

console.log('\n■ 発注仕様の集計（summarizeOrder）：面・段が違っても銘柄×呼び径が同じなら合算される');
{
  const runs: ConduitRun[] = [
    { face: 'A', row: 1, brand: 'kkfit', fepSize: 30, count: 3 },
    { face: 'B', row: 2, brand: 'kkfit', fepSize: 30, count: 2 }, // 面・段が違っても合算されること
    { face: 'C', row: 1, brand: 'nandemo', fepSize: 50, count: 1 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const lines = summarizeOrder(r);
  const kkfit30 = lines.find(l => l.brand === 'kkfit' && l.fepSize === 30);
  ok_('kkfit FEP30が5本に合算される', kkfit30?.count === 5, `${kkfit30?.count}`);
  const nandemo50 = lines.find(l => l.brand === 'nandemo' && l.fepSize === 50);
  ok_('nandemo FEP50が1本', nandemo50?.count === 1);
}

console.log(`\n${ng === 0 ? '✅ 全件一致' : `❌ 不一致 ${ng} 件`}`);
if (ng > 0) throw new Error(`ハンドホール穴あけ計算の検証に失敗: 不一致 ${ng} 件`);
