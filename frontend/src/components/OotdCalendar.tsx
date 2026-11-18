import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { OOTDLog, WardrobeItem } from '../types/wardrobe';
import {
  checkOotdRepeat,
  computeCpw,
  daysSinceLastWorn,
  isDormant90d,
  REFERENCE_TODAY,
} from '../engine/rulesEngine';

interface OotdCalendarProps {
  items: WardrobeItem[];
  ootdLogs: OOTDLog[];
  activeOutfitIds: string[];
  onSaveOotd: (itemIds: string[], dateStr: string, tuckedIn: boolean, notes?: string) => void;
  onLoadOutfitToCanvas: (itemIds: string[]) => void;
  onLockAnchorItem: (itemId: string) => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const OotdCalendar: React.FC<OotdCalendarProps> = ({
  items,
  ootdLogs,
  activeOutfitIds,
  onSaveOotd,
  onLoadOutfitToCanvas,
  onLockAnchorItem,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(REFERENCE_TODAY);
  const [notes, setNotes] = useState<string>('');

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const logByDate = useMemo(() => new Map(ootdLogs.map((l) => [l.wornDate, l])), [ootdLogs]);

  // Build November 2026 calendar cells (Nov 1, 2026 is Sunday -> offset 0)
  const calendarDays = useMemo(() => {
    const days: string[] = [];
    for (let d = 1; d <= 30; d++) {
      days.push(`2026-11-${String(d).padStart(2, '0')}`);
    }
    return days;
  }, []);

  const selectedLog = logByDate.get(selectedDate) || null;
  const repeatCheck = useMemo(
    () => checkOotdRepeat(selectedDate, activeOutfitIds, ootdLogs, 14),
    [selectedDate, activeOutfitIds, ootdLogs]
  );

  const cpwRanked = useMemo(
    () =>
      [...items]
        .map((item) => ({
          item,
          cpw: computeCpw(item),
          dormant: isDormant90d(item, REFERENCE_TODAY),
          daysAgo: daysSinceLastWorn(item, REFERENCE_TODAY),
        }))
        .sort((a, b) => b.cpw - a.cpw),
    [items]
  );

  const maxCpw = Math.max(1, ...cpwRanked.map((r) => r.cpw));

  return (
    <section>
      <div className="section-header">
        <div>
          <div className="section-kicker">Module 04 · OOTD Calendar, Anti-Repeat & CPW</div>
          <h2 className="section-title">OOTD 穿搭日曆、防撞衫與單次穿著成本 (CPW)</h2>
          <p className="section-desc">
            每次定裝記錄 OOTD 即自動遞增穿著次數、更新 CPW = 購入價格 ÷ 穿著次數，並在排程出現 14 天內重複組合時發出防撞衫預警，同時揪出超過 90 天未穿的高成本冷凍單品。
          </p>
        </div>
      </div>

      <div className="studio-split-wide">
        {/* Left: Monthly OOTD Calendar & Scheduler */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">2026 年 11 月 OOTD 穿搭月曆</h3>
              <span className="badge badge-sage">已記錄 {ootdLogs.length} 天</span>
            </div>

            <div className="calendar-grid" style={{ marginBottom: '6px' }}>
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  style={{
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--ink-muted)',
                    paddingBottom: '4px',
                  }}
                >
                  週{w}
                </div>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarDays.map((dateStr) => {
                const dayNum = Number(dateStr.split('-')[2]);
                const log = logByDate.get(dateStr);
                const isSelected = dateStr === selectedDate;
                return (
                  <div
                    key={dateStr}
                    className={`calendar-cell ${isSelected ? 'selected' : ''} ${
                      log ? 'has-log' : ''
                    }`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge-mono" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                        {dayNum}
                      </span>
                      {dateStr === REFERENCE_TODAY && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--accent-camel)', fontWeight: 700 }}>
                          今天
                        </span>
                      )}
                    </div>

                    {log ? (
                      <div style={{ display: 'flex', gap: '3px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {log.itemIds.slice(0, 3).map((id) => {
                          const it = itemMap.get(id);
                          return it ? (
                            <img
                              key={id}
                              src={it.imageUrl}
                              alt={it.name}
                              style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                            />
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}>—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Date Inspector & Anti-Repeat Guard */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">排程與紀錄：{selectedDate}</h3>
              {selectedLog && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => onLoadOutfitToCanvas(selectedLog.itemIds)}
                >
                  <Layers size={13} /> 載入 2D 畫布
                </button>
              )}
            </div>

            {selectedLog ? (
              <div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {selectedLog.itemIds.map((id) => {
                    const it = itemMap.get(id);
                    return it ? (
                      <div
                        key={id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'var(--bg-mat)',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          fontSize: '0.82rem',
                        }}
                      >
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                        />
                        <span>{it.name}</span>
                      </div>
                    ) : null;
                  })}
                </div>
                {selectedLog.notes && (
                  <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--ink-secondary)' }}>
                    筆記：{selectedLog.notes}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)' }}>
                  將目前 2D 畫布中的 {activeOutfitIds.length} 件穿搭單品排程至 <strong>{selectedDate}</strong>：
                </div>

                {repeatCheck.hasConflict ? (
                  <div className="alert-box alert-warning">
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>{repeatCheck.warningMessage}</div>
                  </div>
                ) : (
                  <div className="alert-box alert-success">
                    <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>近 14 天內無重複撞衫組合，可安心排程！</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    className="search-input"
                    style={{ flex: 1 }}
                    placeholder="輸入當日場合或穿搭筆記（選填）..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      onSaveOotd(activeOutfitIds, selectedDate, true, notes || undefined);
                      setNotes('');
                    }}
                  >
                    寫入當日 OOTD
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: CPW Leaderboard & 90-Day Dormant Awakening */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              <TrendingDown size={16} /> 單次穿著成本 (CPW) 與 90 天冷凍喚醒榜
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cpwRanked.map(({ item, cpw, dormant, daysAgo }) => (
              <div
                key={item.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: dormant
                    ? '1.5px solid #E3C196'
                    : '1px solid var(--border-hairline)',
                  background: dormant ? '#FCF7EE' : 'var(--bg-mat)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      style={{ width: '38px', height: '38px', objectFit: 'contain' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.name}</div>
                      <div className="badge-mono" style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
                        購入 NT${item.purchasePrice.toLocaleString()} ÷ {item.wearCount} 次
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div className="badge-mono" style={{ fontWeight: 700, fontSize: '0.96rem' }}>
                      CPW ${cpw.toLocaleString()}
                    </div>
                    {dormant && (
                      <span className="badge badge-dormant" style={{ marginTop: '3px' }}>
                        <Clock size={10} /> {daysAgo === 999 ? '尚未穿過' : `${daysAgo} 天未穿`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: '6px',
                    borderRadius: '99px',
                    background: 'var(--border-hairline)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(5, Math.round((cpw / maxCpw) * 100))}%`,
                      height: '100%',
                      background: dormant ? 'var(--accent-camel)' : 'var(--accent-sage)',
                    }}
                  />
                </div>

                {dormant && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onLockAnchorItem(item.id)}
                    >
                      <Sparkles size={12} /> 立即為這件喚醒搭配
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
