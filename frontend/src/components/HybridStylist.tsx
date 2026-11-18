import React, { useMemo, useState } from 'react';
import {
  CloudRain,
  Sun,
  Snowflake,
  Sparkles,
  Lock,
  Layers,
  Cpu,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { WardrobeItem, WeatherContext } from '../types/wardrobe';
import { runHybridStylistEngine } from '../engine/hybridStylist';
import { isDormant90d, REFERENCE_TODAY } from '../engine/rulesEngine';

interface HybridStylistProps {
  items: WardrobeItem[];
  anchorItemId: string | null;
  onChangeAnchorItem: (itemId: string | null) => void;
  onLoadOutfitToCanvas: (itemIds: string[]) => void;
}

const WEATHER_PRESETS: { label: string; weather: WeatherContext; icon: React.ReactNode }[] = [
  {
    label: '台北微涼有雨 16°C',
    weather: { city: 'Taipei', feelsLikeC: 16, rainProb: 75 },
    icon: <CloudRain size={14} />,
  },
  {
    label: '秋日晴朗微風 20°C',
    weather: { city: 'Kyoto', feelsLikeC: 20, rainProb: 10 },
    icon: <Sun size={14} />,
  },
  {
    label: '盛夏高溫豔陽 30°C',
    weather: { city: 'Kaohsiung', feelsLikeC: 30, rainProb: 15 },
    icon: <Sun size={14} />,
  },
  {
    label: '寒流低溫乾冷 9°C',
    weather: { city: 'Seoul', feelsLikeC: 9, rainProb: 20 },
    icon: <Snowflake size={14} />,
  },
];

const OCCASIONS = [
  { id: 'commute', label: '都會通勤' },
  { id: 'date', label: '質感約會' },
  { id: 'vintage', label: '美式復古' },
  { id: 'minimal', label: '極簡日常' },
  { id: 'all', label: '不限風格' },
];

export const HybridStylist: React.FC<HybridStylistProps> = ({
  items,
  anchorItemId,
  onChangeAnchorItem,
  onLoadOutfitToCanvas,
}) => {
  const [weather, setWeather] = useState<WeatherContext>({
    city: 'Taipei',
    feelsLikeC: 18,
    rainProb: 20,
  });
  const [occasion, setOccasion] = useState<string>('commute');
  const [allowOversized, setAllowOversized] = useState<boolean>(false);
  const [preferDormant90d, setPreferDormant90d] = useState<boolean>(true);
  const [showPayload, setShowPayload] = useState<boolean>(false);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const result = useMemo(
    () =>
      runHybridStylistEngine({
        items,
        weather,
        occasion,
        anchorItemId,
        allowOversized,
        preferDormant90d,
      }),
    [items, weather, occasion, anchorItemId, allowOversized, preferDormant90d]
  );

  return (
    <section>
      <div className="section-header">
        <div>
          <div className="section-kicker">Module 03 · Hybrid Styling Engine (Rules + Low-Token)</div>
          <h2 className="section-title">混合式智慧穿搭推薦引擎</h2>
          <p className="section-desc">
            先透過本地端「氣象保暖係數 ＋ HSL 60-30-10 配色 ＋ 版型防呆 ＋ 90 天 CPW 冷凍喚醒」過濾全衣櫃，僅將精簡屬性 ID JSON 送交推理，徹底免除圖片傳送，節省超過 95% Token。
          </p>
        </div>
      </div>

      <div className="studio-split">
        {/* Left Control Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">1. 氣象與體感溫度條件</h3>
            </div>

            <div className="pill-group" style={{ marginBottom: '14px' }}>
              {WEATHER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`pill ${
                    weather.feelsLikeC === p.weather.feelsLikeC &&
                    weather.rainProb === p.weather.rainProb
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => setWeather(p.weather)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    {p.icon}
                    {p.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="range-row" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>體感溫度 (°C)</span>
                <strong className="badge-mono">{weather.feelsLikeC}°C</strong>
              </div>
              <input
                type="range"
                min={4}
                max={35}
                value={weather.feelsLikeC}
                onChange={(e) =>
                  setWeather((w) => ({ ...w, feelsLikeC: Number(e.target.value) }))
                }
              />
            </div>

            <div className="range-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>降雨機率 (%)</span>
                <strong className="badge-mono">{weather.rainProb}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weather.rainProb}
                onChange={(e) =>
                  setWeather((w) => ({ ...w, rainProb: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">2. 場景風格與單品鎖定（一衣多穿）</h3>
            </div>

            <div className="pill-group" style={{ marginBottom: '14px' }}>
              {OCCASIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`pill ${occasion === o.id ? 'active' : ''}`}
                  onClick={() => setOccasion(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className="field" style={{ marginBottom: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={13} /> 鎖定核心單品（一衣多穿 Anchor Item）
              </label>
              <select
                value={anchorItemId || ''}
                onChange={(e) => onChangeAnchorItem(e.target.value || null)}
              >
                <option value="">不鎖定（全衣櫃自動推薦）</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}（保暖 {i.thermalScore} · CPW $
                    {Math.round(i.purchasePrice / Math.max(1, i.wearCount))}）
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={preferDormant90d}
                  onChange={(e) => setPreferDormant90d(e.target.checked)}
                />
                <span>優先喚醒超過 90 天未穿之高 CPW 冷凍單品</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowOversized}
                  onChange={(e) => setAllowOversized(e.target.checked)}
                />
                <span>允許寬配寬 Oversized 風格（關閉時自動阻擋寬長配寬長）</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Result Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Stage 1 -> Stage 2 Token Savings Telemetry */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <Cpu size={16} /> 兩階段漏斗與低 Token 成本監測
              </h3>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowPayload((s) => !s)}
              >
                {showPayload ? '隱藏精簡 JSON' : '檢視送往 LLM 的精簡 JSON'}
              </button>
            </div>

            <div className="metric-strip">
              <div className="metric-tile">
                <div className="metric-label">目標總保暖係數</div>
                <div className="metric-value">
                  {result.thermalBounds[0]} – {result.thermalBounds[1]}
                </div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">Stage-1 本地過濾漏斗</div>
                <div className="metric-value">
                  {result.totalWardrobeCount} → {result.stage1CandidateCount} 件
                </div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">精簡 Payload Token</div>
                <div className="metric-value" style={{ color: 'var(--accent-sage)' }}>
                  ~{result.estimatedTokensCompact} tok
                </div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">相較傳圖方案節省</div>
                <div className="metric-value" style={{ color: 'var(--accent-camel)' }}>
                  {result.tokenSavingsPct}%
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
              <span className="badge badge-mono">
                <ShieldCheck size={12} /> Cache Key: {result.cacheKey} ({result.cacheHit ? 'HIT 0-tok' : 'FRESH'})
              </span>
              <span className="badge">排除色彩衝突組數：{result.rejectedColorCount}</span>
              <span className="badge">阻擋失衡版型組數：{result.rejectedSilhouetteCount}</span>
            </div>

            {showPayload && (
              <div style={{ marginTop: '12px' }}>
                <pre className="code-block">{result.compactPromptJson}</pre>
              </div>
            )}
          </div>

          {/* 3 Recommended Outfits */}
          {result.outfits.length === 0 ? (
            <div className="alert-box alert-warning">
              目前衣櫃在上衣／下著數量不足，請先匯入或放寬條件後再試。
            </div>
          ) : (
            result.outfits.map((outfit, idx) => (
              <article key={outfit.id} className="panel">
                <div className="panel-header" style={{ marginBottom: '12px' }}>
                  <div>
                    <div className="section-kicker">Recommendation #{idx + 1}</div>
                    <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.25rem' }}>
                      {outfit.styleTitle}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {outfit.includesDormantAwakening && (
                      <span className="badge badge-dormant">
                        <Clock size={12} /> 冷凍單品喚醒
                      </span>
                    )}
                    <span className="badge badge-sage">{outfit.harmonyLabel}</span>
                    <span className="badge badge-mono">總保暖 {outfit.totalThermal}</span>
                  </div>
                </div>

                {/* Garment Mini Flat-Lay Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '12px',
                    marginBottom: '14px',
                  }}
                >
                  {outfit.itemIds.map((id) => {
                    const item = itemMap.get(id);
                    if (!item) return null;
                    const dormant = isDormant90d(item, REFERENCE_TODAY);
                    return (
                      <div
                        key={id}
                        style={{
                          background: 'var(--bg-mat)',
                          borderRadius: '10px',
                          border: dormant
                            ? '1.5px solid var(--accent-amber)'
                            : '1px solid var(--border-hairline)',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          style={{
                            height: '92px',
                            width: '92px',
                            objectFit: 'contain',
                            filter: 'drop-shadow(4px 7px 8px rgba(26,25,23,0.18))',
                          }}
                        />
                        <div
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 500,
                            textAlign: 'center',
                          }}
                        >
                          {item.name}
                        </div>
                        <div className="swatch-chip">
                          <span className="swatch-dot" style={{ backgroundColor: item.primaryHex }} />
                          <span>{item.primaryHex}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-hairline)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-secondary)' }}>
                    <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: '6px', color: 'var(--accent-camel)' }} />
                    {outfit.reason}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onLoadOutfitToCanvas(outfit.itemIds)}
                  >
                    <Layers size={14} />
                    <span>載入 2D 畫布微調</span>
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
