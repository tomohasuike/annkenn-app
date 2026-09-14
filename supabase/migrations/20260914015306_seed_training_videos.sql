-- 作業手順動画 初期データ（社長のYouTube 5本）
insert into public.training_videos (category, title, youtube_id, duration_seconds, chapters, sort_order, is_active) values
('被覆剥ぎ取り', '【基本】被覆剥ぎ取り', 'UBcaOV96Vjs', 308,
 '[{"t":0,"label":"オープニング"},{"t":31,"label":"ケーブル外装の剥ぎ取り"},{"t":156,"label":"心線被覆の剥ぎ取り"},{"t":272,"label":"まとめ・注意点"}]'::jsonb, 10, true),
('リングスリーブ圧着作業', '【基本】リングスリーブ圧着作業①', 'Y8Fp8vIjavY', 199,
 '[{"t":0,"label":"導入"},{"t":18,"label":"電線の被覆剥ぎ取り"},{"t":64,"label":"電線の本数・サイズ確認と圧着"}]'::jsonb, 20, true),
('リングスリーブ圧着作業', '【基本】リングスリーブ圧着作業②', 'Zx63wxF1_Uc', 164,
 '[{"t":0,"label":"ステップ３末端処理とテープ巻き"},{"t":112,"label":"注意点"},{"t":145,"label":"傷の確認"}]'::jsonb, 30, true),
('圧着端子の施工手順', '【基本】圧着端子の施工手順①', '71d220UmroU', 206,
 '[{"t":0,"label":"導入"},{"t":26,"label":"ステップ１被覆の剥ぎ取り"},{"t":125,"label":"ステップ2専用圧着工具の選定"}]'::jsonb, 40, true),
('圧着端子の施工手順', '【基本】圧着端子の施工手順②', 'aTR0PCoM8gk', 160,
 '[{"t":0,"label":"ステップ３端子の挿入と圧着"},{"t":89,"label":"注意点"},{"t":120,"label":"注意点２"}]'::jsonb, 50, true)
on conflict (youtube_id) do nothing;
