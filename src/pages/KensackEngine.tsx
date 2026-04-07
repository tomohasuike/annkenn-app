import React, { useState, useRef } from 'react';
import { Search, Camera, Cpu, Database, AlertTriangle, CheckCircle2, Loader2, ImagePlus, ShoppingCart, Trash2, Mail, FileText, ChevronUp, ChevronDown, Mic, Plus, GripVertical } from 'lucide-react';
import { executeKensackSearch, executeKensackVisionSearch, parseVoiceToCartItems } from '../services/KensackService';
import type { KensackSearchResult, KensackMaterial, CartItem } from '../services/KensackService';
import { NumpadModal } from '../components/ui/NumpadModal';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableCartItemProps {
  m: CartItem;
  setCartItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setNumpadItemId: (id: string | null) => void;
  setNumpadInitialValue: (val: number) => void;
  setNumpadItemName: (name: string) => void;
  removeMaterialFromCart: (id: string, e: React.MouseEvent) => void;
}

const SortableCartItem: React.FC<SortableCartItemProps> = ({ m, setCartItems, setNumpadItemId, setNumpadInitialValue, setNumpadItemName, removeMaterialFromCart }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: m.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`bg-white border-2 border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 relative group ${isDragging ? 'shadow-xl border-blue-300' : 'shadow-sm'}`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="absolute left-1 sm:-left-3 top-1/2 -translate-y-1/2 p-2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 hidden sm:flex shrink-0 transition-colors"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      <div 
        {...attributes} 
        {...listeners} 
        className="w-full flex justify-center pb-2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 sm:hidden shrink-0 transition-colors"
      >
        <GripVertical className="w-5 h-5 rotate-90" />
      </div>

      {/* 画像プレビュー (カタログ品のみ) */}
      {m.type === 'catalog' ? (
        <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 flex-shrink-0 ml-0 sm:ml-4">
          {m.material?.image_url ? (
             <img src={m.material.image_url} alt={m.name} className="max-w-full max-h-full object-contain p-1 mix-blend-multiply" />
          ) : (
             <ImagePlus className="w-6 h-6 text-slate-300" />
          )}
        </div>
      ) : (
        <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 flex-shrink-0 text-blue-500 font-black text-xs ml-0 sm:ml-4">
          {m.type === 'voice' ? 'AI自動' : '手入力'}
        </div>
      )}
      
      <div className="flex-1 w-full min-w-0">
        {m.type === 'catalog' ? (
          <>
            <div className="text-xs font-black text-blue-600 mb-0.5">{m.manufacturer || '不明なメーカー'}</div>
            <h4 className="font-bold text-slate-900 truncate">{m.name}</h4>
            <div className="text-sm font-mono text-slate-500 font-bold">{m.model_number}</div>
          </>
        ) : (
          <div className="space-y-2">
            <input 
              type="text" 
              className="w-full font-bold text-slate-900 border-2 border-slate-200 rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none placeholder-slate-400"
              placeholder="品名 (例: VVFケーブル 2.0-3C)"
              value={m.name}
              onChange={(e) => {
                const val = e.target.value;
                setCartItems(prev => prev.map(item => item.id === m.id ? {...item, name: val} : item));
              }}
            />
            <input 
              type="text" 
              className="w-full text-sm font-mono text-slate-700 border-2 border-slate-200 rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none placeholder-slate-400"
              placeholder="メーカーや型番など(任意)"
              value={m.model_number || ''}
              onChange={(e) => {
                const val = e.target.value;
                setCartItems(prev => prev.map(item => item.id === m.id ? {...item, model_number: val} : item));
              }}
            />
          </div>
        )}
      </div>

      {/* 数量・金額・削除ボタン */}
      <div className="flex items-center justify-between w-full sm:w-auto gap-4 mt-2 sm:mt-0">
        <div className="flex items-center gap-2">
          <button
            className="w-20 bg-white hover:bg-slate-50 text-right font-black text-lg border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-colors"
            onClick={() => {
              setNumpadItemId(m.id);
              setNumpadInitialValue(m.quantity || 1);
              setNumpadItemName(m.name);
            }}
          >
            {m.quantity || 1}
          </button>
          <input 
            type="text"
            className="w-12 font-bold text-slate-600 border-2 border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-blue-500 text-center"
            value={m.unit}
            onChange={(e) => {
              const val = e.target.value;
              setCartItems(prev => prev.map(item => item.id === m.id ? {...item, unit: val} : item));
            }}
          />
        </div>
        
        <div className="text-right w-24 hidden lg:block">
          <div className="font-black text-slate-900">
            {m.price ? `¥${(m.price * m.quantity).toLocaleString()}` : 'ASK'}
          </div>
        </div>
        
        <button 
          onClick={(e) => removeMaterialFromCart(m.id, e)}
          className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export const KensackEngine: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selectedMfgs, setSelectedMfgs] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<KensackSearchResult | null>(null);
  
  // カート（キープ機能）用のState
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceParsing, setIsVoiceParsing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');

  // Numpad Modal用のState
  const [numpadItemId, setNumpadItemId] = useState<string | null>(null);
  const [numpadInitialValue, setNumpadInitialValue] = useState<number>(1);
  const [numpadItemName, setNumpadItemName] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setCartItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleTextSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() && selectedMfgs.length === 0) return;
    if (isSearching) return;

    setIsSearching(true);
    setResult(null);

    // メーカー選択を検索クエリにも付加しつつ、ハードフィルタリング(配列)としても裏側に渡す
    const finalQuery = [selectedMfgs.join(' '), query].filter(Boolean).join(' ');

    try {
      const searchRes = await executeKensackSearch(finalQuery, selectedMfgs);
      setResult(searchRes);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePhotoClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSearching(true);
    setResult(null);
    setQuery(''); // クリア
    setSelectedMfgs([]);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const resultBase64 = e.target?.result as string;
        // Split data:image/jpeg;base64,...
        const [meta, base64Data] = resultBase64.split(',');
        const mimeType = meta.split(':')[1].split(';')[0];
        
        try {
          const searchRes = await executeKensackVisionSearch(base64Data, mimeType);
          setResult(searchRes);
        } catch (error) {
           console.error(error);
           setResult({ materials: [], source: 'error', message: '画像検索中にエラーが発生しました。' });
        } finally {
           setIsSearching(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setIsSearching(false);
    }
    
    // reset input
    if (fileInputRef.current) {
       fileInputRef.current.value = '';
    }
  };

  const toggleManufacturer = (mfg: string) => {
    setSelectedMfgs(prev => 
      prev.includes(mfg) ? prev.filter(m => m !== mfg) : [...prev, mfg]
    );
  };

  const toggleMaterialSelection = (material: KensackMaterial) => {
    setCartItems(prev => {
      const isSelected = prev.some(m => m.material?.id === material.id);
      if (isSelected) {
        return prev.filter(m => m.material?.id !== material.id);
      } else {
        return [...prev, {
          id: `catalog_${material.id}`,
          type: 'catalog',
          name: material.name,
          model_number: material.model_number,
          quantity: 1,
          unit: '個',
          price: material.standard_price || undefined,
          manufacturer: material.manufacturers?.name,
          material: material
        }];
      }
    });
  };

  const removeMaterialFromCart = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCartItems(prev => prev.filter(m => m.id !== id));
  };
  
  const handleVoiceInput = () => {
    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("お使いのブラウザは音声入力に対応していません。推奨: Chrome / Safari");
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onstart = () => {
      setIsListening(true);
      setLiveTranscript('聞き取り中...');
    };
    
    recognition.onresult = (event: any) => {
      let interim = '';
      let finalStr = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalStr += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      
      setLiveTranscript(() => {
        // Since we are continuous, finalStr inherently stacks on previous results.
        // Wait, event.results contains ALL results from the start.
        // So we can just rebuild the whole transcript from scratch every onresult loop!
        let fullText = '';
        for (let i = 0; i < event.results.length; ++i) {
           fullText += event.results[i][0].transcript;
        }
        return fullText;
      });
    };
    
    recognition.onerror = () => setIsListening(false);
    
    recognition.start();
  };
  
  const handleStopVoice = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (liveTranscript.trim() && liveTranscript !== '聞き取り中...') {
      setIsVoiceParsing(true); // 音声ウィンドウは閉じずにパース中状態にする
      try {
        const parsedItems = await parseVoiceToCartItems(liveTranscript);
        setCartItems(prev => {
          setIsCartOpen(true);
          return [...prev, ...parsedItems];
        });
        setIsListening(false); // 成功してから閉じる
      } catch (error) {
        console.error(error);
        alert('音声の解析に失敗しました。');
        setIsListening(false);
      } finally {
        setIsVoiceParsing(false);
      }
    } else {
      setIsListening(false);
    }
  };

  const handleCancelVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };
  
  const handleAddManualItem = () => {
    setCartItems(prev => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        type: 'custom',
        name: '未入力の材料',
        quantity: 1,
        unit: '個'
      }
    ]);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center pt-8 md:pt-16 pb-24 px-4 sm:px-6">
      
      {/* 検索ヘッダー部分 */}
      <div className="w-full max-w-4xl text-center mb-8 md:mb-12">
        <h1 className="text-3xl md:text-5xl font-black text-slate-800 tracking-tight shadow-sm-text">
          Kensack <span className="text-blue-600">Engine</span>
        </h1>
        <p className="mt-3 text-sm md:text-base text-slate-600 font-bold bg-slate-200/50 inline-block px-4 py-1 rounded-full">
          現場材料・自動提案インフラ
        </p>
      </div>

      {/* 検索バー＆カメラボタン (ハイブリッド・スマートUI) */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row items-stretch gap-3 mb-6">
        <form onSubmit={handleTextSearch} className="relative flex-1 flex shadow-lg rounded-2xl md:rounded-[2rem] overflow-hidden group">
          <div className="absolute inset-y-0 left-0 pl-5 md:pl-6 flex items-center pointer-events-none">
            <Search className="h-6 w-6 md:h-8 md:w-8 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full pl-14 md:pl-20 pr-6 py-5 md:py-6 text-lg md:text-2xl font-bold text-slate-900 bg-white border-4 border-transparent focus:border-blue-500 placeholder-slate-400 transition-all outline-none"
            placeholder="材料名、型番、寸法を入力..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={isSearching}
            className="hidden sm:block absolute right-3 top-3 bottom-3 px-8 bg-slate-900 hover:bg-black text-white font-bold rounded-xl md:rounded-2xl transition-colors disabled:opacity-50"
          >
            検索
          </button>
        </form>

        {/* 📸 写真で提案ボタン (大きく目立つ高いコントラスト) */}
        <button
          onClick={handlePhotoClick}
          className="flex-none bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 rounded-2xl md:rounded-[2rem] px-6 md:px-8 py-5 md:py-6 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg md:text-xl font-bold border-4 border-white/20"
        >
          <Camera className="w-7 h-7 md:w-9 md:h-9" />
          <span className="hidden lg:inline">写真で提案</span>
        </button>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handlePhotoUpload} 
        />
      </div>

      {/* メーカー絞り込みチップ (Chips) */}
      <div className="w-full max-w-4xl flex flex-wrap justify-center gap-2 md:gap-3 mb-10 text-sm font-bold">
        <span className="text-slate-500 py-1.5 px-2 mr-1">絞り込むメーカー:</span>
        {['未来工業', 'パナソニック', 'ネグロス電工', '春日電機', '三菱電機', '富士電機', '日東工業'].map((mfg) => {
          const isSelected = selectedMfgs.includes(mfg);
          return (
            <button
              key={mfg}
              onClick={() => toggleManufacturer(mfg)}
              className={
                isSelected
                  ? "bg-blue-600 border-2 border-blue-600 text-white px-4 py-1.5 rounded-full transition-colors active:scale-95 shadow-md shadow-blue-600/20"
                  : "bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-1.5 rounded-full transition-colors active:scale-95"
              }
            >
              {mfg}
            </button>
          );
        })}
      </div>

      {/* 検索中のローディングインジケーター */}
      {isSearching && (
        <div className="flex flex-col items-center justify-center mt-12 text-blue-600 bg-white px-8 py-6 rounded-3xl shadow-sm border border-blue-100">
          <Loader2 className="h-10 w-10 animate-spin mb-3" />
          <p className="font-bold text-lg">インフラを検索中...</p>
        </div>
      )}

      {/* 検索結果（カード型グリッド） */}
      {result && !isSearching && (
        <div className="w-full max-w-7xl animate-fade-in-up">
          
          {/* AI推論理由・結果インジケーター */}
          {result.source === 'ai-translated' && (
            <div className="mb-8 p-5 md:p-6 rounded-2xl bg-white border-l-8 border-purple-500 shadow-md">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
                  <Cpu className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-800 mb-1">AIからの提案結果</h3>
                  <p className="text-slate-600 font-bold text-base md:text-lg leading-relaxed">
                    {result.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {result.source === 'database' && (
            <div className="mb-8 p-4 rounded-xl bg-slate-800 text-white flex items-center gap-3 shadow-md">
              <Database className="w-6 h-6 text-emerald-400" />
              <span className="font-bold">データベース高速一致（APIコスト0円）</span>
            </div>
          )}

          {/* グリッドレイアウト（モバイルで見やすく、タップ領域大） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {result.materials.map((m) => {
              const isLowConfidence = m.confidence !== undefined && m.confidence < 80;
              const isSelected = cartItems.some(selected => selected.material?.id === m.id);
              
              return (
                <div 
                  key={m.id} 
                  onClick={() => toggleMaterialSelection(m)}
                  className={`bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col relative group cursor-pointer border-4 ${isSelected ? 'border-blue-500' : 'border-transparent'}`}
                >
                  
                  {/* 選択済みチェックマーク */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 bg-blue-600 text-white rounded-full p-1 z-20 shadow-lg">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  )}

                  {/* 確信度バッジ */}
                  {isLowConfidence && (
                    <div className="absolute top-3 left-3 bg-red-100 text-red-800 text-sm font-black px-4 py-2 rounded-full flex items-center border-2 border-red-200 z-10 shadow-sm">
                      <AlertTriangle className="w-4 h-4 mr-1.5" />
                      要現物確認
                    </div>
                  )}
                  {m.confidence !== undefined && !isLowConfidence && (
                    <div className="absolute top-3 left-3 bg-emerald-100 text-emerald-800 text-sm font-black px-4 py-2 rounded-full flex items-center z-10 shadow-sm">
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      AI高適合
                    </div>
                  )}

                  {/* 商品画像プレビュー（無ければプレースホルダー） */}
                  <div className="h-56 bg-slate-50 flex items-center justify-center p-6 border-b-2 border-slate-100">
                    {m.image_url ? (
                      <img src={m.image_url} alt={m.name} className="max-h-full max-w-full object-contain mix-blend-multiply drop-shadow-md" />
                    ) : (
                      <div className="text-slate-300 flex flex-col items-center">
                        <ImagePlus className="w-12 h-12 mb-2 opacity-50" />
                        <span className="font-bold text-sm">画像なし</span>
                      </div>
                    )}
                  </div>

                  {/* 情報エリア */}
                  <div className="p-5 flex-1 flex flex-col">
                    <span className="text-sm font-black text-blue-600 mb-2 truncate">
                      {m.manufacturers?.name || '不明なメーカー'}
                    </span>
                    <h4 className="text-xl md:text-2xl font-black text-slate-900 mb-3 leading-tight line-clamp-2">
                      {m.name}
                    </h4>
                    
                    {/* 型番ラベル（目立つように） */}
                    <div className="bg-slate-800 text-white font-mono font-bold px-3 py-1.5 rounded-lg w-fit mb-4 text-sm md:text-base shadow-inner">
                      {m.model_number}
                    </div>
                    
                    {/* 寸法・価格情報 */}
                    <div className="bg-slate-50 rounded-2xl p-4 mt-auto border-2 border-slate-100">
                      <div className="grid grid-cols-3 gap-2 mb-3 items-end">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-400">幅 (W)</span>
                          <span className="font-bold text-slate-700">{m.width_mm || '-'} <span className="text-xs">mm</span></span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-400">高さ (H)</span>
                          <span className="font-bold text-slate-700">{m.height_mm || '-'} <span className="text-xs">mm</span></span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-400">奥行 (D)</span>
                          <span className="font-bold text-slate-700">{m.depth_mm || '-'} <span className="text-xs">mm</span></span>
                        </div>
                      </div>
                      <div className="pt-3 border-t-2 border-slate-200 border-dashed flex justify-between items-center">
                        <span className="text-xs font-black text-slate-400">標準単価</span>
                        <span className="text-xl font-black text-slate-900">
                          {m.standard_price ? `¥${m.standard_price.toLocaleString()}` : 'ASK'}
                        </span>
                      </div>
                      {/* カタログ原版リンク (ページ番号付加) */}
                      {m.catalog_url && (
                        <div className="mt-3 pt-3 border-t-2 border-slate-200 border-dashed">
                          {(() => {
                            const driveMatch = m.catalog_url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                            const isDrive = !!driveMatch;
                            
                            if (isDrive) {
                              const fileId = driveMatch[1];
                              const stateObj = { action: "open", ids: [fileId] };
                              const editorUrl = `/pdf-editor?state=${encodeURIComponent(JSON.stringify(stateObj))}&jumpToPage=${m.page_number || ''}`;
                              
                              return (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const btn = e.currentTarget;
                                    const originalText = btn.innerHTML;
                                    btn.innerHTML = '🔄 通信中...';
                                    btn.disabled = true;
                                    
                                    try {
                                        // 分割済みファイルの検索
                                        if (m.manufacturers?.name && m.page_number) {
                                            const { supabase } = await import('../lib/supabase');
                                            const { data } = await supabase
                                                .from('catalog_pages')
                                                .select('drive_file_id')
                                                .eq('manufacturer', m.manufacturers.name)
                                                .eq('page_number', m.page_number)
                                                .maybeSingle();

                                            if (data && data.drive_file_id) {
                                                // 分割ファイルが存在する場合はそちらを使用（爆速プレビュー）
                                                const fastStateObj = { action: "open", ids: [data.drive_file_id] };
                                                const fastEditorUrl = `/pdf-editor?state=${encodeURIComponent(JSON.stringify(fastStateObj))}&jumpToPage=${m.page_number}`;
                                                window.open(fastEditorUrl, '_blank');
                                                return;
                                            }
                                        }
                                    } catch (err) {
                                        console.error('Failed to lookup split catalog', err);
                                    } finally {
                                        btn.innerHTML = originalText;
                                        btn.disabled = false;
                                    }

                                    // 分割ファイルが無い場合は従来の200MBフルサイズ版（遅い）
                                    window.open(editorUrl, '_blank');
                                  }}
                                  className="w-full flex justify-center items-center gap-2 bg-white border-2 border-blue-600 text-blue-700 hover:bg-blue-50 py-2.5 rounded-xl font-black text-sm transition-colors disabled:opacity-50"
                                >
                                  📘 最速プレビューを開く {m.page_number && <span className="opacity-70 text-xs">({m.page_number}P)</span>}
                                </button>
                              );
                            }

                            return (
                              <a 
                                href={m.page_number ? `${m.catalog_url}#page=${m.page_number}` : m.catalog_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="w-full flex justify-center items-center gap-2 bg-white border-2 border-blue-600 text-blue-700 hover:bg-blue-50 py-2.5 rounded-xl font-black text-sm transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                📘 カタログ原版を開く {m.page_number && <span className="opacity-70 text-xs">({m.page_number}P)</span>}
                              </a>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* 検索結果がゼロだった場合 */}
          {result.materials.length === 0 && result.source !== 'error' && (
            <div className="text-center py-24 bg-white rounded-3xl border-2 border-slate-100 shadow-sm mt-8">
              <Search className="w-16 h-16 mx-auto mb-6 text-slate-300" />
              <h3 className="text-2xl font-black text-slate-800 mb-2">該当する材料・型番がありません</h3>
              <p className="text-slate-500 font-bold">キーワードを変えるか、「写真で提案」をお試しください。</p>
            </div>
          )}
        </div>
      )}

      {/* 音声入力中のオーバーレイ */}
      {isListening && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-10 flex flex-col items-center shadow-2xl w-[95%] max-w-lg transition-all relative overflow-hidden">
            {isVoiceParsing ? (
              // ▼▼ パース中の画面 ▼▼
              <>
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                </div>
                
                <div className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 min-h-[120px] flex gap-2 items-center justify-center mb-6 shadow-inner relative opacity-50">
                  <p className="text-xl md:text-2xl font-black text-slate-800 text-center leading-relaxed max-h-[200px] overflow-y-auto">
                    {liveTranscript}
                  </p>
                </div>

                <div className="flex flex-col items-center justify-center gap-3 w-full py-4 bg-blue-50 rounded-2xl border-2 border-blue-100">
                  <Cpu className="w-8 h-8 text-blue-600 animate-pulse" />
                  <p className="text-blue-700 font-black text-lg text-center leading-snug">
                    AIが音声を判定して<br className="sm:hidden" />リスト化しています...
                  </p>
                </div>
              </>
            ) : (
              // ▼▼ 聞き取り中の画面 ▼▼
              <>
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                  <Mic className="w-10 h-10 text-red-500 animate-bounce" />
                </div>
                
                <div className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 min-h-[120px] flex items-center justify-center mb-6 shadow-inner">
                  <p className="text-xl md:text-2xl font-black text-slate-800 text-center leading-relaxed max-h-[200px] overflow-y-auto">
                    {liveTranscript}
                  </p>
                </div>
                
                <p className="text-slate-500 font-bold text-sm text-center mb-8">
                  話し終わったら「決定」を押してください
                </p>

                <div className="flex w-full gap-3">
                  <button 
                    onClick={handleCancelVoice}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-colors active:scale-95"
                  >
                    キャンセル
                  </button>
                  <button 
                    onClick={handleStopVoice}
                    className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-colors shadow-lg shadow-blue-600/30 active:scale-95 flex items-center justify-center gap-2 text-lg"
                  >
                    <CheckCircle2 className="w-6 h-6" />
                    決定してリスト化
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* カート（キープ）ドロワー */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 bg-white shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] transition-all duration-300 rounded-t-3xl border-t-2 border-slate-200 ${isCartOpen ? 'max-h-[85vh]' : 'max-h-[80px]'}`}>
          
          {/* ドロワーのヘッダー部分（クリックで開閉） */}
          <div 
            onClick={() => setIsCartOpen(!isCartOpen)}
            className="h-[80px] px-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors rounded-t-3xl"
          >
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="bg-blue-600 p-3 rounded-2xl shadow-md text-white">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  {cartItems.length}
                </div>
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-lg md:text-xl">
                  見積もり/発注リスト
                </h3>
                {isCartOpen && (
                  <p className="text-xs font-bold text-slate-400">
                    現場材料の準備を進めます
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
               {/* 閉じた状態で見える合計金額プレビューなど */}
               {!isCartOpen && (
                 <div className="hidden sm:block text-right mr-4">
                   <p className="text-xs font-bold text-slate-500">推定合計金額（参考）</p>
                   <p className="font-black text-lg text-slate-800">
                     ¥{cartItems.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0).toLocaleString()}
                   </p>
                 </div>
               )}
               <button className="p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                 {isCartOpen ? <ChevronDown className="w-6 h-6" /> : <ChevronUp className="w-6 h-6" />}
               </button>
            </div>
          </div>

          {/* ドロワーの中身（開いたときに表示） */}
          <div className={`overflow-hidden transition-all duration-300 flex flex-col ${isCartOpen ? 'opacity-100 h-[calc(85vh-80px)]' : 'opacity-0 h-0'}`}>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
              
              {/* アクションボタン: 音声追加 / 手動追加 */}
              <div className="flex flex-wrap gap-3 mb-6">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleVoiceInput(); }}
                  className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border-2 border-red-200 px-4 py-3 rounded-2xl font-black transition-colors"
                >
                  <Mic className="w-5 h-5" />
                  音声でリストに追加
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleAddManualItem(); }}
                  className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-600 border-2 border-slate-200 px-4 py-3 rounded-2xl font-black transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  手入力行を追加
                </button>
              </div>

              {/* キープしたアイテムの一覧 */}
              <div className="space-y-3 mb-8">
                {cartItems.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-slate-400 font-bold">リストは現在空です</p>
                    <p className="text-slate-400 text-sm mt-1">「手入力」や「音声」で直接追加するか、上記から検索してください</p>
                  </div>
                ) : (
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={cartItems.map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {cartItems.map((m) => (
                        <SortableCartItem 
                          key={m.id} 
                          m={m} 
                          setCartItems={setCartItems}
                          setNumpadItemId={setNumpadItemId}
                          setNumpadInitialValue={setNumpadInitialValue}
                          setNumpadItemName={setNumpadItemName}
                          removeMaterialFromCart={removeMaterialFromCart}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>

            {/* アクションボタン群 (下部固定) */}
            <div className="p-4 md:p-6 bg-white border-t border-slate-200">
              <div className="bg-slate-50 p-4 rounded-3xl border-2 border-slate-100 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
                <div className="w-full lg:w-auto text-center lg:text-left">
                   <p className="text-sm font-bold text-slate-500 mb-1">現在のリスト ({cartItems.length}件)</p>
                   <p className="text-2xl font-black text-slate-800">
                     合計: ¥{cartItems.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0).toLocaleString()} <span className="text-sm text-slate-500 font-bold">（参考定価）</span>
                   </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                   <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-4 rounded-2xl font-black transition-colors shadow-lg active:scale-95 text-sm md:text-base">
                     <FileText className="w-5 h-5" />
                     納入仕様書/Excelを作成
                   </button>
                   <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-black transition-colors shadow-lg shadow-blue-600/30 active:scale-95 text-sm md:text-base">
                     <Mail className="w-5 h-5" />
                     相見積もり依頼 (送信先設定へ)
                   </button>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      {/* サブモーダル: テンキー入力 */}
      <NumpadModal 
        isOpen={numpadItemId !== null}
        initialValue={numpadInitialValue}
        label={numpadItemName}
        onConfirm={(newQuantity: number) => {
          if (numpadItemId) {
            setCartItems(prev => prev.map(item => item.id === numpadItemId ? {...item, quantity: newQuantity} : item));
          }
        }}
        onClose={() => setNumpadItemId(null)}
      />

    </div>
  );
};
