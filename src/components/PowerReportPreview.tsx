import { useMemo } from 'react';

interface PowerLoad {
  id: string;
  circuitNo: number;
  name: string;
  kw: number;
  length_m: number;
  startingMethod: 'direct' | 'star_delta' | 'inverter';
  breakerType: 'MCCB' | 'ELCB';
  iCurrent?: number;
  autoBreakerA?: number;
  is_existing?: boolean;
}

interface PowerReportPreviewProps {
  title: string;
  loads: PowerLoad[];
  summary: {
    totalKw: number;
    recommendedMainBreaker: number;
  };
}

export default function PowerReportPreview({ title, loads, summary }: PowerReportPreviewProps) {

  // 動力計算における大まかな配線係数 (ルールエンジンから引くのがベストだが、ここでは近似プレビュー)
  const getWireSize = (amps: number) => {
    if (amps <= 27) return { size: 2.0, z: 5.65 };
    if (amps <= 37) return { size: 3.5, z: 3.23 };
    if (amps <= 49) return { size: 5.5, z: 2.06 };
    if (amps <= 61) return { size: 8.0, z: 1.41 };
    if (amps <= 88) return { size: 14.0, z: 0.82 };
    if (amps <= 115) return { size: 22.0, z: 0.53 };
    if (amps <= 149) return { size: 38.0, z: 0.31 };
    if (amps <= 217) return { size: 60.0, z: 0.20 };
    return { size: 100.0, z: 0.12 };
  };

  const calculatedRows = useMemo(() => {
    return loads.map(load => {
      const iCurrent = load.iCurrent || (load.kw * 4.5); // Fallback calc
      const breakerA = load.autoBreakerA || 50;
      
      const wireInfo = getWireSize(breakerA);
      
      // 三相3線式 電圧降下 e = 30.8 * L * I / (1000 * A)
      const voltageDrop = (30.8 * (load.length_m || 20) * iCurrent) / (1000 * wireInfo.size);
      
      // 動力基準の電圧降下制限 (全体で2%、200Vなら4V)
      const maxDropLimit = 4.0;
      const isDropWarning = voltageDrop > maxDropLimit;

      const startingMethodJP = load.startingMethod === 'direct' ? '直入' : 
                                 load.startingMethod === 'star_delta' ? 'Y-Δ' : 'インバータ';

      return {
        ...load,
        iCurrent,
        cableSize: wireInfo.size,
        impedanceZ: wireInfo.z,
        voltageDrop,
        maxDropLimit,
        isDropWarning,
        startingMethodJP
      };
    });
  }, [loads]);

  return (
    <div className="bg-white text-slate-800 p-8 shadow-xl max-w-[210mm] min-h-[297mm] mx-auto text-[10px]" style={{ fontFamily: '"Noto Sans JP", "MS Gothic", sans-serif' }}>
      {/* 印刷用ヘッダー */}
      <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-black">計算書 様式 電-8-1 (動力)</h1>
          <p className="mt-1 font-bold text-sm">{title}</p>
        </div>
        <div className="text-right">
          <p className="border border-black px-4 py-1 inline-block font-bold">電圧・電気方式: 三相3線式 200V</p>
        </div>
      </div>

      <div className="mb-4 flex gap-4">
         <div className="border border-black p-2 flex gap-4">
            <span className="font-bold">主幹遮断器: <span className="text-sm">{summary.recommendedMainBreaker}A</span></span>
            <span className="font-bold border-l pl-4 border-slate-400">総容量: <span className="text-sm">{summary.totalKw.toFixed(1)}kW</span></span>
         </div>
      </div>

      {/* 電-8-1 準拠テープル */}
      <table className="w-full border-collapse border border-black text-center">
        <thead className="bg-slate-100 font-bold border-b border-black">
          <tr>
            <th className="border border-black p-1 w-8">No.</th>
            <th className="border border-black p-1">系統・負荷名称</th>
            <th className="border border-black p-1">電圧<br/>(V)</th>
            <th className="border border-black p-1">始動方式</th>
            <th className="border border-black p-1">主幹器具定格<br/>(A)</th>
            <th className="border border-black p-1">こう長<br/>L (m)</th>
            <th className="border border-black p-1">設計負荷電流<br/>I (A)</th>
            <th className="border border-black p-1">電線サイズ<br/>A (mm²)</th>
            <th className="border border-black p-1">Z<br/>(Ω/km)</th>
            <th className="border border-black p-1 text-red-700">電圧降下<br/>e (V)</th>
            <th className="border border-black p-1">備考</th>
          </tr>
        </thead>
        <tbody>
          {calculatedRows.map((row, i) => (
            <tr key={row.id} className={`border-b border-black ${row.is_existing ? 'bg-slate-100 text-slate-500' : ''}`}>
              <td className="border border-black p-1">{row.circuitNo || i + 1}</td>
              <td className="border border-black p-1 text-left px-2">{row.name}</td>
              <td className="border border-black p-1">200</td>
              <td className="border border-black p-1">{row.startingMethodJP}</td>
              <td className="border border-black p-1 font-bold">{row.autoBreakerA}</td>
              <td className="border border-black p-1">{row.length_m || 20}</td>
              <td className="border border-black p-1 bg-slate-50">{row.iCurrent.toFixed(1)}</td>
              <td className="border border-black p-1 bg-yellow-50">{row.cableSize.toFixed(1)}</td>
              <td className="border border-black p-1 text-slate-500">{row.impedanceZ.toFixed(2)}</td>
              <td className={`border border-black p-1 font-bold ${row.isDropWarning ? 'text-red-600 bg-red-50' : 'text-slate-800'}`}>
                {row.voltageDrop.toFixed(2)}
              </td>
              <td className="border border-black p-1 text-[8px] text-slate-500">
                {row.is_existing ? '既設流用' : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 pt-4 border-t border-slate-300 text-[9px] text-slate-500">
        ※本計算書は「様式 電-8-1」に準拠した動力盤用フォーマットです。<br/>
        ※電圧降下計算は配線長(L)および概算定数（30.8）を用いた略算式により算出しています。<br/>
        ※ブレーカ選定は内線規程におけるモータ突入電流を考慮したサイズ（始動方式による逓減あり）を適用しています。
      </div>
    </div>
  );
}
