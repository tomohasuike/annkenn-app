-- 1. プロジェクト大枠（案件）
CREATE TABLE IF NOT EXISTS calc_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    base_temperature INT DEFAULT 40, -- 基準温度(30℃ or 40℃)
    rules_version TEXT DEFAULT 'R6_2024', -- 過去データの崩壊を防ぐ固定フラグ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 分電盤・動力盤
CREATE TABLE IF NOT EXISTS calc_panels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES calc_projects(id) ON DELETE CASCADE,
    parent_panel_id UUID REFERENCES calc_panels(id) ON DELETE SET NULL, -- 後付けツリー紐付け用
    name TEXT NOT NULL,
    panel_type TEXT NOT NULL CHECK(panel_type IN ('LIGHTING', 'POWER')),
    voltage_system TEXT NOT NULL, -- 例: '1Φ3W 100/200V', '3Φ3W 200V'
    frequency INT DEFAULT 50 CHECK(frequency IN (50, 60)),
    main_breaker_at INT,      -- 主幹ブレーカ定格(手動設定用)
    main_breaker_af INT,
    main_cable_sq NUMERIC,    -- 受電ケーブル太さ
    main_cable_length_m NUMERIC DEFAULT 0, -- 電源からの距離
    reduction_factor NUMERIC DEFAULT 1.0,  -- ラック等の低減率
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 負荷回路（詳細）
CREATE TABLE IF NOT EXISTS calc_loads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    panel_id UUID REFERENCES calc_panels(id) ON DELETE CASCADE,
    circuit_no INT NOT NULL, -- 回路番号
    name TEXT NOT NULL,
    is_spare BOOLEAN DEFAULT false, -- 予備回路フラグ (容量計算から除外)
    is_existing BOOLEAN DEFAULT false, -- 既設ロックフラグ (自動計算を除外)
    
    capacity_kw NUMERIC DEFAULT 0,
    power_factor NUMERIC DEFAULT 1.0, -- 力率 (cosθ)
    phase TEXT NOT NULL, -- 割当相 (U, V, W, R, S, T)
    interlock_group_id UUID, -- 切替スイッチ等（同時使用不可）の排他グループ化
    
    starting_method TEXT DEFAULT 'DIRECT', -- DIRECT, Y_DELTA, INVERTER
    cable_length_m NUMERIC DEFAULT 0,      -- こう長(m)
    
    -- 手動上書き分離用フィールド
    auto_breaker_at INT,
    override_breaker_at INT, -- ユーザー上書き時のみ値が入る
    auto_cable_sq NUMERIC,
    override_cable_sq NUMERIC, -- ユーザー上書き時のみ値が入る
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. [将来構想] ボックス/キャビネット・部品のBOM自動連携用中間テーブル
CREATE TABLE IF NOT EXISTS calc_panel_boms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    panel_id UUID REFERENCES calc_panels(id) ON DELETE CASCADE,
    component_type TEXT NOT NULL, -- 'CABINET', 'BREAKER', 'TERMINAL' etc...
    catalog_material_id UUID,     -- IDでネグロスやIDEC等のカタログマスタと後日JOIN
    quantity INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 東電公式ルートA（負荷算定）に基づく契約電力計算RPC関数の例
CREATE OR REPLACE FUNCTION calculate_tepco_contract_kw(p_project_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total_lighting_kw NUMERIC := 0;
    total_power_kw NUMERIC := 0;
    contract_kw NUMERIC := 0;
    
    power_load RECORD;
    rank INT := 1;
BEGIN
    -- 1. 電灯負荷の圧縮 (6kW以下100%, +14kWまで90%, +30kWまで80%...)
    SELECT COALESCE(SUM(capacity_kw), 0) INTO total_lighting_kw
    FROM calc_loads l
    JOIN calc_panels p ON l.panel_id = p.id
    WHERE p.project_id = p_project_id AND p.panel_type = 'LIGHTING' AND l.is_spare = false;
    
    IF total_lighting_kw <= 6 THEN
        total_lighting_kw := total_lighting_kw;
    ELSIF total_lighting_kw <= 20 THEN
        total_lighting_kw := 6 + (total_lighting_kw - 6) * 0.9;
    ELSIF total_lighting_kw <= 50 THEN
        total_lighting_kw := 6 + 14 * 0.9 + (total_lighting_kw - 20) * 0.8;
    ELSE
        total_lighting_kw := 6 + 14 * 0.9 + 30 * 0.8 + (total_lighting_kw - 50) * 0.7;
    END IF;

    -- 2. 動力負荷の降順台数圧縮
    -- 動力のみを抽出し、容量の大きい順に並べ替え
    FOR power_load IN 
        SELECT capacity_kw FROM calc_loads l
        JOIN calc_panels p ON l.panel_id = p.id
        WHERE p.project_id = p_project_id AND p.panel_type = 'POWER' 
          AND l.is_spare = false AND l.interlock_group_id IS NULL
        ORDER BY capacity_kw DESC
    LOOP
        IF rank <= 2 THEN
            total_power_kw := total_power_kw + (power_load.capacity_kw * 1.25 * 1.0);
        ELSIF rank <= 4 THEN
            total_power_kw := total_power_kw + (power_load.capacity_kw * 1.25 * 0.95);
        ELSE
            total_power_kw := total_power_kw + (power_load.capacity_kw * 1.25 * 0.90);
        END IF;
        rank := rank + 1;
    END LOOP;

    -- 合計し、小数第一位で四捨五入
    contract_kw := ROUND((total_lighting_kw + total_power_kw)::NUMERIC, 1);
    
    RETURN contract_kw;
END;
$$ LANGUAGE plpgsql;
