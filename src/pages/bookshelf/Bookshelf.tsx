import React, { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { BookOpen, FolderOpen, Star, Sparkles, Loader2, ArrowRightLeft, Grid, LayoutList, Plus, Trash2, SlidersHorizontal, RefreshCw, KeyRound, Lock, Search, Cloud, CheckCircle2, Wifi, WifiOff, Trash } from "lucide-react"
import { getSavedBookIds, saveBookBlob, deleteBookBlob } from "./bookshelfDb"
import { toast } from "sonner"
import { supabase } from "../../lib/supabase"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Document, Page, pdfjs } from 'react-pdf'

// pdf.js のワーカーを設定
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// 社長専用・会社共有の固定フォルダID
const PRIVATE_FOLDER_ID = "16B13e9iOWtxhliF4qp6SskxxMJqZ0BSb"
const PUBLIC_FOLDER_ID = "1Ux7tZ3O3VLPh-U0q8IjQ8WXHijsu4ror"

// 本のインターフェース
interface BookFile {
  id: string;          // Google Drive file ID
  name: string;        // ファイル名 (本のタイトル)
  mimeType: string;
  parentFolderId: string;
  parentFolderName: string;
  isPrivate: boolean;  // 社長専用フォルダ由来か
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string; // Google Driveの軽量サムネイルURL
}

// データベース内の本のキャッシュ構造
interface DBCacheBook {
  id: string; // Supabase内のUUID
  google_drive_id: string;
  title: string;
  mime_type: string;
  parent_folder_id: string;
}

// 読書進捗
interface UserProgress {
  book_id: string;
  current_page: number;
  zoom_scale: number;
  crop_settings: any;
  view_settings: any; // view_settings.is_favorite などの拡張用
}

// --- 表紙サムネイル生成コンポーネント (react-pdfを使用、キャッシュいらずの軽量オンデマンド描画) ---
const BookCover = React.memo(({ fileId, accessToken, thumbnailLink }: { fileId: string, accessToken: string, thumbnailLink?: string }) => {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [useThumbnail, setUseThumbnail] = useState(!!thumbnailLink);

  useEffect(() => {
    // サムネイルが使える場合は、重いPDFダウンロード処理をスキップ
    if (useThumbnail) {
      setLoading(false);
      return;
    }

    let active = true;
    const fetchPdf = async () => {
      try {
        setLoading(true);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error("Failed to load PDF metadata");
        const blob = await res.blob();
        if (active) {
          const url = URL.createObjectURL(blob);
          setPdfBlobUrl(url);
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to load cover PDF for ID", fileId, e);
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    };
    fetchPdf();
    return () => {
      active = false;
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [fileId, accessToken, useThumbnail]);

  if (loading) {
    return (
      <div className="w-full h-full bg-slate-800/50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  // サムネイル画像を用いた最速描画（通信量わずか数KB）
  if (useThumbnail && thumbnailLink) {
    return (
      <div className="w-full h-full bg-white select-none pointer-events-none flex items-center justify-center overflow-hidden">
        <img 
          src={thumbnailLink} 
          alt="表紙" 
          className="object-cover w-full h-full"
          referrerPolicy="no-referrer"
          onError={() => {
            console.warn("Thumbnail load failed, falling back to PDF render for", fileId);
            setUseThumbnail(false);
          }}
        />
      </div>
    );
  }

  if (error || !pdfBlobUrl) {
    return (
      <div className="w-full h-full bg-slate-900/60 flex flex-col items-center justify-center p-3 text-center">
        <BookOpen className="w-8 h-8 text-slate-600 mb-2" />
        <span className="text-[10px] text-slate-500 font-bold leading-tight">PDF 表紙<br/>ロード失敗</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white select-none pointer-events-none flex items-center justify-center overflow-hidden">
      <Document file={pdfBlobUrl} loading={null} error={null}>
        <Page 
          pageNumber={1} 
          width={150} 
          height={210}
          renderTextLayer={false} 
          renderAnnotationLayer={false}
          className="object-cover w-full h-full"
        />
      </Document>
    </div>
  );
});

// --- ドラッグ＆ドロップ対応の本（グリッド用）コンポーネント ---
function SortableBookCard({ 
  book, 
  dbBookId,
  accessToken, 
  progress, 
  onOpen, 
  onToggleFavorite, 
  isFavorite,
  isDownloaded,
  downloadProgress,
  onDownload,
  onDeleteLocal
}: { 
  book: BookFile, 
  dbBookId: string,
  accessToken: string, 
  progress?: UserProgress, 
  onOpen: (book: BookFile) => void,
  onToggleFavorite: (dbId: string, isFav: boolean) => void,
  isFavorite: boolean,
  isDownloaded: boolean,
  downloadProgress?: number,
  onDownload: (book: BookFile) => void,
  onDeleteLocal: (book: BookFile) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: book.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // ボタンのクリックなどによるバブリングを防ぐ
    if ((e.target as HTMLElement).closest('.action-button')) return;
    onOpen(book);
  };

  const isDownloading = downloadProgress !== undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      onClick={handleCardClick}
      className="group relative cursor-pointer flex flex-col items-center select-none outline-none"
    >
      {/* 3D風の立体的なブックジャケット */}
      <div className="relative w-[145px] h-[205px] rounded-r-lg bg-slate-900 border border-slate-800 shadow-[10px_15px_20px_rgba(0,0,0,0.4)] group-hover:shadow-[12px_22px_30px_rgba(30,58,138,0.3)] transition-all duration-300 transform group-hover:-translate-y-2 group-hover:rotate-y-6 flex overflow-hidden">
        
        {/* 紙 of 厚みを感じさせる左端の背表紙の影（3Dエフェクト） */}
        <div className="absolute left-0 top-0 bottom-0 w-[8px] bg-gradient-to-r from-black/60 via-black/10 to-transparent z-10"></div>
        <div className="absolute left-[8px] top-0 bottom-0 w-[1px] bg-white/10 z-10"></div>
        
        {/* 表紙レンダラー */}
        <BookCover fileId={book.id} accessToken={accessToken} thumbnailLink={book.thumbnailLink} />

        {/* 右上の鍵マーク（社長専用プライベート本） */}
        {book.isPrivate && (
          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600/90 flex items-center justify-center text-white shadow-md backdrop-blur-sm z-20" title="社長専用">
            <Lock className="w-3.5 h-3.5" />
          </div>
        )}

        {/* 左上のローカル保存状態バッジ (☁️ または ✅) */}
        {!isDownloading && (
          <div 
            className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full flex items-center gap-1 text-[9px] font-extrabold shadow-md backdrop-blur-sm z-20 transition-all ${
              isDownloaded 
                ? "bg-emerald-600/90 text-white border border-emerald-500/30" 
                : "bg-slate-950/70 text-blue-400 border border-slate-800"
            }`}
            title={isDownloaded ? "端末に完全保存済み（オフライン読書可能）" : "未保存（クラウド保管・開くたびにダウンロードが発生します）"}
          >
            {isDownloaded ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>保存済</span>
              </>
            ) : (
              <>
                <Cloud className="w-3 h-3 text-blue-400" />
                <span>クラウド</span>
              </>
            )}
          </div>
        )}

        {/* ダウンロード中の美麗なガラスモルフィズム・プログレスオーバーレイ */}
        {isDownloading && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-3 text-center z-30 select-none pointer-events-none">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
            <span className="text-[10px] text-blue-400 font-extrabold tracking-wider">
              ダウンロード中...
            </span>
            <span className="text-sm font-black text-white mt-1">
              {downloadProgress}%
            </span>
            {/* プログレスミニゲージ */}
            <div className="w-20 bg-slate-800 rounded-full h-1 overflow-hidden mt-2">
              <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${downloadProgress}%` }}></div>
            </div>
          </div>
        )}

        {/* アクションボタン（ホバー時に右下・中央下に展開されるボタン群） */}
        <div className="absolute bottom-2 left-2 right-2 flex justify-between gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
          {/* お気に入り星マーク */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(dbBookId, !isFavorite);
            }}
            className="action-button w-8 h-8 rounded-full bg-slate-950/80 hover:bg-slate-950 text-white flex items-center justify-center backdrop-blur-sm shadow-md border border-slate-800"
            title={isFavorite ? "お気に入り解除" : "お気に入り追加"}
          >
            <Star className={`w-4 h-4 ${isFavorite ? "text-yellow-400 fill-yellow-400" : "text-slate-400"}`} />
          </button>

          {/* ローカル保存/削除のアクションボタン */}
          {!isDownloading && (
            isDownloaded ? (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteLocal(book);
                }}
                className="action-button w-8 h-8 rounded-full bg-red-950/80 hover:bg-red-900 text-red-400 flex items-center justify-center backdrop-blur-sm shadow-md border border-red-900/30"
                title="端末から書籍データを安全に削除"
              >
                <Trash className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(book);
                }}
                className="action-button w-8 h-8 rounded-full bg-blue-950/80 hover:bg-blue-900 text-blue-400 flex items-center justify-center backdrop-blur-sm shadow-md border border-blue-900/30"
                title="書籍データを端末に完全ダウンロード（オフライン読書対応）"
              >
                <Cloud className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>

      {/* タイトル & 進捗情報 */}
      <div className="mt-3.5 w-[145px] flex flex-col items-center">
        <h4 className="text-[13px] font-bold text-slate-800 dark:text-slate-100 line-clamp-2 text-center group-hover:text-blue-500 transition-colors duration-200">
          {book.name.replace(/\.[^/.]+$/, "")} {/* 拡張子を除外 */}
        </h4>
        <div className="flex items-center gap-1.5 mt-1.5 w-full justify-center">
          {progress ? (
            <div className="flex flex-col items-center w-full px-1">
              <div className="w-full bg-slate-200 dark:bg-slate-700/80 rounded-full h-1 overflow-hidden">
                {/* 読了インジケーター（簡易） */}
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full" style={{ width: `${Math.min(progress.current_page * 10, 100)}%` }}></div>
              </div>
              <span className="text-[9px] font-extrabold text-blue-500 mt-1 dark:text-blue-400">
                P.{progress.current_page} まで読了
              </span>
            </div>
          ) : (
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
              未読
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- メインコンポーネント ---
export default function Bookshelf() {
  const navigate = useNavigate();
  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  
  // 状態管理
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isApiLoading, setIsApiLoading] = useState(true);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [gdriveFiles, setGdriveFiles] = useState<BookFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("すべて");
  const [dbBooks, setDbBooks] = useState<Record<string, DBCacheBook>>({}); // google_drive_id -> DB内Book
  const [progresses, setProgresses] = useState<Record<string, UserProgress>>({}); // book_id -> 進捗
  const [favorites, setFavorites] = useState<string[]>([]); // DBのbook_idの配列
  const [searchQuery, setSearchQuery] = useState("");
  const [orderMap, setOrderMap] = useState<Record<string, string[]>>({}); // category -> 本のID配列の表示順
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [isGoogleApiLoaded, setIsGoogleApiLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);

  // ドラッグ中の一時的状態
  const [activeDragId, setActiveId] = useState<string | null>(null);

  // サイレント自動トークンリフレッシュ処理 (Promiseキャッシュにより並行時の競合を完全防御)
  const refreshGoogleToken = useCallback(() => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const promise = new Promise<string>((resolve, reject) => {
      if (!tokenClient) return reject("Google Drive認証クライアントがまだ初期化されていません。");

      // バックアップ元のcallback
      const originalCallback = tokenClient.callback;

      tokenClient.callback = (response: any) => {
        // 終わったらPromiseキャッシュをクリア
        refreshPromiseRef.current = null;
        // 元のcallbackに戻す
        tokenClient.callback = originalCallback;

        if (response.error !== undefined) {
          console.error("Bookshelf silent refresh error:", response);
          reject(response.error);
          return;
        }

        const newToken = response.access_token;
        sessionStorage.setItem("google_drive_token", newToken);
        setGoogleToken(newToken);
        resolve(newToken);
      };

      tokenClient.requestAccessToken({ prompt: "" }); // サイレントリフレッシュ
    });

    refreshPromiseRef.current = promise;
    return promise;
  }, [tokenClient]);

  // 高耐久フェッチラッパー (401検知時に自動サイレントリフレッシュ ＆ シームレス自動リトライ)
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    let currentToken = googleToken || sessionStorage.getItem("google_drive_token");

    if (!currentToken) {
      try {
        currentToken = await refreshGoogleToken();
      } catch (err) {
        throw new Error("Google Driveへの自動認証に失敗しました。同期ボタンから再連携してください。");
      }
    }

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${currentToken}`
    };

    let res = await fetch(url, { ...options, headers });

    // 401 Unauthorized（認証切れ）を検知した場合
    if (res.status === 401) {
      console.warn("401 Unauthorized detected in Bookshelf. Attempting silent token refresh...");
      try {
        const newToken = await refreshGoogleToken();
        const retryHeaders = {
          ...options.headers,
          Authorization: `Bearer ${newToken}`
        };
        res = await fetch(url, { ...options, headers: retryHeaders });
      } catch (err) {
        console.error("Bookshelf silent refresh or retry failed:", err);
      }
    }

    return res;
  }, [googleToken, refreshGoogleToken]);

  // ローカル保存・Wi-Fiガード用のステート (ステップ2用)
  const [savedBookIds, setSavedBookIds] = useState<Set<string>>(new Set());
  const [downloadingStatus, setDownloadingStatus] = useState<Record<string, number>>({});
  const [wifiOnly, setWifiOnly] = useState<boolean>(() => {
    const saved = localStorage.getItem("bookshelf_wifi_only");
    return saved !== null ? saved === "true" : true;
  });
  const [showWifiWarning, setShowWifiWarning] = useState<boolean>(false);
  const [pendingDownloadBook, setPendingDownloadBook] = useState<BookFile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<BookFile | null>(null);

  // 保存済みの書籍一覧をIndexedDBから読み込む
  useEffect(() => {
    getSavedBookIds()
      .then((ids) => {
        setSavedBookIds(new Set(ids));
      })
      .catch((err) => {
        console.error("IndexedDBから保存済みIDの取得に失敗:", err);
      });
  }, []);

  // wifiOnly設定を保存
  const handleToggleWifiOnly = () => {
    setWifiOnly((prev) => {
      const next = !prev;
      localStorage.setItem("bookshelf_wifi_only", String(next));
      toast.info(next ? "Wi-Fi接続時のみ大容量通信を行います" : "モバイル回線でのダウンロードを許可しました（ギガ消費にご注意ください）");
      return next;
    });
  };

  // 1. Google Identity Services API & GAPI のロードと安全な初期化
  useEffect(() => {
    const initializeTokenClient = () => {
      if ((window as any).google?.accounts?.oauth2) {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          scope: 'https://www.googleapis.com/auth/drive',
          callback: '', 
        });
        setTokenClient(client);
        setIsApiLoading(false);
      }
    };

    const initializeGapi = () => {
      if ((window as any).gapi) {
        (window as any).gapi.load('client', () => {
          (window as any).gapi.client.load('drive', 'v3').then(() => {
            setIsGoogleApiLoaded(true);
          });
        });
      }
    };

    // スクリプト1: apis.google.com/js/api.js (gapi)
    if (!(window as any).gapi) {
      const script1 = document.createElement('script');
      script1.src = 'https://apis.google.com/js/api.js';
      script1.onload = initializeGapi;
      document.body.appendChild(script1);
    } else {
      initializeGapi();
    }

    // スクリプト2: accounts.google.com/gsi/client (google accounts)
    if (!(window as any).google?.accounts?.oauth2) {
      const script2 = document.createElement('script');
      script2.src = 'https://accounts.google.com/gsi/client';
      script2.onload = initializeTokenClient;
      document.body.appendChild(script2);
    } else {
      initializeTokenClient();
    }

    // ログイン中のユーザー情報を取得
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // 2. Supabase から本のキャッシュ、お気に入り、進捗、並び順データを取得
  const loadDatabaseData = async (driveFiles: BookFile[]) => {
    if (driveFiles.length === 0) return;
    try {
      const driveIds = driveFiles.map(f => f.id);

      // ① データベース内の books データを参照（存在しないものは後で挿入する）
      const { data: booksData, error: booksError } = await supabase
        .from("books")
        .select("*")
        .in("google_drive_id", driveIds);

      if (booksError) throw booksError;

      const cacheMap: Record<string, DBCacheBook> = {};
      const foundDriveIds = new Set<string>();
      if (booksData) {
        booksData.forEach((b: DBCacheBook) => {
          cacheMap[b.google_drive_id] = b;
          foundDriveIds.add(b.google_drive_id);
        });
      }

      // データベースに存在しない本があれば、一括で books テーブルに登録（キャッシュ）
      const missingFiles = driveFiles.filter(f => !foundDriveIds.has(f.id));
      if (missingFiles.length > 0) {
        const insertRows = missingFiles.map(f => ({
          google_drive_id: f.id,
          title: f.name,
          mime_type: f.mimeType,
          parent_folder_id: f.parentFolderId
        }));
        const { data: insertedBooks, error: insertError } = await supabase
          .from("books")
          .insert(insertRows)
          .select();

        if (!insertError && insertedBooks) {
          insertedBooks.forEach((b: DBCacheBook) => {
            cacheMap[b.google_drive_id] = b;
          });
        }
      }

      setDbBooks(cacheMap);

      // ② ユーザーの読書進捗 (user_book_progress) の取得
      const dbBookIds = Object.values(cacheMap).map(b => b.id);
      if (dbBookIds.length > 0) {
        const { data: progressData, error: progressError } = await supabase
          .from("user_book_progress")
          .select("*")
          .in("book_id", dbBookIds);

        if (!progressError && progressData) {
          const progMap: Record<string, UserProgress> = {};
          const favList: string[] = [];
          progressData.forEach((p: any) => {
            progMap[p.book_id] = p;
            if (p.view_settings?.is_favorite) {
              favList.push(p.book_id);
            }
          });
          setProgresses(progMap);
          setFavorites(favList);
        }
      }

      // ③ 本棚の並び順 (bookshelf_orders) の取得
      const { data: orderData, error: orderError } = await supabase
        .from("bookshelf_orders")
        .select("*");
      if (!orderError && orderData) {
        const ords: Record<string, string[]> = {};
        orderData.forEach((o: any) => {
          ords[o.category] = o.ordered_book_ids;
        });
        setOrderMap(ords);
      }

    } catch (e) {
      console.error("Failed to load metadata from Supabase", e);
    }
  };

  // 3. Google Drive からPDFファイルを検索・取得
  const syncWithGoogleDrive = (accessToken: string) => {
    setIsDriveSyncing(true);
    toast.loading("Google Driveと本棚を同期しています...", { id: "sync-drive" });

    // 指定フォルダの子階層（サブフォルダおよびPDF）をロードする内部関数
    const fetchFolderContents = async (folderId: string, isPrivate: boolean): Promise<{ files: BookFile[], subFolders: { id: string, name: string }[] }> => {
      try {
        // ① サブフォルダの一覧を取得
        const subFolderQuery = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subFolderQuery)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const folderRes = await authenticatedFetch(folderUrl);
        const folderData = await folderRes.json();
        const subFolders = folderData.files || [];

        const allFiles: BookFile[] = [];

        // ② 親フォルダ直下のPDFを取得
        const directPdfQuery = `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`;
        const directPdfUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(directPdfQuery)}&fields=files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const directRes = await authenticatedFetch(directPdfUrl);
        const directData = await directRes.json();
        if (directData.files) {
          directData.files.forEach((f: any) => {
            allFiles.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              parentFolderId: folderId,
              parentFolderName: "未分類",
              isPrivate,
              webViewLink: f.webViewLink,
              webContentLink: f.webContentLink,
              thumbnailLink: f.thumbnailLink
            });
          });
        }

        // ③ 各サブフォルダ内のPDFを取得
        for (const sf of subFolders) {
          const sfPdfQuery = `'${sf.id}' in parents and mimeType = 'application/pdf' and trashed = false`;
          const sfPdfUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(sfPdfQuery)}&fields=files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
          const sfRes = await authenticatedFetch(sfPdfUrl);
          const sfData = await sfRes.json();
          if (sfData.files) {
            sfData.files.forEach((f: any) => {
              allFiles.push({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType,
                parentFolderId: sf.id,
                parentFolderName: sf.name,
                isPrivate,
                webViewLink: f.webViewLink,
                webContentLink: f.webContentLink,
                thumbnailLink: f.thumbnailLink
              });
            });
          }
        }

        return { files: allFiles, subFolders };
      } catch (e) {
        console.warn(`Folder access failed for ${folderId} (isPrivate: ${isPrivate})`, e);
        return { files: [], subFolders: [] }; // アクセス拒否時は空配列を返す
      }
    };

    Promise.all([
      fetchFolderContents(PUBLIC_FOLDER_ID, false),  // 会社共有フォルダ
      fetchFolderContents(PRIVATE_FOLDER_ID, true)   // 社長専用個人フォルダ
    ]).then(([publicResult, privateResult]) => {
      const mergedFiles = [...publicResult.files, ...privateResult.files];
      
      // カテゴリ（サブフォルダ名）をユニークに抽出
      const categoriesSet = new Set<string>();
      categoriesSet.add("すべて");
      categoriesSet.add("お気に入り");

      publicResult.subFolders.forEach(sf => categoriesSet.add(sf.name));
      privateResult.subFolders.forEach(sf => categoriesSet.add(sf.name));
      
      // 未分類ファイルがあるか
      const hasUnclassified = mergedFiles.some(f => f.parentFolderName === "未分類");
      if (hasUnclassified) {
        categoriesSet.add("未分類");
      }

      setCategories(Array.from(categoriesSet));
      setGdriveFiles(mergedFiles);
      
      // Supabaseのキャッシュと接続
      loadDatabaseData(mergedFiles);

      setIsDriveSyncing(false);
      toast.success("本棚の同期が完了しました！", { id: "sync-drive" });
    }).catch(e => {
      console.error("Sync failed", e);
      setIsDriveSyncing(false);
      toast.error("Driveとの同期に失敗しました", { id: "sync-drive" });
    });
  };

  // 4. ドライブの明示的認証＆ロード
  const handleAuthAndLoad = () => {
    if (!tokenClient) {
      toast.error("Google Drive認証クライアントがまだ初期化されていません。数秒待ってから再度お試しください。");
      // 念のためその場で初期化を再試行
      if ((window as any).google?.accounts?.oauth2) {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          scope: 'https://www.googleapis.com/auth/drive',
          callback: '', 
        });
        setTokenClient(client);
        toast.info("認証クライアントをその場で初期化しました。もう一度連携ボタンを押してください。");
      }
      return;
    }
    if (!isGoogleApiLoaded) {
      toast.info("Google APIのロードが完了していません。2〜3秒待ってから再度お試しください。");
      // 念のため再ロード
      if ((window as any).gapi) {
        (window as any).gapi.load('client', () => {
          (window as any).gapi.client.load('drive', 'v3').then(() => {
            setIsGoogleApiLoaded(true);
          });
        });
      }
      return;
    }
    
    tokenClient.callback = async (response: any) => {
      if (response.error !== undefined) {
        console.error(response);
        toast.error("Google Driveの認証に失敗しました");
        return;
      }
      setGoogleToken(response.access_token);
      sessionStorage.setItem("google_drive_token", response.access_token);
      syncWithGoogleDrive(response.access_token);
    };

    tokenClient.requestAccessToken({ prompt: "" });
  };

  // 自動的な初期化（セッションストレージからの復元を優先）
  useEffect(() => {
    const savedToken = sessionStorage.getItem("google_drive_token");
    if (savedToken) {
      setGoogleToken(savedToken);
      syncWithGoogleDrive(savedToken);
      return; // 既にトークンがあれば認証処理をスキップ
    }

    if (tokenClient && isGoogleApiLoaded && !googleToken) {
      handleAuthAndLoad();
    }
  }, [tokenClient, isGoogleApiLoaded]);

  // 5. お気に入り登録のトグル（Supabase経由）
  const handleToggleFavorite = async (dbBookId: string, makeFav: boolean) => {
    if (!currentUserId || !dbBookId) return;

    try {
      // 進捗状況(user_book_progress)があれば更新、なければ新規作成(UPSERT)
      const currentProgress = progresses[dbBookId] || {
        current_page: 1,
        zoom_scale: 1.0,
        crop_settings: {},
        view_settings: {}
      };

      const updatedViewSettings = {
        ...(currentProgress.view_settings || {}),
        is_favorite: makeFav
      };

      const { data, error } = await supabase
        .from("user_book_progress")
        .upsert({
          user_id: currentUserId,
          book_id: dbBookId,
          current_page: currentProgress.current_page,
          zoom_scale: currentProgress.zoom_scale,
          crop_settings: currentProgress.crop_settings,
          view_settings: updatedViewSettings,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // 状態の更新
      setProgresses(prev => ({
        ...prev,
        [dbBookId]: data
      }));

      setFavorites(prev => {
        if (makeFav) {
          return [...prev, dbBookId];
        } else {
          return prev.filter(id => id !== dbBookId);
        }
      });

      toast.success(makeFav ? "お気に入りに登録しました" : "お気に入りから解除しました");
    } catch (e) {
      console.error(e);
      toast.error("お気に入りの更新に失敗しました");
    }
  };

  // 6. ドラッグ＆ドロップ並び替えの終了ハンドラ
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    // 現在のアクティブ棚における表示本の一覧
    const currentTabBooks = getFilteredAndSortedBooks();
    const oldIndex = currentTabBooks.findIndex(b => b.id === active.id);
    const newIndex = currentTabBooks.findIndex(b => b.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // ドライブIDの順序を入れ替え
    const reorderedBooks = arrayMove(currentTabBooks, oldIndex, newIndex);
    const newDriveIdsOrder = reorderedBooks.map(b => b.id);

    // 状態更新
    setOrderMap(prev => ({
      ...prev,
      [activeCategory]: newDriveIdsOrder
    }));

    // Supabaseに並び順を永続化
    if (currentUserId) {
      try {
        await supabase
          .from("bookshelf_orders")
          .upsert({
            user_id: currentUserId,
            category: activeCategory,
            ordered_book_ids: newDriveIdsOrder,
            updated_at: new Date().toISOString()
          });
      } catch (err) {
        console.error("Failed to save book orders", err);
      }
    }
  };

  // 7. カテゴリ＆検索フィルタリング、並び順適用ロジック
  const getFilteredAndSortedBooks = (): BookFile[] => {
    let filtered = gdriveFiles.filter(f => {
      // 検索フィルター
      const matchesSearch = searchQuery === "" || f.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // カテゴリフィルター
      if (activeCategory === "すべて") return true;
      if (activeCategory === "未分類") return f.parentFolderName === "未分類";
      if (activeCategory === "お気に入り") {
        const dbBook = dbBooks[f.id];
        return dbBook && favorites.includes(dbBook.id);
      }
      return f.parentFolderName === activeCategory;
    });

    // カスタム並び順 (orderMap) の適用
    const currentCategoryOrder = orderMap[activeCategory];
    if (currentCategoryOrder && currentCategoryOrder.length > 0) {
      const orderSet = new Map(currentCategoryOrder.map((id, index) => [id, index]));
      filtered.sort((a, b) => {
        const indexA = orderSet.has(a.id) ? orderSet.get(a.id)! : 9999;
        const indexB = orderSet.has(b.id) ? orderSet.get(b.id)! : 9999;
        return indexA - indexB;
      });
    }

    return filtered;
  };

  // --- ステップ2：完全ローカル保存（Kindle化）＆Wi-Fi大容量通信ガードの実装 ---

  // モバイル回線の判定ヘルパー
  const checkNetworkIsCellular = (): boolean => {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      if (conn.type === 'cellular' || conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === '3g') {
        return true;
      }
    }
    return false;
  };

  // 書籍のダウンロード（IndexedDBへの永続キャッシュ）
  const handleStartDownload = async (book: BookFile, force: boolean = false) => {
    if (!googleToken) {
      toast.error("Google Driveへの認証が必要です。同期ボタンを押して連携してください。");
      return;
    }

    // Wi-Fiガード自動検知
    if (!force && wifiOnly && checkNetworkIsCellular()) {
      setPendingDownloadBook(book);
      setShowWifiWarning(true);
      return;
    }

    const fileId = book.id;
    setDownloadingStatus(prev => ({ ...prev, [fileId]: 0 }));
    toast.info(`「${book.name.replace(/\.[^/.]+$/, "")}」のダウンロードを開始します...`, { id: `dl-toast-${fileId}` });

    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
      const response = await authenticatedFetch(url);

      if (!response.ok) {
        throw new Error(`Google Drive API エラー: ${response.status}`);
      }

      const contentLength = response.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("ストリームリーダーを取得できませんでした");
      }

      let receivedBytes = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.length;

        if (totalBytes > 0) {
          const percent = Math.round((receivedBytes / totalBytes) * 100);
          setDownloadingStatus(prev => ({ ...prev, [fileId]: percent }));
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: "application/pdf" });
      await saveBookBlob(fileId, blob);

      // 保存済みリストを更新
      setSavedBookIds(prev => {
        const next = new Set(prev);
        next.add(fileId);
        return next;
      });

      toast.success(`「${book.name.replace(/\.[^/.]+$/, "")}」を端末に完全保存しました！（次回からオフラインで一瞬で起動します）`, { id: `dl-toast-${fileId}` });
    } catch (err) {
      console.error("ダウンロード失敗:", err);
      toast.error(`「${book.name.replace(/\.[^/.]+$/, "")}」のダウンロードに失敗しました。`, { id: `dl-toast-${fileId}` });
    } finally {
      setDownloadingStatus(prev => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    }
  };

  // 端末削除の確認
  const handleRequestDeleteLocal = (book: BookFile) => {
    setPendingDeleteBook(book);
    setShowDeleteConfirm(true);
  };

  // 端末削除の実行
  const handleExecuteDeleteLocal = async () => {
    if (!pendingDeleteBook) return;
    const fileId = pendingDeleteBook.id;
    const name = pendingDeleteBook.name.replace(/\.[^/.]+$/, "");

    try {
      await deleteBookBlob(fileId);
      setSavedBookIds(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
      toast.success(`「${name}」の端末データを削除しました。端末容量が解放されました。`);
    } catch (err) {
      console.error("ローカル書籍データ削除失敗:", err);
      toast.error("端末データの削除に失敗しました。");
    } finally {
      setShowDeleteConfirm(false);
      setPendingDeleteBook(null);
    }
  };

  // 8. 本を閲覧（ビュワーへ遷移）
  const handleOpenBook = (book: BookFile) => {
    // Supabaseの書籍テーブルIDを取得、または作成してビュワーに引き渡す
    const dbBook = dbBooks[book.id];
    if (dbBook) {
      // state としてアクセストークンやファイル詳細を引き渡す
      navigate(`/bookshelf/${dbBook.id}`, { 
        state: { 
          driveFileId: book.id, 
          accessToken: googleToken,
          title: book.name,
          isPrivate: book.isPrivate
        } 
      });
    } else {
      toast.error("書籍の初期化中です。少し待ってから再度開いてください。");
    }
  };

  const filteredBooks = getFilteredAndSortedBooks();

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100 min-h-0 relative">
      
      {/* プレミアムなガラスモルフィズム ヘッダー */}
      <header className="p-6 shrink-0 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <BookOpen className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-blue-400 tracking-wide">
              デジタル本棚
            </h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide mt-0.5">
              会社の共有資料 ＆ 社長プライベート書籍箱
            </p>
          </div>
        </div>

        {/* 検索 ＆ 同期操作バー */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="本を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-800/50 border border-slate-700/80 focus:border-blue-500 focus:outline-none w-[180px] sm:w-[220px] transition-all text-slate-100 placeholder-slate-500 font-bold backdrop-blur-sm"
            />
          </div>
          
          {/* Wi-Fiガード設定トグルボタン */}
          <button
            onClick={handleToggleWifiOnly}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
              wifiOnly 
                ? "bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600/20" 
                : "bg-amber-600/10 border-amber-500/30 text-amber-400 hover:bg-amber-600/20"
            }`}
            title={wifiOnly ? "大容量ダウンロードはWi-Fi接続時のみに自動制限します" : "モバイル回線でのダウンロードを許可しています（ギガ消費注意）"}
          >
            {wifiOnly ? <Wifi className="w-3.5 h-3.5 text-blue-400 animate-pulse" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
            <span className="hidden md:inline">{wifiOnly ? "Wi-Fi制限ON" : "制限OFF"}</span>
          </button>

          <button 
            onClick={handleAuthAndLoad}
            disabled={isDriveSyncing}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700/80 disabled:opacity-50 transition-all text-slate-200"
            title="本棚を最新化する"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-spin text-blue-400' : ''}`} />
            <span className="hidden sm:inline">同期</span>
          </button>
        </div>
      </header>

      {/* プレミアム本棚の棚（カテゴリタブ） */}
      {categories.length > 2 && (
        <div className="p-3 shrink-0 bg-slate-950/20 border-b border-slate-800/40 overflow-x-auto flex items-center gap-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 text-xs font-extrabold rounded-lg transition-all whitespace-nowrap ${
                activeCategory === cat 
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                  : "bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-100 border border-slate-800"
              }`}
            >
              {cat === "お気に入り" && <Star className="w-3.5 h-3.5 inline mr-1 fill-yellow-400 text-yellow-400" />}
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* メインエリア：本を並べる棚 */}
      <div className="flex-1 p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
        {googleToken === null ? (
          /* Googleログインが必要な場合 */
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-20 h-20 rounded-full bg-blue-600/10 flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
              <KeyRound className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="text-lg font-black text-white tracking-wide">Google Drive認証が必要です</h3>
            <p className="text-xs text-slate-400 mt-2 max-w-sm font-medium leading-relaxed">
              本棚を表示するには、Google Driveへの接続認可を付与する必要があります。以下のボタンをクリックしてログインしてください。
            </p>
            <button 
              onClick={handleAuthAndLoad}
              className="mt-6 px-6 py-3 font-extrabold text-xs rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              Google Driveと連携する
            </button>
          </div>
        ) : isDriveSyncing && gdriveFiles.length === 0 ? (
          /* 同期中ローディング */
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            <span className="text-xs text-slate-400 font-extrabold tracking-widest animate-pulse">
              本棚を組み立てています...
            </span>
          </div>
        ) : filteredBooks.length === 0 ? (
          /* 書籍が空の場合 */
          <div className="h-full flex flex-col items-center justify-center text-center p-6 py-20">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-4">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-300">本棚が空っぽです</h3>
            <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-medium">
              {activeCategory === "お気に入り" 
                ? "本の上にある星マークをタップしてお気に入りに追加してみましょう。"
                : "指定されたGoogle Driveフォルダ、またはそのサブフォルダにPDFファイルを格納してください。"
              }
            </p>
          </div>
        ) : (
          /* 本の一覧グリッド (ドラッグ＆ドロップ対応) */
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={filteredBooks.map(b => b.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12 justify-items-center">
                {filteredBooks.map((book) => {
                  const dbBook = dbBooks[book.id];
                  return (
                    <SortableBookCard 
                      key={book.id} 
                      book={book} 
                      dbBookId={dbBook ? dbBook.id : ""}
                      accessToken={googleToken}
                      progress={dbBook ? progresses[dbBook.id] : undefined}
                      onOpen={handleOpenBook}
                      onToggleFavorite={handleToggleFavorite}
                      isFavorite={dbBook ? favorites.includes(dbBook.id) : false}
                      isDownloaded={savedBookIds.has(book.id)}
                      downloadProgress={downloadingStatus[book.id]}
                      onDownload={handleStartDownload}
                      onDeleteLocal={handleRequestDeleteLocal}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* --- Wi-Fiガード大容量通信警告モーダル（高級感のあるガラスモルフィズム） --- */}
      {showWifiWarning && pendingDownloadBook && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-2xl p-6 md:p-8 flex flex-col relative overflow-hidden">
            {/* 背景のグロー効果 */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-600/10 rounded-full blur-3xl"></div>

            <div className="flex items-center gap-4 mb-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-amber-600/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shrink-0">
                <WifiOff className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">大容量通信（ギガ消費）の警告</h3>
                <p className="text-[10px] text-amber-400 font-extrabold mt-0.5 tracking-wider uppercase">Wi-Fi Guard Protected</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed space-y-3 mb-6 font-medium relative z-10">
              <p>
                社長、現在モバイルデータ回線（4G/5G）に接続されている、またはデータ節約モードが有効になっている可能性があります。
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 font-bold text-slate-100 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400">ダウンロード対象の書籍:</span>
                <span className="text-xs text-blue-400 line-clamp-2">「{pendingDownloadBook.name.replace(/\.[^/.]+$/, "")}」</span>
                <span className="text-[10px] text-slate-400 mt-1">推定サイズ: 数十MB 〜 百MB超</span>
              </div>
              <p>
                ダウンロードを実行すると多額のパケット通信料（ギガ消費）が発生する恐れがあります。Wi-Fi環境までダウンロードを保留しますか？
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 relative z-10">
              <button
                onClick={() => {
                  setShowWifiWarning(false);
                  setPendingDownloadBook(null);
                }}
                className="flex-1 py-3 text-xs font-black rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all text-center"
              >
                Wi-Fiを待つ（キャンセル）
              </button>
              <button
                onClick={() => {
                  if (pendingDownloadBook) {
                    handleStartDownload(pendingDownloadBook, true); // force=trueで警告を無視して進める
                  }
                  setShowWifiWarning(false);
                  setPendingDownloadBook(null);
                }}
                className="flex-1 py-3 text-xs font-black rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-center"
              >
                強制ダウンロード（続行）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 端末データ削除の確認モーダル --- */}
      {showDeleteConfirm && pendingDeleteBook && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-2xl p-6 md:p-8 flex flex-col relative overflow-hidden">
            <div className="flex items-center gap-4 mb-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-red-600/10 flex items-center justify-center text-red-500 border border-red-500/20 shrink-0">
                <Trash className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">端末データのみ安全削除</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5 tracking-wider uppercase">Local cache deletion</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed mb-6 font-medium relative z-10">
              <p>
                以下の書籍の**端末保存データ（PDF実体データ）のみを安全に削除**します。
              </p>
              <div className="p-3 my-3 rounded-xl bg-slate-950/50 border border-slate-800 font-bold text-slate-100 line-clamp-2">
                「{pendingDeleteBook.name.replace(/\.[^/.]+$/, "")}」
              </div>
              <p className="text-slate-400">
                ⚠️ <strong className="text-slate-200">ご安心ください：</strong> Google Drive上にある原本、およびSupabaseに保存されている読書進捗（現在読んでいるページ数やしおり、お気に入り）は**1バイトも削除されず、完全に保持**されます。再度本棚からダウンロードすることも可能です。
              </p>
            </div>

            <div className="flex gap-3 relative z-10">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setPendingDeleteBook(null);
                }}
                className="flex-1 py-3 text-xs font-black rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all"
              >
                キャンセル
              </button>
              <button
                onClick={handleExecuteDeleteLocal}
                className="flex-1 py-3 text-xs font-black rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                端末からのみ削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
