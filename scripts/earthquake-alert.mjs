// 地震アラート自動送信スクリプト
// GitHub Actions から5分おきに呼び出される
// P2P地震情報 API (api.p2pquake.net) を使用
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('環境変数が設定されていません');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 震度スケール変換マップ（P2P地震情報の数値 → 震度文字列）
const SCALE_MAP = {
  10: '1', 20: '2', 30: '3', 40: '4',
  45: '5弱', 50: '5強', 55: '6弱', 60: '6強', 70: '7'
};

// 震度文字列 → 数値変換（閾値比較用）
const THRESHOLD_MAP = {
  '1': 10, '2': 20, '3': 30, '4': 40,
  '5-': 45, '5弱': 45, '5+': 50, '5強': 50,
  '6-': 55, '6弱': 55, '6+': 60, '6強': 60, '7': 70
};

function scaleToStr(scale) {
  return SCALE_MAP[scale] || `不明(${scale})`;
}

function thresholdToNum(threshold) {
  return THRESHOLD_MAP[threshold] || 55; // デフォルト: 6弱
}

async function main() {
  console.log('=== 地震アラートチェック開始 ===');

  // app_settings 取得
  const { data: settings, error: settingsErr } = await supabase
    .from('app_settings')
    .select('*')
    .limit(1)
    .single();

  if (settingsErr || !settings) {
    console.error('設定の取得に失敗:', settingsErr?.message);
    process.exit(1);
  }

  if (!settings.enable_earthquake_alert) {
    console.log('地震アラートは無効 (enable_earthquake_alert = false)');
    process.exit(0);
  }

  const thresholdNum = thresholdToNum(settings.earthquake_threshold || '6-');
  const targetRegion = settings.earthquake_target_region || '';
  const lastEventId = settings.last_earthquake_event_id;

  console.log(`設定: 閾値=震度${settings.earthquake_threshold}, 対象地域=${targetRegion}`);
  console.log(`最後に処理したイベントID: ${lastEventId || 'なし'}`);

  // P2P地震情報 API から最新の地震情報を取得（最新10件）
  const res = await fetch('https://api.p2pquake.net/v2/history?codes=551&limit=10');
  if (!res.ok) {
    console.error('P2P地震情報 API 取得失敗:', res.status);
    process.exit(1);
  }

  const earthquakes = await res.json();
  console.log(`取得した地震情報: ${earthquakes.length}件`);

  if (!earthquakes || earthquakes.length === 0) {
    console.log('地震情報なし');
    process.exit(0);
  }

  // 最新の地震をチェック
  const latest = earthquakes[0];
  const latestId = latest._id || latest.id || latest.earthquake?.time;
  const maxScale = latest.earthquake?.maxScale || 0;
  const eqTime = latest.earthquake?.time || latest.time;
  const hypocenter = latest.earthquake?.hypocenter;
  const magnitude = hypocenter?.magnitude || '-';
  const hypocenterName = hypocenter?.name || '不明';

  console.log(`最新地震: ${eqTime} | ${hypocenterName} | M${magnitude} | 最大震度: ${scaleToStr(maxScale)}`);

  // 同じイベントを二重処理しない
  if (latestId === lastEventId) {
    console.log('既に処理済みのイベント - スキップ');
    process.exit(0);
  }

  // 栃木県（対象地域）の震度を取得
  let localScale = 0;
  let regionInfo = '';
  if (targetRegion && latest.points && latest.points.length > 0) {
    const regionPoints = latest.points.filter(p =>
      p.pref?.includes(targetRegion) || p.addr?.includes(targetRegion)
    );
    if (regionPoints.length > 0) {
      localScale = Math.max(...regionPoints.map(p => p.scale || 0));
      regionInfo = `${targetRegion}の最大震度: 震度${scaleToStr(localScale)}`;
      console.log(regionInfo);
    } else {
      console.log(`${targetRegion}の観測点なし（全国最大震度: ${scaleToStr(maxScale)}）`);
    }
  }

  // 判定: 対象地域の震度 >= 閾値 OR 全国震度が極めて大きい(6強以上)場合
  const localMeetsThreshold = localScale >= thresholdNum;
  const nationwideExtreme = maxScale >= 60; // 全国震度6強以上は無条件でアラート

  if (!localMeetsThreshold && !nationwideExtreme) {
    console.log(`対象地域(${targetRegion})の震度が閾値未満 (${scaleToStr(localScale)} < 震度${settings.earthquake_threshold}) - 送信しない`);
    // 処理済みとしてIDを更新
    await supabase.from('app_settings').update({ last_earthquake_event_id: latestId }).eq('id', settings.id);
    process.exit(0);
  }

  const reason = localMeetsThreshold
    ? `${targetRegion}で震度${scaleToStr(localScale)}を観測`
    : `全国最大震度${scaleToStr(maxScale)}（広域大地震）`;
  console.log(`アラート条件成立: ${reason} → 通知送信`);

  // メッセージ作成
  const formUrl = settings.safety_app_url || 'https://annkenn-app.vercel.app/safety-report';
  const messageText = [
    `<users/all> 【緊急】大地震発生 - 安否確認のお願い`,
    ``,
    `震源: ${hypocenterName}`,
    `規模: M${magnitude}`,
    `最大震度: ${scaleToStr(maxScale)}`,
    `発生時刻: ${eqTime}`,
    regionInfo,
    ``,
    `直ちに以下のURLより安否状況を報告してください。`,
    ``,
    formUrl
  ].filter(l => l !== undefined).join('\n');

  // Google Chat に送信
  const chatRes = await fetch(settings.safety_webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: messageText }),
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    console.error('Google Chat 送信失敗:', chatRes.status, errText);
    process.exit(1);
  }

  console.log('Google Chat 送信成功');

  // 送信履歴を記録
  await supabase.from('safety_notification_history').insert([{
    type: `緊急（地震自動検知）震度${scaleToStr(maxScale)} ${hypocenterName}`
  }]);

  // last_earthquake_event_id を更新
  await supabase.from('app_settings')
    .update({ last_earthquake_event_id: latestId })
    .eq('id', settings.id);

  console.log(`完了: 地震アラート送信 - ${hypocenterName} M${magnitude} 最大震度${scaleToStr(maxScale)}`);
}

main().catch(err => {
  console.error('予期しないエラー:', err);
  process.exit(1);
});
