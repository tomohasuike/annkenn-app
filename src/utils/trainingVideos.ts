// 作業手順動画(training_videos)まわりの共通型・変換ユーティリティ。
// 一覧ページ(pages/tools/TrainingVideos.tsx)と管理画面(components/settings/TrainingVideoSettings.tsx)の両方から使う。

export type TrainingVideoChapter = {
  /** 章の開始秒 */
  t: number
  label: string
}

export type TrainingVideo = {
  id: string
  category: string
  title: string
  youtube_id: string
  duration_seconds: number
  chapters: TrainingVideoChapter[]
  sort_order: number
  is_active?: boolean
}

export type TrainingVideoCategoryGroup = {
  category: string
  videos: TrainingVideo[]
}

/** 秒数を 3:19 / 1:02:03 形式にする */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * 「3:19」「1:02:03」「199」のいずれの書き方でも秒数に直す。
 * 解釈できない場合は null を返す。
 */
export function parseDurationInput(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)
  const parts = raw.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every(p => /^\d+$/.test(p.trim()))) return null
  const nums = parts.map(p => Number(p.trim()))
  return nums.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1]
}

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

/**
 * YouTubeのURL(watch / youtu.be / embed / shorts / live)から11桁の動画IDを取り出す。
 * 11桁のIDをそのまま貼られた場合もそのまま返す。取り出せなければ null。
 */
export function extractYoutubeId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  if (YOUTUBE_ID_PATTERN.test(raw)) return raw

  const fromUrl = raw.match(/(?:v=|\/embed\/|\/shorts\/|\/live\/|\/v\/|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  if (fromUrl) return fromUrl[1]

  return null
}

/** 埋め込み再生用のURL。start を渡すとその秒数から始まる。 */
export function buildEmbedUrl(youtubeId: string, start?: number): string {
  const params = new URLSearchParams({ rel: '0', playsinline: '1' })
  if (start && start > 0) params.set('start', String(Math.floor(start)))
  return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`
}

/**
 * YouTubeの説明文を貼り付けて章立てに分解する。
 *
 *   00:00 オープニング
 *   02:36 心線被覆の剥ぎ取り
 *
 * のような1行1章の書き方だけでなく、
 *
 *   00:00 導入 00:26 ステップ１被覆の剥ぎ取り
 *
 * のように1行に複数の章が並ぶ書き方にも対応する。mm:ss / hh:mm:ss の両方を受け付ける。
 */
export function parseChapterText(text: string): TrainingVideoChapter[] {
  if (!text.trim()) return []

  const pattern = /(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)/g
  const stamps: { start: number; end: number; seconds: number }[] = []

  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const hours = match[1] ? Number(match[1]) : 0
    const minutes = Number(match[2])
    const seconds = Number(match[3])
    stamps.push({
      start: match.index,
      end: match.index + match[0].length,
      seconds: hours * 3600 + minutes * 60 + seconds,
    })
  }

  const chapters = stamps.map((stamp, i) => {
    const next = stamps[i + 1]
    const rawLabel = text.slice(stamp.end, next ? next.start : undefined)
    const label = rawLabel
      // 行頭・時刻直後に付きがちな区切り記号を落とす
      .replace(/^[\s　\-–—:：・|｜>＞]+/, '')
      .replace(/[\s　]+/g, ' ')
      .trim()
    return { t: stamp.seconds, label: label || `チャプター${i + 1}` }
  })

  // 同じ秒数が重複していたら先に出てきた方を残し、開始秒の昇順に並べる
  const seen = new Set<number>()
  return chapters
    .filter(c => {
      if (seen.has(c.t)) return false
      seen.add(c.t)
      return true
    })
    .sort((a, b) => a.t - b.t)
}

/** DBのjsonbをそのまま渡されても落ちないように章立てを正規化する */
export function normalizeChapters(value: unknown): TrainingVideoChapter[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const t = Number(record.t)
      if (!Number.isFinite(t)) return null
      return { t: Math.max(0, Math.floor(t)), label: String(record.label ?? '') }
    })
    .filter((c): c is TrainingVideoChapter => c !== null)
    .sort((a, b) => a.t - b.t)
}

/**
 * 章の長さ(秒)。最後の章は動画全体の長さまでを使う。
 * 算出できない場合は null。
 */
export function getChapterLength(
  chapters: TrainingVideoChapter[],
  index: number,
  durationSeconds: number
): number | null {
  const current = chapters[index]
  if (!current) return null
  const next = chapters[index + 1]
  const end = next ? next.t : durationSeconds
  const length = end - current.t
  return length > 0 ? length : null
}

/** 再生位置(秒)から、いま再生中の章のindexを求める。該当なしは -1。 */
export function findActiveChapterIndex(chapters: TrainingVideoChapter[], currentSeconds: number): number {
  let active = -1
  for (let i = 0; i < chapters.length; i++) {
    if (currentSeconds + 0.5 >= chapters[i].t) active = i
    else break
  }
  return active
}

/**
 * 分類(category)ごとにまとめる。分類の並びは sort_order が最も小さい動画の順、
 * 分類内は sort_order の昇順(①→②)。
 */
export function groupByCategory(videos: TrainingVideo[]): TrainingVideoCategoryGroup[] {
  const groups = new Map<string, TrainingVideo[]>()
  for (const video of videos) {
    const key = video.category || 'その他'
    const list = groups.get(key)
    if (list) list.push(video)
    else groups.set(key, [video])
  }
  return Array.from(groups.entries())
    .map(([category, list]) => ({
      category,
      videos: [...list].sort((a, b) => a.sort_order - b.sort_order),
    }))
    .sort((a, b) => a.videos[0].sort_order - b.videos[0].sort_order)
}
