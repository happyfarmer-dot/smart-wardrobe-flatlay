import React, { useMemo, useState } from 'react';
import { Luggage, CheckSquare, Layers, CloudRain } from 'lucide-react';
import { WardrobeItem } from '../types/wardrobe';
import { solveTravelCapsule } from '../engine/capsuleOptimizer';

interface TravelCapsuleProps {
  items: WardrobeItem[];
  onLoadOutfitToCanvas: (itemIds: string[]) => void;
}

const TRIP_PRESETS = [
  { label: '京都 5 日秋旅 (12–20°C)', destination: 'Kyoto', days: 5, min: 12, max: 20, rain: false },
  { label: '倫敦 7 日微雨 (9–16°C)', destination: 'London', days: 7, min: 9, max: 16, rain: true },
  { label: '沖繩 4 日海島 (23–29°C)', destination: 'Okinawa', days: 4, min: 23, max: 29, rain: false },
];

export const TravelCapsule: React.FC<TravelCapsuleProps> = ({
  items,
  onLoadOutfitToCanvas,
}) => {
  const [destination, setDestination] = useState('Kyoto');
  const [tripDays, setTripDays] = useState(5);
  const [tempMinC, setTempMinC] = useState(12);
  const [tempMaxC, setTempMaxC] = useState(20);
  const [rainExpected, setRainExpected] = useState(false);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const result = useMemo(
    () =>
      solveTravelCapsule({
        items,
        destination,
        tripDays,
        tempMinC,
        tempMaxC,
        rainExpected,
      }),
    [items, destination, tripDays, tempMinC, tempMaxC, rainExpected]
  );

  return (
    <section>
      <div className="section-header">
        <div>
          <div className="section-kicker">Module 05 · Travel Capsule Combinatorial Planner</div>
          <h2 className="section-title">旅行膠囊衣櫃最佳化生成器</h2>
          <p className="section-desc">
            輸入旅遊天數與目的地溫差區間，透過本地 Set-Cover ＋ 冗餘剪枝演算法求解「最少打包單品數量 × 最多不重複穿搭天數」的行李膠囊清單。
          </p>
        </div>
      </div>

      <div className="studio-split">
        {/* Left: Trip Configuration */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <Luggage size={16} /> 行程參數設定
            </h3>
          </div>

          <div className="pill-group" style={{ marginBottom: '14px' }}>
            {TRIP_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`pill ${
                  destination === p.destination && tripDays === p.days ? 'active' : ''
                }`}
                onClick={() => {
                  setDestination(p.destination);
                  setTripDays(p.days);
                  setTempMinC(p.min);
                  setTempMaxC(p.max);
                  setRainExpected(p.rain);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="field-grid" style={{ marginBottom: '12px' }}>
            <div className="field">
              <label>目的地城市</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} />
            </div>
            <div className="field">
              <label>旅遊天數 ({tripDays} 天)</label>
              <input
                type="number"
                min={2}
                max={14}
                value={tripDays}
                onChange={(e) =>
                  setTripDays(Math.max(2, Math.min(14, Number(e.target.value) || 2)))
                }
              />
            </div>
            <div className="field">
              <label>預期最低溫 (°C)</label>
              <input
                type="number"
                min={-10}
                max={35}
                value={tempMinC}
                onChange={(e) => setTempMinC(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>預期最高溫 (°C)</label>
              <input
                type="number"
                min={-5}
                max={40}
                value={tempMaxC}
                onChange={(e) => setTempMaxC(Number(e.target.value))}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rainExpected}
              onChange={(e) => setRainExpected(e.target.checked)}
            />
            <CloudRain size={15} />
            <span>目的地可能降雨（優先納入防水/防風外套層）</span>
          </label>

          <div className="metric-strip" style={{ marginTop: '18px' }}>
            <div className="metric-tile">
              <div className="metric-label">最少需打包單品</div>
              <div className="metric-value" style={{ color: 'var(--accent-camel)' }}>
                {result.packedCount} 件
              </div>
            </div>
            <div className="metric-tile">
              <div className="metric-label">重複穿搭效率</div>
              <div className="metric-value" style={{ color: 'var(--accent-sage)' }}>
                {result.reuseEfficiency} 天/件
              </div>
            </div>
          </div>
        </div>

        {/* Right: Minimal Packing List + Day-by-Day Matrix */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                <CheckSquare size={16} /> {result.destination} {result.tripDays} 日最精簡行李打包清單（僅 {result.packedCount} 件）
              </h3>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(125px, 1fr))',
                gap: '10px',
              }}
            >
              {result.selectedItemIds.map((id) => {
                const it = itemMap.get(id);
                if (!it) return null;
                return (
                  <div
                    key={id}
                    style={{
                      background: 'var(--bg-mat)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: '10px',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <img
                      src={it.imageUrl}
                      alt={it.name}
                      style={{
                        width: '76px',
                        height: '76px',
                        objectFit: 'contain',
                        filter: 'drop-shadow(4px 6px 8px rgba(26,25,23,0.16))',
                      }}
                    />
                    <span style={{ fontSize: '0.76rem', fontWeight: 600, textAlign: 'center' }}>
                      {it.name}
                    </span>
                    <span className="badge badge-mono">{it.category}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">逐日不重複膠囊穿搭排程</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {result.dailySchedule.map((day) => (
                <div
                  key={day.day}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'var(--bg-mat)',
                    border: '1px solid var(--border-hairline)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span className="badge badge-mono" style={{ fontWeight: 700 }}>
                      DAY {day.day}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {day.itemIds.map((id) => {
                        const it = itemMap.get(id);
                        return it ? (
                          <img
                            key={id}
                            src={it.imageUrl}
                            alt={it.name}
                            title={it.name}
                            style={{ width: '40px', height: '40px', objectFit: 'contain' }}
                          />
                        ) : null;
                      })}
                    </div>
                    <span style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                      {day.note}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onLoadOutfitToCanvas(day.itemIds)}
                  >
                    <Layers size={13} /> 2D 預覽
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
