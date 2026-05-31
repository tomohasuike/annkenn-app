import React, { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useNavigate, useLocation, useOutletContext } from "react-router-dom"
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Sliders, Sun, Moon, Bookmark, 
  BookmarkCheck, FileText, Loader2, Sparkles, Maximize2, Minimize2, 
  Settings, Columns, BookOpen, ToggleLeft, ToggleRight, RotateCcw, 
  Eye, CornerDownRight, Check
} from "lucide-react"
import { getBookBlob, saveBookBlob, deleteBookBlob } from "./bookshelfDb"
import { toast } from "sonner"
import { supabase } from "../../lib/supabase"
import { Document, Page, pdfjs } from "react-pdf"

// pdf.js のワーカーをセットアップ（外部CDNへの依存を100%排除し、ローカルのnode_modulesから直接ビルド・配信することで、オフラインでもMixed Contentや404エラーを完全に防止）
// window.location.origin を明示的に付与した完全な絶対URLにすることで、ルーティング階層が深くてもワーカーが迷子（404）にならず100%ロードされるように徹底
pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.min.mjs"

// フィルタータイプ
type FilterMode = "normal" | "high-contrast" | "sepia" | "dark"

// トリミング設定
interface CropSettings {
  top: number;    // %
  bottom: number; // %
  left: number;   // %
  right: number;  // %
}

// しおり
interface BookmarkItem {
  id: string;
  page_number: number;
  note: string;
  created_at: string;
}

export default function BookViewer() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  
  // 親のAppLayoutから左サイドバーの開閉状態をリアルタイムに取得
  const outletContext = useOutletContext<{ isSidebarOpen: boolean; setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>> }>()
  const isSidebarOpen = outletContext ? outletContext.isSidebarOpen : false
  
  // ロケーションステートまたはローカルストレージから情報を取得
  const state = location.state || {}
  const [driveFileId, setDriveFileId] = useState<string | null>(state.driveFileId || null)
  const [accessToken, setAccessToken] = useState<string | null>(state.accessToken || null)
  const [bookTitle, setBookTitle] = useState<string>(state.title || "書籍ビュワー")
  
  // 状態管理
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [numPages, setNumPages] = useState<number>(0)
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | null>(null)
  
  // 読書設定（Supabase同期対象）
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [isSpreadMode, setIsSpreadMode] = useState<boolean>(true) // 見開きモード
  const [isRightToLeft, setIsRightToLeft] = useState<boolean>(true) // 右開き（小説・漫画用）
  const [filterMode, setFilterMode] = useState<FilterMode>("normal")
  const [crop, setCrop] = useState<CropSettings>({ top: 0, bottom: 0, left: 0, right: 0 })
  const [zoomScale, setZoomScale] = useState<number>(1.0)
  
  // UIコントロール
  const [showControls, setShowControls] = useState<boolean>(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [bookmarkNote, setBookmarkNote] = useState<string>("")
  const [showBookmarks, setShowBookmarks] = useState<boolean>(false)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // 一時オブジェクトURLの一元管理用Ref
  const pdfBlobUrlRef = useRef<string | null>(null)

  // 安全にURLを更新し、古いURLのメモリを即時解放するヘルパー
  const setSafePdfUrl = useCallback((blob: Blob) => {
    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current)
    }
    const url = URL.createObjectURL(blob)
    pdfBlobUrlRef.current = url
    setPdfBlobUrl(url)
  }, [])

  // コンポーネントが完全にアンマウント（画面を閉じる）される際にのみ、オブジェクトURLを安全に破棄
  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current)
        pdfBlobUrlRef.current = null
      }
    }
  }, [])

  const controlsTimeoutRef = useRef<any>(null)
  const saveTimeoutRef = useRef<any>(null)
  const [tokenClient, setTokenClient] = useState<any>(null)
  const mountedRef = useRef<boolean>(true)

  // マウント監視
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Google Identity Services の自動初期化
  useEffect(() => {
    const initializeTokenClient = () => {
      if ((window as any).google?.accounts?.oauth2) {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          scope: 'https://www.googleapis.com/auth/drive',
          callback: '', 
        });
        setTokenClient(client);
      }
    };

    if (!(window as any).google?.accounts?.oauth2) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = initializeTokenClient;
      document.body.appendChild(script);
    } else {
      initializeTokenClient();
    }
  }, []);

  // サイレント自動トークンリフレッシュ処理 (ビュワー単体でのセッション復元仕様)
  const refreshGoogleToken = useCallback(() => {
    return new Promise<string>((resolve, reject) => {
      let client = tokenClient;
      if (!client && (window as any).google?.accounts?.oauth2) {
        client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          scope: 'https://www.googleapis.com/auth/drive',
          callback: '', 
        });
        setTokenClient(client);
      }

      if (!client) {
        return reject("Google Drive認証クライアントが初期化されていません。しばらくお待ちください。");
      }

      client.callback = (response: any) => {
        if (response.error !== undefined) {
          console.error("Viewer silent refresh error:", response);
          reject(response.error);
          return;
        }
        const newToken = response.access_token;
        sessionStorage.setItem("google_drive_token", newToken);
        setAccessToken(newToken);
        resolve(newToken);
      };

      client.requestAccessToken({ prompt: "" }); // サイレントリフレッシュ
    });
  }, [tokenClient]);

  // PDFダウンロード ＆ ローカルキャッシュ制御ロジック (破損キャッシュを100%遮断)
  const loadPdf = useCallback(async (forceCloud: boolean = false) => {
    if (!driveFileId) return
    setIsLoading(true)
    setLoadErrorDetails(null)

    try {
      // ① forceCloud でない場合は、まずローカル（IndexedDB）をチェック
      if (!forceCloud) {
        const localBlob = await getBookBlob(driveFileId)
        if (localBlob && localBlob.size > 0) {
          if (localBlob.type === "application/pdf") {
            if (mountedRef.current) {
              setSafePdfUrl(localBlob)
              setIsLoading(false)
              toast.success("ローカルから瞬間起動しました（通信量0KB）");
            }
            return
          } else {
            console.warn("Local cache is corrupted (not a PDF). Cleansing cache...");
            await deleteBookBlob(driveFileId)
          }
        }
      }

      // ② クラウドからフェッチ
      if (mountedRef.current) {
        toast.info("クラウドからダウンロード中...")
      }
      let token = accessToken || sessionStorage.getItem("google_drive_token")

      if (!token) {
        try {
          token = await refreshGoogleToken()
        } catch (err) {
          throw new Error("Google Driveへの自動認証に失敗しました。本棚から再度お開きください。")
        }
      }

      let res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      // 401エラー（トークン切れ）を検知した場合のサイレント再認証＆リトライ
      if (res.status === 401) {
        console.warn("401 Unauthorized detected in Viewer. Attempting silent refresh...");
        try {
          const newToken = await refreshGoogleToken()
          res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${newToken}` }
          })
        } catch (refreshErr) {
          console.error("Viewer silent refresh failed:", refreshErr);
          throw new Error("Google認証の有効期限が切れました。自動再認証に失敗したため、本棚に戻って同期し直してください。")
        }
      }

      if (!res.ok) {
        throw new Error(`Google Drive API エラー: ${res.status}`)
      }

      const blob = await res.blob()

      // 取得したBlobが本当にPDF形式であるか厳密にチェック（エラーJSONや401メッセージテキストなどのすり抜けを遮断）
      if (blob.type !== "application/pdf" || blob.size < 1000) {
        if (driveFileId) {
          await deleteBookBlob(driveFileId);
        }
        let errorText = "取得したデータがPDF形式ではありません。";
        try {
          const text = await blob.text()
          console.error("ダウンロードデータがPDFではありませんでした:", text)
          if (text.includes("401") || text.includes("Unauthorized")) {
            errorText = "Googleの認証セッションが切れました。";
          } else if (text.includes("403") || text.includes("forbidden")) {
            errorText = "Google Driveへのアクセス権限がないか、API制限に達しました。";
          }
        } catch (e) {}
        throw new Error(`${errorText} 破損キャッシュを防止するため、ローカル保存データをクレンジングしました。`)
      }

      if (mountedRef.current) {
        setSafePdfUrl(blob)

        // ③ 正常なPDFであれば、バックグラウンドで自動ローカル保存（Kindle仕様）
        saveBookBlob(driveFileId, blob)
          .then(() => {
            console.log(`Book ${driveFileId} automatically cached locally.`);
          })
          .catch(err => {
            console.error("自動ローカルキャッシュ保存失敗:", err);
          })
      }
    } catch (err: any) {
      console.error("Failed to download PDF", err)
      if (mountedRef.current) {
        setLoadErrorDetails(err.message || "PDFファイルをロードできませんでした")
        toast.error(err.message || "Google DriveからPDFをダウンロードできませんでした")
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [driveFileId, accessToken, refreshGoogleToken, setSafePdfUrl])

  // 初期ロードのトリガー
  useEffect(() => {
    loadPdf()
  }, [loadPdf])

  // キャッシュ強制消去 ＆ クラウドから原本再取得（自己修復リカバリー）
  const handleForceRecover = async () => {
    try {
      toast.loading("キャッシュをクリアして再取得しています...", { id: "force-recover" });
      if (driveFileId) {
        await deleteBookBlob(driveFileId); // 確実にローカルキャッシュを完全物理削除！
      }
      await loadPdf(true); // forceCloud = true で強制的にGoogle Driveから新規取得
      toast.success("最新の書籍データを再取得しました！", { id: "force-recover" });
    } catch (err: any) {
      console.error("Force recover failed:", err);
      toast.error(err.message || "キャッシュのクリア、または再取得に失敗しました。", { id: "force-recover" });
    }
  };

  // 1. 画面タップでのコントロールトグル
  const handleToggleControls = (e: React.MouseEvent) => {
    // ボタンやスライダー、設定パネルなどのクリックでのトグルを防ぐ
    const target = e.target as HTMLElement
    if (target.closest(".viewer-control-panel") || target.closest("button") || target.closest("input") || target.closest("select")) {
      return
    }
    setShowControls(prev => !prev)
  }

  // 2. ユーザーID of 取得 & 自動ログイン状態の監視
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id)
      } else {
        toast.error("ログインが必要です")
        navigate("/login")
      }
    })
  }, [navigate])

  // 3. 書籍情報がstateにない場合、Supabaseから復元
  useEffect(() => {
    const fetchBookInfo = async () => {
      if (!bookId) return
      try {
        const { data, error } = await supabase
          .from("books")
          .select("*")
          .eq("id", bookId)
          .single()

        if (error) throw error
        if (data) {
          setDriveFileId(data.google_drive_id)
          setBookTitle(data.title)
        }
      } catch (err) {
        console.error("Failed to load book info from DB", err)
        toast.error("書籍情報の読み込みに失敗しました")
      }
    }

    if (!driveFileId && bookId) {
      fetchBookInfo()
    }
  }, [bookId, driveFileId])

  // 5. 読書進捗（現在ページ、各種設定）をしおり含めてロード (Supabase)
  useEffect(() => {
    if (!currentUserId || !bookId) return

    const loadProgressAndBookmarks = async () => {
      try {
        // 進捗取得
        const { data: progress, error: progError } = await supabase
          .from("user_book_progress")
          .select("*")
          .eq("book_id", bookId)
          .eq("user_id", currentUserId)
          .maybeSingle()

        if (!progError && progress) {
          setCurrentPage(progress.current_page || 1)
          if (progress.zoom_scale) setZoomScale(progress.zoom_scale)
          if (progress.crop_settings) {
            setCrop(progress.crop_settings as CropSettings)
          }
          if (progress.view_settings) {
            const vs = progress.view_settings as any
            if (vs.isSpreadMode !== undefined) setIsSpreadMode(vs.isSpreadMode)
            if (vs.isRightToLeft !== undefined) setIsRightToLeft(vs.isRightToLeft)
            if (vs.filterMode !== undefined) setFilterMode(vs.filterMode)
          }
        }

        // しおり取得
        const { data: bookmarksData, error: bMarkError } = await supabase
          .from("bookmarks")
          .select("*")
          .eq("book_id", bookId)
          .eq("user_id", currentUserId)
          .order("page_number", { ascending: true })

        if (!bMarkError && bookmarksData) {
          setBookmarks(bookmarksData)
        }
      } catch (e) {
        console.error("Failed to load progress or bookmarks", e)
      }
    }

    loadProgressAndBookmarks()
  }, [bookId, currentUserId])

  // 6. 進捗データをSupabaseに自動保存（デバウンス処理）
  const saveProgress = useCallback(async (page: number, currentCrop: CropSettings, spread: boolean, rtl: boolean, filter: FilterMode, scale: number) => {
    if (!currentUserId || !bookId) return

    try {
      await supabase
        .from("user_book_progress")
        .upsert({
          user_id: currentUserId,
          book_id: bookId,
          current_page: page,
          zoom_scale: scale,
          crop_settings: currentCrop,
          view_settings: {
            isSpreadMode: spread,
            isRightToLeft: rtl,
            filterMode: filter
          },
          updated_at: new Date().toISOString()
        })
    } catch (e) {
      console.error("Failed to autosave progress", e)
    }
  }, [currentUserId, bookId])

  // 状態変化時に自動セーブをトリガー
  useEffect(() => {
    if (isLoading || numPages === 0) return

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(() => {
      saveProgress(currentPage, crop, isSpreadMode, isRightToLeft, filterMode, zoomScale)
    }, 1200) // 1.2秒変更がない場合にセーブ

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [currentPage, crop, isSpreadMode, isRightToLeft, filterMode, zoomScale, isLoading, numPages, saveProgress])

  // 7. PDFロード成功時
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoadErrorDetails(null) // 成功時はエラー詳細をクリア
    // ページ範囲チェック
    if (currentPage > numPages) {
      setCurrentPage(1)
    }
  }

  // 7-2. PDFロード失敗時
  const onDocumentLoadError = (error: Error) => {
    console.error("PDFのロードに失敗しました:", error)
    setLoadErrorDetails(error.message)
    toast.error(`PDFの解析に失敗しました: ${error.message}`, { duration: 10000 })
  }

  // 8. ページ遷移制御
  const handlePrevPage = useCallback(() => {
    const step = isSpreadMode ? 2 : 1
    setCurrentPage(prev => {
      let target = prev - step
      if (isSpreadMode && target > 1 && target % 2 !== 0) {
        target = target - 1 // 見開きの位置合わせ
      }
      return Math.max(1, target)
    })
  }, [isSpreadMode])

  const handleNextPage = useCallback(() => {
    const step = isSpreadMode ? 2 : 1
    setCurrentPage(prev => {
      let target = prev + step
      if (isSpreadMode && target > 1 && target % 2 !== 0) {
        target = target + 1 // 見開きの位置合わせ
      }
      return Math.min(numPages, target)
    })
  }, [isSpreadMode, numPages])

  // 右開き・左開きに基づいた「進む」「戻る」のアサイン
  const handleGoForward = useCallback(() => {
    if (isRightToLeft) {
      handlePrevPage() // 右開きは左に進むので、ページ番号は減少
    } else {
      handleNextPage() // 左開きは右に進むので、ページ番号は増加
    }
  }, [isRightToLeft, handlePrevPage, handleNextPage])

  const handleGoBackward = useCallback(() => {
    if (isRightToLeft) {
      handleNextPage() // 右開きは右に戻るので、ページ番号は増加
    } else {
      handlePrevPage() // 左開きは左に戻るので、ページ番号は減少
    }
  }, [isRightToLeft, handlePrevPage, handleNextPage])

  // 9. キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showBookmarks && document.activeElement?.tagName === "INPUT") return // しおりメモ入力中はショートカット無効
      
      if (e.key === "ArrowLeft") {
        // RTLなら「進む」、LTRなら「戻る」
        if (isRightToLeft) handleNextPage() // 右開きでキーボード左矢印：次のページ（インデックスは増える）
        else handlePrevPage()               // 左開きでキーボード左矢印：前のページ（インデックスは減る）
      } else if (e.key === "ArrowRight") {
        if (isRightToLeft) handlePrevPage() // 右開きでキーボード右矢印：前のページ
        else handleNextPage()               // 左開きでキーボード右矢印：次のページ
      } else if (e.key === "Escape") {
        setShowSettings(false)
        setShowBookmarks(false)
      } else if (e.key === " ") {
        // スペースキーで進む
        if (isRightToLeft) handlePrevPage()
        else handleNextPage()
        e.preventDefault()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isRightToLeft, handlePrevPage, handleNextPage, showBookmarks])

  // 10. しおりの追加
  const handleAddBookmark = async () => {
    if (!currentUserId || !bookId) return
    
    try {
      const pageToBookmark = currentPage
      
      // 既に対象ページのしおりがあるかチェック
      const alreadyExists = bookmarks.some(b => b.page_number === pageToBookmark)
      if (alreadyExists) {
        toast.error("このページには既にしおりが挟まれています")
        return
      }

      const { data, error } = await supabase
        .from("bookmarks")
        .insert({
          user_id: currentUserId,
          book_id: bookId,
          page_number: pageToBookmark,
          note: bookmarkNote.trim() || `${pageToBookmark}ページ目`
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        setBookmarks(prev => [...prev, data as BookmarkItem].sort((a, b) => a.page_number - b.page_number))
        setBookmarkNote("")
        toast.success("しおりを挟みました")
      }
    } catch (e) {
      console.error(e)
      toast.error("しおりの追加に失敗しました")
    }
  }

  // しおりの削除
  const handleDeleteBookmark = async (id: string) => {
    try {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("id", id)

      if (error) throw error
      setBookmarks(prev => prev.filter(b => b.id !== id))
      toast.success("しおりを外しました")
    } catch (e) {
      console.error(e)
      toast.error("しおりの削除に失敗しました")
    }
  }

  // 11. フルスクリーン切替
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch(err => {
        toast.error("フルスクリーンに切り替えられませんでした")
      })
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // フルスクリーン監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  // 12. 余白リセット
  const handleResetCrop = () => {
    setCrop({ top: 0, bottom: 0, left: 0, right: 0 })
    toast.success("余白トリミングをリセットしました")
  }

  // 13. 見開き表示のページペア算出
  const getSpreadPages = (): number[] => {
    if (currentPage === 1) {
      return [1] // 表紙は常に1枚表示
    }
    
    // 2枚表示。偶数から始まる
    const leftPage = currentPage % 2 === 0 ? currentPage : currentPage - 1
    const rightPage = leftPage + 1
    
    const pages = [leftPage]
    if (rightPage <= numPages) {
      pages.push(rightPage)
    }
    return pages
  }

  // 現在のしおりがあるか
  const isCurrentPageBookmarked = bookmarks.some(b => 
    isSpreadMode 
      ? getSpreadPages().includes(b.page_number)
      : b.page_number === currentPage
  )

  // フィルターCSSの算出
  const getFilterCss = () => {
    switch (filterMode) {
      case "high-contrast":
        return "contrast-[1.35] brightness-[1.05] grayscale-[1]"
      case "sepia":
        return "sepia-[0.55] contrast-[1.05] brightness-[0.98] saturate-[1.1]"
      case "dark":
        return "invert-[0.93] hue-rotate-[180deg]"
      default:
        return ""
    }
  }

  // 余白クリッピングCSSスタイルの算出
  const getPageWrapperStyle = (isLeftSide: boolean) => {
    // 見開きの時、スマートに中央側の余白を少し残すか、または対称にカットするか
    // clip-path: inset(top right bottom left)
    const clipPath = `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`
    
    // 切り取られた余白の分、文字が小さくなるのを防ぐため scale させる
    // スケール率はトリミング割合に応じて適度に拡大
    const horizontalCrop = (crop.left + crop.right) / 100
    const verticalCrop = (crop.top + crop.bottom) / 100
    const autoScale = 1 / Math.max(1 - horizontalCrop, 1 - verticalCrop)
    const finalScale = zoomScale * autoScale

    return {
      clipPath,
      transform: `scale(${finalScale})`,
      transformOrigin: isLeftSide ? "right center" : "left center",
      transition: "transform 0.15s ease-out, clip-path 0.15s ease-out",
    }
  }

  return (
    <div 
      onClick={handleToggleControls}
      className={`flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-0 relative select-none overflow-hidden ${isFullscreen ? `fixed inset-y-0 right-0 left-0 ${isSidebarOpen ? 'lg:left-64' : 'lg:left-0'} z-[100]` : ''}`}
    >
      {/* 1. 上部コントロールバー */}
      <div 
        className={`viewer-control-panel absolute top-0 left-0 right-0 h-16 bg-slate-900/90 border-b border-slate-800/60 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 transition-transform duration-300 z-40 ${
          showControls ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        {/* 左側：戻る ＆ タイトル */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate("/bookshelf")}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all border border-slate-700/60"
            title="本棚に戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs sm:text-sm font-black truncate max-w-[150px] sm:max-w-[300px]">
            {bookTitle}
          </span>
        </div>

        {/* 右側：しおり、設定、フルスクリーン */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* しおりトグルボタン */}
          <button 
            onClick={() => {
              setShowBookmarks(prev => !prev)
              setShowSettings(false)
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
              showBookmarks 
                ? "bg-blue-600 border-blue-500 text-white" 
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60"
            }`}
            title="しおり一覧"
          >
            <Bookmark className={`w-5 h-5 ${isCurrentPageBookmarked ? 'fill-current text-blue-300' : ''}`} />
          </button>

          {/* 表示設定トグルボタン */}
          <button 
            onClick={() => {
              setShowSettings(prev => !prev)
              setShowBookmarks(false)
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
              showSettings 
                ? "bg-blue-600 border-blue-500 text-white" 
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60"
            }`}
            title="表示・画質設定"
          >
            <Sliders className="w-5 h-5" />
          </button>

          {/* フルスクリーンボタン */}
          <button 
            onClick={handleToggleFullscreen}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center border border-slate-700/60 text-slate-300 hover:text-white transition-all"
            title={isFullscreen ? "フルスクリーン解除" : "フルスクリーン表示"}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* 2. メインビューエリア */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-xs text-slate-400 font-bold">書籍データを準備中...</span>
          </div>
        ) : loadErrorDetails ? (
          /* PDFロード失敗画面（認証切れや破損キャッシュ、あるいは解析エラー） */
          <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800/80 shadow-2xl max-w-md relative overflow-hidden viewer-control-panel z-10">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-600/5 rounded-full blur-3xl"></div>
            <div className="w-12 h-12 rounded-2xl bg-red-600/10 flex items-center justify-center text-red-500 border border-red-500/20 mb-4 shrink-0">
              <Sliders className="w-6 h-6 animate-pulse" />
            </div>
            <div className="text-red-400 font-black text-sm tracking-wide mb-2">PDFの読み込み・解析失敗</div>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-4 font-medium">
              ローカルキャッシュの破損、または一時的な通信エラーが発生しました。端末キャッシュを強制消去してクラウドから原本を再ロードすることで修復できます。
            </p>
            <div className="text-[10px] text-red-400 bg-slate-950/90 p-3.5 rounded-xl border border-red-950/30 font-mono w-full break-all mb-6 text-left max-h-32 overflow-y-auto">
              {loadErrorDetails || "不明なレンダリングエラー（PDF形式の破損、またはワーカーのロード失敗）"}
            </div>
            
            <div className="flex flex-col w-full gap-2.5">
              <button 
                onClick={handleForceRecover}
                className="w-full py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-xl text-xs font-black shadow-lg shadow-red-500/10 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                キャッシュ強制消去 ＆ 原本再取得
              </button>
              <button 
                onClick={() => {
                  toast.info("再読み込みしています...");
                  window.location.reload();
                }}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                ページを再読み込み（リトライ）
              </button>
            </div>
          </div>
        ) : pdfBlobUrl ? (
          /* 正常ロード時のPDF表示部 */
          <div className={`w-full h-full flex items-center justify-center relative ${getFilterCss()}`}>
            <Document 
              file={pdfBlobUrl} 
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> レンダリング中...
                </div>
              }
              error={
                <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800/80 shadow-2xl max-w-md relative overflow-hidden viewer-control-panel">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-600/5 rounded-full blur-3xl"></div>
                  <div className="w-12 h-12 rounded-2xl bg-red-600/10 flex items-center justify-center text-red-500 border border-red-500/20 mb-4 shrink-0">
                    <Sliders className="w-6 h-6" />
                  </div>
                  <div className="text-red-400 font-black text-sm tracking-wide mb-2">PDFのレンダリング失敗</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-4 font-medium">
                    PDFのレンダリング中にエラーが発生しました。キャッシュを強制消去して再ダウンロードしてください。
                  </p>
                  <button 
                    onClick={handleForceRecover}
                    className="w-full py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-xl text-xs font-black shadow-lg"
                  >
                    キャッシュ強制消去 ＆ 原本再取得
                  </button>
                </div>
              }
              className="max-h-full max-w-full flex items-center justify-center"
            >
              {isSpreadMode && currentPage > 1 ? (
                /* 見開き表示 (2ページ表示) */
                <div className="flex items-center justify-center gap-1 sm:gap-4 max-h-full max-w-full">
                  {(() => {
                    const pages = getSpreadPages()
                    const leftPageNum = isRightToLeft ? (pages[1] || null) : pages[0]
                    const rightPageNum = isRightToLeft ? pages[0] : (pages[1] || null)

                    return (
                      <>
                        {/* 左ページ */}
                        {leftPageNum ? (
                          <div 
                            className="overflow-hidden border border-slate-800/40 bg-white/5 rounded shadow-lg max-h-[85vh] flex items-center justify-center"
                            style={getPageWrapperStyle(true)}
                          >
                            <Page 
                              pageNumber={leftPageNum} 
                              height={window.innerHeight * 0.82}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              loading={null}
                            />
                          </div>
                        ) : (
                          /* 空白（最終奇数ページの裏など） */
                          <div className="w-[30vw] h-[82vh] bg-slate-900/30 border border-dashed border-slate-800/40 rounded flex items-center justify-center text-xs text-slate-600 font-bold">
                            （白紙）
                          </div>
                        )}

                        {/* 右ページ */}
                        {rightPageNum ? (
                          <div 
                            className="overflow-hidden border border-slate-800/40 bg-white/5 rounded shadow-lg max-h-[85vh] flex items-center justify-center"
                            style={getPageWrapperStyle(false)}
                          >
                            <Page 
                              pageNumber={rightPageNum} 
                              height={window.innerHeight * 0.82}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              loading={null}
                            />
                          </div>
                        ) : (
                          <div className="w-[30vw] h-[82vh] bg-slate-900/30 border border-dashed border-slate-800/40 rounded flex items-center justify-center text-xs text-slate-600 font-bold">
                            （白紙）
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              ) : (
                /* 1ページ表示 */
                <div 
                  className="overflow-hidden border border-slate-800/60 bg-white/5 rounded-lg shadow-2xl max-h-[85vh] flex items-center justify-center"
                  style={getPageWrapperStyle(false)}
                >
                  <Page 
                    pageNumber={currentPage} 
                    height={window.innerHeight * 0.82}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={null}
                  />
                </div>
              )}
            </Document>

            {/* 進む・戻るのタップ領域（左右端。没頭モードでも操作できるように） */}
            <div 
              onClick={(e) => { e.stopPropagation(); handleGoBackward(); }}
              className="absolute left-0 top-16 bottom-16 w-[15%] cursor-pointer group hover:bg-gradient-to-r hover:from-white/[0.02] hover:to-transparent flex items-center justify-start pl-4 z-10"
              title="戻る"
            >
              <ChevronLeft className="w-8 h-8 text-slate-600 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
            </div>
            <div 
              onClick={(e) => { e.stopPropagation(); handleGoForward(); }}
              className="absolute right-0 top-16 bottom-16 w-[15%] cursor-pointer group hover:bg-gradient-to-l hover:from-white/[0.02] hover:to-transparent flex items-center justify-end pr-4 z-10"
              title="進む"
            >
              <ChevronRight className="w-8 h-8 text-slate-600 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
            </div>
          </div>
        ) : (
          <div className="text-slate-400 text-xs font-bold">
            PDFをロードできませんでした。
          </div>
        )}
      </div>

      {/* 3. しおり（ブックマーク）一覧ドロワーパネル */}
      {showBookmarks && (
        <div className="viewer-control-panel absolute right-4 top-20 bottom-24 w-80 bg-slate-900/95 border border-slate-800/80 rounded-2xl shadow-2xl backdrop-blur-md p-5 flex flex-col z-50">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
            <h3 className="text-xs sm:text-sm font-black flex items-center gap-2 text-white">
              <Bookmark className="w-4 h-4 text-blue-500 fill-blue-500" />
              しおりを挟む ＆ 一覧
            </h3>
            <button 
              onClick={() => setShowBookmarks(false)}
              className="text-xs font-bold text-slate-400 hover:text-white"
            >
              閉じる
            </button>
          </div>

          {/* 新規しおり追加エリア */}
          <div className="mb-5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/40">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
              現在の {currentPage}ページ目にしおりを挟む
            </label>
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="しおりのメモを入力...（例: 伏線回収！）"
                value={bookmarkNote}
                onChange={(e) => setBookmarkNote(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/60 rounded-lg focus:outline-none focus:border-blue-500 text-slate-100 placeholder-slate-600 font-bold"
              />
              <button 
                onClick={handleAddBookmark}
                className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center shrink-0"
              >
                挟む
              </button>
            </div>
          </div>

          {/* しおりリスト */}
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-800 pr-1">
            {bookmarks.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs font-bold">
                しおりがありません
              </div>
            ) : (
              bookmarks.map((bm) => (
                <div 
                  key={bm.id}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                    (isSpreadMode ? getSpreadPages().includes(bm.page_number) : bm.page_number === currentPage)
                      ? "bg-blue-600/10 border-blue-500/40"
                      : "bg-slate-950/20 border-slate-800/60 hover:bg-slate-800/40"
                  }`}
                >
                  <button 
                    onClick={() => {
                      setCurrentPage(bm.page_number)
                      toast.success(`${bm.page_number}ページ目にジャンプしました`);
                    }}
                    className="flex-1 text-left mr-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-extrabold text-blue-400">
                        P.{bm.page_number}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(bm.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-200 mt-1 line-clamp-2">
                      {bm.note}
                    </p>
                  </button>
                  <button 
                    onClick={() => handleDeleteBookmark(bm.id)}
                    className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors shrink-0"
                    title="しおりを外す"
                  >
                    <Trash2Icon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. 表示・調整設定パネル (サイドドロワー) */}
      {showSettings && (
        <div className="viewer-control-panel absolute right-4 top-20 bottom-24 w-80 bg-slate-900/95 border border-slate-800/80 rounded-2xl shadow-2xl backdrop-blur-md p-5 flex flex-col z-50 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3 shrink-0">
            <h3 className="text-xs sm:text-sm font-black flex items-center gap-2 text-white">
              <Sliders className="w-4 h-4 text-blue-500" />
              書籍表示 ＆ 画質設定
            </h3>
            <button 
              onClick={() => setShowSettings(false)}
              className="text-xs font-bold text-slate-400 hover:text-white"
            >
              閉じる
            </button>
          </div>

          <div className="space-y-6">
            {/* ① 開き・レイアウト設定 */}
            <div>
              <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5">
                基本レイアウト
              </h4>
              <div className="space-y-3">
                {/* 見開きトグル */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">見開き2ページ表示</span>
                  <button 
                    onClick={() => {
                      setIsSpreadMode(prev => !prev)
                      toast.success(isSpreadMode ? "1ページ表示に切り替えました" : "見開き表示に切り替えました")
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    {isSpreadMode ? <ToggleRight className="w-9 h-9 text-blue-500" /> : <ToggleLeft className="w-9 h-9 text-slate-600" />}
                  </button>
                </div>

                {/* 右開き・左開き切替 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">右開き（小説・漫画など）</span>
                  <button 
                    onClick={() => {
                      setIsRightToLeft(prev => !prev)
                      toast.success(isRightToLeft ? "左開き（技術書仕様）に変更" : "右開き（漫画・小説仕様）に変更")
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    {isRightToLeft ? <ToggleRight className="w-9 h-9 text-blue-500" /> : <ToggleLeft className="w-9 h-9 text-slate-600" />}
                  </button>
                </div>
              </div>
            </div>

            {/* ② スマート余白トリミング */}
            <div className="border-t border-slate-800/40 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  スマート余白カット (Margin Crop)
                </h4>
                <button 
                  onClick={handleResetCrop}
                  className="text-[9px] font-extrabold text-blue-400 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  リセット
                </button>
              </div>

              <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/40">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1">
                    <span>上余白カット</span>
                    <span>{crop.top}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="30" 
                    value={crop.top} 
                    onChange={(e) => setCrop(prev => ({ ...prev, top: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500 h-1 rounded-lg bg-slate-800"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1">
                    <span>下余白カット</span>
                    <span>{crop.bottom}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="30" 
                    value={crop.bottom} 
                    onChange={(e) => setCrop(prev => ({ ...prev, bottom: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500 h-1 rounded-lg bg-slate-800"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1">
                    <span>左余白カット</span>
                    <span>{crop.left}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="30" 
                    value={crop.left} 
                    onChange={(e) => setCrop(prev => ({ ...prev, left: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500 h-1 rounded-lg bg-slate-800"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1">
                    <span>右余白カット</span>
                    <span>{crop.right}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="30" 
                    value={crop.right} 
                    onChange={(e) => setCrop(prev => ({ ...prev, right: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500 h-1 rounded-lg bg-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* ③ 画質・色調フィルター */}
            <div className="border-t border-slate-800/40 pt-4">
              <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5">
                色調フィルター (画質調整)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { mode: "normal", label: "通常 (カラー)", icon: <Eye className="w-3.5 h-3.5" /> },
                  { mode: "high-contrast", label: "くっきり白黒", icon: <Sliders className="w-3.5 h-3.5 text-blue-400" /> },
                  { mode: "sepia", label: "紙 sepia", icon: <Sun className="w-3.5 h-3.5 text-amber-500" /> },
                  { mode: "dark", label: "ダーク反転", icon: <Moon className="w-3.5 h-3.5 text-indigo-400" /> }
                ].map((item) => (
                  <button
                    key={item.mode}
                    onClick={() => {
                      setFilterMode(item.mode as FilterMode)
                      toast.success(`${item.label}フィルターを適用しました`);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
                      filterMode === item.mode 
                        ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/10" 
                        : "bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 text-slate-400"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ④ ズーム拡大倍率 */}
            <div className="border-t border-slate-800/40 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  ズーム・拡大
                </h4>
                <button 
                  onClick={() => setZoomScale(1.0)}
                  className="text-[9px] font-extrabold text-blue-400 hover:underline"
                >
                  等倍
                </button>
              </div>
              <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/40">
                <input 
                  type="range" 
                  min="0.8" 
                  max="2.5" 
                  step="0.05"
                  value={zoomScale} 
                  onChange={(e) => setZoomScale(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500 h-1 rounded-lg bg-slate-800"
                />
                <span className="text-xs font-extrabold text-slate-300 w-12 text-right">
                  {Math.round(zoomScale * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 下部コントロールバー（シークバー） */}
      <div 
        className={`viewer-control-panel absolute bottom-0 left-0 right-0 h-20 bg-slate-900/90 border-t border-slate-800/60 backdrop-blur-md flex flex-col justify-center px-4 sm:px-8 transition-transform duration-300 z-40 ${
          showControls ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center gap-4 w-full">
          {/* シーク用の戻るボタン */}
          <button 
            onClick={handleGoBackward}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center border border-slate-700/60 shrink-0 text-slate-300 hover:text-white transition-all"
            title={isRightToLeft ? "右（進む・次）" : "左（戻る・前）"}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* ページシークスライダー */}
          <div className="flex-1 flex items-center gap-3">
            <span className="text-[10px] font-extrabold text-slate-400 w-6 text-center select-none">1</span>
            
            <div className="flex-1 relative group">
              <input 
                type="range" 
                min="1" 
                max={numPages || 1} 
                value={currentPage}
                onChange={(e) => {
                  let target = parseInt(e.target.value)
                  if (isSpreadMode && target > 1 && target % 2 !== 0) {
                    target = target - 1 // 見開き時の位置合わせ
                  }
                  setCurrentPage(target)
                }}
                className={`w-full h-1.5 rounded-lg accent-blue-500 cursor-pointer bg-slate-800 ${
                  isRightToLeft ? 'direction-rtl' : '' // 右開きのときはスライダーを右から左に流す（自炊特化）
                }`}
                style={{ direction: isRightToLeft ? 'rtl' : 'ltr' }}
              />
            </div>

            <span className="text-[10px] font-extrabold text-slate-400 w-10 text-center select-none">{numPages}</span>
          </div>

          {/* シーク用の進むボタン */}
          <button 
            onClick={handleGoForward}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center border border-slate-700/60 shrink-0 text-slate-300 hover:text-white transition-all"
            title={isRightToLeft ? "左（戻る・前）" : "右（進む・次）"}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* ページ数と現在位置の中央揃えインジケーター */}
        <div className="text-center mt-1 select-none">
          <span className="text-[10px] font-black text-blue-500 bg-blue-950/80 px-2.5 py-0.5 rounded-full border border-blue-900/30">
            {isSpreadMode && currentPage > 1 && currentPage < numPages
              ? `P.${currentPage} - P.${currentPage + 1} / 全 ${numPages} ページ`
              : `P.${currentPage} / 全 ${numPages} ページ`
            }
          </span>
        </div>
      </div>
    </div>
  )
}

// ゴミ箱（Trash）アイコンがLucideからインポートできなかった・見つからない場合のフォールバック
function Trash2Icon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  )
}
