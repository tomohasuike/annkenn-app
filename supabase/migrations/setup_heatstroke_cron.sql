-- =============================================================
-- 熱中症安否確認 通知スケジュール設定（pg_cron + pg_net）
-- Supabase SQL Editor で実行してください
-- =============================================================

-- 既存のジョブがあれば先に削除（再設定用）
SELECT cron.unschedule('heatstroke-prompt-morning')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'heatstroke-prompt-morning');
SELECT cron.unschedule('heatstroke-reminder-morning') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'heatstroke-reminder-morning');
SELECT cron.unschedule('heatstroke-prompt-10')        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'heatstroke-prompt-10');
SELECT cron.unschedule('heatstroke-reminder-10')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'heatstroke-reminder-10');
SELECT cron.unschedule('heatstroke-prompt-15')        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'heatstroke-prompt-15');
SELECT cron.unschedule('heatstroke-reminder-15')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'heatstroke-reminder-15');

-- ① 朝 7:45 (JST) = UTC 22:45 → 促し通知（全員へ）
SELECT cron.schedule(
  'heatstroke-prompt-morning',
  '45 22 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/send-heatstroke-reminders?type=%E6%9C%9D&mode=prompt',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- ② 朝 8:15 (JST) = UTC 23:15 → リマインド（未申告者だけ）
SELECT cron.schedule(
  'heatstroke-reminder-morning',
  '15 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/send-heatstroke-reminders?type=%E6%9C%9D&mode=reminder',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- ③ 10時休憩 10:00 (JST) = UTC 01:00 → 促し通知（全員へ）
SELECT cron.schedule(
  'heatstroke-prompt-10',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/send-heatstroke-reminders?type=10%E6%99%82%E4%BC%91%E6%86%A9&mode=prompt',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- ④ 10時休憩 10:30 (JST) = UTC 01:30 → リマインド（未申告者だけ）
SELECT cron.schedule(
  'heatstroke-reminder-10',
  '30 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/send-heatstroke-reminders?type=10%E6%99%82%E4%BC%91%E6%86%A9&mode=reminder',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- ⑤ 15時休憩 15:00 (JST) = UTC 06:00 → 促し通知（全員へ）
SELECT cron.schedule(
  'heatstroke-prompt-15',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/send-heatstroke-reminders?type=15%E6%99%82%E4%BC%91%E6%86%A9&mode=prompt',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- ⑥ 15時休憩 15:30 (JST) = UTC 06:30 → リマインド（未申告者だけ）
SELECT cron.schedule(
  'heatstroke-reminder-15',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/send-heatstroke-reminders?type=15%E6%99%82%E4%BC%91%E6%86%A9&mode=reminder',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- 設定確認
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'heatstroke-%' ORDER BY jobname;
