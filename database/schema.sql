-- ============================================================================
-- Atelier 2D Flat-Lay Smart Wardrobe & Hybrid Styling System
-- PostgreSQL 16 Relational Schema (DDL)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 1. Users & Preferences
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    user_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email              VARCHAR(255) NOT NULL UNIQUE,
    display_name       VARCHAR(120) NOT NULL,
    preferred_locale   VARCHAR(16)  NOT NULL DEFAULT 'zh-TW',
    allow_oversized    BOOLEAN      NOT NULL DEFAULT FALSE,
    default_city       VARCHAR(100) NOT NULL DEFAULT 'Taipei',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. User Body-Ratio Calibration Profiles (MediaPipe Pose Anchor Ratios)
-- ----------------------------------------------------------------------------
CREATE TABLE user_body_profiles (
    profile_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    height_cm              NUMERIC(5,1) CHECK (height_cm BETWEEN 100 AND 230),
    -- Normalized ratios derived from on-device MediaPipe Pose landmarks
    shoulder_width_ratio   NUMERIC(5,4) NOT NULL DEFAULT 0.2800 CHECK (shoulder_width_ratio BETWEEN 0.15 AND 0.55),
    torso_length_ratio     NUMERIC(5,4) NOT NULL DEFAULT 0.3400 CHECK (torso_length_ratio BETWEEN 0.20 AND 0.50),
    leg_length_ratio       NUMERIC(5,4) NOT NULL DEFAULT 0.4800 CHECK (leg_length_ratio BETWEEN 0.30 AND 0.65),
    shoulder_to_hip_ratio  NUMERIC(5,4) NOT NULL DEFAULT 1.0800 CHECK (shoulder_to_hip_ratio BETWEEN 0.70 AND 1.60),
    -- Normalized landmark coordinates stored purely as scalar geometry (no raw photo upload needed)
    pose_landmarks_json    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    head_cutout_url        TEXT,
    use_head_anchor        BOOLEAN      NOT NULL DEFAULT FALSE,
    calibrated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Digital Wardrobe Items (On-Device Vision + One-Time Gemini Flash Tags)
-- ----------------------------------------------------------------------------
CREATE TABLE wardrobe_items (
    item_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name               VARCHAR(160) NOT NULL,
    image_url          TEXT         NOT NULL,
    image_sha256       CHAR(64)     NOT NULL,

    -- Structured Outputs from one-time lightweight VLM auto-tagging
    category           VARCHAR(24)  NOT NULL CHECK (category IN ('top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory')),
    sub_category       VARCHAR(48)  NOT NULL,
    fit                VARCHAR(16)  NOT NULL CHECK (fit IN ('slim', 'regular', 'loose')),
    length             VARCHAR(16)  NOT NULL CHECK (length IN ('cropped', 'regular', 'long')),
    thermal_score      SMALLINT     NOT NULL CHECK (thermal_score BETWEEN 1 AND 5),
    style_tags         TEXT[]       NOT NULL DEFAULT '{}',
    season             TEXT[]       NOT NULL DEFAULT '{}',

    -- Local K-Means++ top-2 dominant color metadata (after Auto White Balance)
    primary_hex        CHAR(7)      NOT NULL CHECK (primary_hex ~ '^#[0-9A-Fa-f]{6}$'),
    primary_hsl        JSONB        NOT NULL, -- {"h": 0..360, "s": 0..100, "l": 0..100}
    secondary_hex      CHAR(7)      CHECK (secondary_hex IS NULL OR secondary_hex ~ '^#[0-9A-Fa-f]{6}$'),
    secondary_hsl      JSONB,

    -- Lifecycle & Cost-Per-Wear (CPW) tracking
    purchase_price     NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (purchase_price >= 0),
    currency           CHAR(3)       NOT NULL DEFAULT 'TWD',
    wear_count         INTEGER       NOT NULL DEFAULT 0 CHECK (wear_count >= 0),
    last_worn_at       DATE,
    is_archived        BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_item_hash UNIQUE (user_id, image_sha256)
);

-- Fast indexes for Stage-1 local/DB pre-filtering
CREATE INDEX idx_wardrobe_user_active ON wardrobe_items (user_id, category, thermal_score) WHERE is_archived = FALSE;
CREATE INDEX idx_wardrobe_style_gin   ON wardrobe_items USING GIN (style_tags);
CREATE INDEX idx_wardrobe_season_gin  ON wardrobe_items USING GIN (season);
CREATE INDEX idx_wardrobe_dormant     ON wardrobe_items (user_id, last_worn_at, purchase_price) WHERE is_archived = FALSE;

-- ----------------------------------------------------------------------------
-- 4. Hybrid Outfit Recommendations Cache (Low-Token LLM Cost Protection)
-- ----------------------------------------------------------------------------
CREATE TABLE outfit_recommendations_cache (
    cache_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    -- Deterministic SHA-256 of (sorted filtered item_ids + temp_bucket + rain + occasion + anchor_id)
    cache_key                CHAR(64)     NOT NULL,
    occasion                 VARCHAR(48)  NOT NULL,
    anchor_item_id           UUID         REFERENCES wardrobe_items(item_id) ON DELETE SET NULL,
    weather_bucket_json      JSONB        NOT NULL, -- {"temp_bucket":"16-20C","rain":false}
    candidate_item_ids       UUID[]       NOT NULL,
    recommended_outfits_json JSONB        NOT NULL, -- Array of 3 outfits: [{"item_ids":[...],"reason":"..."}]
    model_id                 VARCHAR(64)  NOT NULL DEFAULT 'gemini-2.5-flash',
    prompt_tokens            INTEGER      NOT NULL DEFAULT 0,
    completion_tokens        INTEGER      NOT NULL DEFAULT 0,
    expires_at               TIMESTAMPTZ  NOT NULL,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_cache_key UNIQUE (user_id, cache_key)
);

CREATE INDEX idx_outfit_cache_lookup ON outfit_recommendations_cache (user_id, cache_key, expires_at);

-- ----------------------------------------------------------------------------
-- 5. OOTD Calendar Logs & Anti-Repeat Detection
-- ----------------------------------------------------------------------------
CREATE TABLE ootd_calendar_logs (
    log_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    worn_date              DATE         NOT NULL,
    item_ids               UUID[]       NOT NULL CHECK (cardinality(item_ids) >= 1),
    -- Canonical hash of sorted core garments (top + bottom + outerwear) to catch repeat outfits
    outfit_signature_hash  CHAR(64)     NOT NULL,
    occasion               VARCHAR(48)  NOT NULL DEFAULT 'daily',
    weather_temp_c         NUMERIC(4,1),
    weather_rain_prob      SMALLINT     CHECK (weather_rain_prob BETWEEN 0 AND 100),
    canvas_layout_json     JSONB        NOT NULL DEFAULT '{}'::jsonb, -- z-index, scale, tuck-in mask flags
    snapshot_url           TEXT,
    repeat_warning_ack     BOOLEAN      NOT NULL DEFAULT FALSE,
    notes                  TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_ootd_date UNIQUE (user_id, worn_date)
);

CREATE INDEX idx_ootd_repeat_window ON ootd_calendar_logs (user_id, outfit_signature_hash, worn_date DESC);

-- ----------------------------------------------------------------------------
-- 6. CPW Wear Events Audit Log
-- ----------------------------------------------------------------------------
CREATE TABLE cpw_wear_events (
    event_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    item_id     UUID    NOT NULL REFERENCES wardrobe_items(item_id) ON DELETE CASCADE,
    ootd_log_id UUID    REFERENCES ootd_calendar_logs(log_id) ON DELETE SET NULL,
    worn_date   DATE    NOT NULL,
    delta_wear  INTEGER NOT NULL DEFAULT 1,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cpw_events_item ON cpw_wear_events (item_id, worn_date DESC);

-- ----------------------------------------------------------------------------
-- 7. Travel Capsule Plans
-- ----------------------------------------------------------------------------
CREATE TABLE travel_capsule_plans (
    plan_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    destination           VARCHAR(120) NOT NULL,
    trip_days             SMALLINT     NOT NULL CHECK (trip_days BETWEEN 1 AND 30),
    temp_min_c            NUMERIC(4,1) NOT NULL,
    temp_max_c            NUMERIC(4,1) NOT NULL,
    rain_expected         BOOLEAN      NOT NULL DEFAULT FALSE,
    selected_item_ids     UUID[]       NOT NULL,
    daily_schedule_json   JSONB        NOT NULL,
    total_unique_outfits  SMALLINT     NOT NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. Views & Triggers: Automated CPW & 90-Day Dormant Awakening Priority
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_wardrobe_cpw_analytics AS
SELECT
    w.item_id,
    w.user_id,
    w.name,
    w.category,
    w.sub_category,
    w.purchase_price,
    w.currency,
    w.wear_count,
    w.last_worn_at,
    ROUND(w.purchase_price / GREATEST(w.wear_count, 1), 2) AS current_cpw,
    COALESCE((CURRENT_DATE - w.last_worn_at), 999) AS days_since_last_worn,
    (w.last_worn_at IS NULL OR w.last_worn_at <= CURRENT_DATE - INTERVAL '90 days') AS is_dormant_90d,
    CASE
        WHEN (w.last_worn_at IS NULL OR w.last_worn_at <= CURRENT_DATE - INTERVAL '90 days')
        THEN ROUND(LN(GREATEST(w.purchase_price / GREATEST(w.wear_count, 1), 1) + 1) * 1.5, 3)
        ELSE 0.000
    END AS awakening_boost_weight
FROM wardrobe_items w
WHERE w.is_archived = FALSE;

CREATE OR REPLACE FUNCTION fn_sync_wear_on_ootd_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_item UUID;
BEGIN
    FOREACH v_item IN ARRAY NEW.item_ids LOOP
        UPDATE wardrobe_items
        SET wear_count = wear_count + 1,
            last_worn_at = GREATEST(COALESCE(last_worn_at, NEW.worn_date), NEW.worn_date),
            updated_at = NOW()
        WHERE item_id = v_item AND user_id = NEW.user_id;

        INSERT INTO cpw_wear_events (user_id, item_id, ootd_log_id, worn_date, delta_wear)
        VALUES (NEW.user_id, v_item, NEW.log_id, NEW.worn_date, 1);
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ootd_increment_wear
AFTER INSERT ON ootd_calendar_logs
FOR EACH ROW
EXECUTE FUNCTION fn_sync_wear_on_ootd_insert();
