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
  KKE_OUTER_SPEC, CONNECTOR_OUTER_DIAMETER_MM, connectorOuterDiameterFor, footprintDiameterFor,
  type ConnectorBrand, type FepSize, type HandholeFace,
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

console.log('\n■ コネクター外径テーブル（銘柄×FEP呼び径）が実物資料(connector_list.pdf)の表と一致するか');
{
  const want: [ConnectorBrand, FepSize, number | null][] = [
    ['nandemo', 30, 65], ['nandemo', 100, 150], ['nandemo', 150, 220], ['nandemo', 200, null],
    ['kkfit', 30, 74], ['kkfit', 100, 182], ['kkfit', 150, 240], ['kkfit', 200, null], // FEP100=182は専用技術資料で確定済み
    ['kmm_eflex', 50, 100], ['kmm_eflex', 125, 218],
    ['kmm_tac', 50, 100], ['kmm_tac', 125, 218],
    ['pljoint_s', 80, 138], ['pljoint_s', 150, 241],
    ['kmf', 65, 129], ['kmf', 150, 246],
    // holeonlyはコネクター本体が存在しないため全FEP呼び径でnull。
    ['holeonly', 30, null], ['holeonly', 100, null], ['holeonly', 200, null],
  ];
  for (const [brand, fep, want1] of want) {
    eq(`外径 ${brand} FEP${fep}`, connectorOuterDiameterFor(brand, fep), want1);
  }
  const brands = Object.keys(CONNECTOR_OUTER_DIAMETER_MM) as ConnectorBrand[];
  ok_('外径テーブルの銘柄数は7', brands.length === 7, `${brands.length}`);
}

console.log('\n■ 実効直径(footprintDiameterFor)：外径があればそれ、無ければ穴径にフォールバック');
{
  // 外径が定義されている銘柄は外径を使う。
  eq('nandemo FEP100の実効直径＝外径150', footprintDiameterFor('nandemo', 100), 150);
  eq('kkfit FEP30の実効直径＝外径74', footprintDiameterFor('kkfit', 30), 74);
  // holeonly（外径の概念が無い）は穴径にフォールバックする。
  eq('holeonly FEP100の実効直径＝穴径135にフォールバック', footprintDiameterFor('holeonly', 100), holeDiameterFor('holeonly', 100));
  eq('holeonly FEP100の実効直径の実値', footprintDiameterFor('holeonly', 100), 135);
  // カタログに無い組み合わせは穴径同様nullになる。
  eq('kkfit FEP200の実効直径はnull（穴径も無い）', footprintDiameterFor('kkfit', 200), null);
}

console.log('\n■ 実物資料の検算：なんでも継手FEP100×FEP65は中心間距離140mmになる（コネクター外径基準の直接証拠）');
{
  // drawing_howto.pdfの配置例図：FEP100(コネクター外径φ150)とFEP65(コネクター外径φ110)を
  // 隣接配置した箇所に、赤字で離隔「10」・中心間距離「140」の寸法線がある。
  // 150/2 + 110/2 + 10 = 75 + 55 + 10 = 140 と完全一致する。
  // 穴径(ビット径:FEP100=120,FEP65=90)基準なら 120/2+90/2+10=105mmになってしまい、
  // これは実物と食い違う＝旧実装（穴径基準）の設計上の欠陥そのもの。
  eq('なんでも継手FEP100の外径', connectorOuterDiameterFor('nandemo', 100), 150);
  eq('なんでも継手FEP65の外径', connectorOuterDiameterFor('nandemo', 65), 110);
  const runs: ConduitRun[] = [
    { face: 'A', row: 1, brand: 'nandemo', fepSize: 100, count: 1 },
    { face: 'A', row: 1, brand: 'nandemo', fepSize: 65, count: 1 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceA = r.faces.find(f => f.face === 'A')!;
  const row1 = faceA.rows.find(x => x.row === 1)!;
  ok_('2個とも配置できる', row1.placedHoles.length === 2, `${row1.placedHoles.length}`);
  const big = row1.placedHoles.find(h => h.fepSize === 100)!;
  const small = row1.placedHoles.find(h => h.fepSize === 65)!;
  const centerDist = big && small ? Math.abs(big.x - small.x) : NaN;
  eq('中心間距離が実物資料の140mmと一致（コネクター外径基準）', centerDist, 140);
  ok_('穴径ベースだった旧実装の誤った105mmにはならない', centerDist !== 105, `${centerDist}`);
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

/**
 * 配置結果の不変条件を検査：エリア内に収まっているか、離隔を守っているか。
 * 2026-09-16: 離隔・境界判定はコネクター外径基準の実効直径(footprintDiameterMm)で
 * 行われるようになったため、この検証も穴径(diameterMm)ではなくfootprintDiameterMmで見る。
 */
function checkInvariants(
  label: string,
  placed: { x: number; y: number; footprintDiameterMm: number; clearanceMm: number }[],
  areaW: number,
  areaH: number,
) {
  let allInBounds = true;
  for (const h of placed) {
    const r = h.footprintDiameterMm / 2;
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
      const edgeGap = dist - a.footprintDiameterMm / 2 - b.footprintDiameterMm / 2;
      const required = Math.max(a.clearanceMm, b.clearanceMm);
      if (edgeGap < required - 1e-6) {
        allClear = false;
        console.log(`    離隔不足: edgeGap=${edgeGap.toFixed(2)} required=${required}`);
      }
    }
  }
  ok_(`${label}: 全穴ペアが離隔を満たす`, allClear);
}

console.log('\n■ 450サイズ：1つの面・1つの段の中で、左から順に自動配置され、離隔・エリア内を満たす（コネクター外径基準）');
{
  // 2026-09-16: 離隔・ピッチがコネクター外径(footprintDiameterMm)基準になったことで、
  // 旧テスト(kkfit FEP30×3 + nandemo FEP50×2 = 穴径ベースなら317.5mmで収まっていた)は
  // 外径ベースだと必要幅が457mmになり350mmの横幅に収まらなくなった
  // （これはツールが正しく「実際より狭く配置できてしまう」バグを直したことの裏返し）。
  // この段は「複数銘柄が混在しても収まる範囲で正しく配置される」ことを検証する目的のため、
  // 外径ベースでも収まる本数(kkfit FEP30×2 + nandemo FEP50×1)に調整した。
  // 手計算: 外径 nandemo50=95, kkfit30=74。降順ソートで nandemo50,kkfit30,kkfit30。
  //   center1=ceil(95/2,5)=50 / pitch12=ceil((95+74)/2+10,5)=95→center2=145 /
  //   pitch23=ceil((74+74)/2+10,5)=85→center3=230 / rightEdge3=230+37=267<=350。
  const runs: ConduitRun[] = [
    { face: 'B', row: 1, brand: 'kkfit', fepSize: 30, count: 2 },
    { face: 'B', row: 1, brand: 'nandemo', fepSize: 50, count: 1 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceB = r.faces.find(f => f.face === 'B')!;
  ok_('B面areaが取れる', faceB.area != null);
  ok_('B面の段は1つだけ', faceB.rows.length === 1, `${faceB.rows.length}`);
  ok_('1段目に3個配置できる', faceB.rows[0]?.placedHoles.length === 3, `${faceB.rows[0]?.placedHoles.length}`);
  ok_('1段目は面の中で一番下(bandBottomMm=0)', faceB.rows[0]?.bandBottomMm === 0);
  if (faceB.area) checkInvariants('B面1段目', faceB.rows[0].placedHoles, faceB.area.workableWidthMm, faceB.area.workableHeightMm);
  const errorWarn = r.warnings.some(w => w.level === 'error');
  ok_('エラー警告は出ない', !errorWarn);

  // 同じ本数を穴径ベース(旧実装)のまま計算していたら収まっていたはず、という比較用の確認。
  // ＝新実装ではnandemo FEP50×2+kkfit FEP30×3(旧テストの本数)は収まらなくなることを明示する。
  const overflowRuns: ConduitRun[] = [
    { face: 'C', row: 1, brand: 'kkfit', fepSize: 30, count: 3 },
    { face: 'C', row: 1, brand: 'nandemo', fepSize: 50, count: 2 },
  ];
  const r2 = computeHandholeLayout({ width: 450, runs: overflowRuns });
  const faceC = r2.faces.find(f => f.face === 'C')!;
  const rowC = faceC.rows.find(x => x.row === 1)!;
  ok_('旧テストの本数(5個)は外径基準では横幅超過でfits=false', rowC.fits === false, `usedWidthMm=${rowC.usedWidthMm}`);
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
  // kmf FEP150（穴径180・コネクター外径246）を1段に2個。
  // 外径基準のピッチ＝ceil((246+246)/2+10,5)=260。1個目center=125、2個目center=385、
  // 2個目の右端=385+123=508mmが350mmを超える（穴径基準なら190ピッチで317.5mmに収まっていた）。
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
  // kmf FEP150（コネクター外径246）を1個ずつ4段。外径基準では1段あたりbandTopが
  // 248mmずつ積み上がり(centerOffset125+外径半径123)、1段目248mm・2段目508mmまでは
  // 600mm以内だが、3段目で768mmとなり600mmを超える。
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

console.log('\n■ 450サイズ：A面の⊗マーク（内部インサート、ローカル175,274・半径22.5）と重なる穴だけ配置されないこと（コネクター外径基準）');
{
  // 2026-09-16: 干渉判定がコネクター外径(footprintDiameterMm)基準になったことで、
  // 旧テスト(kkfit FEP30を5段積んで265に到達させる)は外径ベースだと積み上がり方が変わり
  // ⊗マークに届かなくなったため、外径基準で改めて手計算した組み合わせに更新した。
  //
  // 1段目: kmf FEP150(コネクター外径246)を1個。
  //   centerYOffset=ceil(246/2,5)=125, bandTop=125+123=248, 次段base=ceil(248+10,5)=260。
  // 2段目: kkfit FEP30(コネクター外径74)を4個。
  //   centerYOffset=ceil(74/2,5)=40, absCenterY=260+40=300。
  //   x位置(降順ピッチ85で並ぶ): 40, 125, 210, 295。
  //   ⊗マーク(175,274,半径22.5)との距離: x=40→137.5, x=125→56.4, x=210→43.6, x=295→122.8。
  //   半径37+22.5=59.5との比較で、x=125とx=210の2個だけが重なる（手計算で検算済み）。
  const runs: ConduitRun[] = [
    { face: 'A', row: 1, brand: 'kmf', fepSize: 150, count: 1 },
    { face: 'A', row: 2, brand: 'kkfit', fepSize: 30, count: 4 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceA = r.faces.find(f => f.face === 'A')!;
  const row2 = faceA.rows.find(x => x.row === 2)!;
  ok_('2段目は横幅・高さは問題ない(fits=true)', row2.fits === true, `bandTopMm=${row2.bandTopMm}`);
  ok_('2段目は4個要求', row2.requiredHoles.length === 4);
  ok_('2段目は4個中2個だけ⊗マークと重なり配置されない', row2.placedHoles.length === 2,
    `placed=${row2.placedHoles.length} x=${row2.placedHoles.map(h => h.x).join(',')}`);
  ok_('配置できたのはx=40とx=295の2個（x=125,210は⊗マークと重なり除外）',
    row2.placedHoles.every(h => h.x === 40 || h.x === 295),
    `x=${row2.placedHoles.map(h => h.x).join(',')}`);
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
