import { useMemo, useState } from 'react';
import { Cable, AlertTriangle, Info, CheckCircle2, ChevronLeft, RotateCcw, XCircle } from 'lucide-react';
import {
  CABLE_TYPE_LABELS,
  CV_CORE_CONFIG_LABELS,
  CONDUIT_TYPE_ORDER,
  CONDUIT_TYPE_LABELS,
  CONDUIT_TYPE_SHORT_LABELS,
  getAllCableTypes,
  type CvVoltageClass,
} from '../../constants/cableConduitLookup';
import {
  getVariantsForCableType,
  findTable,
  findRow,
  type CableVariant,
} from '../../utils/cableConduitLookupEngine';

// sizeLabelが単純な数値表記(小数含む)の場合のみ、断面積の単位「sq」を補って表示する。
// (FP多心/AE/PEV/CCP系など、複合表記のsizeLabelはそのまま表示する)
function formatSizeLabel(sizeLabel: string): string {
  return /^\d+(\.\d+)?$/.test(sizeLabel) ? `${sizeLabel}sq` : sizeLabel;
}

function formatVariantLabel(cableType: string, variant: CableVariant): string {
  if (cableType === 'CV') {
    const coreLabel = CV_CORE_CONFIG_LABELS[variant.coreConfig] ?? variant.coreConfig;
    return variant.voltageClass ? `${coreLabel} ・ ${variant.voltageClass}` : coreLabel;
  }
  return variant.coreConfig;
}

export default function ConduitFillCalc() {
  const cableTypes = useMemo(() => getAllCableTypes(), []);

  const [cableType, setCableType] = useState<string | null>(null);
  const [coreConfig, setCoreConfig] = useState<string | null>(null);
  const [voltageClass, setVoltageClass] = useState<CvVoltageClass | undefined>(undefined);
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);

  const variants = useMemo(() => (cableType ? getVariantsForCableType(cableType) : []), [cableType]);

  const selectedTable = useMemo(() => {
    if (!cableType || !coreConfig) return null;
    return findTable(cableType, coreConfig, voltageClass) ?? null;
  }, [cableType, coreConfig, voltageClass]);

  const selectedRow = useMemo(() => {
    if (!selectedTable || !sizeLabel) return null;
    return findRow(selectedTable, sizeLabel) ?? null;
  }, [selectedTable, sizeLabel]);

  const handleSelectCableType = (ct: string) => {
    setCableType(ct);
    setSizeLabel(null);
    const vs = getVariantsForCableType(ct);
    if (vs.length === 1) {
      // バリエーションが1つしか無いケーブル種別(VVF・SVなど)は自動選択してStep2を省略する
      setCoreConfig(vs[0].coreConfig);
      setVoltageClass(vs[0].voltageClass);
    } else {
      setCoreConfig(null);
      setVoltageClass(undefined);
    }
  };

  const handleSelectVariant = (v: CableVariant) => {
    setCoreConfig(v.coreConfig);
    setVoltageClass(v.voltageClass);
    setSizeLabel(null);
  };

  const handleReset = () => {
    setCableType(null);
    setCoreConfig(null);
    setVoltageClass(undefined);
    setSizeLabel(null);
  };

  const handleBackToCableType = () => {
    setCoreConfig(null);
    setVoltageClass(undefined);
    setSizeLabel(null);
  };

  const handleBackToVariant = () => {
    setSizeLabel(null);
  };

  const skipVariantStep = variants.length <= 1;
  const cableTypeLabel = cableType ? (CABLE_TYPE_LABELS[cableType] ?? cableType) : null;
  const variantLabel = cableType && selectedTable
    ? formatVariantLabel(cableType, { table: selectedTable, coreConfig: selectedTable.coreConfig, voltageClass: selectedTable.voltageClass })
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Cable className="w-6 h-6 text-blue-500" />
            ケーブル用配管早見表
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ケーブルの種類・構成・サイズを選ぶだけで、収容に適した配管の呼び径を早見表から直接引けます。
          </p>
        </div>
        {(cableType || coreConfig || sizeLabel) && (
          <button
            onClick={handleReset}
            className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-3 py-2 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            選び直す
          </button>
        )}
      </div>

      {/* パンくず */}
      {cableType && (
        <div className="flex items-center flex-wrap gap-1.5 text-xs font-bold text-slate-500">
          <button onClick={handleBackToCableType} className="text-blue-600 hover:underline">
            {cableTypeLabel}
          </button>
          {variantLabel && (
            <>
              <span className="text-slate-300">/</span>
              <button onClick={handleBackToVariant} className="text-blue-600 hover:underline">
                {variantLabel}
              </button>
            </>
          )}
          {sizeLabel && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-slate-600 dark:text-slate-300">{formatSizeLabel(sizeLabel)}</span>
            </>
          )}
        </div>
      )}

      {/* Step1: ケーブル種別選択 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
        <label className="text-xs font-semibold text-slate-500 block">Step 1. ケーブルの種類を選んでください</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cableTypes.map(ct => (
            <button
              key={ct}
              onClick={() => handleSelectCableType(ct)}
              className={`px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors text-left ${
                cableType === ct
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
              }`}
            >
              {CABLE_TYPE_LABELS[ct] ?? ct}
            </button>
          ))}
        </div>
      </div>

      {/* Step2: 構成/電圧区分選択(バリエーションが2つ以上ある場合のみ表示) */}
      {cableType && !skipVariantStep && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
          <label className="text-xs font-semibold text-slate-500 block">Step 2. 条数・電圧区分などを選んでください</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {variants.map(v => {
              const isActive = coreConfig === v.coreConfig && voltageClass === v.voltageClass;
              return (
                <button
                  key={`${v.coreConfig}__${v.voltageClass ?? ''}`}
                  onClick={() => handleSelectVariant(v)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors text-left ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                  }`}
                >
                  {formatVariantLabel(cableType, v)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step3: サイズ選択 */}
      {selectedTable && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
          <label className="text-xs font-semibold text-slate-500 block">
            Step {skipVariantStep ? '2' : '3'}. ケーブルサイズを選んでください
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {selectedTable.rows.map(row => (
              <button
                key={row.sizeLabel}
                onClick={() => setSizeLabel(row.sizeLabel)}
                className={`px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  sizeLabel === row.sizeLabel
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-orange-300'
                }`}
              >
                {formatSizeLabel(row.sizeLabel)}
              </button>
            ))}
          </div>

          {selectedTable.uncertainCells && selectedTable.uncertainCells.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                この表は一部セルの読み取り精度について注記があります。念のため原本の早見表でもご確認ください。
              </p>
            </div>
          )}
        </div>
      )}

      {/* 結果表示 */}
      {sizeLabel && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 space-y-5">
          {!selectedRow ? (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700 dark:text-red-400">該当データが見つかりませんでした</p>
                <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">選択内容をご確認のうえ、選び直してください。</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    推奨される配管の呼び径
                  </h2>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>ケーブル外径: <span className="font-bold text-slate-700 dark:text-slate-300">{selectedRow.cableOuterDiameterMm}mm</span></span>
                  <span>ケーブル断面積: <span className="font-bold text-slate-700 dark:text-slate-300">{selectedRow.cableCrossSectionMm2}mm²</span></span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {CONDUIT_TYPE_ORDER.map(key => {
                  const value = selectedRow.conduit[key];
                  return (
                    <div
                      key={key}
                      className={`rounded-xl border px-3 py-3 text-center ${
                        value
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                      }`}
                      title={CONDUIT_TYPE_LABELS[key]}
                    >
                      <p className="text-[10px] font-semibold text-slate-400 mb-1">{CONDUIT_TYPE_SHORT_LABELS[key]}</p>
                      {value ? (
                        <p className="text-xl font-black text-blue-700 dark:text-blue-400 tracking-tight">{value}</p>
                      ) : (
                        <p className="flex items-center justify-center gap-1 text-xs font-bold text-slate-400">
                          <XCircle className="w-3.5 h-3.5" />
                          記載なし
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-slate-400">
                出典: 早見表 掲載ページ {selectedTable?.sourcePrintedPage}
              </p>
            </>
          )}
        </div>
      )}

      {!cableType && (
        <div className="flex items-center gap-2 text-sm text-slate-400 justify-center py-6">
          <ChevronLeft className="w-4 h-4 rotate-90" />
          まずはケーブルの種類を選んでください。
        </div>
      )}

      {/* 免責文言 */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-800 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
          本ツールは㈱榊井設備設計システムズ作成「ケーブル用配管早見表」に基づく参考値です。実際の採用前には有資格者による確認をお願いします。
        </p>
      </div>

      {/* 出典注記 */}
      <div className="flex items-start gap-2 text-xs text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          出典: ㈱榊井設備設計システムズ作成「ケーブル用配管早見表」(全43表)。
          E管(ねじなし電線管)・薄鋼電線管・厚鋼電線管・PF管(早見表原本ではCD管表記)・
          VE管(硬質ビニル電線管)・FEP管(波付ポリエチレン管)・SGP管(配管用炭素鋼鋼管)・
          F2(フレキシブル管等)の8種類について、ケーブルの種類・サイズごとの推奨呼び径を掲載しています。
          「記載なし」は早見表にその組み合わせの記載が無いことを示します。
        </p>
      </div>
    </div>
  );
}
