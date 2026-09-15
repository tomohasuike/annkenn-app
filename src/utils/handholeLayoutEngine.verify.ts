// src/utils/handholeLayoutEngine.verify.ts
//
// ハンドホール穴あけ計算の検証。実行:  npx tsx src/utils/handholeLayoutEngine.verify.ts
//
// プルボックスと違い「支持材別開口寸法表」のような外部の正解値表は無いため、
// テーブル値の引き当てと、配置アルゴリズムが守るべき不変条件（離隔・エリア内・
// エリア外はエラー）をプログラムで検証する。
// 根拠: hitec-ai-team（社長指示 2026-09-15、北関東工業カタログ・加工図面）
import { computeHandholeLayout, summarizeOrder, type ConduitRun } from './handholeLayoutEngine';
import {
  HOLE_DIAMETER_MM, holeDiameterFor, minClearanceFor, machinableAreaFor,
  KKE_OUTER_SPEC, type ConnectorBrand, type FepSize,
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

console.log('\n■ 加工可能エリア：450だけ値がある／それ以外は未確認(null)');
{
  const a450 = machinableAreaFor(450);
  ok_('450の加工可能エリアが取れる', a450 != null);
  if (a450) {
    eq('450 全幅', a450.totalWidthMm, 530);
    eq('450 加工可能幅', a450.workableWidthMm, 350);
    eq('450 全高(寸法チェーン)', a450.totalHeightMm, 920);
    eq('450 上端除外', a450.topExcludeMm, 220);
    eq('450 下端除外', a450.bottomExcludeMm, 100);
    eq('450 加工可能高さ(DXF実測)', a450.workableHeightMm, 600);
  }
  for (const w of [600, 800, 900, 1000, 1200, 1500, 1800, 2000] as const) {
    ok_(`${w}サイズは加工可能エリア未確認(null)`, machinableAreaFor(w) === null);
  }
}

console.log('\n■ 450サイズ以外は自動配置せず「未確認」警告になること');
{
  const runs: ConduitRun[] = [{ brand: 'kkfit', fepSize: 50, count: 2 }];
  for (const w of [600, 900, 1800] as const) {
    const r = computeHandholeLayout({ width: w, runs });
    ok_(`${w}: areaはnull`, r.area === null);
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

console.log('\n■ 450サイズ：普通の本数なら自動配置でき、離隔・エリア内が守られる');
{
  const runs: ConduitRun[] = [
    { brand: 'kkfit', fepSize: 30, count: 3 },
    { brand: 'nandemo', fepSize: 50, count: 2 },
    { brand: 'holeonly', fepSize: 40, count: 2 },
  ];
  const r = computeHandholeLayout({ width: 450, runs });
  ok_('area確認できる', r.area != null);
  ok_('要求穴数は7', r.requiredHoles.length === 7, `${r.requiredHoles.length}`);
  ok_('全部配置できる', r.placedHoles.length === 7 && r.unplacedHoles.length === 0,
    `placed=${r.placedHoles.length} unplaced=${r.unplacedHoles.length}`);
  if (r.area) checkInvariants('通常本数', r.placedHoles, r.area.workableWidthMm, r.area.workableHeightMm);
  const errorWarn = r.warnings.some(w => w.level === 'error');
  ok_('エラー警告は出ない', !errorWarn);
}

console.log('\n■ 450サイズ：詰め込みすぎるとエリア外エラーになること');
{
  // 450の加工可能エリアは 350×600mm。KMF FEP150(φ180)を大量に入れると確実に収まらない。
  const runs: ConduitRun[] = [{ brand: 'kmf', fepSize: 150, count: 20 }];
  const r = computeHandholeLayout({ width: 450, runs });
  ok_('要求穴数は20', r.requiredHoles.length === 20);
  ok_('一部は配置しきれず未配置がある', r.unplacedHoles.length > 0, `unplaced=${r.unplacedHoles.length}`);
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('収まりません'));
  ok_('エリア外エラーが出る', hasError);
  if (r.area) checkInvariants('詰め込み(配置できた分)', r.placedHoles, r.area.workableWidthMm, r.area.workableHeightMm);
}

console.log('\n■ 5mm/10mmグリッドに丸められているか');
{
  const runs: ConduitRun[] = [
    { brand: 'kkfit', fepSize: 65, count: 2 },
    { brand: 'nandemo', fepSize: 80, count: 2 },
  ];
  for (const grid of [5, 10] as const) {
    const r = computeHandholeLayout({ width: 450, runs, gridMm: grid });
    const allSnapped = r.placedHoles.every(h => Math.abs(h.x % grid) < 1e-6 && Math.abs(h.y % grid) < 1e-6);
    ok_(`grid=${grid}mmで中心座標が丸められている`, allSnapped);
  }
}

console.log('\n■ カタログに無い銘柄×呼び径の組み合わせはエラーになること（FEP200×コネクター銘柄は全滅のはず）');
{
  const runs: ConduitRun[] = [{ brand: 'kkfit', fepSize: 200, count: 1 }];
  const r = computeHandholeLayout({ width: 450, runs });
  ok_('要求穴0件（データ欠落でスキップ）', r.requiredHoles.length === 0);
  const hasError = r.warnings.some(w => w.level === 'error' && w.message.includes('穴径データがありません'));
  ok_('データ欠落エラーが出る', hasError);
}

console.log('\n■ 発注仕様の集計（summarizeOrder）');
{
  const runs: ConduitRun[] = [
    { brand: 'kkfit', fepSize: 30, count: 3 },
    { brand: 'kkfit', fepSize: 30, count: 2 }, // 同じ銘柄・呼び径は合算されること
    { brand: 'nandemo', fepSize: 50, count: 1 },
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
