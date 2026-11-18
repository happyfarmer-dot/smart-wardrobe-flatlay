# 1. 系統整體架構圖與資料流說明

## 1.1 架構設計核心原則

本系統針對「**極低雲端算力成本**」與「**高實用性日常穿搭**」進行嚴格分層設計：
1. **視覺零雲端算力（Zero Cloud Vision Cost）**：所有去背（Subject Segmentation）、自動白平衡（Gray-World AWB）、25° 柔和投影（Drop Shadow）、K-Means++ 主色提取、與全身照姿態比例量測（MediaPipe Pose / 瀏覽器端節點校準），100% 於使用者裝置端（React Web Canvas / iOS VisionKit / Android ML Kit）完成。
2. **兩階段混合推薦管線（Two-Stage Hybrid Styling Pipeline）**：
   - **Stage 1（本地／後端規則引擎）**：利用體感溫度與降雨機率計算保暖係數區間、套用 HSL 60-30-10 配色和諧規則與版型防呆（Silhouette Anti-Fool），並對超過 90 天未穿之高 CPW 單品給予喚醒權重加分，將百件衣櫃篩選至 `8~16` 件合格候選單品。
   - **Stage 2（極致省 Token LLM + 離線 Fallback）**：禁止傳送圖片與完整衣櫃，僅將精簡後的 `item_id` + 短屬性 JSON 送入 `Gemini 2.5 Flash`（或前端離線語意評分器），搭配 PostgreSQL Cache Key 快取機制，將單次推薦 Token 消耗壓低至約 **250~550 tokens**（相較圖片多模態推論節省 **97%+**）。

---

## 1.2 系統整體架構圖（Mermaid）

```mermaid
flowchart TB
    subgraph Client["使用者端側 Client (React Web / Flutter + Native ML)"]
        direction TB
        CAM["相機 / 相簿 / 網購截圖匯入"]
        SEG["端側主體去背<br/>(ML Kit / VisionKit / Browser Flood-Edge)"]
        AWB["影像標準化<br/>(Auto White Balance + 25° Soft Drop Shadow)"]
        KM["本地 K-Means++ 主色提取<br/>(Top-2 HEX & HSL)"]
        POSE["全身照身形比例錨點<br/>(MediaPipe Pose: 肩寬/軀幹/腿長比例)"]
        CANVAS["2D Flat-Lay 拼貼畫布<br/>(Z-Index 圖層 / 一鍵紮衣服 Tuck-in 遮罩)"]

        CAM --> SEG --> AWB --> KM
        POSE --> CANVAS
        AWB --> CANVAS
    end

    subgraph LocalEngine["本地端規則與最佳化引擎 (Zero-Token Local Engine)"]
        direction TB
        TH["氣象與保暖係數過濾<br/>(Apparent Temp + Rain -> Thermal Sum)"]
        HSL["HSL 60-30-10 色彩和諧檢核<br/>(同色系/鄰近色/互補色/中性色錨點)"]
        SIL["版型比例防呆<br/>(排除 Loose+Long 失衡組合)"]
        CPW["CPW 與 90 天冷凍單品喚醒加權"]
        CAP["旅行膠囊最佳化求解器<br/>(Set-Cover + Beam Search)"]

        TH --> HSL --> SIL --> CPW
    end

    subgraph Cloud["雲端輕量後端 (Python FastAPI + PostgreSQL 16)"]
        direction TB
        API["FastAPI REST Gateway"]
        CACHE["Outfit Recommendation Cache<br/>(SHA-256 Weather+Filter Key)"]
        PG[("PostgreSQL 16<br/>wardrobe_items / body_profiles / ootd_logs")]
        GEMINI["Gemini 2.5 Flash (Structured Outputs)<br/>1. 入庫單次影像打標 JSON<br/>2. ID-Only 3 套穿搭理由生成"]

        API --> CACHE
        API <--> PG
        CACHE -- "Cache Miss" --> GEMINI
        API -- "入庫一次呼叫" --> GEMINI
    end

    EXT["免費氣象 API (Open-Meteo / 離線氣象模擬)"] --> TH
    KM -- "精簡屬性 + 標準化透明圖" --> API
    CANVAS -- "OOTD 排程與防撞衫檢查" --> API
    Client --> LocalEngine
    LocalEngine -- "Stage-1 精簡候選 JSON (< 300 tokens)" --> API
```

---

## 1.3 核心資料流說明

### 資料流 A：衣物入庫數位化（Wardrobe Digitization Flow）
```mermaid
sequenceDiagram
    actor User
    participant Client as 端側 App (Vision + Canvas)
    participant API as FastAPI Backend
    participant Gemini as Gemini 2.5 Flash
    participant DB as PostgreSQL

    User->>Client: 拍攝 / 相簿匯入 / 網購截圖
    Client->>Client: 1. 本地主體去背 (RGBA Alpha Mask)
    Client->>Client: 2. Gray-World 自動白平衡 + 統一柔和投影
    Client->>Client: 3. K-Means++ 提取前 2 名 HEX / HSL
    Client->>API: 上傳去背壓縮縮圖 (WebP) + 本地 HEX/HSL
    API->>Gemini: 單次呼叫 Auto-Tagging (Strict JSON Schema)
    Gemini-->>API: {category, sub_category, fit, length, thermal_score, style_tags, season}
    API->>DB: INSERT INTO wardrobe_items (含 image_sha256 去重)
    DB-->>Client: 返回數位單品檔案（後續推薦不再重傳圖片）
```

### 資料流 B：兩階段混合智慧穿搭推薦（Hybrid Styling Flow）
1. **輸入狀態**：取得目前氣溫、濕度/降雨機率、目標場景（通勤／約會／美式復古）或鎖定單品（Anchor Item）。
2. **Stage 1 本地規則漏斗**：
   - `Thermal Filter`：依體感溫度對應目標總保暖分數區間（例如 `14°C 有雨` $\rightarrow$ `thermal_score` 總和 `6~9` 並優先挑選防風/長袖外套）。
   - `HSL 60-30-10 Filter`：排除高飽和衝突配色，保留單色階（$\Delta H \le 15^\circ$）、鄰近色（$\Delta H \le 35^\circ$）、互補對比（$\Delta H \in [155^\circ, 205^\circ]$）與中性色錨點（$S < 18\%$ 或極明／極暗）。
   - `Silhouette Anti-Fool`：非 `oversized` 指定模式時，阻擋 `loose + long` 上衣配 `loose + long` 褲款。
   - `CPW Dormant Boost`：超過 90 天未穿且高單次穿著成本（CPW）的單品獲得喚醒加權。
3. **Cache Key 比對**：計算 `SHA256(sorted(candidate_ids) + temp_bucket + rain + occasion + anchor_id)`；若快取命中直接 0 Token 回傳。
4. **Stage 2 LLM 精簡推理（或瀏覽器端離線語意合成）**：僅送入候選單品的緊湊 JSON 陣列（每件約 18~24 tokens），要求回傳 3 組最佳 `item_ids` 與一句話理由。
5. **2D 畫布渲染**：根據 `user_body_profiles` 的 `torso_length_ratio` 與 `leg_length_ratio` 動態縮放上下著比例，套用 Z-Index 與 Tuck-in 裁切遮罩呈現平拍穿搭。
