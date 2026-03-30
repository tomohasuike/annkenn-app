DO $$
DECLARE
    cur_date date;
    w record;
    r record;
    w_role text;
    worked_on boolean;
    in_time timestamp with time zone;
    out_time timestamp with time zone;
    in_hr int;
    in_min int;
    out_hr int;
    out_min int;
    tt int;
    pt int;
BEGIN
    -- Delete existing data for the period
    DELETE FROM daily_attendance 
    WHERE target_date >= '2026-02-26' AND target_date <= '2026-03-25';

    -- Loop through all target workers
    FOR w IN 
        SELECT id, name FROM worker_master 
        WHERE type NOT IN ('役員', '事務員', '協力会社') 
        AND name NOT LIKE '%蓮池%'
        AND is_active = true
    LOOP
        -- Loop through days
        FOR cur_date IN SELECT generate_series('2026-02-26'::date, '2026-03-25'::date, '1 day'::interval)::date
        LOOP
            -- Check if they are in a report personnel for this day
            worked_on := false;
            w_role := '一般';
            
            SELECT true INTO worked_on 
            FROM report_personnel rp
            JOIN daily_reports dr ON rp.report_id = dr.id
            WHERE rp.worker_id = w.id AND dr.report_date = cur_date
            LIMIT 1;

            -- Assuming 10% random absence if no report, and skip Sunday if no report
            IF EXTRACT(DOW FROM cur_date) = 0 AND NOT worked_on THEN
                CONTINUE;
            END IF;

            IF NOT worked_on AND (random() > 0.9) THEN
                CONTINUE;
            END IF;

            IF worked_on AND random() > 0.8 THEN
                w_role := '職長';
            END IF;

            in_hr := 7 + floor(random() * 2)::int;
            in_min := floor(random() * 60)::int;
            out_hr := 17 + floor(random() * 3)::int;
            out_min := floor(random() * 60)::int;

            -- Convert to timestamp explicitly
            in_time := cur_date + make_time(in_hr, in_min, 0);
            out_time := cur_date + make_time(out_hr, out_min, 0);
            -- set to UTC+9 correctly
            in_time := in_time - interval '9 hours';
            out_time := out_time - interval '9 hours';

            tt := (ARRAY[30, 45, 60, 90])[1 + floor(random() * 4)::int];
            pt := (ARRAY[0, 15, 30])[1 + floor(random() * 3)::int];

            INSERT INTO daily_attendance (worker_id, target_date, clock_in_time, clock_out_time, role, prep_time_minutes, travel_time_minutes, is_locked)
            VALUES (w.id, cur_date, in_time, out_time, w_role, pt, tt, false);
        END LOOP;
    END LOOP;
END $$;
