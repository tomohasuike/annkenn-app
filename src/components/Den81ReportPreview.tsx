import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';

interface LightingLoad {
  id: string;
  circuitNo: number;
  name: string;
  voltage: '100V' | '200V';
  phase: 'U' | 'W' | 'UW';
  va: number;
  length_m: number;
  breakerType: 'MCCB' | 'ELCB';
  uCurrent?: number;
  wCurrent?: number;
  autoBreakerA?: number;
}

interface Den81ReportPreviewProps {
  title: string;
  loads: LightingLoad[];
  summary: {
    totalVA: number;
    recommendedMainBreaker: number;
    unbalanceRate: number;
  };
}

// 簡易ルールエンジン（内線規程より抜粋）
// TODO: DBやjson(naisen_rules.json)から取得する部分を将来的に置き換え
const CABLE_RULES = [
  { size: 2.0, maxAmps: 27, z: 5.65 }, // 2.0mm (Zは近似値 Ω/km)
  { size: 3.5, maxAmps: 37, z: 3.23 }, // 3.5mm²以降は撚り線
  { size: 5.5, maxAmps: 49, z: 2.06 }, 
  { size: 8.0, maxAmps: 61, z: 1.41 },
  { size: 14.0, maxAmps: 88, z: 0.82 },
];

export default function Den81ReportPreview({ title, loads, summary }: Den81ReportPreviewProps) {

  // 各行の詳細計算
  const calculatedRows = useMemo(() => {
    return loads.map(load => {
      // 5. 設計負荷電流 I (A) = VA / 電圧
      const voltValue = load.voltage === '200V' ? 200 : 100;
      const iCurrent = load.va / voltValue;
      
      // 8. 電線種別・サイズ と 9. 許容電流
      // ブレーカ定格値(autoBreakerA)と設計電流(I)をカバーできる最低の電線サイズを探索
      const requireAmps = Math.max(iCurrent, load.autoBreakerA || 0);
      const matchedCable = CABLE_RULES.find(c => c.maxAmps >= requireAmps) || CABLE_RULES[CABLE_RULES.length - 1];
      
      // 12. 電圧降下合計 e (V)
      // 単相2線式等の簡易電圧降下式 e = (35.6 * L * I) / (1000 * A)
      // ※ここでは近似計算式
      const voltageDrop = (35.6 * (load.length_m || 0) * iCurrent) / (1000 * matchedCable.size);
      
      // 11. 許容電圧降下 (V)
      // 幹線・分岐合わせて原則2%以下（60m以下の場合）
      const maxDropLimit = voltValue * 0.02; 
      const isDropWarning = voltageDrop > maxDropLimit;

      return {
        ...load,
        iCurrent,
        cableSize: matchedCable.size,
        cableMaxAmps: matchedCable.maxAmps,
        impedanceZ: matchedCable.z,
        voltageDrop,
        maxDropLimit,
        isDropWarning
      };
    });
  }, [loads]);

  return (
    <div className="bg-white text-slate-800 p-8 shadow-xl max-w-[210mm] min-h-[297mm] mx-auto text-[10px]" style={{ fontFamily: '"Noto Sans JP", "MS Gothic", sans-serif' }}>
      {/* 印刷用ヘッダー */}
      <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-black">計算書 様式 電-8-1</h1>
          <p className="mt-1 font-bold text-sm">{title}</p>
        </div>
        <div className="text-right">
          <p className="border border-black px-4 py-1 inline-block font-bold">電圧・電気方式: 単相3線式 100/200V</p>
        </div>
      </div>

      <div className="mb-4 flex gap-4">
         <div className="border border-black p-2 flex gap-4">
            <span className="font-bold">主幹遮断器: <span className="text-sm">{summary.recommendedMainBreaker}A</span></span>
            <span className="font-bold border-l pl-4 border-slate-400">総容量: <span className="text-sm">{(summary.totalVA / 1000).toFixed(1)}kVA</span></span>
            <span className="font-bold border-l pl-4 border-slate-400">不平衡率: <span className={`text-sm ${summary.unbalanceRate > 40 ? 'text-red-600' : ''}`}>{summary.unbalanceRate.toFixed(1)}%</span></span>
         </div>
      </div>

      {/* 電-8-1 準拠テープル */}
      <table className="w-full border-collapse border border-black text-center">
        <thead className="bg-slate-100 font-bold border-b border-black">
          <tr>
            <th className="border border-black p-1 w-8">No.</th>
            <th className="border border-black p-1">系統・負荷名称</th>
            <th className="border border-black p-1">電圧<br/>(V)</th>
            <th className="border border-black p-1">主幹器具定格<br/>(A)</th>
            <th className="border border-black p-1">こう長<br/>L (m)</th>
            <th className="border border-black p-1">設計負荷電流<br/>I (A)</th>
            <th className="border border-black p-1">負荷の力率<br/>cosθ</th>
            <th className="border border-black p-1">配線方式</th>
            <th className="border border-black p-1">電線サイズ<br/>A (mm²)</th>
            <th className="border border-black p-1 text-blue-700">許容電流<br/>(A)</th>
            <th className="border border-black p-1">Z<br/>(Ω/km)</th>
            <th className="border border-black p-1">許容降下<br/>(V)</th>
            <th className="border border-black p-1 text-red-700">電圧降下<br/>e (V)</th>
            <th className="border border-black p-1">備考</th>
          </tr>
        </thead>
        <tbody>
          {calculatedRows.map((row, i) => (
            <tr key={row.id} className="border-b border-black">
              <td className="border border-black p-1">{row.circuitNo}</td>
              <td className="border border-black p-1 text-left px-2">{row.name}</td>
              <td className="border border-black p-1">{row.voltage.replace('V', '')}</td>
              <td className="border border-black p-1">{row.autoBreakerA}</td>
              <td className="border border-black p-1">{row.length_m || 0}</td>
              <td className="border border-black p-1">{row.iCurrent.toFixed(1)}</td>
              <td className="border border-black p-1">1.0</td>
              <td className="border border-black p-1">金属管等</td>
              <td className="border border-black p-1 bg-yellow-50">{row.cableSize.toFixed(1)}</td>
              <td className="border border-black p-1 font-bold text-blue-700">
                {row.cableMaxAmps}
                {row.cableMaxAmps < (row.autoBreakerA || 0) && <AlertCircle className="w-3 h-3 text-red-500 inline ml-1" />}
              </td>
              <td className="border border-black p-1 text-slate-500">{row.impedanceZ.toFixed(2)}</td>
              <td className="border border-black p-1">{row.maxDropLimit.toFixed(1)}</td>
              <td className={`border border-black p-1 font-bold ${row.isDropWarning ? 'text-red-600 bg-red-50' : 'text-slate-800'}`}>
                {row.voltageDrop.toFixed(2)}
              </td>
              <td className="border border-black p-1 text-[8px] text-slate-500">
                {row.phase}相
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 pt-4 border-t border-slate-300 text-[9px] text-slate-500">
        ※本計算書は「様式 電-8-1」に準拠した出力フォーマットです。<br/>
        ※電圧降下計算は配線長(L)および概算のインピーダンスを用いた略算式により算出しています。
      </div>
    </div>
  );
}
