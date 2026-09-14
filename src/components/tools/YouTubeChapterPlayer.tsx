import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { loadYouTubeIframeApi, type YouTubePlayer } from '../../utils/youtubeIframeApi'
import { buildEmbedUrl } from '../../utils/trainingVideos'

export type ChapterPlayerHandle = {
  /** 指定秒から再生する(頭出し) */
  seekTo: (seconds: number) => void
  /** 現在の再生位置(秒)。取得できない場合は null */
  getCurrentTime: () => number | null
  /** 動画全体の長さ(秒)。取得できない場合は null */
  getDuration: () => number | null
}

type Props = {
  youtubeId: string
  /** 最初に表示したときの開始秒 */
  startSeconds?: number
  className?: string
  onReady?: () => void
}

/**
 * 章の頭出しができるYouTubeプレーヤー。
 *
 * 通常は IFrame Player API の seekTo を使うので、章ボタンを押しても
 * 動画が読み込み直されず、その秒数へ即座に飛ぶ。
 * APIが読み込めない環境では ?start=秒 を付けた通常の埋め込みに自動で切り替える。
 */
const YouTubeChapterPlayer = forwardRef<ChapterPlayerHandle, Props>(function YouTubeChapterPlayer(
  { youtubeId, startSeconds = 0, className = '', onReady },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  const [isReady, setIsReady] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  // フォールバック時はiframeを作り直して頭出しするため、nonceでkeyを変える
  const [fallbackSeek, setFallbackSeek] = useState({ seconds: startSeconds, nonce: 0 })

  useEffect(() => {
    let cancelled = false
    let createdPlayer: YouTubePlayer | null = null
    const host = hostRef.current

    setIsReady(false)
    playerRef.current = null
    pendingSeekRef.current = null

    loadYouTubeIframeApi()
      .then(YT => {
        if (cancelled || !hostRef.current) return
        // YT.Playerは渡した要素をiframeで置き換えるため、毎回使い捨てのdivを差し込む
        const mount = document.createElement('div')
        hostRef.current.replaceChildren(mount)

        createdPlayer = new YT.Player(mount, {
          videoId: youtubeId,
          width: '100%',
          height: '100%',
          playerVars: {
            rel: 0,
            playsinline: 1,
            start: Math.floor(startSeconds) || 0,
          },
          events: {
            onReady: event => {
              if (cancelled) return
              playerRef.current = event.target
              const iframe = event.target.getIframe()
              iframe.style.width = '100%'
              iframe.style.height = '100%'
              iframe.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture')
              iframe.setAttribute('allowfullscreen', 'true')
              setIsReady(true)
              onReadyRef.current?.()

              const pending = pendingSeekRef.current
              if (pending !== null) {
                pendingSeekRef.current = null
                event.target.seekTo(pending, true)
                event.target.playVideo()
              }
            },
          },
        })
      })
      .catch(error => {
        console.warn('YouTube IFrame APIを利用できないため通常の埋め込みに切り替えます', error)
        if (!cancelled) setUseFallback(true)
      })

    return () => {
      cancelled = true
      playerRef.current = null
      try {
        createdPlayer?.destroy()
      } catch {
        // 破棄済みの場合は無視する
      }
      host?.replaceChildren()
    }
    // startSecondsは初期表示位置なので、変わってもプレーヤーは作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId])

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current
    if (player && typeof player.seekTo === 'function') {
      player.seekTo(seconds, true)
      try {
        player.playVideo()
      } catch {
        // 自動再生がブロックされた場合は位置だけ移動する
      }
      return
    }
    // プレーヤーがまだ準備中なら、準備完了時に反映する
    if (!useFallback) {
      pendingSeekRef.current = seconds
      return
    }
    setFallbackSeek(prev => ({ seconds, nonce: prev.nonce + 1 }))
  }, [useFallback])

  useImperativeHandle(
    ref,
    () => ({
      seekTo,
      getCurrentTime: () => {
        const player = playerRef.current
        if (!player || typeof player.getCurrentTime !== 'function') return null
        const value = player.getCurrentTime()
        return Number.isFinite(value) ? value : null
      },
      getDuration: () => {
        const player = playerRef.current
        if (!player || typeof player.getDuration !== 'function') return null
        const value = player.getDuration()
        return Number.isFinite(value) && value > 0 ? value : null
      },
    }),
    [seekTo]
  )

  return (
    <div className={`relative w-full aspect-video bg-black rounded-xl overflow-hidden ${className}`}>
      {useFallback ? (
        <iframe
          key={fallbackSeek.nonce}
          className="absolute inset-0 w-full h-full"
          src={`${buildEmbedUrl(youtubeId, fallbackSeek.seconds)}${fallbackSeek.nonce > 0 ? '&autoplay=1' : ''}`}
          title="作業手順動画"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <>
          <div ref={hostRef} className="absolute inset-0 w-full h-full [&>iframe]:w-full [&>iframe]:h-full" />
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
        </>
      )}
    </div>
  )
})

export default YouTubeChapterPlayer
