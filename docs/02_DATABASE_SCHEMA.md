# 2. 關聯式資料庫完整 Schema 設計說明

完整可執行的 PostgreSQL 16 DDL 位於 [`database/schema.sql`](../database/schema.sql)。

## 2.1 實體關聯圖（ER Diagram）

```mermaid
erDiagram
    USERS ||--o| USER_BODY_PROFILES : "calibrates"
    USERS ||--o{ WARDROBE_ITEMS : "owns"
    USERS ||--o{ OUTFIT_RECOMMENDATIONS_CACHE : "caches"
    USERS ||--o{ OOTD_CALENDAR_LOGS : "logs"
    USERS ||--o{ TRAVEL_CAPSULE_PLANS : "generates"
    WARDROBE_ITEMS ||--o{ CPW_WEAR_EVENTS : "tracks"
    OOTD_CALENDAR_LOGS ||--o{ CPW_WEAR_EVENTS : "triggers"

    USERS {
        uuid user_id PK
        varchar email
        varchar display_name
        boolean allow_oversized
    }
    USER_BODY_PROFILES {
        uuid profile_id PK
        uuid user_id FK
        numeric shoulder_width_ratio
        numeric torso_length_ratio
        numeric leg_length_ratio
        numeric shoulder_to_hip_ratio
        text head_cutout_url
    }
    WARDROBE_ITEMS {
        uuid item_id PK
        uuid user_id FK
        varchar category
        varchar sub_category
        varchar fit
        varchar length
        smallint thermal_score
        char primary_hex
        jsonb primary_hsl
        numeric purchase_price
        integer wear_count
        date last_worn_at
    }
    OUTFIT_RECOMMENDATIONS_CACHE {
        uuid cache_id PK
        uuid user_id FK
        char cache_key
        jsonb recommended_outfits_json
        integer prompt_tokens
        timestamptz expires_at
    }
    OOTD_CALENDAR_LOGS {
        uuid log_id PK
        uuid user_id FK
        date worn_date
        uuid[] item_ids
        char outfit_signature_hash
        jsonb canvas_layout_json
    }
    CPW_WEAR_EVENTS {
        uuid event_id PK
        uuid item_id FK
        uuid ootd_log_id FK
        date worn_date
        integer delta_wear
    }
    TRAVEL_CAPSULE_PLANS {
        uuid plan_id PK
        uuid user_id FK
        smallint trip_days
        uuid[] selected_item_ids
        jsonb daily_schedule_json
    }
```

## 2.2 關鍵資料庫設計亮點

1. **影像雜湊去重 (`uq_user_item_hash`)**：透過端側計算 `image_sha256`，防止使用者批次匯入相簿或網購截圖時重複呼叫多模態 LLM 打標，直接省下重複入庫 Token。
2. **結構化屬性強約束 (`CHECK` + `GIN`)**：`category`、`fit`、`length`、`thermal_score (1~5)` 與 LLM Structured Output Enum 完全對應；`style_tags` 與 `season` 採用 PostgreSQL `TEXT[]` 搭配 GIN 索引，支援毫秒級交集篩選。
3. **快取鍵防呆 (`outfit_recommendations_cache`)**：以 `SHA-256(候選單品 ID 列表 + 體感溫度區間 + 降雨旗標 + 風格/鎖定單品)` 作為 `cache_key`，相同天氣與衣櫃狀態重複查詢完全 0 Token。
4. **自動化 CPW 與 90 天冷凍喚醒視圖 (`v_wardrobe_cpw_analytics` + `trg_ootd_increment_wear`)**：
   - 當使用者於 `ootd_calendar_logs` 寫入每日穿搭，PostgreSQL Trigger 自動原子性遞增每件單品的 `wear_count`、更新 `last_worn_at`，並寫入 `cpw_wear_events` 稽核記錄。
   - `v_wardrobe_cpw_analytics` 動態計算 `current_cpw = purchase_price / GREATEST(wear_count, 1)`，以及超過 90 天未穿單品的喚醒加權分數 `awakening_boost_weight`。
5. **14 天防撞衫指紋 (`outfit_signature_hash`)**：對每日上衣／下著／外套核心單品排序雜湊，搭配 `(user_id, outfit_signature_hash, worn_date DESC)` 索引，快速偵測近期重複穿搭。
