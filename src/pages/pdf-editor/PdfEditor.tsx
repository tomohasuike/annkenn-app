import { v4 as uuidv4 } from 'uuid';
import React, { useState, useCallback, useRef, useEffect } from 'react';
const EMPTY_ARRAY: any[] = [];
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Sidebar, ZoomIn, ZoomOut, MousePointer2, PenLine, Type, Square, Info, ChevronDown, Upload, Eraser, RotateCcw, Trash2, Undo2, Redo2, Pencil, Plus, Shapes, Slash, MoveUpRight, AppWindow, Circle, MessageSquare, Star, Hexagon, Download, Cloud, Hand, Folder, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import PdfDrawingOverlay from './PdfDrawingOverlay';
import { ColorPickerDropdown } from './ColorPickerDropdown';
import TextToolbar from './TextToolbar';
import type { Annotation, ToolType, ShapeType } from './PdfDrawingOverlay';
import { PDFDocument, degrees } from 'pdf-lib';
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useInView } from 'react-intersection-observer';
import Konva from 'konva';

if (typeof document !== 'undefined' && !document.getElementById('force-grabbing-style')) {
  const style = document.createElement('style');
  style.id = 'force-grabbing-style';
  style.innerHTML = `
    .force-grabbing-cursor, .force-grabbing-cursor * {
      cursor: grabbing !important;
    }
  `;
  document.head.appendChild(style);
}

// Memoized PDF preview child to prevent extreme re-rendering during drag transforms
const PDFThumbnail = React.memo(({ pageId, rotation, onInitRotation }: { pageId: string, rotation?: number, onInitRotation?: (id: string, rot: number) => void }) => {
    const { ref, inView } = useInView({
        triggerOnce: true,
        rootMargin: '400px 0px',
    });

    const isLandscape = (rotation || 0) % 180 !== 0;
    const placeholderHeight = isLandscape ? 60 : 120;

    // Retina/高DPI対応: 最低でも2倍のピクセル密度を担保して鮮明に描画する
    const dpr = Math.max(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

    return (
        <div ref={ref} className="w-[85px] flex items-center justify-center bg-white transition-all duration-200" style={{ minHeight: inView ? 'auto' : placeholderHeight }}>
            {inView ? (
                <Page 
                    pageNumber={typeof pageId === 'string' ? parseInt(pageId.split('-')[1]) : pageId} 
                    width={85} 
                    devicePixelRatio={dpr}
                    renderTextLayer={false} 
                    renderAnnotationLayer={false} 
                    rotate={rotation}
                    onLoadSuccess={(page) => {
                        if (onInitRotation) onInitRotation(pageId, page.rotate || 0);
                    }}
                    className="pointer-events-none select-none bg-white"
                />
            ) : null}
        </div>
    );
});

// Main Page Component for Continuous Scrolling View
const MainPage = React.memo(({ 
    pageId, 
    rotation, 
    annotations, 
    setAnnotations,
    activeTool,
    activeShapeType,
    activeColor,
    activeFillColor,
    activeStrokeWidth,
    onVisible,
    onHistorySave,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    setActiveTool,
    stageRef,
    onInitRotation,
    zoomScale = 1
}: any) => {
    const { ref: inViewRef, inView } = useInView({
        rootMargin: '1000px 0px',
    });
    
    const { ref: visibleRef } = useInView({
        threshold: 0.51,
        onChange: (inView) => {
            if (inView) onVisible(pageId);
        }
    });

    const [pageSize, setPageSize] = useState({width:0, height:0});

    const setRefs = useCallback((node: any) => {
        inViewRef(node);
        visibleRef(node);
    }, [inViewRef, visibleRef]);

    const isLandscape = (rotation || 0) % 180 !== 0;
    const placeholderHeight = isLandscape ? 565 : 1131;

    const currentMinHeight = pageSize.height > 0 ? pageSize.height : placeholderHeight;

    // Retina/高DPI対応: Canvas自体の解像度を上げて鮮明に表示する（見た目のサイズや座標計算は維持）
    const baseDpr = Math.max(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);
    const dpr = baseDpr * Math.max(1, zoomScale); // ズーム倍率を掛けてさらに高画質化

    return (
        <div ref={setRefs} className="relative shadow-md bg-white mb-6 flex flex-col items-center shrink-0 transition-transform duration-200 scroll-mt-8" style={{ width: 800, minHeight: currentMinHeight }}>
            {inView ? (
                <>
                    <Page 
                        pageNumber={typeof pageId === 'string' ? parseInt(pageId.split('-')[1]) : pageId} 
                        renderTextLayer={true} 
                        renderAnnotationLayer={false}
                        rotate={rotation}
                        width={800}
                        devicePixelRatio={dpr}
                        onLoadSuccess={(page) => {
                            if (onInitRotation) onInitRotation(pageId, page.rotate || 0);
                            setPageSize({ width: 800, height: page.getViewport({ scale: 800 / page.getViewport({ scale: 1 }).width }).height });
                        }}
                    />
                    {pageSize.width > 0 && pageSize.height > 0 && (
                        <PdfDrawingOverlay selectedIds={selectedAnnotationIds} setSelectedIds={setSelectedAnnotationIds} 
                            width={pageSize.width}
                            height={pageSize.height}
                            tool={activeTool}
                            shapeType={activeShapeType}
                            color={activeColor}
                            fillColor={activeFillColor}
                            strokeWidth={activeStrokeWidth}
                            annotations={annotations}
                            setAnnotations={setAnnotations}
                            onHistorySave={onHistorySave}
                            setActiveTool={setActiveTool}
                            stageRef={stageRef}
                        />
                    )}
                </>
            ) : <div className="flex-1 w-full h-full flex items-center justify-center text-gray-300">Loading...</div>}
        </div>
    );
});

// Sortable Thumbnail Component
function SortableThumbnail({ id, index, isActive, isSelected, onSelect, rotation, onInitRotation }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(id) });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };
    
    return (
        <div 
            ref={setNodeRef} style={style} {...attributes} {...listeners}
            className="flex flex-col items-center cursor-pointer mb-2 w-[101px] mx-auto outline-none group"
            onClick={(e) => onSelect(id, e)}
        >
            <div className={`flex flex-col w-full transition-all duration-200 ${
                isSelected 
                    ? 'bg-blue-600 p-[6px] rounded-xl shadow-sm' 
                    : (isActive ? 'bg-gray-300/70 p-[6px] rounded-xl' : 'bg-transparent p-[6px] rounded-xl group-hover:bg-gray-200/50')
            }`}>
                <div className={`flex items-center justify-center bg-white overflow-hidden transition-all duration-200 mx-auto ${
                    isSelected ? 'rounded-[3px]' : 'rounded-[3px] shadow-sm border border-gray-300'
                }`}>
                    <PDFThumbnail pageId={id} rotation={rotation} onInitRotation={onInitRotation} />
                </div>
                <div className="flex items-center justify-center pt-1">
                    <span className={`text-[10px] leading-none font-bold select-none ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                        {index + 1}
                    </span>
                </div>
            </div>
        </div>
    );
}

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDF_OPTIONS = { cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`, cMapPacked: true };

function OverlayThumbnail({ id, rotation }: { id: string, rotation?: number }) {
    return (
        <div className="flex flex-col items-center cursor-grabbing py-2 px-1 rounded-md w-[110px] mx-auto scale-105 opacity-95">
            <div className="overflow-hidden rounded-sm shadow-2xl border-2 border-blue-400 flex items-center justify-center bg-white">
                <PDFThumbnail pageId={id} rotation={rotation} />
            </div>
        </div>
    );
}

export default function PdfEditor() {
  const [files, setFiles] = useState<File[]>([]);
  const [filePageCounts, setFilePageCounts] = useState<number[]>([]);
  const [pageNumber, setPageNumber] = useState<string>("0-1");
  const [isExporting, setIsExporting] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isOpenMenuOpen, setIsOpenMenuOpen] = useState(false);
  const [isDriveSaveMenuOpen, setIsDriveSaveMenuOpen] = useState(false);
  const [isExtractMenuOpen, setIsExtractMenuOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [fileNameModal, setFileNameModal] = useState<{isOpen: boolean, defaultName: string, onConfirm: (name: string) => void} | null>(null);
  const [tempFileName, setTempFileName] = useState('');

  const stageRefs = useRef<Record<string, Konva.Stage | null>>({});

  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [isGoogleApiLoaded, setIsGoogleApiLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);

  useEffect(() => {
      const loadGoogleApi = () => {
          const script1 = document.createElement('script');
          script1.src = 'https://apis.google.com/js/api.js';
          script1.onload = () => {
              (window as any).gapi.load('client:picker', () => {
                  (window as any).gapi.client.load('drive', 'v3');
                  setIsGoogleApiLoaded(true);
              });
          };
          document.body.appendChild(script1);

          const script2 = document.createElement('script');
          script2.src = 'https://accounts.google.com/gsi/client';
          script2.onload = () => {
              const client = (window as any).google.accounts.oauth2.initTokenClient({
                  client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
                  scope: 'https://www.googleapis.com/auth/drive',
                  callback: '', 
              });
              setTokenClient(client);
          };
          document.body.appendChild(script2);
      };
      
      if (!(window as any).gapi && !(window as any).google) {
          loadGoogleApi();
      } else {
          setIsGoogleApiLoaded(true);
      }
  }, []);

  const loadProjectDataFromDrive = async (fileId: string, accessToken: string) => {
      try {
          toast.loading('裏側の図形データを検索しています...', { id: 'load-json' });
          const jsonFileName = `${fileId}_data.json`;
          
          // ★エンコードと必須パラメータ(includeItemsFromAllDrives, orderBy)を追加
          const query = `name='${jsonFileName}' and trashed=false`;
          const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime desc`;
          
          const searchRes = await fetch(searchUrl, {
              headers: { Authorization: `Bearer ${accessToken}` }
          });
          const searchData = await searchRes.json();
          
          if (searchData.files && searchData.files.length > 0) {
              const jsonFileId = searchData.files[0].id;
              const dataRes = await fetch(`https://www.googleapis.com/drive/v3/files/${jsonFileId}?alt=media&supportsAllDrives=true`, {
                  headers: { Authorization: `Bearer ${accessToken}` }
              });
              const projectData = await dataRes.json();
              
              // 確実に最新の状態としてセットする
              if (projectData.pageAnnotations) {
                  setPageAnnotations(projectData.pageAnnotations);
                  pageAnnotationsRef.current = projectData.pageAnnotations; // Refも即座に更新
              }
              if (projectData.pageRotations) setPageRotations(projectData.pageRotations);
              if (projectData.filePageCounts && projectData.filePageCounts.length > 0) setFilePageCounts(projectData.filePageCounts);
              if (projectData.pageOrder && projectData.pageOrder.length > 0) {
                  setPageOrder(projectData.pageOrder);
              }
              
              toast.success('図形データを復元しました！', { id: 'load-json' });
          } else {
              toast.error('保存された図形データが見つかりませんでした', { id: 'load-json' });
          }
      } catch (e) {
          console.error('Failed to load project data', e);
          toast.error('図形データの読み込みに失敗しました', { id: 'load-json' });
      }
  };

  const performDriveOpenById = (fileIdToLoad: string) => {
      if (!tokenClient || !isGoogleApiLoaded) return;
      
      tokenClient.callback = async (response: any) => {
          if (response.error !== undefined) {
              console.error(response);
              toast.error('Google Drive認証に失敗しました');
              return;
          }
          
          try {
              setIsMerging(true);
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdToLoad}?fields=id,name,parents&supportsAllDrives=true`, {
                  headers: { Authorization: `Bearer ${response.access_token}` }
              });
              if (!res.ok) throw new Error('Failed to fetch file metadata');
              const metadata = await res.json();
              const parentId = metadata.parents && metadata.parents.length > 0 ? metadata.parents[0] : null;
              
              const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdToLoad}?alt=media&supportsAllDrives=true`, {
                  headers: { Authorization: `Bearer ${response.access_token}` }
              });
              if (!fileRes.ok) throw new Error('Failed to download file data');
              const blob = await fileRes.blob();
              const downloadedFile = new File([blob], metadata.name, { type: 'application/pdf' });
              (downloadedFile as any).fileId = fileIdToLoad;
              (downloadedFile as any).parentId = parentId;
              
              setFiles([downloadedFile]);
              setDriveFileId(fileIdToLoad);
              setPageAnnotations({});
              setFilePageCounts([]);
              setPageOrder([]);
              setPast([]);
              setFuture([]);
              await loadProjectDataFromDrive(fileIdToLoad, response.access_token);
              
              toast.success('ドライブからファイルを読み込みました');
          } catch (e) {
              console.error(e);
              toast.error('ドライブからのファイル読み込みに失敗しました');
          } finally {
              setIsMerging(false);
          }
      };
      tokenClient.requestAccessToken({prompt: ''});
  };

  useEffect(() => {
      // APIロード完了前なら何もしないで待つ
      if (!isGoogleApiLoaded || !tokenClient) return;

      const urlParams = new URLSearchParams(window.location.search);
      const stateParam = urlParams.get('state');
      
      if (stateParam && !isMerging && files.length === 0) {
          try {
              const state = JSON.parse(stateParam);
              if (state.action === 'open' && state.ids && state.ids.length > 0) {
                  const targetFileId = state.ids[0];
                  
                  // URLからパラメータを消去し、リロード時の無限ループ（再発火）を防ぐ
                  window.history.replaceState({}, document.title, window.location.pathname);
                  
                  // ★ ここで既存のドライブ読み込み関数（対象のファイルIDを渡す）を呼び出す
                  performDriveOpenById(targetFileId);
              }
          } catch (e) {
              console.error('Drive state parameterの解析に失敗しました:', e);
          }
      }
  }, [isGoogleApiLoaded, tokenClient, isMerging, files.length]);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeShapeType] = useState<ShapeType>('rect');
  const [activeColor, setActiveColor] = useState<string>('#ef4444');
  const [activeFillColor, setActiveFillColor] = useState<string>('transparent');
  const [activeStrokeWidth, setActiveStrokeWidth] = useState<number>(3);
  
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  
  const [activeFontFamily, setActiveFontFamily] = useState<string>('Helvetica');
  const [activeFontSize, setActiveFontSize] = useState<number>(24);
  const [activeFontStyle, setActiveFontStyle] = useState<string>('normal');
  const [activeTextDecoration, setActiveTextDecoration] = useState<string>('none');
  const [activeTextAlign, setActiveTextAlign] = useState<string>('left');
  const [activeTextFill, setActiveTextFill] = useState<string>('#ef4444');
  const [activeTextStroke, setActiveTextStroke] = useState<string>('transparent');
  const [activeTextStrokeWidth, setActiveTextStrokeWidth] = useState<number>(0);
  const [activeTextBackgroundFill, setActiveTextBackgroundFill] = useState<string>('transparent');
  const [activeTextBackgroundStroke, setActiveTextBackgroundStroke] = useState<string>('transparent');
  const [activeTextBackgroundStrokeWidth, setActiveTextBackgroundStrokeWidth] = useState<number>(0);
  const [isMarkupToolbarVisible, setIsMarkupToolbarVisible] = useState(false);
  const [scale, setScale] = useState<number>(1);
  const scaleRef = useRef<number>(1);
  const [pageRotations, setPageRotations] = useState<Record<string, number>>({});

  const headerRef = useRef<HTMLElement>(null);
  
  const toggleMenu = useCallback((menu: 'open' | 'add' | 'save' | 'extract' | 'info') => {
      setIsOpenMenuOpen(menu === 'open' ? !isOpenMenuOpen : false);
      setIsAddMenuOpen(menu === 'add' ? !isAddMenuOpen : false);
      setIsDriveSaveMenuOpen(menu === 'save' ? !isDriveSaveMenuOpen : false);
      setIsExtractMenuOpen(menu === 'extract' ? !isExtractMenuOpen : false);
      setIsInfoOpen(menu === 'info' ? !isInfoOpen : false);
  }, [isOpenMenuOpen, isAddMenuOpen, isDriveSaveMenuOpen, isExtractMenuOpen, isInfoOpen]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
              setIsOpenMenuOpen(false);
              setIsAddMenuOpen(false);
              setIsDriveSaveMenuOpen(false);
              setIsExtractMenuOpen(false);
              setIsInfoOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleInitRotation = useCallback((pageId: string, nativeRotation: number) => {
      setPageRotations(prev => {
          // 既にユーザーが回転させている、または初期化済みの場合は何もしない
          if (prev[pageId] !== undefined) return prev;
          return { ...prev, [pageId]: nativeRotation };
      });
  }, []);

  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [pageOrder, setPageOrder] = useState<string[]>([]);
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);

  type HistoryState = {
      pageOrder: string[];
      pageRotations: Record<string, number>;
      pageAnnotations: Record<string, Annotation[]>;
  };

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const currentStateRef = useRef<HistoryState>({ pageOrder: [], pageRotations: {}, pageAnnotations: {} });
  const mainScrollRef = useRef<HTMLElement>(null);
  const docWrapperRef = useRef<HTMLDivElement>(null);

  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const panStartCoordsRef = useRef({ x: 0, y: 0 });
  const panStartScrollRef = useRef({ left: 0, top: 0 });

  useEffect(() => {
    scaleRef.current = scale;
    if (docWrapperRef.current) {
      docWrapperRef.current.style.transform = `scale(${scale})`;
    }
  }, [scale]);
  
  const [pageAnnotations, setPageAnnotations] = useState<Record<string, Annotation[]>>({});
  const pageAnnotationsRef = useRef<Record<string, Annotation[]>>({});
  useEffect(() => {
      pageAnnotationsRef.current = pageAnnotations;
  }, [pageAnnotations]);
  
  const isTextMode = activeTool === 'text' || (selectedAnnotationIds.length > 0 && selectedAnnotationIds.every(id => {
      let isText = false;
      Object.values(pageAnnotations).forEach(anns => {
          if (anns.some(a => a.id === id && a.type === 'text')) isText = true;
      });
      return isText;
  }));
  
  useEffect(() => {
      currentStateRef.current = { pageOrder, pageRotations, pageAnnotations };
  }, [pageOrder, pageRotations, pageAnnotations]);

  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault(); 

      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (delta === 0) return;

      const zoomChange = delta < 0 ? 0.08 : -0.08;

      let prevZoom = scaleRef.current;
      const newZoom = Math.min(Math.max(prevZoom + zoomChange, 0.5), 5.0);
      if (newZoom === prevZoom) return;

      if (mainScrollRef.current && docWrapperRef.current) {
          const container = mainScrollRef.current;
          const rect = container.getBoundingClientRect();
          
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          
          const unscaledX = (container.scrollLeft + mouseX) / prevZoom;
          const unscaledY = (container.scrollTop + mouseY) / prevZoom;

          docWrapperRef.current.style.transform = `scale(${newZoom})`;
          container.scrollLeft = unscaledX * newZoom - mouseX;
          container.scrollTop = unscaledY * newZoom - mouseY;

          scaleRef.current = newZoom;

          clearTimeout((window as any)._zoomTimeout);
          (window as any)._zoomTimeout = setTimeout(() => {
              setScale(newZoom);
          }, 150);
      }
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener('wheel', handleGlobalWheel, { capture: true });
    };
  }, []);

  const handleMainMouseDown = (e: React.MouseEvent) => {
      if (activeTool !== 'view') return;
      isPanningRef.current = true;
      setIsPanning(true);
      document.body.style.cursor = 'grabbing';
      document.body.classList.add('force-grabbing-cursor');
      panStartCoordsRef.current = { x: e.clientX, y: e.clientY };
      if (mainScrollRef.current) {
          panStartScrollRef.current = { 
              left: mainScrollRef.current.scrollLeft, 
              top: mainScrollRef.current.scrollTop 
          };
      }
  };

  const handleMainMouseMove = (e: React.MouseEvent) => {
      if (!isPanningRef.current || activeTool !== 'view') return;
      if (mainScrollRef.current) {
          const dx = e.clientX - panStartCoordsRef.current.x;
          const dy = e.clientY - panStartCoordsRef.current.y;
          mainScrollRef.current.scrollLeft = panStartScrollRef.current.left - dx;
          mainScrollRef.current.scrollTop = panStartScrollRef.current.top - dy;
      }
  };

  const handleMainMouseUp = () => {
      if (isPanningRef.current) {
          isPanningRef.current = false;
          setIsPanning(false);
      }
      document.body.classList.remove('force-grabbing-cursor');
      if (activeTool === 'view') {
          document.body.style.cursor = 'grab';
      } else {
          document.body.style.cursor = '';
      }
  };

  const saveHistory = useCallback(() => {
      setPast(prev => {
          const snapshot = JSON.parse(JSON.stringify(currentStateRef.current));
          return [...prev, snapshot].slice(-50);
      });
      setFuture([]);
  }, []);

  const handleColorChange = useCallback((newColor: string, isFill: boolean) => {
      if (isFill) {
          setActiveFillColor(newColor);
      } else {
          setActiveColor(newColor);
      }
      
      if (selectedAnnotationIds.length > 0) {
          saveHistory();
          setPageAnnotations(prev => {
              const nextAnnotations = { ...prev };
              let hasAnyChanges = false;
              Object.keys(nextAnnotations).forEach(pId => {
                  let pageChanged = false;
                  const newAnns = nextAnnotations[pId as any].map((a: any) => {
                      if (selectedAnnotationIds.includes(a.id)) {
                          pageChanged = true;
                          hasAnyChanges = true;
                          const safeColor = newColor === '#ef4444' ? '#ef4444' : (newColor === 'transparent' ? 'transparent' : newColor);
                          return isFill ? { ...a, fillColor: safeColor } : { ...a, color: safeColor };                      }
                      return a;
                  });
                  if (pageChanged) {
                      nextAnnotations[pId as any] = newAnns;
                  }
              });
              return hasAnyChanges ? nextAnnotations : prev;
          });
      }
  }, [selectedAnnotationIds, saveHistory]);

  const handleStrokeWidthChange = useCallback((newWidth: number) => {
      setActiveStrokeWidth(newWidth);
      if (selectedAnnotationIds.length > 0) {
          saveHistory();
          setPageAnnotations(prev => {
              const nextAnnotations = { ...prev };
              let hasAnyChanges = false;
              Object.keys(nextAnnotations).forEach(pId => {
                  let pageChanged = false;
                  const newAnns = nextAnnotations[pId as any].map((a: any) => {
                      if (selectedAnnotationIds.includes(a.id)) {
                          pageChanged = true;
                          hasAnyChanges = true;
                          return { ...a, strokeWidth: Number(newWidth) || 0 };
                      }
                      return a;
                  });
                  if (pageChanged) {
                      nextAnnotations[pId as any] = newAnns;
                  }
              });
              return hasAnyChanges ? nextAnnotations : prev;
          });
      }
  }, [selectedAnnotationIds, saveHistory]);

  const handleTextPropertyChange = useCallback((prop: string, value: any) => {
      if (prop === 'fontFamily') setActiveFontFamily(value);
      if (prop === 'fontSize') setActiveFontSize(value);
      if (prop === 'fontStyle') setActiveFontStyle(value);
      if (prop === 'textDecoration') setActiveTextDecoration(value);
      if (prop === 'textAlign') setActiveTextAlign(value);
      if (prop === 'textFill') setActiveTextFill(value);
      if (prop === 'textStroke') setActiveTextStroke(value);
      if (prop === 'textStrokeWidth') setActiveTextStrokeWidth(value);
      if (prop === 'fill') setActiveTextBackgroundFill(value);
      if (prop === 'stroke') setActiveTextBackgroundStroke(value);
      if (prop === 'strokeWidth') setActiveTextBackgroundStrokeWidth(value);

      if (selectedAnnotationIds.length > 0) {
          saveHistory();
          setPageAnnotations(prev => {
              const nextAnnotations = { ...prev };
              let hasAnyChanges = false;
              Object.keys(nextAnnotations).forEach(pId => {
                  let pageChanged = false;
                  const newAnns = nextAnnotations[pId as any].map((a: any) => {
                      if (selectedAnnotationIds.includes(a.id) && a.type === 'text') {
                          pageChanged = true;
                          hasAnyChanges = true;
                          const actualProp = prop === 'textAlign' ? 'align' : prop;
                          let finalValue = value;
                          if (actualProp === 'strokeWidth' || actualProp === 'textStrokeWidth' || actualProp === 'fontSize') {
                              finalValue = Number(value) || 0;
                          }
                          
                          if (value === '#ef4444') finalValue = '#ef4444';
                          if (value === 'transparent') finalValue = 'transparent';

                          return { ...a, [actualProp]: finalValue };
                      }
                      return a;
                  });
                  if (pageChanged) {
                      nextAnnotations[pId as any] = newAnns;
                  }
              });
              return hasAnyChanges ? nextAnnotations : prev;
          });
      }
  }, [selectedAnnotationIds, saveHistory]);

  const handleUndo = useCallback(() => {
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      
      setFuture(prev => [JSON.parse(JSON.stringify(currentStateRef.current)), ...prev]);
      setPast(newPast);
      
      setPageOrder(previous.pageOrder);
      setPageRotations(previous.pageRotations);
      setPageAnnotations(previous.pageAnnotations);
      setSelectedPages([]);
  }, [past]);

  const handleRedo = useCallback(() => {
      if (future.length === 0) return;
      const next = future[0];
      const newFuture = future.slice(1);
      
      setPast(prev => [...prev, JSON.parse(JSON.stringify(currentStateRef.current))]);
      setFuture(newFuture);
      
      setPageOrder(next.pageOrder);
      setPageRotations(next.pageRotations);
      setPageAnnotations(next.pageAnnotations);
      setSelectedPages([]);
  }, [future]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      saveHistory();
      setPageOrder((items) => {
        const oldIndex = items.findIndex(x => String(x) === String(active.id));
        const newIndex = items.findIndex(x => String(x) === String(over.id));
        if (oldIndex !== -1 && newIndex !== -1) {
            return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }
  };
  
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<any>(null);
  const mainPageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
          setIsDraggingOver(true);
      }
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
          setIsDraggingOver(false);
      }
  };
  
  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDraggingOver(false);
      
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length === 0) return;
      
      const droppedFile = droppedFiles[0];
      if (droppedFile.type !== 'application/pdf') {
          alert("PDFファイルのみ追加可能です。");
          return;
      }
      
      if (files.length === 0) {
          onFileChange({ target: { files: [droppedFile] } } as unknown as React.ChangeEvent<HTMLInputElement>);
      } else {
          await performMerge(droppedFile);
      }
  };

  const handleThumbnailClick = (clickedId: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
        setSelectedPages(prev => {
            if (prev.includes(clickedId)) {
                return prev.filter(id => id !== clickedId);
            }
            return [...prev, clickedId];
        });
        setPageNumber(clickedId);
    } else if (e.shiftKey) {
        const startIdx = pageOrder.findIndex(p => p === pageNumber);
        const endIdx = pageOrder.findIndex(p => p === clickedId);
        if (startIdx !== -1 && endIdx !== -1) {
            const min = Math.min(startIdx, endIdx);
            const max = Math.max(startIdx, endIdx);
            const range = pageOrder.slice(min, max + 1);
            setSelectedPages(prev => Array.from(new Set([...prev, ...range])));
        }
        setPageNumber(clickedId);
    } else {
        setSelectedPages([clickedId]);
        setPageNumber(clickedId);
    }

    isProgrammaticScroll.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    
    mainPageRefs.current[clickedId]?.scrollIntoView({ behavior: 'auto', block: 'start' });
    
    scrollTimeout.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
    }, 350);
  };

  const handleRotate = () => {
      if (selectedPages.length === 0) return;
      saveHistory();
      setPageRotations(prev => {
          const next = { ...prev };
          const targets = selectedPages.length > 0 ? selectedPages : [pageNumber];
          targets.forEach(id => {
              const current = next[id] || 0;
              next[id] = (current - 90) % 360;
          });
          return next;
      });
  };

  const handleDeleteSelectedPages = useCallback(() => {
      const targets = selectedPages.length > 0 ? selectedPages : [pageNumber];
      
      const newOrder = pageOrder.filter(id => !targets.includes(id));
      if (newOrder.length === 0) {
          alert("最後の1ページは削除できません。");
          return;
      }

      saveHistory();
      setPageOrder(newOrder);

      setPageRotations(prev => {
          const next = { ...prev };
          targets.forEach(t => delete next[t]);
          return next;
      });
      setPageAnnotations(prev => {
          const next = { ...prev };
          targets.forEach(t => delete next[t]);
          return next;
      });

      if (targets.includes(pageNumber)) {
          const deleteIdx = pageOrder.findIndex(p => p === pageNumber);
          let newActive = newOrder[deleteIdx];
          if (!newActive) {
              newActive = newOrder[newOrder.length - 1]; 
          }
          setPageNumber(newActive);
          setSelectedPages([newActive]);
      } else {
          setSelectedPages(prev => prev.filter(id => !targets.includes(id)));
      }
  }, [selectedPages, pageNumber, pageOrder, saveHistory]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

          if (e.key === 'Backspace' || e.key === 'Delete') {
              if (selectedAnnotationIds && selectedAnnotationIds.length > 0) {
                  e.preventDefault();
                  saveHistory();
                  setPageAnnotations(prev => {
                      const newAnns = { ...prev };
                      Object.keys(newAnns).forEach(pId => {
                          newAnns[pId] = newAnns[pId].filter(a => !selectedAnnotationIds.includes(a.id));
                      });
                      return newAnns;
                  });
                  setSelectedAnnotationIds([]);
                  return;
              }
              
              if (selectedPages.length > 0 && pageOrder.length > 1) {
                  e.preventDefault();
                  handleDeleteSelectedPages();
              }
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteSelectedPages, selectedPages.length, pageOrder.length, selectedAnnotationIds, saveHistory]);
  
  
  const handleInsertShape = (shape: any) => {
      saveHistory();
      const targetPage = pageNumber || (pageOrder.length > 0 ? pageOrder[0] : '0-1');
      const newId = uuidv4();

      let insertX = 300;
      let insertY = 300;
      
      let newAnn: Annotation;
      
      if (shape === 'text') {
          newAnn = {
              id: newId,
              type: 'text',
              text: 'テキスト',
              x: 300,
              y: 300,
              width: 120,
              height: 40,
              textFill: activeTextFill,
              textStroke: activeTextStroke,
              textStrokeWidth: activeTextStrokeWidth,
              fill: activeTextBackgroundFill,
              stroke: activeTextBackgroundStroke,
              strokeWidth: activeTextBackgroundStrokeWidth,
              fontSize: activeFontSize,
              fontFamily: activeFontFamily,
              fontStyle: activeFontStyle,
              textDecoration: activeTextDecoration,
              align: activeTextAlign
          } as any;
      } else {
          newAnn = {
              id: newId,
              type: 'shape',
              shapeType: shape,
              x: insertX,
              y: insertY,
              width: 100,
              height: 100,
              color: activeColor || '#ef4444',
              fillColor: activeFillColor === 'transparent' ? 'transparent' : activeFillColor,
              fill: activeFillColor === 'transparent' ? 'transparent' : activeFillColor,
              stroke: activeColor || '#ef4444',
              strokeWidth: activeStrokeWidth || 3,
              cornerRadius: shape === 'rounded_rect' ? 25 : undefined,
              innerRadius: shape === 'star' ? 25 : undefined,
              radius: shape === 'polygon' ? 50 : undefined,
              tailBase: shape === 'speech_bubble' ? 50 : undefined,
              tailTip: shape === 'speech_bubble' ? { x: 50, y: 130 } : undefined,
              tailWidth: shape === 'speech_bubble' ? 20 : undefined
          } as any;
      }
      
      setPageAnnotations(prev => {
          if (!prev) return { [targetPage]: [newAnn] } as Record<string, Annotation[]>;
          const currentAnns = prev[targetPage];
          if (!currentAnns) return { ...prev, [targetPage]: [newAnn] };
          return { ...prev, [targetPage]: [...currentAnns, newAnn] };
      });
      
      setActiveTool('select');

      setTimeout(() => {
          setSelectedAnnotationIds([newId]);
      }, 100);
  };

  const setCurrentAnnotationsForPage = useCallback((pageId: string, newAnns: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
      setPageAnnotations(prev => {
          const resolved = typeof newAnns === 'function' ? newAnns(prev[pageId] || []) : newAnns;
          return { ...prev, [pageId]: resolved };
      });
  }, []);

  const handlePageVisible = useCallback((pageId: string) => {
      if (isProgrammaticScroll.current) return;
      setPageNumber((prev) => {
          if (prev !== pageId) {
              setSelectedPages([pageId]);
              return pageId;
          }
          return prev;
      });
  }, []);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files: selectedFiles } = event.target;
    if (selectedFiles && selectedFiles[0]) {
      try {
          const originalFile = selectedFiles[0];
          const arrayBuffer = await originalFile.arrayBuffer();
          const inMemoryFile = new File([arrayBuffer], originalFile.name, { type: originalFile.type });
          
          setFiles([inMemoryFile]);
          setFilePageCounts([]);
          setPageOrder([]);
          setPageAnnotations({});
          setPast([]);
          setFuture([]);
      } catch (e) {
          console.error("Local file load error", e);
          alert("ファイルの読み込みに失敗しました。");
      }
    }
  };

  const onFileChangeMerge = async (event: React.ChangeEvent<HTMLInputElement>) => {
      setIsAddMenuOpen(false);
      const { files: selectedFiles } = event.target;
      if (selectedFiles && selectedFiles[0]) {
          await performMerge(selectedFiles[0]);
      }
  };

  const handleFileLoadSuccess = useCallback((fileIndex: number, loadedNumPages: number) => {
    setFilePageCounts(prev => {
        if (prev[fileIndex] === loadedNumPages) return prev;
        const newCounts = [...prev];
        newCounts[fileIndex] = loadedNumPages;
        return newCounts;
    });
    setPageOrder(prev => {
        const existingSet = new Set(prev);
        const newPages: string[] = [];
        for (let i = 1; i <= loadedNumPages; i++) {
             const id = `${fileIndex}-${i}`;
             if (!existingSet.has(id)) {
                 newPages.push(id);
             }
        }
        if (newPages.length > 0) {
            if (prev.length === 0) {
                setPageNumber(newPages[0]);
                setSelectedPages([newPages[0]]);
                setPageRotations({});
            }
            return [...prev, ...newPages];
        }
        return prev;
    });
    setScale(1);
  }, []);

  const generateEditedPdf = async (targetOrder: string[], isForExport: boolean = true) => {
      if (files.length === 0) throw new Error("No files");

      // 結合対応：すべての読み込み済みファイルをPDFDocumentとしてキャッシュ
      const loadedPdfs: Record<number, any> = {};
      for (let i = 0; i < files.length; i++) {
          const arrayBuffer = await files[i].arrayBuffer();
          loadedPdfs[i] = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      }

      // 空の新しいPDFを作成（ここに指定順序でページをコピーしていく）
      const newPdfDoc = await PDFDocument.create();

      for (let index = 0; index < targetOrder.length; index++) {
          const pageId = targetOrder[index];
          const parts = pageId.split('-');
          const fileIndex = parseInt(parts[0], 10);
          const originalIndex = parseInt(parts[1], 10) - 1;

          const sourcePdf = loadedPdfs[fileIndex];
          if (!sourcePdf) continue;

          // 対象のページをコピーして追加（CropBoxやRotateなどの属性はそのまま引き継がれる）
          const [copiedPage] = await newPdfDoc.copyPages(sourcePdf, [originalIndex]);
          newPdfDoc.addPage(copiedPage);

          // 1. 【UIの基準に合わせる】元の回転を無視し、UIの角度（絶対値）をセットする
          const userRotation = pageRotations[pageId] || 0;
          copiedPage.setRotation(degrees(userRotation));

          // ★ ここに isForExport の条件分岐を追加して、ローカル保存時のみ合成する
          if (isForExport) {
              // 2. 図形・テキストをPDFに合成する（前回完璧に動作したロジックを完全維持）
              const stage = stageRefs.current[pageId];
              if (stage) {
                  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
                  const img = await newPdfDoc.embedPng(dataUrl);
    
                  const crop = copiedPage.getCropBox();
    
                  const isLandscape = userRotation === 90 || userRotation === 270;
                  const imgW = isLandscape ? crop.height : crop.width;
                  const imgH = isLandscape ? crop.width : crop.height;
    
                  let drawX = crop.x;
                  let drawY = crop.y;
                  let drawRot = 0; // CCW
    
                  if (userRotation === 90) {
                      drawX = crop.x + crop.width;
                      drawY = crop.y;
                      drawRot = 90; // 90度反時計回り
                  } else if (userRotation === 180) {
                      drawX = crop.x + crop.width;
                      drawY = crop.y + crop.height;
                      drawRot = 180; // 180度反時計回り
                  } else if (userRotation === 270) {
                      drawX = crop.x;
                      drawY = crop.y + crop.height;
                      drawRot = 270; // 270度反時計回り
                  }
    
                  copiedPage.drawImage(img, {
                      x: drawX,
                      y: drawY,
                      width: imgW,
                      height: imgH,
                      rotate: degrees(drawRot),
                  });
              }
          }
      }

      return newPdfDoc;
  };

  const performMerge = async (newFile: File) => {
      setIsMerging(true);
      try {
          const arrayBuffer = await newFile.arrayBuffer();
          const inMemoryFile = new File([arrayBuffer], newFile.name, { type: newFile.type });
          setFiles(prev => [...prev, inMemoryFile]);
      } catch (e) {
          console.error("Merge error", e);
          alert("PDFの追加に失敗しました。");
      } finally {
          setIsMerging(false);
          setIsAddMenuOpen(false);
      }
  };

  const handleExportPdf = async (exportMode: 'save' | 'saveAs' | 'extract' = 'save', destination: 'local' | 'drive' = 'local') => {
    if (files.length === 0) return;
    
    try {
        const originalName = files[0]?.name || 'document.pdf';
        let defaultName = originalName;
        const baseName = originalName.replace(/\.pdf$/i, '');

        if (exportMode === 'saveAs') {
            defaultName = `${baseName}_コピー.pdf`;
        } else if (exportMode === 'extract') {
            defaultName = `${baseName}_抽出.pdf`;
        }

        let fileHandle = null;
        if (destination === 'local') {
            if ('showSaveFilePicker' in window) {
                const options = {
                    suggestedName: defaultName,
                    types: [{
                        description: 'PDF File',
                        accept: { 'application/pdf': ['.pdf'] },
                    }],
                };
                fileHandle = await (window as any).showSaveFilePicker(options);
            }
        } else if (destination === 'drive') {
            if (!tokenClient || !isGoogleApiLoaded) {
                toast.error('Google APIが利用できません');
                return;
            }

            // ★ 修正箇所：prompt をやめて自前モーダルを開く
            setTempFileName(defaultName);
            setFileNameModal({
                isOpen: true,
                defaultName: defaultName,
                onConfirm: (newName: string) => {
                    const finalName = newName.toLowerCase().endsWith('.pdf') ? newName : `${newName}.pdf`;

                    tokenClient.callback = async (response: any) => {
                        if (response.error !== undefined) {
                            toast.error('Google認証に失敗しました');
                            return;
                        }
                        const accessToken = response.access_token;
                        
                        const performDriveExport = async (targetFolderId?: string) => {
                            try {
                                setIsExporting(true);
                                const extractSelected = exportMode === 'extract';
                                const targetsToExport = extractSelected && selectedPages.length > 0 && selectedPages.length < pageOrder.length ? pageOrder.filter(id => selectedPages.includes(id)) : pageOrder;
                                
                                const newPdfDoc = await generateEditedPdf(targetsToExport, false);
                                newPdfDoc.setTitle(finalName);
                                const pdfBytes = await newPdfDoc.save();
                                const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });

                                const metadata: any = { name: finalName, mimeType: 'application/pdf' };
                                if (targetFolderId) {
                                    metadata.parents = [targetFolderId];
                                } else if ((files[0] as any)?.parentId) {
                                    metadata.parents = [(files[0] as any).parentId];
                                }

                                const formData = new FormData();
                                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                                formData.append('file', blob);

                                const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${accessToken}` },
                                    body: formData
                                });
                                
                                if (!res.ok) throw new Error('Drive extraction PDF failed');
                                const pdfData = await res.json();
                                const newPdfId = pdfData.id;

                                const extractedAnnotations: Record<string, any[]> = {};
                                const extractedRotations: Record<string, number> = {};
                                const extractedOrder: string[] = [];
                                const currentAnns = pageAnnotationsRef.current || pageAnnotations;
                                
                                targetsToExport.forEach((oldId, index) => {
                                    const newId = `0-${index + 1}`; 
                                    extractedOrder.push(newId);
                                    if (currentAnns[oldId] && currentAnns[oldId].length > 0) {
                                        extractedAnnotations[newId] = currentAnns[oldId].map((a: any) => ({ ...a, pageNumber: newId }));
                                    }
                                    if (pageRotations[oldId] !== undefined) {
                                        extractedRotations[newId] = pageRotations[oldId];
                                    }
                                });

                                const projectData = {
                                    pageAnnotations: extractedAnnotations,
                                    pageRotations: extractedRotations,
                                    pageOrder: extractedOrder,
                                    filePageCounts: [extractedOrder.length],
                                    filesMeta: [finalName]
                                };

                                const jsonFileName = `${newPdfId}_data.json`;
                                const jsonMetadata: any = {
                                    name: jsonFileName,
                                    mimeType: 'application/json'
                                };
                                if (targetFolderId) {
                                    jsonMetadata.parents = [targetFolderId];
                                } else if ((files[0] as any)?.parentId) {
                                    jsonMetadata.parents = [(files[0] as any).parentId];
                                }
                                
                                const jsonBlob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
                                const jsonFormData = new FormData();
                                jsonFormData.append('metadata', new Blob([JSON.stringify(jsonMetadata)], { type: 'application/json' }));
                                jsonFormData.append('file', jsonBlob);

                                const jsonRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${accessToken}` },
                                    body: jsonFormData
                                });

                                if (!jsonRes.ok) throw new Error('Drive extraction JSON failed');

                                toast.success(`ドライブに「${finalName}」を保存しました`);
                            } catch (e) {
                                console.error(e);
                                toast.error('保存に失敗しました');
                            } finally {
                                setIsExporting(false);
                            }
                        };

                        try {
                            const pickerBuilder = new (window as any).google.picker.PickerBuilder()
                                .setLocale('ja')
                                .enableFeature((window as any).google.picker.Feature.SUPPORT_DRIVES)
                                .setTitle('保存先のフォルダを選択してください')
                                .setOAuthToken(accessToken)
                                .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY || '')
                                .setOrigin(window.location.protocol + '//' + window.location.host);

                            // 1. 最近使用したフォルダ（先ほどフラットに表示されていたものを活用）
                            const recentView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS);
                            recentView.setLabel('最近使用したフォルダ');
                            recentView.setIncludeFolders(true);
                            recentView.setSelectFolderEnabled(true);
                            recentView.setMimeTypes('application/vnd.google-apps.folder');
                            pickerBuilder.addView(recentView);

                            // 2. マイドライブ（ルート階層からツリーを潜れる）
                            const myDriveView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS);
                            myDriveView.setLabel('マイドライブ');
                            myDriveView.setIncludeFolders(true);
                            myDriveView.setSelectFolderEnabled(true);
                            myDriveView.setMimeTypes('application/vnd.google-apps.folder');
                            myDriveView.setParent('root');
                            pickerBuilder.addView(myDriveView);
                            
                            // 3. 共有ドライブ
                            const sharedDrivesView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS);
                            sharedDrivesView.setLabel('共有ドライブ');
                            sharedDrivesView.setEnableDrives(true);
                            sharedDrivesView.setIncludeFolders(true);
                            sharedDrivesView.setSelectFolderEnabled(true);
                            sharedDrivesView.setMimeTypes('application/vnd.google-apps.folder');
                            pickerBuilder.addView(sharedDrivesView);
                            
                            pickerBuilder.setCallback((data: any) => {
                                if (data.action === (window as any).google.picker.Action.PICKED) {
                                    performDriveExport(data.docs[0].id);
                                } else if (data.action === (window as any).google.picker.Action.CANCEL) {
                                    toast.info('保存がキャンセルされました');
                                }
                            });

                            const picker = pickerBuilder.build();
                            picker.setVisible(true);
                        } catch (err) {
                            console.error('Picker initialization failed', err);
                            await performDriveExport();
                        }
                    };
                    
                    // ★ モーダルの「決定」ボタン起因で認証を走らせるため、ブロックされない
                    tokenClient.requestAccessToken({prompt: ''});
                }
            });
            return;
        }

        setIsExporting(true);

        const extractSelected = exportMode === 'extract';
        const targetsToExport = extractSelected && selectedPages.length > 0 && selectedPages.length < pageOrder.length ? pageOrder.filter(id => selectedPages.includes(id)) : pageOrder;
        const newPdfDoc = await generateEditedPdf(targetsToExport, true);
        
        newPdfDoc.setTitle(defaultName);

        const pdfBytes = await newPdfDoc.save();

        if (fileHandle) {
            const writable = await fileHandle.createWritable();
            await writable.write(pdfBytes);
            await writable.close();
        } else {
            const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultName; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

    } catch (err: any) {
        if (err.name !== 'AbortError') {
            const errMsg = err.message || JSON.stringify(err);
            console.error('PDFのエクスポートに失敗しました:', err);
            alert('PDF保存エラー: ' + errMsg);
        }
    } finally {
        setIsExporting(false);
    }
  };

  const handleOpenFromDrive = (mode: 'replace' | 'append' = 'replace') => {
      if (!tokenClient || !isGoogleApiLoaded) {
          alert('Google APIを読み込み中です。少し待ってから再度お試しください。');
          return;
      }
      tokenClient.callback = async (response: any) => {
          if (response.error !== undefined) {
              console.error(response);
              return;
          }
          const accessToken = response.access_token;
          
          const myDriveView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS);
          myDriveView.setLabel('マイドライブ');
          myDriveView.setMimeTypes('application/pdf');
          myDriveView.setIncludeFolders(true);
          myDriveView.setParent('root');

          const sharedDrivesView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS);
          sharedDrivesView.setLabel('共有ドライブ');
          sharedDrivesView.setMimeTypes('application/pdf');
          sharedDrivesView.setEnableDrives(true);
          sharedDrivesView.setIncludeFolders(true);

          const recentView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.RECENT);
          recentView.setLabel('最近使用したアイテム');
          recentView.setMimeTypes('application/pdf');
          
          const picker = new (window as any).google.picker.PickerBuilder()
              .setLocale('ja')
              .addView(myDriveView)
              .addView(sharedDrivesView)
              .addView(recentView)
              .enableFeature((window as any).google.picker.Feature.SUPPORT_DRIVES)
              .setOAuthToken(accessToken)
              .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY || '')
              .setCallback(async (data: any) => {
                  if (data.action === (window as any).google.picker.Action.PICKED) {
                      const doc = data.docs[0];
                      const fileId = doc.id;
                      const fileName = doc.name;
                      const parentId = doc.parentId || null;
                      
                      try {
                          setIsMerging(true);
                          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                              headers: { Authorization: `Bearer ${accessToken}` }
                          });
                          if (!res.ok) throw new Error('File download failed');
                          
                          const blob = await res.blob();
                          const downloadedFile = new File([blob], fileName, { type: 'application/pdf' });
                          (downloadedFile as any).fileId = fileId;
                          (downloadedFile as any).parentId = parentId;
                          
                          if (mode === 'replace') {
                              setFiles([downloadedFile]);
                              setDriveFileId(fileId);
                              setPageAnnotations({});
                              setFilePageCounts([]);
                              setPageOrder([]);
                              setPast([]);
                              setFuture([]);
                              await loadProjectDataFromDrive(fileId, accessToken);
                          } else {
                              setFiles(prev => [...prev, downloadedFile]);
                          }
                      } catch (e) {
                          alert('ファイルの読み込みに失敗しました');
                          console.error(e);
                      } finally {
                          setIsMerging(false);
                      }
                  }
              })
              .build();
          picker.setVisible(true);
      };
      tokenClient.requestAccessToken({prompt: ''});
  };

  const handleDualSaveAs = () => {
      const originalName = files[0]?.name || 'document.pdf';
      const baseName = originalName.replace(/\.pdf$/i, '');
      const defaultName = `${baseName}_コピー.pdf`;
      let promptedName = prompt('別名で保存するファイル名を入力してください', defaultName);
      if (!promptedName) return;
      if (!promptedName.toLowerCase().endsWith('.pdf')) promptedName += '.pdf';
      
      if (!tokenClient || !isGoogleApiLoaded) {
          toast.error('Google APIが利用できません');
          return;
      }
      
      tokenClient.callback = async (response: any) => {
          if (response.error !== undefined) {
              toast.error('Google認証に失敗しました');
              return;
          }
          const accessToken = response.access_token;
          
          try {
              const myDriveView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS);
              myDriveView.setLabel('マイドライブ');
              myDriveView.setIncludeFolders(true);
              myDriveView.setSelectFolderEnabled(true);
              myDriveView.setMimeTypes('application/vnd.google-apps.folder');
              
              const sharedDrivesView = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS);
              sharedDrivesView.setLabel('共有ドライブ');
              sharedDrivesView.setEnableDrives(true);
              sharedDrivesView.setIncludeFolders(true);
              sharedDrivesView.setSelectFolderEnabled(true);
              sharedDrivesView.setMimeTypes('application/vnd.google-apps.folder');
              
              const picker = new (window as any).google.picker.PickerBuilder()
                  .setLocale('ja')
                  .addView(myDriveView)
                  .addView(sharedDrivesView)
                  .enableFeature((window as any).google.picker.Feature.SUPPORT_DRIVES)
                  .setTitle('保存先のフォルダを選択してください')
                  .setOAuthToken(accessToken)
                  .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY || '')
                  .setCallback((data: any) => {
                      if (data.action === (window as any).google.picker.Action.PICKED) {
                          const folderId = data.docs[0].id;
                          handleDualSave(promptedName, folderId);
                      }
                  })
                  .build();
              picker.setVisible(true);
          } catch (err) {
              console.error('Picker initialization failed', err);
              handleDualSave(promptedName);
          }
      };
      tokenClient.requestAccessToken({prompt: ''});
  };

  const handleDualSave = async (saveAsName?: string, targetFolderId?: string) => {
      if (files.length === 0 || !tokenClient || !isGoogleApiLoaded) {
          toast.error('Google APIの準備ができていないか、ファイルがありません');
          return;
      }

      tokenClient.callback = async (response: any) => {
          if (response.error !== undefined) {
              console.error(response);
              toast.error('Google認証に失敗しました');
              return;
          }
          const accessToken = response.access_token;
          
          try {
              setIsExporting(true);
              
              let effectiveDriveId = saveAsName ? null : ((files[0] as any).fileId || driveFileId);
              let targetName = saveAsName || files[0].name;

              const processA = async () => {
                  const newPdfDoc = await generateEditedPdf(pageOrder, false); // false を渡して合成をスキップ
                  const pdfBytes = await newPdfDoc.save();
                  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
                  
                  if (effectiveDriveId) {
                      const metadata = { name: targetName, mimeType: 'application/pdf' };
                      const formData = new FormData();
                      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                      formData.append('file', blob);
                      
                      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${effectiveDriveId}?uploadType=multipart&supportsAllDrives=true`, {
                          method: 'PATCH',
                          headers: { Authorization: `Bearer ${accessToken}` },
                          body: formData
                      });
                      if (!res.ok) {
                          const err = await res.text();
                          throw new Error(`Process A (PATCH) failed: ${res.status} ${err}`);
                      }
                      return effectiveDriveId;
                  } else {
                      const metadata: any = { 
                          name: targetName, 
                          mimeType: 'application/pdf',
                      };
                      if (!saveAsName) {
                          metadata.parents = ['15wiLbsMkfl6Eb3ZxNAkTJzdDMysct0mv'];
                      } else if (targetFolderId) {
                          metadata.parents = [targetFolderId];
                      } else if ((files[0] as any)?.parentId) {
                          metadata.parents = [(files[0] as any).parentId];
                      }
                      
                      const formData = new FormData();
                      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                      formData.append('file', blob);

                      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${accessToken}` },
                          body: formData
                      });
                      
                      if (!res.ok) throw new Error("Process A (POST) failed");
                      const data = await res.json();
                      setDriveFileId(data.id);
                      if (files[0]) {
                          (files[0] as any).fileId = data.id;
                          if (saveAsName) {
                              const newFile = new File([files[0]], targetName, { type: 'application/pdf' });
                              (newFile as any).fileId = data.id;
                              setFiles([newFile, ...files.slice(1)]);
                          }
                      }
                      return data.id;
                  }
              };

              const processB = async (targetId: string) => {
                  const targetFolderId = '15wiLbsMkfl6Eb3ZxNAkTJzdDMysct0mv';
                  const jsonFileName = `${targetId}_data.json`;
                  
                  // ★エンコードと必須パラメータを追加
                  const query = `name='${jsonFileName}' and '${targetFolderId}' in parents and trashed=false`;
                  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
                  
                  const searchRes = await fetch(searchUrl, {
                      headers: { Authorization: `Bearer ${accessToken}` }
                  });
                  const searchData = await searchRes.json();
                  const existingFileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

                  // ★ 修正箇所：結合・並び替えられた新しいPDFに合わせてJSONデータを「正規化」する
                  const normalizedAnnotations: Record<string, any[]> = {};
                  const normalizedRotations: Record<string, number> = {};
                  const normalizedOrder: string[] = [];
                  const currentAnns = pageAnnotationsRef.current || pageAnnotations;
                  
                  pageOrder.forEach((oldId, index) => {
                      const newId = `0-${index + 1}`; // 新しいPDFの通し番号（0-1, 0-2...）に振り直す
                      normalizedOrder.push(newId);
                      
                      // 図形の所属ページID(pageNumber)も新しいIDに更新して引き継ぐ
                      if (currentAnns[oldId] && currentAnns[oldId].length > 0) {
                          normalizedAnnotations[newId] = currentAnns[oldId].map((a: any) => ({ ...a, pageNumber: newId }));
                      }
                      
                      // 回転状態も新しいIDに引き継ぐ
                      if (pageRotations[oldId] !== undefined) {
                          normalizedRotations[newId] = pageRotations[oldId];
                      }
                  });

                  // 正規化されたデータを保存する
                  const projectData = {
                      pageAnnotations: normalizedAnnotations,
                      pageRotations: normalizedRotations,
                      pageOrder: normalizedOrder,
                      filePageCounts: [normalizedOrder.length], // 1つのファイルに結合されたのでページ数を更新
                      filesMeta: [files[0] ? files[0].name : 'document.pdf']
                  };
                  
                  const dataBlob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
                  
                  const metadata: any = existingFileId ? { mimeType: 'application/json' } : {
                      name: jsonFileName,
                      mimeType: 'application/json',
                      parents: [targetFolderId]
                  };
                  
                  const formData = new FormData();
                  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                  formData.append('file', dataBlob);
                  
                  const method = existingFileId ? 'PATCH' : 'POST';
                  const url = existingFileId 
                      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&supportsAllDrives=true`
                      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`;
                      
                  const res = await fetch(url, {
                      method,
                      headers: { Authorization: `Bearer ${accessToken}` },
                      body: formData
                  });
                  if (!res.ok) {
                      const err = await res.text();
                      throw new Error(`Process B (JSON Save) failed: ${res.status} ${err}`);
                  }
              };

              if (effectiveDriveId) {
                  await Promise.all([processA(), processB(effectiveDriveId)]);
              } else {
                  const newId = await processA();
                  await processB(newId);
              }
              
              toast.success('ドライブへの保存が完了しました');
              
          } catch (e) {
              console.error(e);
              toast.error('保存処理に失敗しました');
          } finally {
              setIsExporting(false);
          }
      };
      tokenClient.requestAccessToken({prompt: ''});
  };

  return (
    <div 
        className="flex flex-col h-screen w-full overflow-hidden bg-[#f5f5f7] relative"
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none transition-all duration-200">
              <div className={`bg-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border-2 border-dashed ${files.length === 0 ? 'border-blue-500 scale-105 transition-transform duration-300' : 'border-transparent'}`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${files.length === 0 ? 'bg-blue-500 text-white animate-bounce' : 'bg-blue-100 text-blue-600'}`}>
                      <Upload className="w-8 h-8" />
                  </div>
                  <p className="text-xl font-bold text-gray-800">{files.length === 0 ? "ここにPDFをドロップして開く" : "ここにPDFをドロップして追加"}</p>
                  <p className="text-sm text-gray-500">{files.length === 0 ? "アップロードしてファイルの編集を開始します" : "現在のファイルの末尾に結合されます"}</p>
              </div>
          </div>
      )}
      
      {isMerging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm pointer-events-none">
              <div className="bg-white px-8 py-6 rounded-2xl shadow-xl flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="font-bold text-gray-800">ファイルを結合中...</p>
              </div>
          </div>
      )}

      <header ref={headerRef} className="flex-shrink-0 h-[52px] bg-gray-100 shadow-inner border-b border-gray-300 flex items-center justify-between px-4 relative z-[9999]">
        
        <div className="flex items-center gap-2">
          <button 
             onClick={() => setShowSidebar(!showSidebar)}
             className={`p-1.5 rounded-md transition-colors ${showSidebar ? 'bg-gray-200/50 text-gray-800' : 'hover:bg-gray-200/50 text-gray-700'}`}
          >
             <Sidebar strokeWidth={1.5} className="w-[18px] h-[18px]" />
          </button>
          
          <div className="w-px h-4 bg-gray-300 mx-1"></div>

          {files.length > 0 && (
              <div className="flex items-center gap-1">
                  <div className="relative">
                      <button 
                          onClick={() => toggleMenu('open')} 
                          className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ${isOpenMenuOpen ? 'bg-gray-200/50 text-gray-800' : 'hover:bg-gray-200/50 text-gray-700'}`}
                          title="ファイルを開く"
                      >
                          <Folder strokeWidth={1.5} className="w-[18px] h-[18px]" />
                      </button>
                      {isOpenMenuOpen && (
                          <div className="absolute top-[36px] left-0 bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg rounded-lg p-2 w-[220px] z-[100] animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                              <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 w-full transition-colors cursor-pointer">
                                  <Upload strokeWidth={1.5} className="w-[16px] h-[16px] text-blue-500" />
                                  <span className="whitespace-nowrap">ローカルから開く</span>
                                  <input type="file" accept="application/pdf" className="hidden" onClick={(e) => (e.target as HTMLInputElement).value = ''} onChange={(e) => { setIsOpenMenuOpen(false); onFileChange(e); }} />
                              </label>
                              <div className="h-px bg-gray-200 my-1 mx-2"></div>
                              <button 
                                  onClick={() => {
                                      setIsOpenMenuOpen(false);
                                      handleOpenFromDrive('replace');
                                  }} 
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 text-left w-full transition-colors"
                              >
                                  <Cloud strokeWidth={1.5} className="w-[16px] h-[16px] text-green-500" />
                                  <span className="whitespace-nowrap">Googleドライブから開く</span>
                              </button>
                          </div>
                      )}
                  </div>
                  <div className="relative">
                      <button 
                          onClick={() => toggleMenu('add')} 
                          className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors mr-2 ${isAddMenuOpen ? 'bg-gray-200/50 text-gray-800' : 'hover:bg-gray-200/50 text-gray-700'}`}
                          title="ページを追加"
                      >
                          <Plus strokeWidth={1.5} className="w-[18px] h-[18px]" />
                      </button>
                      {isAddMenuOpen && (
                          <div className="absolute top-[36px] left-0 bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg rounded-lg p-2 w-[220px] z-[100] animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                              <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 w-full transition-colors cursor-pointer">
                                  <Upload strokeWidth={1.5} className="w-[16px] h-[16px] text-blue-500" />
                                  <span className="whitespace-nowrap">ローカルから追加</span>
                                  <input type="file" accept="application/pdf" className="hidden" onClick={(e) => (e.target as HTMLInputElement).value = ''} onChange={(e) => { setIsAddMenuOpen(false); onFileChangeMerge(e); }} />
                              </label>
                              <div className="h-px bg-gray-200 my-1 mx-2"></div>
                              <button 
                                  onClick={() => {
                                      setIsAddMenuOpen(false);
                                      handleOpenFromDrive('append');
                                  }} 
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 text-left w-full transition-colors"
                              >
                                  <Cloud strokeWidth={1.5} className="w-[16px] h-[16px] text-green-500" />
                                  <span className="whitespace-nowrap">Googleドライブから追加</span>
                              </button>
                          </div>
                      )}
                  </div>
              </div>
          )}

          {files.length > 0 ? (
              <div className="flex flex-col py-0.5 px-1">
                 <span className="text-[13px] font-bold text-gray-800 truncate max-w-[280px] leading-tight flex items-center gap-1 cursor-default select-none">
                    {files[0]?.name}
                    <ChevronDown strokeWidth={1.5} className="w-3 h-3 text-gray-400" />
                 </span>
                 <span className="text-[10px] text-gray-500 leading-tight cursor-default select-none mt-px">
                    {pageNumber ? pageNumber.split('-')[1] : '-'} / {filePageCounts.reduce((a, b) => a + b, 0)} ページ - 編集済み
                 </span>
              </div>
          ) : (
             <span className="text-[13px] font-semibold text-gray-800 cursor-default select-none ml-1">未選択</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-1 flex-1 min-w-0">
           {files.length > 0 ? (
              <div className="flex items-center text-gray-700">
                 <div className="flex items-center gap-0.5 mr-1">
                    <button onClick={() => setScale(Math.max(0.5, scale - 0.2))} className="w-7 h-7 rounded-md hover:bg-gray-200/50 transition-colors flex items-center justify-center" title="縮小">
                        <ZoomOut strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                    </button>
                    <div className="w-px h-3.5 bg-gray-300 mx-0.5"></div>
                    <button onClick={() => setScale(1)} className="w-7 h-7 rounded-md hover:bg-gray-200/50 transition-colors flex items-center justify-center" title="実寸表示 (100%)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"/>
                          <line x1="21" x2="16.65" y1="21" y2="16.65"/>
                          <text x="11" y="14.5" fontSize="10.5" fontWeight="500" textAnchor="middle" strokeWidth="0" fill="currentColor" fontFamily="sans-serif">1</text>
                        </svg>
                    </button>
                    <div className="w-px h-3.5 bg-gray-300 mx-0.5"></div>
                    <button onClick={() => setScale(Math.min(3, scale + 0.2))} className="w-7 h-7 rounded-md hover:bg-gray-200/50 transition-colors flex items-center justify-center" title="拡大">
                        <ZoomIn strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                    </button>
                    <div className="w-px h-3.5 bg-gray-300 mx-0.5"></div>
                    <button onClick={() => setActiveTool('view')} className={`w-7 h-7 rounded-md transition-colors flex items-center justify-center ${activeTool === 'view' ? 'bg-gray-300/70 text-gray-900 shadow-inner' : 'hover:bg-gray-200/50 text-gray-700'}`} title="パン (移動)">
                        <Hand strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                    </button>
                 </div>
                 
                 <div className="w-px h-4 bg-gray-300 mx-2"></div>
                 
                 <div className="flex items-center">
                    <button onClick={handleUndo} disabled={past.length === 0} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors mr-0.5 ${past.length > 0 ? 'hover:bg-gray-200/50 text-gray-700' : 'opacity-40 cursor-not-allowed text-gray-400'}`} title="元に戻す">
                        <Undo2 strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                    </button>
                    <button onClick={handleRedo} disabled={future.length === 0} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ${future.length > 0 ? 'hover:bg-gray-200/50 text-gray-700' : 'opacity-40 cursor-not-allowed text-gray-400'}`} title="やり直す">
                        <Redo2 strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                    </button>
                 </div>
                 
                 <div className="w-px h-4 bg-gray-300 mx-2"></div>

                 <div className="flex items-center">
                    <button onClick={handleRotate} disabled={selectedPages.length === 0} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ${selectedPages.length > 0 ? 'hover:bg-gray-200/50 text-gray-700' : 'opacity-40 cursor-not-allowed text-gray-400'}`} title="左へ回転">
                        <RotateCcw strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                    </button>
                    <button onClick={handleDeleteSelectedPages} disabled={selectedPages.length === 0 || pageOrder.length <= 1} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ml-0.5 ${selectedPages.length > 0 && pageOrder.length > 1 ? 'hover:bg-red-100 text-gray-700 hover:text-red-600' : 'opacity-40 cursor-not-allowed text-gray-400'}`} title="選択したページを削除">
                        <Trash2 strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                    </button>
                 </div>
                 
                 <div className="w-px h-4 bg-gray-300 mx-2"></div>
                 
                 <button 
                     onClick={() => setIsMarkupToolbarVisible(!isMarkupToolbarVisible)} 
                     className={`flex items-center justify-center w-[28px] h-[28px] rounded-full transition-colors mr-2 border shadow-sm ${isMarkupToolbarVisible ? 'bg-blue-100 border-blue-300 text-blue-600' : 'bg-white hover:bg-gray-100 border-gray-300 text-gray-700'}`} 
                     title="マークアップツールを表示"
                 >
                     <Pencil strokeWidth={1.5} className="w-[14px] h-[14px]" />
                 </button>
                 
                  <div className="relative">
                      <button 
                          onClick={() => toggleMenu('info')} 
                          className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors mx-0.5 ${isInfoOpen ? 'bg-gray-200/50 text-blue-600' : 'hover:bg-gray-200/50'}`}
                      >
                          <Info strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                      </button>
                      
                      {isInfoOpen && (
                          <div className="absolute top-[36px] right-0 bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg rounded-lg p-3 w-[240px] z-[100] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2">
                              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">プロパティ</div>
                              <div className="flex flex-col gap-1.5 text-[12px]">
                                  <div className="flex justify-between">
                                      <span className="text-gray-500">ファイル名</span>
                                      <span className="font-medium text-gray-800 truncate max-w-[120px]" title={files[0]?.name}>{files[0]?.name || '無題のドキュメント'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                      <span className="text-gray-500">総ページ数</span>
                                      <span className="font-medium text-gray-800">{filePageCounts.reduce((a, b) => a + b, 0) || '-'} ページ</span>
                                  </div>
                                  <div className="flex justify-between">
                                      <span className="text-gray-500">状態</span>
                                      <span className="font-medium text-blue-600">編集可能</span>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  {selectedPages.length > 0 && selectedPages.length < pageOrder.length && (
                      <div className="relative">
                          <button 
                              onClick={() => toggleMenu('extract')}
                              disabled={isExporting}
                              className="relative flex items-center justify-center w-10 h-10 rounded-md text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors shadow-sm ml-2 disabled:opacity-50"
                              title="ページ抽出"
                          >
                              <Scissors strokeWidth={1.75} className="w-5 h-5"/>
                              <ChevronDown strokeWidth={2.5} className="w-2.5 h-2.5 absolute bottom-1 right-1 opacity-70" />
                          </button>
                          
                          {isExtractMenuOpen && (
                              <div className="absolute top-[36px] right-0 bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg rounded-lg p-2 w-[180px] z-[100] animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                                  <button 
                                      onClick={() => { setIsExtractMenuOpen(false); handleExportPdf('extract', 'local'); }} 
                                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 text-left w-full transition-colors"
                                  >
                                      <Download strokeWidth={1.5} className="w-[16px] h-[16px] text-gray-500"/>
                                      パソコンに保存
                                  </button>
                                  <div className="h-px bg-gray-200 my-1 mx-2"></div>
                                  <button 
                                      onClick={() => { setIsExtractMenuOpen(false); handleExportPdf('extract', 'drive'); }} 
                                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-blue-600 text-left w-full transition-colors font-medium"
                                  >
                                      <Cloud strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                                      ドライブに保存
                                  </button>
                              </div>
                          )}
                      </div>
                  )}

                  <button 
                      onClick={() => handleExportPdf('save', 'local')}
                      disabled={isExporting}
                      className="flex items-center justify-center w-10 h-10 rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm ml-2 disabled:opacity-50"
                      title="パソコンにダウンロード"
                  >
                      <Download strokeWidth={1.75} className="w-5 h-5"/>
                  </button>

                  <div className="relative z-[9999]">
                      <button 
                          onClick={() => toggleMenu('save')}
                          disabled={isExporting}
                          // ★背景を青、文字・アイコンを白に変更
                          className="relative flex items-center justify-center w-10 h-10 rounded-md text-white bg-blue-600 border border-blue-600 hover:bg-blue-700 transition-colors shadow-sm ml-2 disabled:opacity-50"
                          title="ドライブに保存"
                      >
                          {/* ★ローディングスピナーとアイコンの色を白に戻す */}
                          {isExporting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Cloud strokeWidth={1.75} className="w-5 h-5"/>}
                          {!isExporting && <ChevronDown strokeWidth={2.5} className="w-2.5 h-2.5 absolute bottom-1 right-1 opacity-80" />}
                      </button>

                      {isDriveSaveMenuOpen && (
                          <div className="absolute top-[36px] right-0 bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg rounded-lg p-2 w-[160px] z-[9999] animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                              <button 
                                  onClick={() => { 
                                      setIsDriveSaveMenuOpen(false); 
                                      if (!((files[0] as any)?.fileId || driveFileId)) {
                                          handleDualSaveAs();
                                      } else {
                                          handleDualSave(); 
                                      }
                                  }} 
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 text-left w-full transition-colors font-medium"
                              >
                                  <Cloud strokeWidth={1.5} className="w-[16px] h-[16px] text-blue-500"/>
                                  上書き保存
                              </button>
                              <div className="h-px bg-gray-200 my-1 mx-2"></div>
                              <button 
                                  onClick={() => { setIsDriveSaveMenuOpen(false); handleDualSaveAs(); }} 
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-purple-600 text-left w-full transition-colors font-medium"
                              >
                                  <PenLine strokeWidth={1.5} className="w-[16px] h-[16px]"/>
                                  別名で保存...
                              </button>
                          </div>
                      )}
                  </div>
              </div>
           ) : (
               <div className="flex items-center gap-2">
                   {/* ローカルを白ベース（Secondary）に変更 */}
                   <label className="flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md font-medium text-sm hover:bg-gray-50 transition-colors cursor-pointer shadow-sm">
                     <Upload strokeWidth={1.5} className="w-4 h-4" />
                     <span className="whitespace-nowrap">ローカルPDFを開く</span>
                     <input type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
                   </label>
                   {/* Googleドライブを青ベース（Primary）に変更 */}
                   <button onClick={() => handleOpenFromDrive('replace')} className="flex items-center gap-1.5 bg-blue-600 border border-blue-600 text-white px-3 py-1.5 rounded-md font-medium text-sm hover:bg-blue-700 transition-colors cursor-pointer shadow-sm">
                       <Cloud strokeWidth={1.5} className="w-4 h-4" />
                       <span className="whitespace-nowrap">Googleドライブから開く</span>
                   </button>
               </div>
           )}
        </div>
      </header>

      {/* Markup Toolbar */}
      {isMarkupToolbarVisible && (
          <div className="flex-shrink-0 h-[44px] bg-[#f5f5f7] border-b border-gray-300 flex items-center justify-center px-4 relative z-[60] shadow-sm animate-in slide-in-from-top-2 duration-200">
             <div className="flex items-center gap-1">
                <button onClick={() => { console.log('TEXT BUTTON CLICKED! Inserting text shape'); handleInsertShape('text'); }} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors hover:bg-gray-200/50 text-gray-700`} title="テキスト"><Type strokeWidth={1.5} className="w-[16px] h-[16px]"/></button>
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                
                <div className="relative group">
                  <button
                    type="button"
                    className="flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors hover:bg-gray-200 text-gray-900"
                    title="図形メニュー（ホバーで展開）"
                  >
                    <Shapes className="w-[16px] h-[16px]" />
                  </button>

                  <div className="absolute top-[28px] left-[-30px] pt-2 z-[9999] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-100 min-w-[80px]">
                    <div className="bg-white border border-gray-300 shadow-lg rounded-lg p-2 grid grid-cols-2 gap-2">
                      {[
                        { type: 'line', Icon: Slash, title: '直線' },
                        { type: 'arrow', Icon: MoveUpRight, title: '矢印' },
                        { type: 'rect', Icon: Square, title: '四角形' },
                        { type: 'rounded_rect', Icon: AppWindow, title: '角丸四角形' },
                        { type: 'ellipse', Icon: Circle, title: '円' },
                        { type: 'speech_bubble', Icon: MessageSquare, title: '吹き出し' },
                        { type: 'star', Icon: Star, title: '星' },
                        { type: 'polygon', Icon: Hexagon, title: '多角形' },
                      ].map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          title={item.title}
                          className="p-2 hover:bg-gray-100 rounded cursor-pointer flex items-center justify-center pointer-events-auto active:scale-95 transition-transform"
                          onPointerDownCapture={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            const targetPage = typeof pageNumber !== 'undefined' ? pageNumber : (pageOrder.length > 0 ? pageOrder[0] : '0-1');
                            const newShapeId = uuidv4();
                            
                            const newShape = {
                              id: newShapeId,
                              pageNumber: targetPage,
                              type: 'shape',
                              shapeType: item.type,
                              x: 300, 
                              y: 300,
                              width: 150,
                              height: 100,
                              fill: 'transparent',
                              stroke: activeColor || '#ef4444',
                              strokeWidth: 3,
                            } as any;

                            setPageAnnotations(prev => {
                                const prevAnn = prev[targetPage] || [];
                                return { ...prev, [targetPage]: [...prevAnn, newShape] };
                            });
                            
                            setTimeout(() => {
                                setActiveTool('select');
                                setSelectedAnnotationIds([newShapeId]);
                            }, 50);
                          }}
                        >
                          <item.Icon className="w-4 h-4 text-gray-900" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button onClick={() => { console.log('PEN BUTTON CLICKED! Setting activeTool to pen'); setActiveTool('pen'); }} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ${activeTool === 'pen' ? 'bg-gray-300/70 text-gray-900 shadow-inner' : 'hover:bg-gray-200/50 text-gray-700'}`} title="ペン"><PenLine strokeWidth={1.5} className="w-[16px] h-[16px]"/></button>
                <button onClick={() => setActiveTool('redact')} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ${activeTool === 'redact' ? 'bg-gray-300/70 text-gray-900 shadow-inner' : 'hover:bg-gray-200/50 text-gray-700'}`} title="墨消し・塗りつぶし"><Eraser strokeWidth={1.5} className="w-[16px] h-[16px]"/></button>
                
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <button onClick={() => setActiveTool('view')} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ${activeTool === 'view' ? 'bg-gray-300/70 text-gray-900 shadow-inner' : 'hover:bg-gray-200/50 text-gray-700'}`} title="閲覧・テキスト選択"><Hand strokeWidth={1.5} className="w-[16px] h-[16px]"/></button>
                <button onClick={() => setActiveTool('select')} className={`flex items-center justify-center w-[28px] h-[28px] rounded-md transition-colors ${activeTool === 'select' ? 'bg-gray-300/70 text-gray-900 shadow-inner' : 'hover:bg-gray-200/50 text-gray-700'}`} title="描画選択ツール"><MousePointer2 strokeWidth={1.5} className="w-[16px] h-[16px]"/></button>
             </div>
             
             <div className="w-px h-5 bg-gray-300 mx-5"></div>
             
             <div className="flex items-center gap-5">
                 {isTextMode ? (
                     <TextToolbar 
                         fontFamily={activeFontFamily}
                         setFontFamily={(v: string) => handleTextPropertyChange('fontFamily', v)}
                         fontSize={activeFontSize}
                         setFontSize={(v: number) => handleTextPropertyChange('fontSize', v)}
                         fontStyle={activeFontStyle}
                         setFontStyle={(v: string) => handleTextPropertyChange('fontStyle', v)}
                         textDecoration={activeTextDecoration}
                         setTextDecoration={(v: string) => handleTextPropertyChange('textDecoration', v)}
                         textAlign={activeTextAlign}
                         setTextAlign={(v: string) => handleTextPropertyChange('textAlign', v)}
                         textFill={activeTextFill}
                         setTextFill={(v: string) => handleTextPropertyChange('textFill', v)}
                         fill={activeTextBackgroundFill}
                         setFill={(v: string) => handleTextPropertyChange('fill', v)}
                         stroke={activeTextBackgroundStroke}
                         setStroke={(v: string) => handleTextPropertyChange('stroke', v)}
                         strokeWidth={activeTextBackgroundStrokeWidth}
                         setStrokeWidth={(v: number) => handleTextPropertyChange('strokeWidth', v)}
                     />
                 ) : (
                     <>
                         <ColorPickerDropdown 
                             color={activeColor} 
                             onChange={(c) => handleColorChange(c, false)} 
                             label="線" 
                             allowTransparent={false} 
                             type="stroke"
                         />
                         
                         <ColorPickerDropdown 
                             color={activeFillColor} 
                             onChange={(c) => handleColorChange(c, true)} 
                             label="塗り" 
                             allowTransparent={true} 
                             type="fill"
                         />
                         
                         <div className="flex items-center gap-1.5 ml-1" title="線の太さ">
                             <span className="text-[11px] font-medium text-gray-500">太さ</span>
                             <select value={activeStrokeWidth} onChange={(e) => handleStrokeWidthChange(Number(e.target.value))} className="bg-white border shadow-sm border-gray-300 text-gray-700 text-[11px] rounded px-1.5 py-0.5 outline-none cursor-pointer">
                                <option value={1}>1px</option>
                                <option value={3}>3px</option>
                                <option value={5}>5px</option>
                                <option value={8}>8px</option>
                                <option value={12}>12px</option>
                             </select>
                         </div>
                     </>
                 )}
             </div>
          </div>
      )}

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden bg-[#e5e5ea]">
        {/* Sidebar */}
        {files.length > 0 && showSidebar && (
            <aside className="w-[12%] min-w-[110px] max-w-[150px] bg-[#f5f5f7] border-r border-gray-300 overflow-y-auto shrink-0 py-3 px-1.5 flex flex-col items-center">
                <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCenter} 
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveId(null)}
                >
                    <SortableContext items={pageOrder} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col w-full relative z-[1]">
                            {files.map((file, fileIndex) => (
                                <Document 
                                    key={fileIndex} 
                                    file={file} 
                                    className="contents"
                                    options={PDF_OPTIONS}
                                >
                                    {filePageCounts[fileIndex] && Array.from({ length: filePageCounts[fileIndex] }, (_, i) => {
                                        const globalId = `${fileIndex}-${i + 1}`;
                                        const rank = pageOrder.indexOf(globalId);
                                        const order = rank !== -1 ? rank : 9999;
                                        return (
                                            <div key={globalId} style={{ order }} className="w-full flex justify-center mb-2">
                                                <SortableThumbnail 
                                                    id={globalId}
                                                    index={rank !== -1 ? rank : pageOrder.length}
                                                    isActive={pageNumber === globalId}
                                                    isSelected={selectedPages.includes(globalId)}
                                                    onSelect={handleThumbnailClick}
                                                    rotation={pageRotations[globalId]}
                                                    onInitRotation={handleInitRotation}
                                                />
                                            </div>
                                        );
                                    })}
                                    
                                    {activeId && activeId.startsWith(`${fileIndex}-`) && (
                                        <DragOverlay>
                                            <OverlayThumbnail id={activeId} rotation={pageRotations[activeId]} />
                                        </DragOverlay>
                                    )}
                                </Document>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </aside>
        )}

        {/* Central Document Area */}
        <main 
            ref={mainScrollRef} 
            className={`flex-1 overflow-auto relative ${files.length > 0 ? 'block' : 'flex items-center justify-center'} min-h-0 bg-gray-50 ${activeTool === 'view' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
            onMouseDown={handleMainMouseDown}
            onMouseMove={handleMainMouseMove}
            onMouseUp={handleMainMouseUp}
            onMouseLeave={handleMainMouseUp}
        >
            {files.length === 0 ? (
                <div className="text-center space-y-3">
                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-gray-200">
                        <Upload className="w-8 h-8 text-blue-500" />
                    </div>
                </div>
            ) : (
                <div 
                    ref={docWrapperRef} 
                    className={`relative mx-auto w-fit ${activeTool === 'view' ? 'select-none' : 'select-none'} origin-top-left flex flex-col items-center mb-32`} 
                    style={{ 
                        width: 800,
                        cursor: activeTool === 'view' ? (isPanning ? 'grabbing' : 'grab') : 'default'
                    }}
                >
                    {files.map((file, fileIndex) => (
                        <Document 
                            key={fileIndex} 
                            file={file} 
                            className="contents"
                            onLoadSuccess={({ numPages }) => handleFileLoadSuccess(fileIndex, numPages)}
                            options={PDF_OPTIONS}
                            loading={fileIndex === 0 ? <div className="p-12 text-gray-500">Loading PDF...</div> : null}
                        >
                            {filePageCounts[fileIndex] && Array.from({ length: filePageCounts[fileIndex] }, (_, i) => {
                                const pageId = `${fileIndex}-${i + 1}`;
                                const rank = pageOrder.indexOf(pageId);
                                const order = rank !== -1 ? rank : 9999;
                                return (
                                    <div key={pageId} style={{ order }} ref={el => { if (mainPageRefs.current) mainPageRefs.current[pageId] = el; }} className="mb-4">
                                        <MainPage 
                                            pageId={pageId}
                                            rotation={pageRotations[pageId]}
                                            onInitRotation={handleInitRotation}
                                            annotations={pageAnnotations[pageId] || EMPTY_ARRAY}
                                            setAnnotations={(newAnns: any) => setCurrentAnnotationsForPage(pageId, newAnns)}
                                            activeTool={activeTool}
                                            activeShapeType={activeShapeType}
                                            activeColor={activeColor}
                                            activeFillColor={activeFillColor}
                                            activeStrokeWidth={activeStrokeWidth}
                                            onVisible={handlePageVisible}
                                            onHistorySave={saveHistory}
                                            selectedAnnotationIds={selectedAnnotationIds}
                                            setSelectedAnnotationIds={setSelectedAnnotationIds}
                                            setActiveTool={setActiveTool}
                                            zoomScale={scale}
                                            stageRef={(node: Konva.Stage | null) => {
                                                if (node) {
                                                    stageRefs.current[pageId] = node;
                                                }
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </Document>
                    ))}
                </div>
            )}
        </main>
      </div>
      {fileNameModal?.isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-[400px] p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-gray-800">抽出ファイルの保存</h3>
                <p className="text-sm text-gray-500">Googleドライブに保存するファイル名を入力してください。</p>
                <input 
                    type="text" 
                    value={tempFileName}
                    onChange={(e) => setTempFileName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800"
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && tempFileName.trim()) {
                            fileNameModal.onConfirm(tempFileName);
                            setFileNameModal(null);
                        }
                    }}
                />
                <div className="flex justify-end gap-2 mt-2">
                    <button 
                        onClick={() => setFileNameModal(null)}
                        className="px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors font-medium"
                    >
                        キャンセル
                    </button>
                    <button 
                        disabled={!tempFileName.trim()}
                        onClick={() => {
                            fileNameModal.onConfirm(tempFileName);
                            setFileNameModal(null);
                        }}
                        className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                    >
                        保存してフォルダを選択
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}