import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronRight, Clock, ListVideo, Loader2, PlayCircle, ArrowLeft, Video } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import YouTubeChapterPlayer, { type ChapterPlayerHandle } from '../../components/tools/YouTubeChapterPlayer'
import {
  findActiveChapterIndex,
  formatDuration,
  getChapterLength,
  groupByCategory,
  normalizeChapters,
  type TrainingVideo,
} from '../../utils/trainingVideos'

export default function TrainingVideos() {
  const [videos, setVideos] = useState<TrainingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentSeconds, setCurrentSeconds] = useState(0)

  const playerRef = useRef<ChapterPlayerHandle>(null)

  useEffect(() => {
    let cancelled = false

    const fetchVideos = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('training_videos')
        .select('id, category, title, youtube_id, duration_seconds, chapters, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('作業手順動画の取得に失敗しました', error)
        setLoadError(error.message)
        setVideos([])
      } else {
        setLoadError(null)
        setVideos(
          (data || []).map(row => ({
            id: row.id,
            category: row.category,
            title: row.title,
            youtube_id: row.youtube_id,
            duration_seconds: Number(row.duration_seconds) || 0,
            chapters: normalizeChapters(row.chapters),
            sort_order: Number(row.sort_order) || 0,
          }))
        )
      }
      setLoading(false)
    }

    fetchVideos()
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => groupByCategory(videos), [videos])
  const selected = useMemo(() => videos.find(v => v.id === selectedId) ?? null, [videos, selectedId])
  const sameCategoryVideos = useMemo(
    () => (selected ? videos.filter(v => v.category === selected.category).sort((a, b) => a.sort_order - b.sort_order) : []),
    [videos, selected]
  )

  // 再生位置を1秒ごとに拾って、いま見ている章を光らせる
  useEffect(() => {
    if (!selected) return
    setCurrentSeconds(0)
    const timer = window.setInterval(() => {
      const time = playerRef.current?.getCurrentTime()
      if (time !== null && time !== undefined) setCurrentSeconds(time)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [selected])

  const handleSelect = useCallback((video: TrainingVideo) => {
    setSelectedId(video.id)
    setCurrentSeconds(0)
  }, [])

  const handleJumpToChapter = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds)
    setCurrentSeconds(seconds)
  }, [])

  const activeChapterIndex = selected ? findActiveChapterIndex(selected.chapters, currentSeconds) : -1

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-5 pb-16">
      {/* ヘッダー */}
      {!selected && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Video className="w-6 h-6 text-blue-500" />
            作業手順動画
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            社内の作業手順動画です。見出しを押すと、その作業のところから再生されます。
          </p>
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">動画一覧を読み込めませんでした</p>
            <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">{loadError}</p>
          </div>
        </div>
      )}

      {/* 再生画面 */}
      {selected && (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-2 min-h-[48px] px-4 py-3 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-[0.98]"
          >
            <ArrowLeft className="w-5 h-5" />
            動画一覧にもどる
          </button>

          <div className="sticky top-0 z-20 bg-background pt-1 pb-3">
            <YouTubeChapterPlayer ref={playerRef} youtubeId={selected.youtube_id} />
          </div>

          <div>
            <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{selected.category}</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mt-1">
              {selected.title}
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-slate-500 mt-1.5">
              <Clock className="w-4 h-4" />
              {formatDuration(selected.duration_seconds)}
            </p>
          </div>

          {/* 章の頭出し */}
          {selected.chapters.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <ListVideo className="w-4 h-4" />
                見たいところを押すと、そこから再生されます
              </p>
              <div className="space-y-2">
                {selected.chapters.map((chapter, index) => {
                  const length = getChapterLength(selected.chapters, index, selected.duration_seconds)
                  const isActive = index === activeChapterIndex
                  return (
                    <button
                      key={`${chapter.t}-${index}`}
                      onClick={() => handleJumpToChapter(chapter.t)}
                      className={`w-full flex items-center gap-3 text-left min-h-[64px] px-4 py-3.5 rounded-xl border-2 transition-colors active:scale-[0.99] ${
                        isActive
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'
                      }`}
                    >
                      <PlayCircle className={`w-7 h-7 shrink-0 ${isActive ? 'text-white' : 'text-blue-500'}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-base font-bold leading-snug break-words">{chapter.label}</span>
                        <span className={`block text-xs font-bold mt-0.5 ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {formatDuration(chapter.t)}〜
                          {length !== null && `（${formatDuration(length)}）`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 同じ分類の他の動画 */}
          {sameCategoryVideos.length > 1 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold text-slate-500">同じ分類の動画</p>
              {sameCategoryVideos.map(video => (
                <button
                  key={video.id}
                  onClick={() => handleSelect(video)}
                  disabled={video.id === selected.id}
                  className={`w-full flex items-center gap-3 text-left min-h-[56px] px-4 py-3 rounded-xl border transition-colors ${
                    video.id === selected.id
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-default'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400 active:scale-[0.99]'
                  }`}
                >
                  <span className="flex-1 min-w-0 text-sm font-bold break-words">{video.title}</span>
                  <span className="text-xs font-bold text-slate-400 shrink-0">{formatDuration(video.duration_seconds)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 一覧画面 */}
      {!selected && (
        <div className="space-y-6">
          {groups.length === 0 && !loadError && (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <Video className="w-10 h-10 mx-auto" />
              <p className="text-sm font-bold">公開されている動画がまだありません</p>
              <p className="text-xs">管理者が「設定・管理ボード」から追加できます。</p>
            </div>
          )}

          {groups.map(group => (
            <div key={group.category} className="space-y-2">
              <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 px-1">{group.category}</h2>
              <div className="space-y-2">
                {group.videos.map(video => (
                  <button
                    key={video.id}
                    onClick={() => handleSelect(video)}
                    className="w-full flex items-center gap-3 text-left min-h-[72px] px-4 py-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-400 transition-colors active:scale-[0.99] shadow-sm"
                  >
                    <PlayCircle className="w-9 h-9 text-blue-500 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-base font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
                        {video.title}
                      </span>
                      <span className="flex items-center gap-3 text-xs font-bold text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDuration(video.duration_seconds)}
                        </span>
                        {video.chapters.length > 0 && <span>章 {video.chapters.length}件</span>}
                      </span>
                    </span>
                    <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
