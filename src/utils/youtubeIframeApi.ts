// YouTube IFrame Player API (https://www.youtube.com/iframe_api) のローダー。
// 章の頭出し(seekTo)を再読み込みなしで行うために使う。読み込みは1回だけ。

export type YouTubePlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  getCurrentTime: () => number
  getDuration: () => number
  getIframe: () => HTMLIFrameElement
  destroy: () => void
}

type YouTubePlayerOptions = {
  videoId: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void
    onStateChange?: (event: { target: YouTubePlayer; data: number }) => void
    onError?: (event: { target: YouTubePlayer; data: number }) => void
  }
}

export type YouTubeApi = {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeApi & { loaded?: number }
    onYouTubeIframeAPIReady?: () => void
  }
}

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api'
const LOAD_TIMEOUT_MS = 10000

let loaderPromise: Promise<YouTubeApi> | null = null

export function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube IFrame APIはブラウザ上でのみ利用できます'))
  }
  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT)
  }
  if (loaderPromise) return loaderPromise

  loaderPromise = new Promise<YouTubeApi>((resolve, reject) => {
    let settled = false

    const finish = () => {
      if (settled) return
      if (window.YT && typeof window.YT.Player === 'function') {
        settled = true
        window.clearInterval(pollId)
        window.clearTimeout(timeoutId)
        resolve(window.YT)
      }
    }

    // APIの準備完了は onYouTubeIframeAPIReady で通知される。
    // 他のコードが既に定義している可能性があるのでチェーンする。
    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      finish()
    }

    // コールバックを取りこぼした場合に備えた保険
    const pollId = window.setInterval(finish, 100)

    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      window.clearInterval(pollId)
      loaderPromise = null
      reject(new Error('YouTube IFrame APIの読み込みがタイムアウトしました'))
    }, LOAD_TIMEOUT_MS)

    if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.onerror = () => {
        if (settled) return
        settled = true
        window.clearInterval(pollId)
        window.clearTimeout(timeoutId)
        loaderPromise = null
        reject(new Error('YouTube IFrame APIの読み込みに失敗しました'))
      }
      document.head.appendChild(script)
    }

    finish()
  })

  return loaderPromise
}
