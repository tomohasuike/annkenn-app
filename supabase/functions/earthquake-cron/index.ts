import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const b64Decode = (str: string) => new TextDecoder().decode(Uint8Array.from(atob(str), c => c.charCodeAt(0)));

async function runEarthquakeCheck() {
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
            const points = latestEvent.points || [];

            for (const pt of points) {
                // null/undefined safety for addr and pref
                const addr = pt.addr ?? '';
                const pref = pt.pref ?? '';

                if (
                    pt.scale >= targetMinScale &&
                    (
                        regionQuery === "本社周辺" ||
                        regionQuery === "全域" ||
                        addr.includes(regionQuery) ||
                        pref.includes(regionQuery)
                    )
                ) {
                    isMatch = true;
                    break;
                }
            }

            // Fallback: If regionQuery is generic and maxScale is met globally, trigger.
            if (!isMatch && (regionQuery === "本社周辺" || regionQuery === "全域")) {
                isMatch = true;
            }
        }

        if (!isMatch) {
            console.log("Earthquake event did not meet criteria. EventId:", eventId);
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
        const msgHeader = b64Decode("PHVzZXJzL2FsbD4g44CQ57eK5oCl44CR5a6J5ZCm56K66KqN44Gu44GK6aGY44GE");
        const msgBody1 = b64Decode("5aSn6KaP5qih44Gq5Zyw6ZyH44GM55m655Sf44GX44G+44GX44Gf44CC55u044Gh44Gr5Lul5LiL44GuVVJM44KI44KK5a6J5ZCm54q25rOB44KS5aCx5ZGK44GX44Gm44GP44Gg44GV44GE44CC");

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
        const typeEmergency = b64Decode("57eK5oCl6Ieq5YuV5LiA5paJ6YCB5L+h77yI5Zyw6ZyH6YCj5YuV77yJ");
        await supabase
            .from('safety_notification_history')
            .insert([{ type: typeEmergency }]);

        // Finally, save processing state so we don't fire again
        await supabase.from('app_settings').update({ last_earthquake_event_id: eventId }).eq('id', settings.id);

        console.log("Earthquake dispatch complete.");

    } catch (err) {
        console.error("Unhandled error in earthquake cron:", err);
    }
}

// Cron: every minute
Deno.cron("earthquake-auto-alert", "* * * * *", runEarthquakeCheck);

// HTTP handler (required for Supabase Edge Function deployment)
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            }
        });
    }

    try {
        await runEarthquakeCheck();
        return new Response(JSON.stringify({ success: true, message: "Earthquake check executed." }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (err: any) {
        console.error("HTTP trigger error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
