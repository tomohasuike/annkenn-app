-- 1. pg_net拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. 案件追加時：Google Drive上にフォルダ構造を自動作成するトリガー
CREATE OR REPLACE FUNCTION public.tr_handle_project_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Deno Edge Function 'create-project-folder' を呼び出し
  PERFORM net.http_post(
    url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/create-project-folder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'record', row_to_json(NEW)
    ),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_on_project_created ON public.projects;
CREATE TRIGGER tr_on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_handle_project_created();


-- 3. 案件更新（ステータス変更）時：Google Drive上のフォルダを自動で「進行中」<->「完工」ディレクトリへ移動させるトリガー
CREATE OR REPLACE FUNCTION public.tr_handle_project_updated()
RETURNS TRIGGER AS $$
BEGIN
  -- ステータス（status_flag）が変更された場合のみ実行
  IF (OLD.status_flag IS DISTINCT FROM NEW.status_flag) THEN
    PERFORM net.http_post(
      url := 'https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/move-project-folder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'record', row_to_json(NEW),
        'old_record', row_to_json(OLD)
      ),
      timeout_milliseconds := 10000
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_on_project_updated ON public.projects;
CREATE TRIGGER tr_on_project_updated
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_handle_project_updated();
