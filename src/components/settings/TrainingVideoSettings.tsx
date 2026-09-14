import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import YouTubeChapterPlayer, { type ChapterPlayerHandle } from '../tools/YouTubeChapterPlayer'
import {
  extractYoutubeId,
  formatDuration,
  normalizeChapters,
  parseChapterText,
  parseDurationInput,
  type TrainingVideo,
  type TrainingVideoChapter,
} from '../../utils/trainingVideos'

type EditingVideo = {
  id?: string
  category: string
  title: string
  youtubeInput: string
  durationInput: string
  chapters: TrainingVideoChapter[]
  is_active: boolean
}

const emptyVideo = (): EditingVideo => ({
  category: '',
  title: '',
  youtubeInput: '',
  durationInput: '',
  chapters: [],
  is_active: true,
})

/** DBエラーを社長にも分かる日本語にする */
function toFriendlyMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code
  // youtube_id には一意制約があるため、同じ動画を二重に登録しようとすると弾かれる
  if (code === '23505') return 'この動画はすでに登録されています。既存の行を編集してください。'
  if (error instanceof Error) return error.message
  const message = (error as { message?: string } | null)?.message
  return message || fallback
}

/** 更新・削除は一般社員だと「エラーは出ないが0件」になるため、戻り行の件数で成否を判定する */
function assertRowsAffected(rows: unknown[] | null, action: string) {
  if (!rows || rows.length === 0) {
    throw new Error(`${action}できませんでした。管理者権限があるアカウントか確認してください。`)
  }
}

export default function TrainingVideoSettings() {
  const [videos, setVideos] = useState<TrainingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderDirty, setOrderDirty] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<EditingVideo | null>(null)
  const [chapterSource, setChapterSource] = useState('')
  // 章立てを丸ごと入れ替えたとき、時刻入力(非制御)を作り直すためのカウンタ
  const [chaptersRevision, setChaptersRevision] = useState(0)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const previewRef = useRef<ChapterPlayerHandle>(null)

  useEffect(() => {
    fetchVideos()
  }, [])

  const fetchVideos = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('training_videos')
      .select('id, category, title, youtube_id, duration_seconds, chapters, sort_order, is_active')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error(error)
      setMessage({ type: 'error', text: `動画一覧の取得に失敗しました: ${error.message}` })
      setVideos([])
    } else {
      setVideos(
        (data || []).map(row => ({
          id: row.id,
          category: row.category,
          title: row.title,
          youtube_id: row.youtube_id,
          duration_seconds: Number(row.duration_seconds) || 0,
          chapters: normalizeChapters(row.chapters),
          sort_order: Number(row.sort_order) || 0,
          is_active: Boolean(row.is_active),
        }))
      )
      setOrderDirty(false)
    }
    setLoading(false)
  }

  const categories = useMemo(
    () => Array.from(new Set(videos.map(v => v.category).filter(Boolean))),
    [videos]
  )

  const editingYoutubeId = editing ? extractYoutubeId(editing.youtubeInput) : null
  const editingDuration = editing ? parseDurationInput(editing.durationInput) : null

  // --- 並べ替え ---
  const moveVideo = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= videos.length) return
    setVideos(prev => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
    setOrderDirty(true)
  }

  const saveOrder = async () => {
    setSavingOrder(true)
    try {
      for (let i = 0; i < videos.length; i++) {
        const desired = (i + 1) * 10
        if (videos[i].sort_order === desired) continue
        const { data, error } = await supabase
          .from('training_videos')
          .update({ sort_order: desired })
          .eq('id', videos[i].id)
          .select('id')
        if (error) throw error
        assertRowsAffected(data, `「${videos[i].title}」の並び順を更新`)
      }
      setMessage({ type: 'success', text: '並び順を保存しました。' })
      await fetchVideos()
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: toFriendlyMessage(e, '並び順の保存に失敗しました。') })
    } finally {
      setSavingOrder(false)
    }
  }

  const toggleActive = async (video: TrainingVideo) => {
    try {
      const { data, error } = await supabase
        .from('training_videos')
        .update({ is_active: !video.is_active })
        .eq('id', video.id)
        .select('id')
      if (error) throw error
      assertRowsAffected(data, `「${video.title}」の公開状態を変更`)
      await fetchVideos()
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: toFriendlyMessage(e, '公開状態の変更に失敗しました。') })
    }
  }

  const handleDelete = async (video: TrainingVideo) => {
    if (!confirm(`「${video.title}」を削除しますか？\n\n※ 元に戻せません。一時的に隠したいだけなら「非公開」にしてください。`)) return
    try {
      const { data, error } = await supabase
        .from('training_videos')
        .delete()
        .eq('id', video.id)
        .select('id')
      if (error) throw error
      assertRowsAffected(data, `「${video.title}」を削除`)
      setMessage({ type: 'success', text: `「${video.title}」を削除しました。` })
      await fetchVideos()
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: toFriendlyMessage(e, '削除に失敗しました。') })
    }
  }

  // --- 追加・編集モーダル ---
  const openModal = (video?: TrainingVideo) => {
    setModalError(null)
    setChapterSource('')
    setChaptersRevision(r => r + 1)
    if (video) {
      setEditing({
        id: video.id,
        category: video.category,
        title: video.title,
        youtubeInput: video.youtube_id,
        durationInput: video.duration_seconds ? formatDuration(video.duration_seconds) : '',
        chapters: video.chapters,
        is_active: Boolean(video.is_active),
      })
    } else {
      setEditing(emptyVideo())
    }
    setIsModalOpen(true)
  }

  const applyChapterSource = () => {
    if (!editing) return
    const parsed = parseChapterText(chapterSource)
    if (parsed.length === 0) {
      setModalError('時刻(00:00 など)を見つけられませんでした。説明文を貼り直してください。')
      return
    }
    setModalError(null)
    setChaptersRevision(r => r + 1)
    setEditing({ ...editing, chapters: parsed })
  }

  const updateChapter = (index: number, patch: Partial<{ timeText: string; label: string }>) => {
    if (!editing) return
    setEditing({
      ...editing,
      chapters: editing.chapters.map((chapter, i) => {
        if (i !== index) return chapter
        if (patch.label !== undefined) return { ...chapter, label: patch.label }
        if (patch.timeText !== undefined) {
          const seconds = parseDurationInput(patch.timeText)
          return { ...chapter, t: seconds === null ? chapter.t : seconds }
        }
        return chapter
      }),
    })
  }

  const removeChapter = (index: number) => {
    if (!editing) return
    setChaptersRevision(r => r + 1)
    setEditing({ ...editing, chapters: editing.chapters.filter((_, i) => i !== index) })
  }

  const addChapter = () => {
    if (!editing) return
    setChaptersRevision(r => r + 1)
    setEditing({ ...editing, chapters: [...editing.chapters, { t: 0, label: '' }] })
  }

  const fillDurationFromPlayer = () => {
    const duration = previewRef.current?.getDuration()
    if (!editing) return
    if (duration === null || duration === undefined) {
      setModalError('プレビューの読み込みが終わってから、もう一度押してください。')
      return
    }
    setModalError(null)
    setEditing({ ...editing, durationInput: formatDuration(Math.floor(duration)) })
  }

  const handleSave = async () => {
    if (!editing) return
    const youtubeId = extractYoutubeId(editing.youtubeInput)
    const duration = parseDurationInput(editing.durationInput)

    if (!editing.category.trim()) return setModalError('分類を入力してください。')
    if (!editing.title.trim()) return setModalError('タイトルを入力してください。')
    if (!youtubeId) return setModalError('YouTubeのURL、または11桁の動画IDを入力してください。')
    if (duration === null) return setModalError('動画の長さを「3:19」または秒数で入力してください。')

    const chapters = [...editing.chapters]
      .map(c => ({ t: Math.max(0, Math.floor(c.t)), label: c.label.trim() }))
      .sort((a, b) => a.t - b.t)

    setModalSaving(true)
    setModalError(null)
    try {
      if (editing.id) {
        const { data, error } = await supabase
          .from('training_videos')
          .update({
            category: editing.category.trim(),
            title: editing.title.trim(),
            youtube_id: youtubeId,
            duration_seconds: duration,
            chapters,
            is_active: editing.is_active,
          })
          .eq('id', editing.id)
          .select('id')
        if (error) throw error
        assertRowsAffected(data, '更新')
      } else {
        const maxOrder = videos.reduce((max, v) => Math.max(max, v.sort_order), 0)
        const { data, error } = await supabase
          .from('training_videos')
          .insert({
            category: editing.category.trim(),
            title: editing.title.trim(),
            youtube_id: youtubeId,
            duration_seconds: duration,
            chapters,
            sort_order: maxOrder + 10,
            is_active: editing.is_active,
          })
          .select('id')
        if (error) throw error
        assertRowsAffected(data, '登録')
      }
      setIsModalOpen(false)
      setEditing(null)
      setMessage({ type: 'success', text: '作業手順動画を保存しました。' })
      await fetchVideos()
    } catch (e) {
      console.error(e)
      setModalError(toFriendlyMessage(e, '保存に失敗しました。'))
    } finally {
      setModalSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold">作業手順動画</h3>
          <p className="text-sm text-muted-foreground">
            現場ツールの「作業手順動画」に表示される動画を管理します。並び順は上から順に表示されます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orderDirty && (
            <button
              onClick={saveOrder}
              disabled={savingOrder}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm disabled:opacity-50"
            >
              {savingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              並び順を保存
            </button>
          )}
          <button
            onClick={() => openModal()}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            動画を追加
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="whitespace-pre-wrap flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs font-bold underline shrink-0">
            閉じる
          </button>
        </div>
      )}

      {videos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          まだ動画が登録されていません。「動画を追加」から登録してください。
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-20">並び順</th>
                <th className="px-3 py-2 font-medium">分類</th>
                <th className="px-3 py-2 font-medium">タイトル</th>
                <th className="px-3 py-2 font-medium w-28">動画ID</th>
                <th className="px-3 py-2 font-medium w-20">長さ</th>
                <th className="px-3 py-2 font-medium w-16">章</th>
                <th className="px-3 py-2 font-medium w-24">公開</th>
                <th className="px-3 py-2 font-medium w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {videos.map((video, index) => (
                <tr key={video.id} className={video.is_active ? '' : 'bg-muted/20 text-muted-foreground'}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveVideo(index, -1)}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30"
                        title="上へ"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveVideo(index, 1)}
                        disabled={index === videos.length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30"
                        title="下へ"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">{video.category}</td>
                  <td className="px-3 py-2 font-medium">{video.title}</td>
                  <td className="px-3 py-2 font-mono text-xs">{video.youtube_id}</td>
                  <td className="px-3 py-2">{formatDuration(video.duration_seconds)}</td>
                  <td className="px-3 py-2">{video.chapters.length}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(video)}
                      className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md transition-colors ${
                        video.is_active
                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {video.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {video.is_active ? '公開中' : '非公開'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openModal(video)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="編集"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(video)}
                        className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 追加・編集モーダル */}
      {isModalOpen && editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-card w-full max-w-3xl my-8 rounded-xl shadow-lg border animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/20 rounded-t-xl">
              <h3 className="font-semibold text-lg">{editing.id ? '作業手順動画の編集' : '作業手順動画の追加'}</h3>
            </div>

            <div className="p-6 space-y-5">
              {modalError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    分類 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="training-video-categories"
                    value={editing.category}
                    onChange={e => setEditing({ ...editing, category: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="リングスリーブ圧着作業"
                  />
                  <datalist id="training-video-categories">
                    {categories.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground mt-1">同じ分類の動画はまとめて表示されます。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    タイトル <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editing.title}
                    onChange={e => setEditing({ ...editing, title: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="【基本】リングスリーブ圧着作業①"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  YouTubeのURL または 動画ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editing.youtubeInput}
                  onChange={e => setEditing({ ...editing, youtubeInput: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX"
                />
                <p className="text-xs mt-1">
                  {editingYoutubeId ? (
                    <span className="text-green-700 font-medium">読み取った動画ID: {editingYoutubeId}</span>
                  ) : (
                    <span className="text-muted-foreground">URLを貼り付けると11桁の動画IDを自動で取り出します。</span>
                  )}
                </p>
              </div>

              {editingYoutubeId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">プレビュー</p>
                    <YouTubeChapterPlayer ref={previewRef} youtubeId={editingYoutubeId} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      動画の長さ <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editing.durationInput}
                        onChange={e => setEditing({ ...editing, durationInput: e.target.value })}
                        className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                        placeholder="3:19"
                      />
                      <button
                        onClick={fillDurationFromPlayer}
                        className="shrink-0 px-3 py-2 text-sm font-medium border rounded-md hover:bg-muted transition-colors flex items-center gap-1.5"
                        title="プレビューの動画から長さを取り込みます"
                      >
                        <Wand2 className="w-4 h-4" />
                        自動取得
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      「3:19」または秒数（199）で入力できます。
                      {editingDuration !== null && ` → ${editingDuration}秒`}
                    </p>
                  </div>
                </div>
              )}

              {/* 章立ての取り込み */}
              <div className="border-t pt-5 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    YouTubeの説明文を貼り付けて章立てを読み取る
                  </label>
                  <textarea
                    value={chapterSource}
                    onChange={e => setChapterSource(e.target.value)}
                    rows={4}
                    className="w-full border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder={'00:00 オープニング\n00:31 ケーブル外装の剥ぎ取り\n02:36 心線被覆の剥ぎ取り'}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={applyChapterSource}
                      className="px-3 py-2 text-sm font-medium border rounded-md hover:bg-muted transition-colors flex items-center gap-1.5"
                    >
                      <Wand2 className="w-4 h-4" />
                      章立てを読み取る
                    </button>
                    <p className="text-xs text-muted-foreground">
                      1行に複数の章が並んでいても拾えます。mm:ss / hh:mm:ss に対応。
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      章立て（保存前にここで確認・修正できます）
                    </p>
                    <button
                      onClick={addChapter}
                      className="text-xs font-medium px-2 py-1 border rounded-md hover:bg-muted transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      行を追加
                    </button>
                  </div>

                  {editing.chapters.length === 0 ? (
                    <p className="text-sm text-muted-foreground border rounded-md px-3 py-4 text-center">
                      章立てはまだありません。説明文を貼り付けて読み取るか、行を追加してください。
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editing.chapters.map((chapter, index) => (
                        <div key={`${chaptersRevision}-${index}`} className="flex items-center gap-2">
                          <input
                            type="text"
                            defaultValue={formatDuration(chapter.t)}
                            onBlur={e => updateChapter(index, { timeText: e.target.value })}
                            className="w-24 shrink-0 border rounded-md px-2 py-2 text-sm font-mono text-center focus:ring-1 focus:ring-primary focus:border-primary"
                            placeholder="0:00"
                          />
                          <input
                            type="text"
                            value={chapter.label}
                            onChange={e => updateChapter(index, { label: e.target.value })}
                            className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                            placeholder="章のタイトル"
                          />
                          <button
                            onClick={() => removeChapter(index)}
                            className="shrink-0 p-2 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                            title="この章を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.is_active}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                社員に公開する
              </label>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3 bg-muted/10 rounded-b-xl">
              <button
                onClick={() => {
                  setIsModalOpen(false)
                  setEditing(null)
                }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-md transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={modalSaving}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {modalSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
