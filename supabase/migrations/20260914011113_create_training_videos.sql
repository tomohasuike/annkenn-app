-- 作業手順動画（YouTube）テーブル
-- 閲覧: ログイン済み社員全員 / 追加・更新・削除: is_admin() の管理者のみ
-- anon ロールからは一切アクセスさせない（ポリシー未付与 + 明示REVOKE）

create table public.training_videos (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  youtube_id text not null unique
    check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  duration_seconds integer not null default 0
    check (duration_seconds >= 0),
  chapters jsonb not null default '[]'::jsonb
    check (jsonb_typeof(chapters) = 'array'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.training_videos is '作業手順の教育動画（YouTube）。閲覧は全社員、編集は管理者(is_admin)のみ。';
comment on column public.training_videos.category is '分類（例: 被覆剥ぎ取り / リングスリーブ圧着作業 / 圧着端子の施工手順）';
comment on column public.training_videos.youtube_id is 'YouTube動画ID（11桁）。埋め込みURLの組み立てに使う。';
comment on column public.training_videos.duration_seconds is '動画の長さ（秒）';
comment on column public.training_videos.chapters is '章立て。[{"t": 開始秒数, "label": "見出し"}] の配列。';
comment on column public.training_videos.sort_order is '表示並び順（昇順）';
comment on column public.training_videos.is_active is '公開フラグ。falseは非表示。';

create index training_videos_category_sort_idx
  on public.training_videos (category, sort_order);
create index training_videos_active_sort_idx
  on public.training_videos (sort_order) where is_active;

-- updated_at 自動更新（既存の handle_updated_at() を流用）
create trigger set_training_videos_updated_at
  before update on public.training_videos
  for each row execute function public.handle_updated_at();

-- ---------------- RLS ----------------
alter table public.training_videos enable row level security;

create policy "Authenticated users can read training videos"
  on public.training_videos for select
  to authenticated
  using (true);

create policy "Admins can insert training videos"
  on public.training_videos for insert
  to authenticated
  with check (is_admin());

create policy "Admins can update training videos"
  on public.training_videos for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "Admins can delete training videos"
  on public.training_videos for delete
  to authenticated
  using (is_admin());

-- ---------------- 権限（PUBLIC/anon の取りこぼし防止） ----------------
revoke all on public.training_videos from public;
revoke all on public.training_videos from anon;
grant select, insert, update, delete on public.training_videos to authenticated;
revoke truncate, references, trigger on public.training_videos from authenticated;
grant all on public.training_videos to service_role;
