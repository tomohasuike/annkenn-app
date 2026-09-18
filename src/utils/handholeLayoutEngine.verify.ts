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
import { computeHandholeLayout, summarizeOrder, suggestConduitRuns, type ConduitRun } from './handholeLayoutEngine';
import {
  HOLE_DIAMETER_MM, holeDiameterFor, minClearanceFor, machinableAreasFor,
  HANDHOLE_FACE_ORDER, KKE_450_FACE_DXF_ORIGIN,
  KKE_OUTER_SPEC, CONNECTOR_OUTER_DIAMETER_MM, connectorOuterDiameterFor, footprintDiameterFor,
  likelyNeedsTightenToolFor,
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

  // 600・900は複数バリエーションを実装済みなので未確認リストから除外。
  for (const w of [800, 1000, 1200, 1500, 1800, 2000] as const) {
    const areas = machinableAreasFor(w);
    ok_(`${w}サイズは4面とも加工可能エリア未確認(null)`, HANDHOLE_FACE_ORDER.every(f => areas[f] === null));
  }
  // 600サイズでも、実装していない高さバリエーション（コード不一致）を渡すと未確認扱いになること。
  const areas600Unknown = machinableAreasFor(600, '600E-9999');
  ok_('600サイズでも未知のheightVariantCodeを渡すと4面ともnull', HANDHOLE_FACE_ORDER.every(f => areas600Unknown[f] === null));
}

console.log('\n■ 450サイズ以外（未確認サイズ）は自動配置せず「未確認」警告になること（面・段を指定していても）');
{
  const runs: ConduitRun[] = [{ face: 'A', row: 1, brand: 'kkfit', fepSize: 50, count: 2 }];
  for (const w of [1000, 1800] as const) {
    const r = computeHandholeLayout({ width: w, runs });
    ok_(`${w}: 4面ともareaはnull`, r.faces.every(f => f.area === null));
    ok_(`${w}: 配置0件`, r.placedHoles.length === 0);
    ok_(`${w}: 未配置に全穴が入る`, r.unplacedHoles.length === r.requiredHoles.length && r.requiredHoles.length === 2);
    const hasWarn = r.warnings.some(w2 => w2.level === 'warn' && w2.message.includes('未確認'));
    ok_(`${w}: 未確認の警告が出る`, hasWarn);
  }
}

console.log('\n■ 600サイズ：600E-600（既定、単一ブロック）の加工可能エリア実測値');
{
  const areas = machinableAreasFor(600); // heightVariantCode省略＝既定の600E-600
  for (const face of HANDHOLE_FACE_ORDER) {
    const a = areas[face];
    ok_(`600E-600 ${face}面の加工可能エリアが取れる`, a != null);
    if (!a) continue;
    eq(`600E-600 ${face}面 全幅`, a.totalWidthMm, 680);
    eq(`600E-600 ${face}面 加工可能幅`, a.workableWidthMm, 450);
    eq(`600E-600 ${face}面 全高`, a.totalHeightMm, 840);
    eq(`600E-600 ${face}面 上端除外`, a.topExcludeMm, 395);
    eq(`600E-600 ${face}面 下端除外`, a.bottomExcludeMm, 125);
    eq(`600E-600 ${face}面 ブロック数`, a.blocks.length, 1);
    eq(`600E-600 ${face}面 加工可能高さ`, a.workableHeightMm, 320);
    ok_(`600E-600 ${face}面 自己整合(上端+ブロック+下端=全高)`, a.topExcludeMm + a.workableHeightMm + a.bottomExcludeMm === a.totalHeightMm);
  }
  ok_('600E-600 A面に⊗マークがある', (areas.A?.keepOutZones.length ?? 0) === 1);
  ok_('600E-600 C面に⊗マークがある', (areas.C?.keepOutZones.length ?? 0) === 1);
  ok_('600E-600 B面に⊗マークは無い', (areas.B?.keepOutZones.length ?? 0) === 0);
  ok_('600E-600 D面に⊗マークは無い', (areas.D?.keepOutZones.length ?? 0) === 0);
}

console.log('\n■ 600サイズ：600E-1200（上下2ブロック）の加工可能エリア実測値・ブロック間ギャップ');
{
  const areas = machinableAreasFor(600, '600E-1200');
  for (const face of HANDHOLE_FACE_ORDER) {
    const a = areas[face];
    ok_(`600E-1200 ${face}面の加工可能エリアが取れる`, a != null);
    if (!a) continue;
    eq(`600E-1200 ${face}面 全高`, a.totalHeightMm, 1440);
    eq(`600E-1200 ${face}面 上端除外`, a.topExcludeMm, 320);
    eq(`600E-1200 ${face}面 下端除外`, a.bottomExcludeMm, 125);
    eq(`600E-1200 ${face}面 ブロック数`, a.blocks.length, 2);
    eq(`600E-1200 ${face}面 下ブロック(index0)高さ`, a.blocks[0]?.heightMm, 620);
    eq(`600E-1200 ${face}面 上ブロック(index1)高さ`, a.blocks[1]?.heightMm, 225);
    eq(`600E-1200 ${face}面 ブロック間ギャップ`, a.gapsMm[0], 150);
    eq(`600E-1200 ${face}面 加工可能高さ(=620+150+225)`, a.workableHeightMm, 995);
    ok_(`600E-1200 ${face}面 自己整合(上端+可動域+下端=全高)`, a.topExcludeMm + a.workableHeightMm + a.bottomExcludeMm === a.totalHeightMm);
    eq(`600E-1200 ${face}面 下ブロックの下端(blockBottomsMm[0])`, a.blockBottomsMm[0], 0);
    eq(`600E-1200 ${face}面 上ブロックの下端(blockBottomsMm[1]=620+150)`, a.blockBottomsMm[1], 770);
  }
  // ⊗マークは下ブロック(index0)のみ、A/C面のみ。全体ローカルy=199(ブロックローカル199+ブロック下端0)。
  ok_('600E-1200 A面の⊗マークは下ブロックにある', areas.A?.keepOutZones.length === 1 && areas.A.keepOutZones[0].yMm === 199);
  ok_('600E-1200 C面の⊗マークは下ブロックにある', areas.C?.keepOutZones.length === 1 && areas.C.keepOutZones[0].yMm === 199);
  ok_('600E-1200 B面に⊗マークは無い', (areas.B?.keepOutZones.length ?? 0) === 0);
  ok_('600E-1200 D面に⊗マークは無い', (areas.D?.keepOutZones.length ?? 0) === 0);
}

console.log('\n■ 600E-1200：ブロック選択（block）で上下ブロックそれぞれに配置でき、段はブロックをまたいで積み上がらないこと');
{
  // ブロック1(下、620mm)に2段、ブロック2(上、225mm)に1段。
  const runs: ConduitRun[] = [
    { face: 'A', block: 1, row: 1, brand: 'kkfit', fepSize: 50, count: 1 },
    { face: 'A', block: 1, row: 2, brand: 'kkfit', fepSize: 50, count: 1 },
    { face: 'A', block: 2, row: 1, brand: 'kkfit', fepSize: 50, count: 1 },
  ];
  const r = computeHandholeLayout({ width: 600, heightVariantCode: '600E-1200', runs });
  const faceA = r.faces.find(f => f.face === 'A')!;
  ok_('エラーは出ない', !r.warnings.some(w => w.level === 'error'), r.warnings.map(w => w.message).join(' | '));
  ok_('3段とも配置できる(3個)', r.placedHoles.length === 3, `${r.placedHoles.length}`);
  const block1Row1 = faceA.rows.find(x => x.block === 1 && x.row === 1)!;
  const block1Row2 = faceA.rows.find(x => x.block === 1 && x.row === 2)!;
  const block2Row1 = faceA.rows.find(x => x.block === 2 && x.row === 1)!;
  ok_('ブロック1 1段目のbandBottomMmは0(面全体ローカルでもブロック1の下端=0)', block1Row1.bandBottomMm === 0, `${block1Row1.bandBottomMm}`);
  ok_('ブロック2 1段目のbandBottomMmはブロック間ギャップの先(>=770)', block2Row1.bandBottomMm >= 770, `${block2Row1.bandBottomMm}`);
  ok_('ブロック1の2段はブロック1の高さ(620mm)以内で積み上がる', block1Row2.bandTopMm <= 620, `${block1Row2.bandTopMm}`);
  if (faceA.area) checkInvariants('A面(600E-1200・全ブロック合算)', faceA.placedHoles, faceA.area.workableWidthMm, faceA.area.workableHeightMm);

  // 存在しないブロック番号(3)を指定するとエラーになること。
  const badRuns: ConduitRun[] = [{ face: 'A', block: 3, row: 1, brand: 'kkfit', fepSize: 50, count: 1 }];
  const rBad = computeHandholeLayout({ width: 600, heightVariantCode: '600E-1200', runs: badRuns });
  ok_('存在しないブロック番号はエラーになり配置されない', rBad.placedHoles.length === 0 && rBad.unplacedHoles.length === 1);
  const hasBlockError = rBad.warnings.some(w => w.level === 'error' && w.message.includes('ブロック3') && w.message.includes('存在しません'));
  ok_('存在しないブロックのエラーメッセージが出る', hasBlockError, rBad.warnings.map(w => w.message).join(' | '));

  // block省略時は既定で1扱いになること（450等、単一ブロックの既存呼び出し方との後方互換）。
  const implicitRuns: ConduitRun[] = [{ face: 'B', row: 1, brand: 'kkfit', fepSize: 50, count: 1 }];
  const rImplicit = computeHandholeLayout({ width: 600, heightVariantCode: '600E-1200', runs: implicitRuns });
  const faceB = rImplicit.faces.find(f => f.face === 'B')!;
  ok_('blockを省略すると1(下ブロック)扱いになる', faceB.rows[0]?.block === 1, `${faceB.rows[0]?.block}`);
}

console.log('\n■ 900サイズ：900E-900（既定、上下2ブロック）の加工可能エリア実測値（実発注データで最頻出サイズのため2026-09-18追加）');
{
  const areas = machinableAreasFor(900); // heightVariantCode省略＝既定の900E-900
  for (const face of HANDHOLE_FACE_ORDER) {
    const a = areas[face];
    ok_(`900E-900 ${face}面の加工可能エリアが取れる`, a != null);
    if (!a) continue;
    eq(`900E-900 ${face}面 全幅`, a.totalWidthMm, 1000);
    eq(`900E-900 ${face}面 加工可能幅`, a.workableWidthMm, 750);
    eq(`900E-900 ${face}面 全高`, a.totalHeightMm, 1140);
    eq(`900E-900 ${face}面 上端除外`, a.topExcludeMm, 320);
    eq(`900E-900 ${face}面 下端除外`, a.bottomExcludeMm, 125);
    eq(`900E-900 ${face}面 ブロック数`, a.blocks.length, 2);
    eq(`900E-900 ${face}面 下ブロック(index0)高さ`, a.blocks[0]?.heightMm, 320);
    eq(`900E-900 ${face}面 上ブロック(index1)高さ`, a.blocks[1]?.heightMm, 225);
    eq(`900E-900 ${face}面 ブロック間ギャップ`, a.gapsMm[0], 150);
    eq(`900E-900 ${face}面 加工可能高さ(=320+150+225)`, a.workableHeightMm, 695);
    ok_(`900E-900 ${face}面 自己整合(上端+可動域+下端=全高)`, a.topExcludeMm + a.workableHeightMm + a.bottomExcludeMm === a.totalHeightMm);
  }
  ok_('900E-900 A面の⊗マークは下ブロックにある(x=375,y=53)', areas.A?.keepOutZones.length === 1 && areas.A.keepOutZones[0].xMm === 375 && areas.A.keepOutZones[0].yMm === 53);
  ok_('900E-900 C面の⊗マークは下ブロックにある', areas.C?.keepOutZones.length === 1 && areas.C.keepOutZones[0].yMm === 53);
  ok_('900E-900 B面に⊗マークは無い', (areas.B?.keepOutZones.length ?? 0) === 0);
  ok_('900E-900 D面に⊗マークは無い', (areas.D?.keepOutZones.length ?? 0) === 0);
}

console.log('\n■ 900サイズ：900E-1200（上下2ブロック）の加工可能エリア実測値。600E-1200と縦方向の内訳が一致すること');
{
  const areas900 = machinableAreasFor(900, '900E-1200');
  const areas600 = machinableAreasFor(600, '600E-1200');
  for (const face of HANDHOLE_FACE_ORDER) {
    const a = areas900[face];
    const a6 = areas600[face];
    ok_(`900E-1200 ${face}面の加工可能エリアが取れる`, a != null);
    if (!a || !a6) continue;
    eq(`900E-1200 ${face}面 全幅`, a.totalWidthMm, 1000);
    eq(`900E-1200 ${face}面 加工可能幅`, a.workableWidthMm, 750);
    eq(`900E-1200 ${face}面 全高`, a.totalHeightMm, 1440);
    eq(`900E-1200 ${face}面 上端除外`, a.topExcludeMm, 320);
    eq(`900E-1200 ${face}面 下端除外`, a.bottomExcludeMm, 125);
    eq(`900E-1200 ${face}面 ブロック数`, a.blocks.length, 2);
    eq(`900E-1200 ${face}面 下ブロック(index0)高さ`, a.blocks[0]?.heightMm, 620);
    eq(`900E-1200 ${face}面 上ブロック(index1)高さ`, a.blocks[1]?.heightMm, 225);
    eq(`900E-1200 ${face}面 ブロック間ギャップ`, a.gapsMm[0], 150);
    ok_(`900E-1200 ${face}面 自己整合(上端+可動域+下端=全高)`, a.topExcludeMm + a.workableHeightMm + a.bottomExcludeMm === a.totalHeightMm);
    // 900E-1200は600E-1200と縦方向の内訳(上端除外・各ブロック高さ・隙間・下端除外)が完全に一致する
    // （幅・⊗マークのx位置のみ異なる）。これはS/Bピースの高さ構成が幅サイズに依存しないことの裏付け。
    ok_(`900E-1200/600E-1200 ${face}面 縦方向の内訳が一致`,
      a.topExcludeMm === a6.topExcludeMm && a.bottomExcludeMm === a6.bottomExcludeMm &&
      a.blocks[0].heightMm === a6.blocks[0].heightMm && a.blocks[1].heightMm === a6.blocks[1].heightMm &&
      a.gapsMm[0] === a6.gapsMm[0]);
  }
  ok_('900E-1200 A面の⊗マークは下ブロックにある(x=375,y=190)', areas900.A?.keepOutZones.length === 1 && areas900.A.keepOutZones[0].xMm === 375 && areas900.A.keepOutZones[0].yMm === 190);
  ok_('900E-1200 B面に⊗マークは無い', (areas900.B?.keepOutZones.length ?? 0) === 0);
}

console.log('\n■ 900サイズ：900×900×900mmで実際にKKフィットFEP100(工具警告対象)を配置しても問題ないこと');
{
  // 実発注で最頻出のサイズ・実発注でよく使われる大径コネクタ(KKフィットFEP100)の組み合わせを
  // 一度通しで検算しておく（回帰の早期発見用）。
  const runs: ConduitRun[] = [{ face: 'A', row: 1, brand: 'kkfit', fepSize: 100, count: 1 }];
  const r = computeHandholeLayout({ width: 900, runs, extraClearanceMm: 20 });
  ok_('900E-900で配置できる', r.placedHoles.length === 1, r.warnings.map(w => w.message).join(' | '));
  const faceA = r.faces.find(f => f.face === 'A')!;
  if (faceA.area) checkInvariants('900E-900 A面', faceA.placedHoles, faceA.area.workableWidthMm, faceA.area.workableHeightMm);
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

console.log('\n■ 450サイズ：段の配管が面の横幅(350mm)を超える場合、はみ出す穴だけが配置対象外になること（2026-09-18、段全体を諦める方式から変更）');
{
  // kmf FEP150（穴径180・コネクター外径246）を1段に2個。D面には⊗マークが無いため、
  // 押し出し(avoidKeepOutZones)は発生しない。外径基準のピッチ＝ceil((246+246)/2+10,5)=260。
  // 1個目center=125（右端248、350mm以内）、2個目center=385（右端508、350mmを超える）。
  // 2026-09-18以前は「1本でも横幅を超えたら段全体を配置しない」だったが、社長ご指摘
  // 「はみ出した穴だけ諦めればいいのでは」を受け、⊗マーク重複と同じ「その穴だけ諦める」方式に
  // 統一した。1個目は横幅に収まるので配置され、2個目だけが配置対象外になる。
  const runs: ConduitRun[] = [{ face: 'D', row: 1, brand: 'kmf', fepSize: 150, count: 2 }];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceD = r.faces.find(f => f.face === 'D')!;
  const row1 = faceD.rows.find(x => x.row === 1)!;
  ok_('要求2本のうち1本しか配置できないためfits=false', row1.fits === false);
  ok_('横幅に収まる1個目(x=125)は配置される', row1.placedHoles.length === 1 && row1.placedHoles[0]?.x === 125,
    `placed=${row1.placedHoles.length} x=${row1.placedHoles.map(h => h.x).join(',')}`);
  ok_('未配置は1個だけ(横幅を超える2個目のみ)', r.unplacedHoles.length === 1, `${r.unplacedHoles.length}`);
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('D面') && w.message.includes('横幅') && w.message.includes('x=385'));
  ok_('D面1段目、x=385の穴だけ横幅超過エラーが出る', hasError, r.warnings.map(w => w.message).join(' | '));
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

console.log('\n■ 450サイズ：A面の⊗マーク（内部インサート、ローカル175,274・半径22.5）に当たる穴は「その場で諦める」のではなく先まで押し出して配置し直すこと（2026-09-18、社長ご指摘で変更）');
{
  // 2026-09-18: 社長ご指摘「⊗マークと重なるからその穴を諦めるのではなく、マークの先まで
  // 動かして配置し直せばいいのでは」を受け、layoutRowX内でナイーブな位置が⊗マーク等と重なる
  // 場合は領域の右端の先まで中心位置を押し出す(avoidKeepOutZones)ように変更した。
  //
  // 1段目: kmf FEP150(コネクター外径246)を1個。
  //   centerYOffset=ceil(246/2,5)=125, bandTop=125+123=248, 次段base=ceil(248+10,5)=260。
  // 2段目: kkfit FEP30(コネクター外径74)を4個。centerYOffset=ceil(74/2,5)=40, absCenterY=300。
  //   ⊗マーク(175,274,半径22.5)との干渉範囲は、dy=300-274=26, threshold=37+22.5=59.5,
  //   halfWidth=sqrt(59.5^2-26^2)=53.5 → x∈(121.5,228.5)が⊗マークと重なる禁止帯。
  //   押し出し後の実際の位置(npx tsxで実装を直接実行し検算済み): x=40(禁止帯外・そのまま),
  //   x=125→禁止帯内のため228.5の先の230まで押し出し, x=230+ピッチ85=315→350mmの横幅を超える
  //   ため配置対象外, x=315+85=400→同じく横幅超過で配置対象外。結果、2個(x=40,230)配置・
  //   2個(横幅超過)配置対象外、という「本数の上限自体は変わらないが理由と位置が変わる」結果になる
  //   （⊗マークを避けて押し出した先で今度は面の横幅に収まらなくなるため。手計算・実装出力とも一致）。
  const runs: ConduitRun[] = [
    { face: 'A', row: 1, brand: 'kmf', fepSize: 150, count: 1 },
    { face: 'A', row: 2, brand: 'kkfit', fepSize: 30, count: 4 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  const faceA = r.faces.find(f => f.face === 'A')!;
  const row2 = faceA.rows.find(x => x.row === 2)!;
  ok_('2段目は高さは問題ないが4本中2本しか入らずfits=false', row2.fits === false, `bandTopMm=${row2.bandTopMm}`);
  ok_('2段目は4個要求', row2.requiredHoles.length === 4);
  ok_('2段目は4個中2個配置できる（⊗マークを避けて押し出した結果）', row2.placedHoles.length === 2,
    `placed=${row2.placedHoles.length} x=${row2.placedHoles.map(h => h.x).join(',')}`);
  ok_('配置できたのはx=40とx=230の2個（x=230は125から⊗マークの先まで押し出された位置）',
    row2.placedHoles.every(h => h.x === 40 || h.x === 230),
    `x=${row2.placedHoles.map(h => h.x).join(',')}`);
  ok_('押し出し後も⊗マークとは重ならない（干渉判定に引っかからない）',
    !r.warnings.some(w => w.level === 'error' && w.message.includes('と重なります')),
    r.warnings.map(w => w.message).join(' | '));
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('A面') && w.message.includes('横幅'));
  ok_('押し出した先で横幅を超える2本は横幅超過エラーになる', hasError, r.warnings.map(w => w.message).join(' | '));
  ok_('未配置がある', r.unplacedHoles.length > 0, `${r.unplacedHoles.length}`);
  if (faceA.area) checkInvariants('A面全体(配置できた分)', faceA.placedHoles, faceA.area.workableWidthMm, faceA.area.workableHeightMm);
}

console.log('\n■ 600E-600：⊗マークを避けて押し出した結果、面の横幅に収まらない分だけが配置対象外になること（社長報告の実例の再現）');
{
  // 社長が実機で報告した状況の再現：A面1段目にKKフィットFEP50(外径98)を4本要求。
  // ⊗マーク(225,65,半径22.5)との干渉範囲はx∈(155.1,294.9)。押し出し前は40,160,270,380mmに
  // 並ぶはずが、160→295(押し出し)、270は押し出し後の295から見て次のピッチ位置なので
  // 実際にはlayoutRowXが順に計算するため、押し出しの連鎖を実装出力で直接確認する。
  const runs: ConduitRun[] = [{ face: 'A', row: 1, brand: 'kkfit', fepSize: 50, count: 4 }];
  const r = computeHandholeLayout({ width: 600, heightVariantCode: '600E-600', runs });
  const faceA = r.faces.find(f => f.face === 'A')!;
  const row1 = faceA.rows.find(x => x.row === 1)!;
  ok_('4本要求、⊗マークと面の横幅の両方の制約で2本しか入らない(この位置での物理的な上限)',
    row1.placedHoles.length === 2, `placed=${row1.placedHoles.length} x=${row1.placedHoles.map(h => h.x).join(',')}`);
  ok_('1本目はx=50(禁止帯より左、押し出し不要)', row1.placedHoles.some(h => h.x === 50),
    `x=${row1.placedHoles.map(h => h.x).join(',')}`);
  ok_('2本目は⊗マークの先(x=295)まで押し出されている（旧実装のx=380と違う位置）',
    row1.placedHoles.some(h => h.x === 295), `x=${row1.placedHoles.map(h => h.x).join(',')}`);
  ok_('残り2本は押し出した先で横幅超過になり配置対象外', r.unplacedHoles.length === 2, `${r.unplacedHoles.length}`);
  const hasKeepoutError = r.warnings.some(w => w.level === 'error' && w.message.includes('と重なります'));
  ok_('もはや⊗マーク重複エラーは出ない（押し出しで回避済みのため）', !hasKeepoutError, r.warnings.map(w => w.message).join(' | '));
  if (faceA.area) checkInvariants('600E-600 A面1段目(配置できた分)', row1.placedHoles, faceA.area.workableWidthMm, faceA.area.workableHeightMm);
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

console.log('\n■ likelyNeedsTightenToolFor: 確認できているのはkkfit FEP100以上のみ');
{
  ok_('kkfit FEP100は工具の可能性あり', likelyNeedsTightenToolFor('kkfit', 100) === true);
  ok_('kkfit FEP150は工具の可能性あり', likelyNeedsTightenToolFor('kkfit', 150) === true);
  ok_('kkfit FEP80は対象外', likelyNeedsTightenToolFor('kkfit', 80) === false);
  ok_('nandemo FEP150は未確認のためfalse(=不要という意味ではない)', likelyNeedsTightenToolFor('nandemo', 150) === false);
}

console.log('\n■ 工具使用の可能性がある配管を含むと警告が出る（追加離隔0の時のみ）');
{
  const runs: ConduitRun[] = [{ face: 'B', row: 1, brand: 'kkfit', fepSize: 100, count: 1 }];
  const r0 = computeHandholeLayout({ width: 450, runs, extraClearanceMm: 0 });
  ok_('追加離隔0だと工具の警告が出る', r0.warnings.some(w => w.level === 'warn' && w.message.includes('工具')));
  const r1 = computeHandholeLayout({ width: 450, runs, extraClearanceMm: 20 });
  ok_('追加離隔を設定済みなら工具の警告は出ない', !r1.warnings.some(w => w.level === 'warn' && w.message.includes('工具')));
}

console.log('\n■ extraClearanceMm: メーカー規定の離隔に上乗せされ、ピッチ・段の積み上げ両方に反映される');
{
  const runs: ConduitRun[] = [
    { face: 'B', row: 1, brand: 'kkfit', fepSize: 50, count: 2 },
  ];
  const base = computeHandholeLayout({ width: 450, runs, extraClearanceMm: 0 });
  const extra = computeHandholeLayout({ width: 450, runs, extraClearanceMm: 20 });
  const baseHoles = [...base.placedHoles].sort((a, b) => a.x - b.x);
  const extraHoles = [...extra.placedHoles].sort((a, b) => a.x - b.x);
  ok_('base: 2個配置できる', baseHoles.length === 2);
  ok_('extra: 2個配置できる', extraHoles.length === 2);
  const basePitch = baseHoles.length === 2 ? baseHoles[1].x - baseHoles[0].x : NaN;
  const extraPitch = extraHoles.length === 2 ? extraHoles[1].x - extraHoles[0].x : NaN;
  ok_('追加離隔20mmぶんピッチが広がる', extraPitch - basePitch >= 20, `base=${basePitch} extra=${extraPitch}`);

  const runsRows: ConduitRun[] = [
    { face: 'C', row: 1, brand: 'kkfit', fepSize: 50, count: 1 },
    { face: 'C', row: 2, brand: 'kkfit', fepSize: 50, count: 1 },
  ];
  const baseRows = computeHandholeLayout({ width: 450, runs: runsRows, extraClearanceMm: 0 });
  const extraRows = computeHandholeLayout({ width: 450, runs: runsRows, extraClearanceMm: 20 });
  const baseFace = baseRows.faces.find(f => f.face === 'C');
  const extraFace = extraRows.faces.find(f => f.face === 'C');
  const baseBand2 = baseFace?.rows.find(r => r.row === 2)?.bandBottomMm ?? NaN;
  const extraBand2 = extraFace?.rows.find(r => r.row === 2)?.bandBottomMm ?? NaN;
  ok_('追加離隔20mmぶん2段目の下端も上がる', extraBand2 - baseBand2 >= 20, `base=${baseBand2} extra=${extraBand2}`);
}

console.log('\n■ おすすめ割り付け(suggestConduitRuns)：面・段を指定せず本数だけ渡すと自動で割り付けられること');
{
  // 単純なケース：450サイズ、350mm幅に余裕で収まる本数(3本)を1つのリクエストで渡す。
  const r1 = suggestConduitRuns({ width: 450, requests: [{ brand: 'kkfit', fepSize: 30, count: 3 }] });
  ok_('エラーは出ない', !r1.warnings.some(w => w.level === 'error'), r1.warnings.map(w => w.message).join(' | '));
  ok_('未割り付けは無い', r1.unallocated.length === 0, JSON.stringify(r1.unallocated));
  ok_('runsの合計本数は3', r1.runs.reduce((s, run) => s + run.count, 0) === 3);
  ok_('A面ブロック1段目に割り付けられる', r1.runs.every(run => run.face === 'A' && (run.block ?? 1) === 1 && run.row === 1));
  // ラウンドトリップ検証：suggestConduitRunsが返したrunsをそのままcomputeHandholeLayoutに渡すと
  // 実際に全て配置できるはず（＝suggestConduitRunsの「入る」判定がcomputeHandholeLayoutの
  // 実際の配置ロジックと矛盾していないことの検証）。
  const check1 = computeHandholeLayout({ width: 450, runs: r1.runs });
  ok_('ラウンドトリップ: 全て配置できる(未配置0件)', check1.unplacedHoles.length === 0, `未配置=${check1.unplacedHoles.length}`);
  ok_('ラウンドトリップ: 3件配置される', check1.placedHoles.length === 3);
}

console.log('\n■ おすすめ割り付け：1段に収まらない本数は複数の段・ブロック・面に自動で分散されること');
{
  // 600E-1200(上下2ブロック)に、kkfit FEP50(実効直径98mm、1段4本が限度)を25本要求。
  // 1面(A面)だけでも複数段・複数ブロックにまたがるはずの本数。
  const r = suggestConduitRuns({
    width: 600, heightVariantCode: '600E-1200',
    requests: [{ brand: 'kkfit', fepSize: 50, count: 25 }],
  });
  ok_('エラーは出ない', !r.warnings.some(w => w.level === 'error'), r.warnings.map(w => w.message).join(' | '));
  ok_('未割り付けは無い(25本くらいは複数面で十分収まる容量のはず)', r.unallocated.length === 0, JSON.stringify(r.unallocated));
  const totalAssigned = r.runs.reduce((s, run) => s + run.count, 0);
  ok_('runsの合計本数は25', totalAssigned === 25, `${totalAssigned}`);
  const usedRows = new Set(r.runs.map(run => `${run.face}-${run.block ?? 1}-${run.row}`));
  ok_('複数の段(面+ブロック+段の組み合わせ)に分散されている', usedRows.size > 1, `${usedRows.size}種類`);
  // ラウンドトリップ検証
  const check = computeHandholeLayout({ width: 600, heightVariantCode: '600E-1200', runs: r.runs });
  ok_('ラウンドトリップ: 全て配置できる(未配置0件)', check.unplacedHoles.length === 0, `未配置=${check.unplacedHoles.length}`);
  ok_('ラウンドトリップ: 25件配置される', check.placedHoles.length === 25, `${check.placedHoles.length}`);
}

console.log('\n■ おすすめ割り付け：どこにも入りきらない超過分は正直にunallocatedとして報告されること');
{
  // 450サイズ1面あたりの容量をはるかに超える本数(kkfit FEP150、実効直径246mmの大径を50本)を要求。
  const r = suggestConduitRuns({ width: 450, requests: [{ brand: 'kkfit', fepSize: 150, count: 50 }] });
  ok_('未割り付けが発生する', r.unallocated.length > 0, JSON.stringify(r.unallocated));
  const totalRequested = 50;
  const totalAssigned = r.runs.reduce((s, run) => s + run.count, 0);
  const totalUnallocated = r.unallocated.reduce((s, u) => s + u.count, 0);
  ok_('割り付け済み+未割り付け=要求本数(本数の保存則)', totalAssigned + totalUnallocated === totalRequested,
    `assigned=${totalAssigned} unallocated=${totalUnallocated} requested=${totalRequested}`);
  const hasUnallocatedWarn = r.warnings.some(w => w.level === 'warn' && w.message.includes('どの面・ブロックにも収まりませんでした'));
  ok_('未割り付けの警告が出る', hasUnallocatedWarn, r.warnings.map(w => w.message).join(' | '));
  // 割り付けられた分だけをcomputeHandholeLayoutに渡すと、それらは全て配置できるはず。
  const check = computeHandholeLayout({ width: 450, runs: r.runs });
  ok_('ラウンドトリップ: 割り付けられた分は全て配置できる', check.unplacedHoles.length === 0, `未配置=${check.unplacedHoles.length}`);
}

console.log('\n■ おすすめ割り付け：カタログに無い組み合わせはエラーになり、他のリクエストは正常に処理されること');
{
  const r = suggestConduitRuns({
    width: 450,
    requests: [
      { brand: 'kkfit', fepSize: 200, count: 1 }, // カタログに無い組み合わせ
      { brand: 'kkfit', fepSize: 30, count: 2 }, // 正常
    ],
  });
  const hasDataError = r.warnings.some(w => w.level === 'error' && w.message.includes('穴径データがありません'));
  ok_('データ欠落エラーが出る', hasDataError, r.warnings.map(w => w.message).join(' | '));
  ok_('正常な方(2本)は割り付けられる', r.runs.reduce((s, run) => s + run.count, 0) === 2);
}

console.log(`\n${ng === 0 ? '✅ 全件一致' : `❌ 不一致 ${ng} 件`}`);
if (ng > 0) throw new Error(`ハンドホール穴あけ計算の検証に失敗: 不一致 ${ng} 件`);
