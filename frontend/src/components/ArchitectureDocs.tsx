import React, { useState } from 'react';
import { Copy, Check, Database, Cpu, FileCode2, ShieldAlert } from 'lucide-react';

const DELIVERABLE_TABS = [
  { id: 'arch', label: '1. 系統架構與資料流' },
  { id: 'ddl', label: '2. PostgreSQL DDL' },
  { id: 'prompts', label: '3. 極致省 Token Prompt' },
  { id: 'algos', label: '4. 核心本地演算法' },
  { id: 'roadmap', label: '5. MVP 路線圖與風險' },
] as const;

type DocTabId = (typeof DELIVERABLE_TABS)[number]['id'];

const DDL_EXCERPT = `-- 完整 DDL 位於儲存庫 database/schema.sql
CREATE TABLE user_body_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    shoulder_width_ratio NUMERIC(5,4) NOT NULL DEFAULT 0.2800,
    torso_length_ratio   NUMERIC(5,4) NOT NULL DEFAULT 0.3400,
    leg_length_ratio     NUMERIC(5,4) NOT NULL DEFAULT 0.4800,
    head_cutout_url      TEXT,
    use_head_anchor      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE wardrobe_items (
    item_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    image_sha256  CHAR(64) NOT NULL,
    category      VARCHAR(24) NOT NULL CHECK (category IN ('top','bottom','outerwear','dress','shoes','accessory')),
    sub_category  VARCHAR(48) NOT NULL,
    fit           VARCHAR(16) NOT NULL CHECK (fit IN ('slim','regular','loose')),
    length        VARCHAR(16) NOT NULL CHECK (length IN ('cropped','regular','long')),
    thermal_score SMALLINT NOT NULL CHECK (thermal_score BETWEEN 1 AND 5),
    primary_hex   CHAR(7) NOT NULL,
    primary_hsl   JSONB NOT NULL,
    purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    wear_count    INTEGER NOT NULL DEFAULT 0,
    last_worn_at  DATE,
    CONSTRAINT uq_user_item_hash UNIQUE (user_id, image_sha256)
);

CREATE TABLE outfit_recommendations_cache (
    cache_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    cache_key  CHAR(64) NOT NULL,
    recommended_outfits_json JSONB NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_user_cache_key UNIQUE (user_id, cache_key)
);

-- OOTD 寫入時自動原子累加穿著次數並更新 last_worn_at
CREATE TRIGGER trg_ootd_increment_wear
AFTER INSERT ON ootd_calendar_logs
FOR EACH ROW EXECUTE FUNCTION fn_sync_wear_on_ootd_insert();`;

const PROMPT_EXCERPT = `// [1] 入庫單次多模態自動打標（Gemini 2.5 Flash Structured Outputs）
System (~58 tokens):
Apparel attribute extractor. Output strictly valid JSON matching the schema.
Thermal guide: 1=tank/linen tee, 2=cotton shirt/chinos/denim, 3=knit/blazer/trench, 4=heavy wool, 5=down parka.

User (~18 tokens + 512px segmented thumbnail):
Classify this isolated garment image. Local dominant colors: primary=#B68F66, secondary=#4E3929.

// [2] Stage-2 低 Token ID-Only 穿搭推薦（禁傳圖片，僅傳 Stage-1 候選短鍵 JSON）
System (~65 tokens):
Select 3 distinct outfits using ONLY provided item ids.
Prioritize items with "dorm":true when aesthetically balanced.
Write "reason" in Traditional Chinese (<= 22 words).

User Payload (~210 tokens for 10 candidates):
ctx: temp=16C, rain=75%, target_thermal=7-10, occasion=commute, anchor=none
items: [{"id":"i1","c":"top","sub":"oxford_shirt","f":"regular","l":"regular","th":2,"hx":"#F3F1EA","st":["commute"],"dorm":false}, ...]`;

export const ArchitectureDocs: React.FC = () => {
  const [tab, setTab] = useState<DocTabId>('arch');
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section>
      <div className="section-header">
        <div>
          <div className="section-kicker">Architecture & Deliverables · React + FastAPI + PostgreSQL</div>
          <h2 className="section-title">系統架構與五大技術交付文件總覽</h2>
          <p className="section-desc">
            完整技術設計文件與後端實作已同步收錄於 GitHub 儲存庫的 <code>docs/</code>、<code>database/schema.sql</code> 與 <code>backend/</code> 目錄。
          </p>
        </div>
      </div>

      <div className="pill-group" style={{ marginBottom: '20px' }}>
        {DELIVERABLE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pill ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'arch' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Cpu size={16} /> 系統整體分層架構與資料流（Zero Cloud VTON）
            </h3>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '14px',
              marginBottom: '18px',
            }}
          >
            <div className="panel" style={{ background: 'var(--bg-mat)' }}>
              <div className="section-kicker">Layer 1 · On-Device Client</div>
              <h4 style={{ margin: '4px 0 8px' }}>端側視覺與 2D 拼貼畫布</h4>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                Android ML Kit / iOS VisionKit / Web Canvas 本地去背、Gray-World 白平衡、25° 柔和投影、K-Means++ 主色提取與全身照比例縮放。
              </p>
            </div>
            <div className="panel" style={{ background: 'var(--bg-mat)' }}>
              <div className="section-kicker">Layer 2 · Local Rules Engine</div>
              <h4 style={{ margin: '4px 0 8px' }}>零 Token 物理與美學漏斗</h4>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                氣象體感保暖加總、HSL 60-30-10 配色和諧檢核、版型比例防呆、90 天高 CPW 喚醒權重、以及旅行膠囊 Set-Cover 求解器。
              </p>
            </div>
            <div className="panel" style={{ background: 'var(--bg-mat)' }}>
              <div className="section-kicker">Layer 3 · FastAPI + PostgreSQL</div>
              <h4 style={{ margin: '4px 0 8px' }}>快取層與 Gemini 2.5 Flash</h4>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                SHA-256 圖片去重入庫單次打標；推薦請求先比對 <code>outfit_recommendations_cache</code>，未命中才送出極簡 ID JSON，節省 97% Token。
              </p>
            </div>
          </div>

          <pre className="code-block">{`flowchart LR
  UserPhoto[衣物拍攝/相簿/截圖] --> Seg[端側主體去背 + Gray-World AWB + 25° 投影]
  Seg --> KMeans[本地 K-Means++ HEX/HSL + SHA-256]
  KMeans -->|入庫僅調用一次| GeminiTag[Gemini 2.5 Flash Structured JSON]
  GeminiTag --> PG[(PostgreSQL 16)]

  Weather[氣象體感/降雨] --> Stage1[Stage 1 本地規則漏斗: 保暖/HSL/版型/CPW]
  PG --> Stage1
  Stage1 -->|<=16件精簡ID JSON| Cache{SHA-256 推薦快取}
  Cache -->|Miss| GeminiStyle[Gemini 2.5 Flash ID-Only 3套推薦]
  Cache -->|Hit 0-Token| Canvas2D[2D 身形比例畫布 + Tuck-in 遮罩]`}</pre>
        </div>
      )}

      {tab === 'ddl' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Database size={16} /> PostgreSQL 16 核心 DDL（<code>database/schema.sql</code>）
            </h3>
            <button type="button" className="btn btn-sm" onClick={() => handleCopy(DDL_EXCERPT)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? '已複製' : '複製 DDL'}</span>
            </button>
          </div>
          <pre className="code-block">{DDL_EXCERPT}</pre>
        </div>
      )}

      {tab === 'prompts' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <FileCode2 size={16} /> 極致省 Token Prompt 與 JSON Schema（<code>backend/app/prompts.py</code>）
            </h3>
            <button type="button" className="btn btn-sm" onClick={() => handleCopy(PROMPT_EXCERPT)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? '已複製' : '複製 Prompt'}</span>
            </button>
          </div>
          <pre className="code-block">{PROMPT_EXCERPT}</pre>
        </div>
      )}

      {tab === 'algos' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">本地端五大核心演算法實作對照</h3>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div className="alert-box alert-success">
              <div>
                <strong>1. HSL 60-30-10 與衝突排除：</strong>{' '}
                低飽和（<code>S &lt; 18%</code>）與黑白灰視為中性錨點不限搭配；有彩色計算最小圓周色相差 <code>ΔH</code>，採單色階 <code>&le;15°</code>、鄰近 <code>&le;38°</code>、互補 <code>150–205°</code>，拒絕雙高飽和撞色（<code>50° &lt; ΔH &lt; 140°</code>）。
              </div>
            </div>
            <div className="alert-box alert-success">
              <div>
                <strong>2. 版型防呆與身形比例縮放：</strong>{' '}
                非寬鬆模式自動阻擋 <code>loose+long</code> 上衣配 <code>loose+long</code> 褲款；依據全身照量測 <code>torsoLengthRatio / 0.34</code> 與 <code>legLengthRatio / 0.48</code> 動態縮放 2D 畫布單品。
              </div>
            </div>
            <div className="alert-box alert-success">
              <div>
                <strong>3. 旅行膠囊 Set-Cover ＋ 剪枝最佳化：</strong>{' '}
                先建立合法溫差兼容組合圖，以貪婪邊際覆蓋率選取最少單品覆蓋 N 天，最後反向剪枝冗餘項目並強制相鄰天數不重複。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'roadmap' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <ShieldAlert size={16} /> 分階段 MVP 開發路線圖與風險緩解檢查表
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>階段</th>
                  <th style={{ padding: '10px 8px' }}>核心交付</th>
                  <th style={{ padding: '10px 8px' }}>關鍵風險與防線</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Phase 1 (W1–W2)</td>
                  <td style={{ padding: '10px 8px' }}>端側去背 + AWB + 25° 投影 + K-Means + 入庫單次打標</td>
                  <td style={{ padding: '10px 8px' }}>SHA-256 雜湊去重防重複打標；梯度保護防止白衣過切</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Phase 2 (W3–W4)</td>
                  <td style={{ padding: '10px 8px' }}>身形錨點量測 + 2D Z-Index 畫布 + Tuck-in 遮罩</td>
                  <td style={{ padding: '10px 8px' }}>全身照僅存 4 個幾何比例數值，原圖永不上傳雲端</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Phase 3 (W5–W6)</td>
                  <td style={{ padding: '10px 8px' }}>Stage-1 漏斗 + FastAPI SHA-256 快取 + 低 Token LLM</td>
                  <td style={{ padding: '10px 8px' }}>分級放寬機制 (Graceful Relaxation) 確保極端條件不空集合</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Phase 4 (W7–W8)</td>
                  <td style={{ padding: '10px 8px' }}>OOTD 防撞衫月曆 + CPW 喚醒 + 旅行膠囊生成器</td>
                  <td style={{ padding: '10px 8px' }}>SQL Trigger 原子同步 wear_count，12 件膠囊範例消弭冷啟動</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
