import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const b64Decode = (str: string) => new TextDecoder().decode(Uint8Array.from(atob(str), c => c.charCodeAt(0)));

Deno.cron("earthquake-auto-alert", "* * * * *", async () => {
    console.log("Earthquake Cron started...");

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing DB credentials.");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Fetch Settings
        const { data: settings, error: settingsError } = await supabase
            .from('app_settings')
            .select('*')
            .limit(1)
            .single();

        if (settingsError || !settings) {
            console.error("Could not load settings.", settingsError);
            return;
        }

        // Check if earthquake alert is enabled
        if (!settings.enable_earthquake_alert || !settings.earthquake_threshold || !settings.earthquake_target_region) {
            console.log("Earthquake alert is not fully enabled or configured.");
            return;
        }

        // Fetch Earthquake info from P2Pquake API
        // codes=551 is JMA Seismic Intensity Information
        const res = await fetch("https://api.p2pquake.net/v2/history?codes=551&limit=1");
        if (!res.ok) {
            console.error("Failed to fetch from P2Pquake", await res.text());
            return;
        }

        const events = await res.json();
        if (!events || events.length === 0) {
            console.log("No earthquake events found.");
            return;
        }

        const latestEvent = events[0];
        
        // Ensure it's a valid event with an ID
        const eventId = latestEvent.earthquake?.time || latestEvent.id || latestEvent.time;
        if (!eventId) {
            console.log("Could not determine event ID.", latestEvent);
            return;
        }

        // Check if we already processed this event
        if (settings.last_earthquake_event_id === eventId) {
            console.log("Event already processed:", eventId);
            return;
        }

        // Check threshold
        const maxScale = latestEvent.earthquake?.maxScale;
        if (typeof maxScale !== 'number') {
            console.log("Event has no maxScale data. EventId:", eventId);
            return;
        }

        // Threshold Mapping
        const thresholdMap: Record<string, number> = {
            "5-": 45,
            "5+": 50,
            "6-": 55,
            "6+": 60,
            "7": 70
        };

        const targetMinScale = thresholdMap[settings.earthquake_threshold] || 999;
        const regionQuery = settings.earthquake_target_region;

        console.log(`Analyzing EQ: maxScale=${maxScale}, needed=${targetMinScale}, regionQuery=${regionQuery}`);

        let isMatch = false;

        // Condition 1: Overall max Scale is >= Threshold
        if (maxScale >= targetMinScale) {
            // Condition 2: Is the threshold met in the target region?
            // "points" contains {"addr":"東京都", "scale": 45} etc.
            const points = latestEvent.points || [];
            
            // "本社周辺" is generic, if user types anything we do a loose check.
            // If they type a specific pref like "東京" or city "新宿", we check points.
            // If the query is "本社周辺", we might fallback to checking just the overall maxScale,
            // OR doing a rudimentary substring check.
            for (const pt of points) {
                if (pt.scale >= targetMinScale && (regionQuery === "本社周辺" || regionQuery === "全域" || pt.addr.includes(regionQuery) || pt.pref.includes(regionQuery))) {
                    isMatch = true;
                    break;
                }
            }

            // Fallback: If regionQuery is "本社周辺" and maxScale is met globally, trigger it.
            if (!isMatch && (regionQuery === "本社周辺" || regionQuery === "全域")) {
                isMatch = true; // For '本社周辺' without specific prefecture, trigger if ANY point matches threshold!
            }
        }

        if (!isMatch) {
            console.log("Earthquake event did not meet criteria. EventId:", eventId);
            // Even if it didn't match, we SHOULD NOT record it as processed yet?
            // Actually we should record it as processed so we don't re-check it 100 times.
            await supabase.from('app_settings').update({ last_earthquake_event_id: eventId }).eq('id', settings.id);
            return;
        }

        // MATCH FOUND! TRIGGER ALERTS!
        console.log("EARTHQUAKE THRESHOLD MET! Dispatching Webhook...");

        if (!settings.safety_webhook_url) {
            console.error("Webhook URL is missing!");
            return;
        }

        // Send Webhook to Google Chat
        const msgHeader = b64Decode("PHVzZXJzL2FsbD4g44CQ57eK5oCl44CR5a6J5ZCm56K66KqN44Gu44GK6aGY44GE"); // <users/all> 【緊急】安否確認のお願い
        const msgBody1 = b64Decode("5aSn6KaP5qih44Gq5Zyw6ZyH44GM55m655Sf44GX44G+44GX44Gf44CC55u044Gh44Gr5Lul5LiL44GuVVJM44KI44KK5a6J5ZCm54q25rOB44KS5aCx5ZGK44GX44Gm44GP44Gg44GV44GE44CC"); // 大規模な地震が発生しました。直ちに以下のURLより安否状況を報告してください。
        
        const messageText = `${msgHeader}\n${msgBody1}\n\n${settings.safety_app_url || ''}`;

        const hookRes = await fetch(settings.safety_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: messageText }),
        });

        if (!hookRes.ok) {
            console.error("Webhook failed:", hookRes.status, await hookRes.text());
        }

        // Create notification history
        const typeEmergency = b64Decode("57eK5oCl6Ieq5YuV5LiA5paJ6YCB5L+h77yI5Zyw6ZyH6YCj5YuV77yJ"); // 緊急自動一斉送信（地震連動）
        await supabase
            .from('safety_notification_history')
            .insert([{ type: typeEmergency }]);

        // Finally, save processing state so we don't fire again
        await supabase.from('app_settings').update({ last_earthquake_event_id: eventId }).eq('id', settings.id);
        
        console.log("Earthquake dispatch complete.");

    } catch (err) {
        console.error("Unhandled error in earthquake cron:", err);
    }
});
