import React, { useState, useEffect } from 'react';
import { X, Calculator, Plus, Minus, RotateCcw, Check } from 'lucide-react';

interface EquipmentItem {
  id: string;
  name: string;
  va: number;
}

interface EquipmentCategory {
  id: string;
  name: string;
  items: EquipmentItem[];
}

const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  {
    id: 'led',
    name: 'LED照明',
    items: [
      { id: 'led_dl', name: 'ダウンライト・小型', va: 15 },
      { id: 'led_base_20', name: 'ベースライト(20W形)', va: 15 },
      { id: 'led_base_40_1', name: 'ベースライト(40W・1灯)', va: 20 },
      { id: 'led_base_40_2', name: 'ベースライト(40W・2灯)', va: 40 },
      { id: 'led_high', name: '高天井照明', va: 100 },
      { id: 'led_outdoor', name: '屋外防犯灯', va: 20 },
    ]
  },
  {
    id: 'legacy',
    name: '従来型照明',
    items: [
      { id: 'fl_40_1', name: '蛍光灯(40W・1灯用)', va: 50 },
      { id: 'fl_40_2', name: '蛍光灯(40W・2灯用)', va: 100 },
      { id: 'hg_400', name: '水銀灯(400W)', va: 450 },
      { id: 'inc_60', name: '白熱灯(60W)', va: 60 },
    ]
  },
  {
    id: 'outlets',
    name: 'コンセント・換気',
    items: [
      { id: 'outlet_general', name: '一般コンセント', va: 150 },
      { id: 'outlet_oa', name: 'OAコンセント', va: 300 },
      { id: 'fan_small', name: '小型換気扇', va: 30 },
      { id: 'fan_lossnay', name: 'ロスナイ (壁掛)', va: 60 },
    ]
  },
  {
    id: 'heavy',
    name: '空調・大型機器',
    items: [
      { id: 'ac_100v', name: 'ルームエアコン (100V)', va: 1000 },
      { id: 'ac_200v', name: 'ルームエアコン (200V)', va: 2000 },
      { id: 'pac', name: 'パッケージエアコン', va: 3000 },
      { id: 'ih', name: 'IHクッキングヒーター', va: 5000 },
      { id: 'ecocute', name: 'エコキュート', va: 4000 },
    ]
  },
  {
    id: 'special',
    name: '特殊機器・その他',
    items: []
  }
];

interface VACalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (totalVA: number, primaryCategoryId: string) => void;
  targetName?: string;
  targetId?: string; // 回路のID（localStorageのキーに使用）
}

export default function VACalculatorModal({ isOpen, onClose, onApply, targetName, targetId }: VACalculatorModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState<{ id: string, categoryId: string, name: string, va: number | '', qty: number }[]>([]);
  const [activeTab, setActiveTab] = useState<string>(EQUIPMENT_CATEGORIES[0].id);

  // モーダルが開くとき: targetIdのデータをlocalStorageから復元
  useEffect(() => {
    if (isOpen) {
      if (targetId) {
        const saved = localStorage.getItem(`va_calc_${targetId}`);
        if (saved) {
          try {
            const { quantities: q, customItems: c, activeTab: t } = JSON.parse(saved);
            setQuantities(q || {});
            setCustomItems(c || []);
            setActiveTab(t || EQUIPMENT_CATEGORIES[0].id);
            return;
          } catch {}
        }
      }
      // 保存データなしまたはtargetIdなしの場合は初期化
      setQuantities({});
      setCustomItems([]);
      setActiveTab(EQUIPMENT_CATEGORIES[0].id);
    }
  }, [isOpen, targetId]);

  if (!isOpen) return null;

  const handleUpdateQuantity = (id: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  const setExactQuantity = (id: string, val: string) => {
    const num = parseInt(val, 10);
    setQuantities(prev => ({
      ...prev,
      [id]: isNaN(num) ? 0 : Math.max(0, num)
    }));
  };

  const addCustomItem = (categoryId: string) => {
    setCustomItems(prev => [
      ...prev, 
      { id: crypto.randomUUID(), categoryId, name: '', va: '', qty: 1 }
    ]);
  };

  const updateCustomItem = (id: string, field: 'name' | 'va' | 'qty', value: any) => {
    setCustomItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeCustomItem = (id: string) => {
    setCustomItems(prev => prev.filter(item => item.id !== id));
  };

  // Calculate category totals helper
  const getCategoryTotal = (categoryId: string) => {
    const predefinedTotal = (EQUIPMENT_CATEGORIES.find(c => c.id === categoryId)?.items || []).reduce((sum, item) => {
      return sum + (quantities[item.id] || 0) * item.va;
    }, 0);
    
    const customTotal = customItems.filter(c => c.categoryId === categoryId).reduce((sum, item) => {
      const itemVa = typeof item.va === 'number' ? item.va : 0;
      return sum + itemVa * item.qty;
    }, 0);
    
    return predefinedTotal + customTotal;
  };

  // Calculate grand total manually
  let totalVA = 0;
  EQUIPMENT_CATEGORIES.forEach(cat => {
    totalVA += getCategoryTotal(cat.id);
  });

  const handleApply = () => {
    // 最もVAが多いカテゴリを「主カテゴリ」として返す
    let primaryCategoryId = activeTab;
    let maxVA = 0;
    EQUIPMENT_CATEGORIES.forEach(cat => {
      const v = getCategoryTotal(cat.id);
      if (v > maxVA) { maxVA = v; primaryCategoryId = cat.id; }
    });
    // 入力内訳をlocalStorageに保存
    if (targetId) {
      localStorage.setItem(`va_calc_${targetId}`, JSON.stringify({ quantities, customItems, activeTab }));
    }
    onApply(totalVA, primaryCategoryId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">容量 (VA) 内訳計算</h2>
              {targetName && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  対象回路: <span className="font-semibold">{targetName}</span>
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
          
          {/* Tabs Navigation */}
          <div className="flex flex-row sm:flex-col overflow-x-auto sm:overflow-y-auto w-full sm:w-60 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
            {EQUIPMENT_CATEGORIES.map(category => {
              const catTotal = getCategoryTotal(category.id);
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveTab(category.id)}
                  className={`flex flex-col flex-shrink-0 px-4 py-3 text-left transition-colors sm:border-l-2
                    ${activeTab === category.id 
                      ? 'border-b-2 sm:border-b-0 sm:border-l-indigo-500 bg-white dark:bg-slate-800 border-indigo-500' 
                      : 'border-b-2 border-transparent sm:border-l-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <span className={`text-sm font-medium ${activeTab === category.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                    {category.name}
                  </span>
                  {catTotal > 0 && (
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                      {catTotal.toLocaleString()} VA
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white dark:bg-slate-900">
            
            {/* Predefined Items for current category */}
            {EQUIPMENT_CATEGORIES.find(c => c.id === activeTab)?.items.map(item => {
              const qty = quantities[item.id] || 0;
              return (
                <div key={item.id} className={`flex items-center justify-between p-3 mb-2 rounded-lg border transition-colors ${qty > 0 ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/50 dark:bg-indigo-900/20 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{item.va} VA / 個</div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button 
                      onClick={() => handleUpdateQuantity(item.id, -1)}
                      disabled={qty <= 0}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input 
                      type="number"
                      value={qty || ''}
                      placeholder="0"
                      onChange={(e) => setExactQuantity(item.id, e.target.value)}
                      className="w-12 text-center text-sm font-semibold p-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button 
                      onClick={() => handleUpdateQuantity(item.id, 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    
                    <div className="w-16 sm:w-20 text-right pr-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{qty * item.va}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">VA</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Custom/Manual Inputs for current category */}
            <div className={`mt-6 pt-4 ${EQUIPMENT_CATEGORIES.find(c => c.id === activeTab)?.items.length ? 'border-t border-slate-200 dark:border-slate-800' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-500" />
                  手動入力・その他 ({EQUIPMENT_CATEGORIES.find(c => c.id === activeTab)?.name})
                </h3>
              </div>
              
              {activeTab === 'special' && customItems.filter(c => c.categoryId === activeTab).length === 0 && (
                 <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg mb-4">
                  <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">盤内の特殊な機器のVAを合算したい場合に使用してください。</p>
                </div>
              )}
                
              {customItems.filter(c => c.categoryId === activeTab).length === 0 ? (
                <div className="text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">リストにない特殊な機器を追加できます</p>
                  <button 
                    onClick={() => addCustomItem(activeTab)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
                  >
                    <Plus className="w-4 h-4 text-indigo-500" />
                    手動項目を追加
                  </button>
                </div>
              ) : (
                <div className="space-y-3 mb-2">
                  {customItems.filter(c => c.categoryId === activeTab).map((item) => (
                    <div key={item.id} className="flex flex-col sm:flex-row gap-2 sm:items-center p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                      <div className="flex-1">
                        <input 
                          type="text"
                          placeholder="機器名 (任意)"
                          value={item.name}
                          onChange={(e) => updateCustomItem(item.id, 'name', e.target.value)}
                          className="w-full text-sm font-medium p-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input 
                            type="number"
                            placeholder="VA"
                            value={item.va}
                            onChange={(e) => updateCustomItem(item.id, 'va', e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-20 text-sm font-bold p-2 pr-6 text-right border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">VA</span>
                        </div>
                        <span className="text-slate-400 font-bold">×</span>
                        <input 
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => updateCustomItem(item.id, 'qty', Math.max(1, Number(e.target.value)))}
                          className="w-14 text-sm font-bold p-2 text-center border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-slate-500 text-sm ml-1 font-medium">個</span>
                        
                        <button 
                          onClick={() => removeCustomItem(item.id)}
                          className="ml-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-2">
                    <button 
                      onClick={() => addCustomItem(activeTab)}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                    >
                      <Plus className="w-4 h-4 border-2 border-current rounded-full p-0.5" />
                      さらに追加
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-baseline gap-3 w-full sm:w-auto justify-center sm:justify-start">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">合計容量:</span>
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 flex items-baseline gap-1">
              {totalVA.toLocaleString()}
              <span className="text-sm font-bold text-slate-500 dark:text-slate-500">VA</span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                setQuantities({});
                setCustomItems([]);
                // localStorageからも削除
                if (targetId) localStorage.removeItem(`va_calc_${targetId}`);
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">リセット</span>
            </button>
            <button
              onClick={handleApply}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition-all hover:shadow-md"
            >
              <Check className="w-4 h-4" />
              反映する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline Trash icon for the custom items to save importing from separated scope if not exported
function Trash2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}
