import React, { useState, useRef, useEffect } from 'react';
import { Search, Camera, Cpu, AlertTriangle, CheckCircle2, Loader2, ImagePlus, ShoppingCart, Trash2, Mail, FileText, ChevronUp, ChevronDown, Mic, Plus, GripVertical } from 'lucide-react';
import { executeKensackSearch, executeKensackVisionSearch, parseVoiceToCartItems } from '../services/KensackService';
import type { KensackSearchResult, KensackMaterial, CartItem, ChatMessage } from '../services/KensackService';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { NumpadModal } from '../components/ui/NumpadModal';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HighlightText: React.FC<{ text: string, splitQuery: string }> = ({ text, splitQuery }) => {
  if (!splitQuery || !text) return <>{text}</>;
  
  const queryWords = splitQuery.split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return <>{text}</>;

  const regex = new RegExp(`(${queryWords.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, index) => {
        const isMatch = queryWords.some(word => word.toLowerCase() === part.toLowerCase());
        return isMatch 
          ? <span key={index} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5">{part}</span> 
          : <span key={index}>{part}</span>;
      })}
    </>
  );
};

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
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

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

  // Catalog Viewer Modal State
  const [isCatalogViewerOpen, setIsCatalogViewerOpen] = useState(false);
  const [catalogViewerMode, setCatalogViewerMode] = useState<'loading' | 'error' | 'ready'>('loading');
  const [catalogViewerPages, setCatalogViewerPages] = useState<{page_number: number, catalog_url: string, drive_file_id?: string, page_image_url?: string, pdf_drive_file_id?: string}[]>([]);
  const [catalogViewerMfg, setCatalogViewerMfg] = useState('');
  const [catalogViewerTitle, setCatalogViewerTitle] = useState('');
  const [catalogViewerPdfModeIndex, setCatalogViewerPdfModeIndex] = useState<number | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);

  useEffect(() => {
      // Preload Google Identity Services if needed
      if (!(window as any).google?.accounts) {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          document.body.appendChild(script);
      }
  }, []);

  // 検索窓専用の音声入力設定
  const [isVoiceSearching, setIsVoiceSearching] = useState(false);
  const searchRecognitionRef = useRef<any>(null);
  const latestSearchQueryRef = useRef<string>('');

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

  const clearChatHistory = () => {
    setChatHistory([]);
    setResult(null);
    setQuery('');
  };

  const handleTextSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const actualQuery = overrideQuery !== undefined ? overrideQuery : query;
    if (!actualQuery.trim() && selectedMfgs.length === 0) return;
    if (isSearching) return;

    setIsSearching(true);
    setResult(null);

    // メーカー選択を検索クエリにも付加しつつ、ハードフィルタリング(配列)としても裏側に渡す
    const finalQuery = [selectedMfgs.join(' '), actualQuery].filter(Boolean).join(' ');

    try {
      const searchRes = await executeKensackSearch(finalQuery, selectedMfgs, chatHistory);
      setResult(searchRes);
      
      // Update chat history (keep last 3 turns = 6 messages)
      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory.push({ role: 'user', content: finalQuery });
        if (searchRes.aiProposal) {
          newHistory.push({ role: 'model', content: searchRes.aiProposal });
        } else if (searchRes.message) {
          newHistory.push({ role: 'model', content: searchRes.message });
        }
        // Slice to keep at most the last 6 messages
        return newHistory.slice(-6);
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleOpenCatalogViewer = async (m: KensackMaterial, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCatalogViewerOpen(true);
    setCatalogViewerMode('loading');
    setCatalogViewerMfg(m.manufacturers?.name || '');
    setCatalogViewerTitle(m.name || '');
    setCatalogViewerPdfModeIndex(null); // reset pdf mode

    // Get the grouped pages, or if empty, just use the single page.
    const pagesList = m.grouped_pages && m.grouped_pages.length > 0
      ? m.grouped_pages 
      : (m.catalog_url ? [{ page_number: m.page_number || 1, catalog_url: m.catalog_url }] : []);
      
    if (pagesList.length === 0) {
      setCatalogViewerMode('error');
      return;
    }

    try {
        let token = driveAccessToken;
        if (!token && (window as any).google?.accounts) {
            token = await new Promise<string | null>((resolve) => {
                try {
                    const client = (window as any).google.accounts.oauth2.initTokenClient({
                        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
                        scope: 'https://www.googleapis.com/auth/drive.readonly',
                        callback: (response: any) => {
                            if (response && response.access_token) {
                                setDriveAccessToken(response.access_token);
                                resolve(response.access_token);
                            } else {
                                resolve(null);
                            }
                        },
                    });
                    client.requestAccessToken({ prompt: '' });
                } catch (e) {
                    console.error("Token client init failed", e);
                    resolve(null);
                }
            });
        }
    } catch(err) {
        console.error("Auth flow failed", err);
    }

    try {
      const { supabase } = await import('../lib/supabase');
      // Fetch drive_file_ids for all these pages in parallel
      const enrichedPages = await Promise.all(
        pagesList.map(async (p) => {
          if (!m.manufacturers?.name) return p;
          const { data } = await supabase
              .from('catalog_pages')
              .select('drive_file_id')
              .eq('manufacturer', m.manufacturers.name)
              .eq('page_number', p.page_number)
              .maybeSingle();
              
          if (data && data.drive_file_id) {
            return { ...p, drive_file_id: data.drive_file_id };
          }
          return p;
        })
      );
      setCatalogViewerPages(enrichedPages);
      setCatalogViewerMode('ready');
    } catch (err) {
       console.error("Failed to load catalog pages:", err);
       setCatalogViewerPages(pagesList as any);
       setCatalogViewerMode('ready'); // Try to proceed even without proxy ids
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
  
  const handleSearchVoiceInput = () => {
    if (isVoiceSearching && searchRecognitionRef.current) {
      searchRecognitionRef.current.stop();
      setIsVoiceSearching(false);
      return;
    }

    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("お使いのブラウザは音声入力に対応していません。推奨: Chrome / Safari");
      return;
    }

    const recognition = new SpeechRecognition();
    searchRecognitionRef.current = recognition;
    recognition.lang = 'ja-JP';
    recognition.continuous = false; // 単発発話用
    recognition.interimResults = true;
    
    recognition.onstart = () => {
      setIsVoiceSearching(true);
      setQuery('');
      latestSearchQueryRef.current = '';
    };
    
    recognition.onresult = (event: any) => {
      let fullText = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        fullText += event.results[i][0].transcript;
      }
      setQuery(fullText);
      latestSearchQueryRef.current = fullText;
    };
    
    recognition.onend = () => {
      setIsVoiceSearching(false);
      // 自動的に検索を実行する
      if (latestSearchQueryRef.current.trim()) {
        handleTextSearch(undefined, latestSearchQueryRef.current);
      }
    };
    
    recognition.onerror = () => setIsVoiceSearching(false);
    
    recognition.start();
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
        <form onSubmit={(e) => handleTextSearch(e)} className="relative flex-1 flex shadow-lg rounded-2xl md:rounded-[2rem] overflow-hidden group border-2 border-transparent transition-all focus-within:border-blue-300">
          <div className="absolute inset-y-0 left-0 pl-5 md:pl-6 flex items-center pointer-events-none">
            <Search className="h-6 w-6 md:h-8 md:w-8 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full pl-14 md:pl-20 pr-16 md:pr-36 py-5 md:py-6 text-lg md:text-2xl font-bold text-slate-900 bg-white placeholder-slate-400 transition-all outline-none"
            placeholder="材料名、型番、寸法を入力..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              latestSearchQueryRef.current = e.target.value;
            }}
            disabled={isSearching}
          />
          {/* 検索音声マイクボタン */}
          <div className="absolute inset-y-0 right-2 sm:right-[100px] flex items-center">
            <button
              type="button"
              onClick={handleSearchVoiceInput}
              disabled={isSearching}
              className={`p-3 md:p-4 rounded-full transition-all duration-300 outline-none ${
                isVoiceSearching 
                  ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse' 
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
              }`}
            >
              <Mic className={`w-5 h-5 md:w-6 md:h-6 ${isVoiceSearching ? 'animate-bounce' : ''}`} />
            </button>
          </div>
          <button
            type="submit"
            disabled={isSearching || isVoiceSearching}
            className="hidden sm:flex absolute right-3 top-3 bottom-3 px-8 bg-slate-900 hover:bg-black text-white font-bold rounded-xl md:rounded-2xl items-center transition-colors disabled:opacity-50"
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
        {['未来工業', 'パナソニック', 'ネグロス電工', '古河電工', '日東工業', '三菱電機', '富士電機', 'IDEC', '内外電機'].map((mfg) => {
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

      {/* 会話履歴 (チャットUI) */}
      {chatHistory.length > 0 && (
        <div className="w-full max-w-4xl flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-center px-2 mb-2">
            <span className="text-sm font-bold text-slate-400">会話の文脈を引き継いで検索中...</span>
            <button 
              onClick={clearChatHistory}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-500 bg-white hover:bg-red-50 px-3 py-1.5 rounded-full transition-colors border border-slate-200 hover:border-red-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              リセットして新しく探す
            </button>
          </div>
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-3 animate-fade-in-up md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              
              {/* アイコン */}
              {msg.role === 'model' && (
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-2 rounded-full text-white shadow-md flex-none mt-1">
                  <Cpu className="w-5 h-5" />
                </div>
              )}
              
              {/* 吹き出し */}
              <div 
                className={`max-w-[85%] md:max-w-[75%] p-4 rounded-2xl md:rounded-3xl shadow-sm text-sm md:text-base font-bold leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-slate-900 text-white rounded-tr-none' 
                    : 'bg-white text-slate-800 border-2 border-blue-50 rounded-tl-none'
                }`}
              >
                {msg.content}
              </div>

            </div>
          ))}
          <div className="h-4"></div>
        </div>
      )}

      {/* 検索中のローディングインジケーター */}
      {isSearching && (
        <div className="flex flex-col items-center justify-center mt-12 text-blue-600 bg-white px-8 py-6 rounded-3xl shadow-sm border border-blue-100">
          <Loader2 className="h-10 w-10 animate-spin mb-3" />
          <p className="font-bold text-lg">AIとカタログを同期中...</p>
        </div>
      )}

      {/* 検索結果（カード型グリッド） */}
      {result && !isSearching && (
        <div className="w-full max-w-7xl animate-fade-in-up">

          {/* AI推論エラーまたは通常メッセージ等 (AI提案がなかった場合のフォールバック表示) */}
          {result.source === 'ai-translated' && !result.aiProposal && (
            <div className="mb-8 p-5 md:p-6 rounded-2xl bg-white border-l-8 border-purple-500 shadow-md">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
                  <Cpu className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-800 mb-1">AIからの推論結果</h3>
                  <p className="text-slate-600 font-bold text-base md:text-lg leading-relaxed">
                    {result.message}
                  </p>
                </div>
              </div>
            </div>
          )}


          {/* グリッドレイアウト（モバイルで見やすく、タップ領域大） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {result.materials.map((m) => {
              const isLowConfidence = m.confidence !== undefined && m.confidence < 80;
              const isSelected = cartItems.some(selected => selected.material?.id === m.id);
              const hasDimensions = m.width_mm || m.height_mm || m.depth_mm;
              
              return (
                <div 
                  key={m.id} 
                  onClick={() => toggleMaterialSelection(m)}
                  className={`bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col relative group cursor-pointer border-4 ${isSelected ? 'border-blue-500' : 'border-transparent'}`}
                >
                  
                  {/* 選択済みチェックマーク */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-1 z-20 shadow-md">
                      <CheckCircle2 className="w-5 h-5" />
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
                  <div className="h-40 bg-slate-50 flex items-center justify-center p-4 border-b-2 border-slate-100">
                    {m.image_url ? (
                      <img 
                        src={m.image_url} 
                        alt={m.name} 
                        className="max-h-full max-w-full object-contain mix-blend-multiply drop-shadow-sm" 
                        onError={(e) => {
                          e.currentTarget.onerror = null; // Prevent infinite loops
                          e.currentTarget.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E`;
                          e.currentTarget.className = "w-12 h-12 opacity-50";
                        }}
                      />
                    ) : (
                      <div className="text-slate-300 flex flex-col items-center">
                        <ImagePlus className="w-10 h-10 mb-2 opacity-50" />
                        <span className="font-bold text-xs">画像なし</span>
                      </div>
                    )}
                  </div>

                  {/* 情報エリア */}
                  <div className="p-4 flex-1 flex flex-col">
                    <span className="text-xs font-black text-blue-600 mb-1 truncate">
                      {m.manufacturers?.name || '不明なメーカー'}
                    </span>
                    <h4 className="text-lg font-black text-slate-900 mb-2 leading-tight line-clamp-2">
                      <HighlightText text={m.name || ''} splitQuery={query} />
                    </h4>
                    
                    {/* 型番ラベル */}
                    <div className="bg-slate-800 text-white font-mono font-bold px-2.5 py-1 rounded-md w-fit mb-3 text-sm shadow-inner">
                      <HighlightText text={m.model_number || ''} splitQuery={query} />
                    </div>
                    
                    {/* 寸法・価格情報 */}
                    <div className="bg-slate-50 rounded-xl p-3 mt-auto border border-slate-100">
                      {hasDimensions && (
                        <div className="grid grid-cols-3 gap-2 mb-2 items-end">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400">幅 (W)</span>
                            <span className="text-sm font-bold text-slate-700">{m.width_mm || '-'} <span className="text-[10px]">mm</span></span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400">高さ (H)</span>
                            <span className="text-sm font-bold text-slate-700">{m.height_mm || '-'} <span className="text-[10px]">mm</span></span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400">奥行 (D)</span>
                            <span className="text-sm font-bold text-slate-700">{m.depth_mm || '-'} <span className="text-[10px]">mm</span></span>
                          </div>
                        </div>
                      )}
                      <div className={`${hasDimensions ? 'pt-2 border-t border-slate-200 border-dashed' : ''} flex justify-between items-center`}>
                        <span className="text-xs font-black text-slate-400">標準単価</span>
                        <span className="text-lg font-black text-slate-900">
                          {m.standard_price ? `¥${m.standard_price.toLocaleString()}` : 'ASK'}
                        </span>
                      </div>
                      {/* カタログ原版リンク (ページ番号付加) */}
                      {m.catalog_url && (
                        <div className="mt-2 pt-2 border-t border-slate-200 border-dashed">
                          <button
                            type="button"
                            onClick={(e) => handleOpenCatalogViewer(m, e)}
                            className="w-full flex justify-center items-center gap-1.5 bg-white border-2 border-blue-600 text-blue-700 hover:bg-blue-50 py-1.5 rounded-lg font-black text-xs transition-colors"
                          >
                            📘 カタログビューアを開く {m.grouped_pages && m.grouped_pages.length > 1 ? <span className="opacity-70 text-[10px]">({m.grouped_pages.length}P抜粋)</span> : (m.page_number && <span className="opacity-70 text-[10px]">({m.page_number}P)</span>)}
                          </button>
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

      {/* サブモーダル: カタログビューア */}
      {isCatalogViewerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <div className="text-xs font-bold text-blue-600 mb-0.5">{catalogViewerMfg}</div>
                <h3 className="text-lg font-black text-slate-800">{catalogViewerTitle}</h3>
              </div>
              <button
                onClick={() => setIsCatalogViewerOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex bg-slate-100/50">
              {catalogViewerMode === 'loading' && (
                <div className="m-auto flex flex-col items-center justify-center text-slate-400 gap-3 w-full">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="font-bold">カタログ情報を取得中...</p>
                </div>
              )}
              
              {catalogViewerMode === 'error' && (
                <div className="m-auto flex flex-col items-center justify-center text-red-400 gap-3 w-full">
                  <AlertTriangle className="w-8 h-8" />
                  <p className="font-bold">プレビューの読み込みに失敗しました。</p>
                </div>
              )}

              {catalogViewerMode === 'ready' && catalogViewerPages.map((page, idx) => {
                let imgUrl = '';
                
                if (page.page_image_url) {
                   imgUrl = page.page_image_url;
                } else if (page.drive_file_id) {
                   imgUrl = `https://drive.google.com/thumbnail?id=${page.drive_file_id}&sz=w800`;
                }

                const pdfUrl = page.pdf_drive_file_id 
                    ? `https://drive.google.com/uc?export=download&id=${page.pdf_drive_file_id}`
                    : page.catalog_url;

                const isPdfMode = catalogViewerPdfModeIndex === idx;

                return (
                  <div key={idx} className="shrink-0 w-full snap-center h-full flex flex-col items-center relative p-4 pb-20">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
                      <div className="bg-slate-800 text-white px-4 py-2 text-sm font-bold flex justify-between items-center shrink-0">
                        <span>PAGE {page.page_number}</span>
                      </div>
                      <div className="p-0 flex-1 flex justify-center bg-slate-50 relative overflow-auto">
                        
                        {!isPdfMode ? (
                          imgUrl ? (
                             <img 
                                src={imgUrl} 
                                alt={`カタログ ページ ${page.page_number}`}
                                className="w-full h-auto object-contain shadow-sm border border-slate-200 mx-auto"
                                loading="lazy"
                             />
                          ) : (
                             <div className="flex flex-col items-center justify-center text-slate-400 py-10 gap-3 w-full h-full absolute inset-0">
                                <ImagePlus className="w-8 h-8 opacity-50" />
                                <span className="text-sm font-bold">画像準備中</span>
                                {page.catalog_url && (
                                    <a 
                                      href={page.catalog_url} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="mt-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-100 transition-colors pointer-events-auto"
                                    >
                                      PDF原本を開く
                                    </a>
                                )}
                             </div>
                          )
                        ) : (
                          // PDF Mode
                          <div className="w-full h-full flex flex-col items-center p-2">
                             {pdfUrl ? (
                               <Document 
                                 file={pdfUrl}
                                 loading={<div className="p-8 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />PDF読込中...</div>}
                                 error={<div className="p-8 text-red-500">PDFの読み込みに失敗しました</div>}
                               >
                                  <Page 
                                    className="shadow-md border border-slate-200" 
                                    pageNumber={1} 
                                    renderTextLayer={true} 
                                    renderAnnotationLayer={false} 
                                    width={typeof window !== 'undefined' ? Math.min(window.innerWidth - 48, 600) : 600} 
                                  />
                               </Document>
                             ) : (
                                <div className="p-8 text-red-500">PDFファイルのURLが見つかりません</div>
                             )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Floating Action Button for Copying Text */}
                    <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10">
                       <button
                         onClick={() => setCatalogViewerPdfModeIndex(isPdfMode ? null : idx)}
                         className={`shadow-xl px-6 py-4 rounded-full font-black text-sm md:text-base flex items-center justify-center gap-3 transition-all active:scale-95 border-4 ${
                            isPdfMode 
                            ? 'bg-slate-800 hover:bg-slate-900 border-slate-700 text-white shadow-slate-900/30' 
                            : 'bg-blue-600 hover:bg-blue-700 border-white/20 text-white shadow-blue-600/30'
                         }`}
                       >
                         {isPdfMode ? (
                           <>
                              <ImagePlus className="w-5 h-5" />
                              見やすい画像ビューワーに戻る
                           </>
                         ) : (
                           <>
                              <FileText className="w-5 h-5" />
                              📄 このページの文字をコピーする
                           </>
                         )}
                       </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
