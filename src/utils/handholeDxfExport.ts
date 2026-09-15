// src/utils/handholeDxfExport.ts
// ハンドホール穴あけ（北関東工業・発注仕様モード）: 計算済みの穴配置を、実物の北関東工業
// 空白発注図面DXF（KK-E型450サイズ・450E-750・A面）へ書き込む純粋関数。
//
// 対象は現時点でKK-E型450サイズ（`computeHandholeLayout()`の`area`が非nullを返すサイズ）のみ。
// それ以外のサイズは加工可能エリアの実寸が未確認のため、この関数の対象外
// （呼び出し側＝UIが、`result.area`がnullのサイズではこの関数を呼ばないこと）。
//
// 【安全のための追記方式】
// 既存のDXFエンティティ・レイヤーテーブル・スタイルテーブル等には一切触れない。
// ENTITIESセクションの終端（`0`/`ENDSEC`が現れる直前）に、新規のCIRCLE・TEXTエンティティの
// テキストを文字列として挿入するだけ。TABLESセクション（レイヤー定義等）は変更しないため、
// 新規エンティティは以下を流用する:
//   - レイヤー: DXF仕様上どのDXFにも必ず存在する"0"番レイヤー
//   - 文字スタイル: KKE450_B75.dxf実物のSTYLEテーブルに存在する"Standard"
//   - オーナーハンドル: 実物ファイルのENTITIESセクション内の全エンティティが共通して
//     参照しているモデル空間ブロックレコードのハンドル"1F"（実測・プロトタイプ検証で確認済み）
// 新規エンティティのハンドル（グループコード5）は、実物ファイルの$HANDSEED（0x6443A）より
// 十分大きい0x100000以降から採番し、既存ハンドルと衝突しないようにする。
//
// 【座標変換】（A面。プロトタイプ検証でDXF内のDIMENSIONエンティティの実測値から確定済み。
// 数値は捏造・推測ではなく実測値そのものなので変更しないこと）
//   DXF_X = local_x + 1995.959259451858
//   DXF_Y = local_y + 1964.301545107644
// スケール1:1、回転・反転なし。local_x/local_yは`computeHandholeLayout()`が`placedHoles`として
// 返す「加工可能エリア左下を原点」とするmm座標。
//
// 検証: npx tsx でこの関数を実際に呼び出し、public/handhole-templates/KKE450_B75.dxfへ
// 実際に書き込んだ結果をscratchpadへ出力、Python(ezdxf)で読み込み・レンダリングして
// 目視確認済み（既存エンティティが変換前後で完全一致することもezdxfの属性比較で確認済み）。

import { machinableAreaFor, type KkEWidth } from '../constants/handholeKitakanto';
import type { PlacedHole } from './handholeLayoutEngine';

/** A面 加工可能エリア左下原点のDXF座標（実測値。変更禁止）。 */
const ORIGIN_X = 1995.959259451858;
const ORIGIN_Y = 1964.301545107644;

/**
 * 新規エンティティのオーナーハンドル。KKE450_B75.dxf実物のENTITIESセクション内、
 * 既存の全エンティティ（CIRCLE/TEXT/MTEXT/INSERT等）が共通して参照している
 * モデル空間ブロックレコードのハンドル。プロトタイプ検証（add_connector.py）で実測済み。
 */
const OWNER_HANDLE = '1F';

/** 新規エンティティに使うレイヤー。TABLESセクションを一切変更しないよう、
 *  DXF仕様上必ず存在する"0"番レイヤーを流用する（新規レイヤーは追加しない）。 */
const LAYER_NAME = '0';

/** 新規エンティティに使う文字スタイル。KKE450_B75.dxfのSTYLEテーブルに実在する"Standard"を流用。 */
const TEXT_STYLE = 'Standard';

/** ラベルの文字高さ(mm)。 */
const TEXT_HEIGHT_MM = 12;

/** ラベルと円の間の隙間(mm)。 */
const TEXT_GAP_MM = 5;

/**
 * 新規ハンドルの採番開始値。KKE450_B75.dxf実物の$HANDSEED(0x6443A=410682)より
 * 十分大きく、既存のどのハンドルとも衝突しない。
 */
const HANDLE_BASE = 0x100000;

/** DXFの数値表現。整数はAutoCAD流に小数点を付けて出す（例: 35 -> "35.0"）。 */
function fmtNum(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

/** グループコード1行分（コード行＋値行）。コードは幅3で右詰め（実物DXFの表記に合わせる）。 */
function gLine(code: number, value: string, eol: string): string {
  return `${String(code).padStart(3, ' ')}${eol}${value}${eol}`;
}

function buildCircleEntity(handle: string, dxfX: number, dxfY: number, radiusMm: number, eol: string): string {
  return [
    gLine(0, 'CIRCLE', eol),
    gLine(5, handle, eol),
    gLine(330, OWNER_HANDLE, eol),
    gLine(100, 'AcDbEntity', eol),
    gLine(8, LAYER_NAME, eol),
    gLine(100, 'AcDbCircle', eol),
    gLine(10, fmtNum(dxfX), eol),
    gLine(20, fmtNum(dxfY), eol),
    gLine(30, '0.0', eol),
    gLine(40, fmtNum(radiusMm), eol),
  ].join('');
}

function buildTextEntity(handle: string, dxfX: number, dxfY: number, text: string, eol: string): string {
  return [
    gLine(0, 'TEXT', eol),
    gLine(5, handle, eol),
    gLine(330, OWNER_HANDLE, eol),
    gLine(100, 'AcDbEntity', eol),
    gLine(8, LAYER_NAME, eol),
    gLine(100, 'AcDbText', eol),
    gLine(10, fmtNum(dxfX), eol),
    gLine(20, fmtNum(dxfY), eol),
    gLine(30, '0.0', eol),
    gLine(40, fmtNum(TEXT_HEIGHT_MM), eol),
    gLine(1, text, eol),
    gLine(7, TEXT_STYLE, eol),
    gLine(100, 'AcDbText', eol),
  ].join('');
}

export class HandholeDxfExportError extends Error {}

/**
 * テンプレートDXF（KKE450_B75.dxf、テキストとして読み込んだもの）のENTITIESセクション末尾に、
 * 配置済みの穴（CIRCLE+TEXT）を追記した新しいDXFテキストを返す。既存のエンティティ・
 * テーブル定義は一切変更しない。
 *
 * @param templateDxfText public/handhole-templates/KKE450_B75.dxf の中身（テキスト）
 * @param placedHoles computeHandholeLayout() の placedHoles（配置できた穴のみ）
 * @param width 対象サイズ。450以外を渡した場合はエラー（加工可能エリア未確認のため）。
 */
export function generateHandholeOrderDxf(
  templateDxfText: string,
  placedHoles: PlacedHole[],
  width: KkEWidth = 450,
): string {
  if (width !== 450) {
    throw new HandholeDxfExportError(
      `KK-E型${width}サイズは加工可能エリアの実寸が未確認のため、発注図面への書き込みには対応していません。`,
    );
  }
  if (placedHoles.length === 0) {
    throw new HandholeDxfExportError('配置された穴がありません。配管条件を追加してください。');
  }

  const area = machinableAreaFor(width);
  if (!area) {
    // width===450なら本来ここには来ないはず（machinableAreaForの前提が変わっていない限り）。
    throw new HandholeDxfExportError('加工可能エリアの実寸データが見つかりません。');
  }

  // 安全のための範囲チェック（呼び出し側がunplacedHolesを取り違えて渡した場合の事故防止）。
  for (const h of placedHoles) {
    const r = h.diameterMm / 2;
    const outOfRange =
      h.x - r < -1e-6 ||
      h.y - r < -1e-6 ||
      h.x + r > area.workableWidthMm + 1e-6 ||
      h.y + r > area.workableHeightMm + 1e-6;
    if (outOfRange) {
      throw new HandholeDxfExportError(
        `穴「${h.label}」(x=${h.x}, y=${h.y}, φ${h.diameterMm})が加工可能エリア` +
          `（幅${area.workableWidthMm}×高さ${area.workableHeightMm}mm）をはみ出しています。発注図面への書き込みを中止しました。`,
      );
    }
  }

  const eol = templateDxfText.includes('\r\n') ? '\r\n' : '\n';

  // ENTITIESセクションの開始位置（"ENTITIES"は実物ファイル内で1箇所のみ、単独行として出現する）。
  const entitiesIdx = templateDxfText.indexOf(`${eol}ENTITIES${eol}`);
  if (entitiesIdx === -1) {
    throw new HandholeDxfExportError(
      'テンプレートDXF内にENTITIESセクションが見つかりません。テンプレートファイルが破損している可能性があります。',
    );
  }

  // ENTITIESセクションを閉じる"0"/"ENDSEC"の直前（このセクション内で最初に現れるもの）を探す。
  const endsecMarker = `  0${eol}ENDSEC${eol}`;
  const insertAt = templateDxfText.indexOf(endsecMarker, entitiesIdx);
  if (insertAt === -1) {
    throw new HandholeDxfExportError('テンプレートDXF内にENTITIESセクションの終端(ENDSEC)が見つかりません。');
  }

  let handleCounter = HANDLE_BASE;
  const nextHandle = () => (handleCounter++).toString(16).toUpperCase();

  const chunks: string[] = [];
  for (const hole of placedHoles) {
    const dxfX = ORIGIN_X + hole.x;
    const dxfY = ORIGIN_Y + hole.y;
    const radius = hole.diameterMm / 2;

    chunks.push(buildCircleEntity(nextHandle(), dxfX, dxfY, radius, eol));

    // ラベルは短く「φ{穴径}」のみ。銘柄名まで入れると穴同士の間隔が狭い時に文字が重なって
    // 読めなくなることをレンダリング確認で確認済みのため、あえて最小限にしている
    // （銘柄・FEP呼び径は別途UIの「穴の一覧（発注仕様）」表で確認できる）。
    const label = `φ${hole.diameterMm}`;
    const textX = dxfX - radius;
    const textY = dxfY - radius - TEXT_HEIGHT_MM - TEXT_GAP_MM;
    chunks.push(buildTextEntity(nextHandle(), textX, textY, label, eol));
  }

  const insertion = chunks.join('');
  return templateDxfText.slice(0, insertAt) + insertion + templateDxfText.slice(insertAt);
}

/** ブラウザ上でDXFテキストを`.dxf`ファイルとしてダウンロードさせる。 */
export function downloadDxfText(dxfText: string, fileName: string): void {
  const blob = new Blob([dxfText], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
