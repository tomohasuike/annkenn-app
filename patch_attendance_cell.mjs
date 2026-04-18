/**
 * patch_attendance_cell.mjs
 * 現在の壊れた状態（clockInセルが消失、clockOutセルが残存）を
 * 正しい2セル構造（clockIn + clockOut、それぞれTOT上段/本人下段）に修正する
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'src/pages/attendance/AttendanceAdmin.tsx');

let content = readFileSync(filePath, 'utf8');

// ─────────────────────────────────────────────────────
// 1. 壊れた位置を特定する
//    型定義（line 33）を除くため、スキップ位置は 3000 文字以降で検索
// ─────────────────────────────────────────────────────
const SKIP_CHARS = 3000; // TypeScript interface 定義をスキップ

// tot_clock_out_time の JSX 内での最初の出現位置
const totOutIdx = content.indexOf('tot_clock_out_time', SKIP_CHARS);
if (totOutIdx === -1) {
  console.error('❌ JSX内に tot_clock_out_time が見つかりません');
  process.exit(1);
}
console.log(`📍 tot_clock_out_time JSX位置: ${totOutIdx}`);

// 直近の <td の位置（tdOpenIdx）
const tdOpenIdx = content.lastIndexOf('<td', totOutIdx);
if (tdOpenIdx === -1) {
  console.error('❌ <td が見つかりません');
  process.exit(1);
}

// その <td が含まれる行の先頭位置（直前の改行 + 1）
const lineStartIdx = content.lastIndexOf('\n', tdOpenIdx) + 1;

// 対応する </td> の終端位置（totOutIdx 以降の最初の </td> の直後）
const tdCloseStr = '</td>';
const tdCloseEndIdx = content.indexOf(tdCloseStr, totOutIdx) + tdCloseStr.length;

console.log(`📍 置換範囲: ${lineStartIdx} 〜 ${tdCloseEndIdx}`);
console.log(`📝 置換前:\n${content.substring(lineStartIdx, Math.min(lineStartIdx + 200, tdCloseEndIdx))}...`);

// ─────────────────────────────────────────────────────
// 2. 正しい2セル構造を定義
// ─────────────────────────────────────────────────────
const correctTwoCells = [
  // ── 出勤時間セル（clockIn）──
  `                            <td className="p-1 border-r font-medium text-slate-700 align-top pt-2 px-1 min-w-[80px]">`,
  `                               <div className="flex flex-col gap-0.5">`,
  `                                 <div className="flex justify-between items-center text-[11px]">`,
  `                                    <span className="text-[9px] text-slate-400 mr-1">TOT</span>`,
  `                                    <span className="text-slate-500">{formatInputTime(record?.tot_clock_in_time) || <span className="text-slate-300">---</span>}</span>`,
  `                                 </div>`,
  `                                 <div className="flex justify-between items-center border-t border-slate-100 pt-0.5 mt-0.5">`,
  `                                    <span className="text-[9px] text-blue-400 mr-1">本人</span>`,
  "                                    <input",
  `                                       type="time"`,
  `                                       value={currentClockIn || ''}`,
  `                                       onChange={e => handleClockInChange(e.target.value)}`,
  "                                       className={`w-16 text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded text-[11px] font-medium p-0 m-0 ${draft?.clockIn !== undefined ? 'text-amber-600 font-bold bg-amber-50' : 'text-blue-700'}`}",
  `                                    />`,
  `                                 </div>`,
  `                               </div>`,
  `                            </td>`,
  // ── 退社時間セル（clockOut）──
  `                            <td className="p-1 border-r font-medium text-slate-700 align-top pt-2 px-1 min-w-[80px]">`,
  `                               <div className="flex flex-col gap-0.5">`,
  `                                 <div className="flex justify-between items-center text-[11px]">`,
  `                                    <span className="text-[9px] text-slate-400 mr-1">TOT</span>`,
  `                                    <span className="text-slate-500">{formatInputTime(record?.tot_clock_out_time) || <span className="text-slate-300">---</span>}</span>`,
  `                                 </div>`,
  `                                 <div className="flex justify-between items-center border-t border-slate-100 pt-0.5 mt-0.5">`,
  `                                    <span className="text-[9px] text-blue-400 mr-1">本人</span>`,
  "                                    <input",
  `                                       type="time"`,
  `                                       value={currentClockOut || ''}`,
  `                                       onChange={e => handleClockOutChange(e.target.value)}`,
  "                                       className={`w-16 text-center bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded text-[11px] font-medium p-0 m-0 ${draft?.clockOut !== undefined ? 'text-amber-600 font-bold bg-amber-50' : 'text-blue-700'}`}",
  `                                    />`,
  `                                 </div>`,
  `                               </div>`,
  `                            </td>`,
].join('\n');

// ─────────────────────────────────────────────────────
// 3. 置換実行
// ─────────────────────────────────────────────────────
content = content.substring(0, lineStartIdx) + correctTwoCells + content.substring(tdCloseEndIdx);

// ─────────────────────────────────────────────────────
// 4. 検証
// ─────────────────────────────────────────────────────
const checks = [
  ['tot_clock_in_time (JSX)', content.indexOf('tot_clock_in_time', SKIP_CHARS) !== -1],
  ['tot_clock_out_time (JSX)', content.indexOf('tot_clock_out_time', SKIP_CHARS) !== -1],
  ['currentClockIn', content.includes('currentClockIn || \'\'')],
  ['currentClockOut', content.includes('currentClockOut || \'\'')],
  ['handleClockInChange', content.includes('handleClockInChange')],
  ['handleClockOutChange', content.includes('handleClockOutChange')],
];

let allOk = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) allOk = false;
}

if (!allOk) {
  console.error('\n❌ 検証に失敗しました。ファイルへの書き込みを中止します。');
  process.exit(1);
}

writeFileSync(filePath, content, 'utf8');
console.log('\n✅ AttendanceAdmin.tsx の修正完了！');
console.log('出勤時間: 上段=TOT・下段=本人入力');
console.log('退社時間: 上段=TOT・下段=本人入力');
