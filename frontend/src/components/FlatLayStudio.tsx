import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Scissors,
  UserCheck,
  Download,
  CalendarPlus,
  RotateCcw,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import {
  BodyProfile,
  CanvasLayerItem,
  OOTDLog,
  WardrobeItem,
} from '../types/wardrobe';
import {
  BODY_PRESETS,
  buildCalibratedCanvasLayout,
  computeRatiosFromLandmarks,
} from '../engine/bodyCalibration';
import { checkOotdRepeat, REFERENCE_TODAY } from '../engine/rulesEngine';

interface FlatLayStudioProps {
  items: WardrobeItem[];
  bodyProfile: BodyProfile;
  onUpdateBodyProfile: (next: BodyProfile) => void;
  activeOutfitIds: string[];
  onChangeOutfitIds: (ids: string[]) => void;
  ootdLogs: OOTDLog[];
  onSaveOotd: (itemIds: string[], dateStr: string, tuckedIn: boolean, notes?: string) => void;
}

export const FlatLayStudio: React.FC<FlatLayStudioProps> = ({
  items,
  bodyProfile,
  onUpdateBodyProfile,
  activeOutfitIds,
  onChangeOutfitIds,
  ootdLogs,
  onSaveOotd,
}) => {
  const [tuckedIn, setTuckedIn] = useState<boolean>(true);
  const [layers, setLayers] = useState<CanvasLayerItem[]>(() => {
    const selected = items.filter((i) => activeOutfitIds.includes(i.id));
    return buildCalibratedCanvasLayout(selected, bodyProfile, true);
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [calibrationPhotoUrl, setCalibrationPhotoUrl] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(REFERENCE_TODAY);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const matRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    itemId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Re-build proportional layout when active outfit, body ratios, or head anchor toggles
  useEffect(() => {
    const selected = items.filter((i) => activeOutfitIds.includes(i.id));
    setLayers(buildCalibratedCanvasLayout(selected, bodyProfile, tuckedIn));
  }, [
    activeOutfitIds,
    bodyProfile.torsoLengthRatio,
    bodyProfile.legLengthRatio,
    bodyProfile.shoulderWidthRatio,
    bodyProfile.useHeadAnchor,
    tuckedIn,
    items,
  ]);

  const repeatCheck = useMemo(
    () => checkOotdRepeat(scheduleDate, activeOutfitIds, ootdLogs, 14),
    [scheduleDate, activeOutfitIds, ootdLogs]
  );

  // Waistline Y position used both for guide line and Tuck-in bottom clipping
  const bottomLayer = layers.find((l) => itemMap.get(l.itemId)?.category === 'bottom');
  const waistClipLineY = bottomLayer ? bottomLayer.y - 102 * bottomLayer.scale : 292;

  const handleToggleGarment = (itemId: string) => {
    const clicked = itemMap.get(itemId);
    if (!clicked) return;

    if (activeOutfitIds.includes(itemId)) {
      onChangeOutfitIds(activeOutfitIds.filter((id) => id !== itemId));
    } else {
      // Replace same-category item cleanly for instant flat-lay swap
      const filtered = activeOutfitIds.filter((id) => {
        const existing = itemMap.get(id);
        return existing?.category !== clicked.category;
      });
      onChangeOutfitIds([...filtered, itemId]);
    }
  };

  const handleAdjustZ = (itemId: string, delta: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, zIndex: Math.max(1, l.zIndex + delta) } : l))
    );
  };

  const handleAdjustScale = (itemId: string, scale: number) => {
    setLayers((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, scale } : l)));
  };

  const handlePointerDownLayer = (e: React.PointerEvent, layer: CanvasLayerItem) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedLayerId(layer.itemId);
    dragStateRef.current = {
      itemId: layer.itemId,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
    };
  };

  const handlePointerMoveMat = (e: React.PointerEvent) => {
    const st = dragStateRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    setLayers((prev) =>
      prev.map((l) =>
        l.itemId === st.itemId
          ? {
              ...l,
              x: Math.max(60, Math.min(500, st.origX + dx)),
              y: Math.max(60, Math.min(640, st.origY + dy)),
            }
          : l
      )
    );
  };

  const handlePointerUpMat = () => {
    dragStateRef.current = null;
  };

  const handleLandmarkChange = (
    key: keyof BodyProfile['landmarks'],
    val: number
  ) => {
    const nextLandmarks = { ...bodyProfile.landmarks, [key]: val };
    const ratios = computeRatiosFromLandmarks(nextLandmarks, bodyProfile.heightCm);
    onUpdateBodyProfile({
      ...bodyProfile,
      ...ratios,
      landmarks: nextLandmarks,
    });
  };

  const handleApplyPreset = (preset: (typeof BODY_PRESETS)[number]) => {
    const ratios = computeRatiosFromLandmarks(preset.landmarks, preset.heightCm);
    onUpdateBodyProfile({
      ...bodyProfile,
      heightCm: preset.heightCm,
      ...ratios,
      landmarks: preset.landmarks,
    });
  };

  const handleUploadCalibrationPhoto = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const reader = new FileReader();
    reader.onload = () => setCalibrationPhotoUrl(String(reader.result));
    reader.readAsDataURL(files[0]);
  };

  const handleExportFlatLayPng = async () => {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 1120;
    outCanvas.height = 1380;
    const ctx = outCanvas.getContext('2d')!;

    // Warm linen mat backdrop
    const grad = ctx.createRadialGradient(420, 400, 80, 560, 690, 900);
    grad.addColorStop(0, '#FAF7F0');
    grad.addColorStop(1, '#E9E2D4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

    const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = src;
      });

    if (bodyProfile.useHeadAnchor) {
      try {
        const headImg = await loadImg(bodyProfile.headCutoutUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(560, 126, 82, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(headImg, 478, 44, 164, 164);
        ctx.restore();
      } catch {
        // Ignore if optional image unavailable
      }
    }

    for (const layer of ordered) {
      const item = itemMap.get(layer.itemId);
      if (!item) continue;
      const im = await loadImg(item.imageUrl);
      const size = 480 * layer.scale;
      const cx = layer.x * 2;
      const cy = layer.y * 2;
      const dx = cx - size / 2;
      const dy = cy - size / 2;

      ctx.save();
      if (tuckedIn && item.category === 'top') {
        const clipBottom = waistClipLineY * 2;
        ctx.beginPath();
        ctx.rect(0, 0, outCanvas.width, clipBottom);
        ctx.clip();
      }
      ctx.shadowColor = 'rgba(26, 25, 23, 0.22)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetX = 14;
      ctx.shadowOffsetY = 24;
      ctx.drawImage(im, dx, dy, size, size);
      ctx.restore();
    }

    // Editorial spec stamp at bottom
    ctx.fillStyle = '#5A554C';
    ctx.font = '500 24px "JetBrains Mono", monospace';
    ctx.fillText(
      `ATELIER 2D · TORSO ${(bodyProfile.torsoLengthRatio * 100).toFixed(0)}% / LEG ${(
        bodyProfile.legLengthRatio * 100
      ).toFixed(0)}% · ${tuckedIn ? 'TUCKED-IN' : 'UNTUCKED'}`,
      54,
      1325
    );

    const link = document.createElement('a');
    link.download = `atelier-flatlay-${scheduleDate}.png`;
    link.href = outCanvas.toDataURL('image/png');
    link.click();
  };

  const handleLogToOotd = () => {
    if (activeOutfitIds.length === 0) return;
    onSaveOotd(
      activeOutfitIds,
      scheduleDate,
      tuckedIn,
      `2D 拼貼定裝（${tuckedIn ? '紮衣服修飾腰線' : '自然垂墜層次'}）`
    );
    setSaveFeedback(`已記錄至 ${scheduleDate} OOTD 日曆，並自動更新單品穿著次數與 CPW！`);
    setTimeout(() => setSaveFeedback(null), 4000);
  };

  const selectedLayer = layers.find((l) => l.itemId === selectedLayerId) || null;
  const selectedGarment = selectedLayer ? itemMap.get(selectedLayer.itemId) : null;

  return (
    <section>
      <div className="section-header">
        <div>
          <div className="section-kicker">Module 02 · Body-Ratio Calibration & 2D Canvas</div>
          <h2 className="section-title">身形比例校準與 2D 平面拼貼畫布</h2>
          <p className="section-desc">
            無需雲端生成人體試穿圖。透過全身照比例錨點量測肩寬、軀幹與腿長比例，動態縮放上下著尺寸，支援 Z-Index 圖層排序與一鍵「紮衣服（Tuck-in）」褲頭裁切遮罩。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${tuckedIn ? 'btn-accent' : ''}`}
            onClick={() => setTuckedIn((v) => !v)}
          >
            <Scissors size={16} />
            <span>{tuckedIn ? '紮衣服遮罩：已開啟' : '一鍵紮衣服 (Tuck-in)'}</span>
          </button>
          <button
            type="button"
            className={`btn ${bodyProfile.useHeadAnchor ? 'btn-primary' : ''}`}
            onClick={() =>
              onUpdateBodyProfile({
                ...bodyProfile,
                useHeadAnchor: !bodyProfile.useHeadAnchor,
              })
            }
          >
            <UserCheck size={16} />
            <span>{bodyProfile.useHeadAnchor ? '頭部錨點：顯示' : '頭部錨點：隱藏'}</span>
          </button>
          <button type="button" className="btn" onClick={handleExportFlatLayPng}>
            <Download size={16} />
            <span>匯出平拍 PNG</span>
          </button>
        </div>
      </div>

      <div className="studio-split">
        {/* Left Column: Body-Ratio Calibration + Garment Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">全身照身形比例錨點 (MediaPipe Pose)</h3>
              <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={13} />
                <span>匯入全身照</span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleUploadCalibrationPhoto(e.target.files)}
                />
              </label>
            </div>

            {/* Preset Pills */}
            <div className="pill-group" style={{ marginBottom: '12px' }}>
              {BODY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`pill ${bodyProfile.heightCm === p.heightCm ? 'active' : ''}`}
                  onClick={() => handleApplyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Visual Calibration Box */}
            <div className="calibration-stage">
              {calibrationPhotoUrl ? (
                <img
                  src={calibrationPhotoUrl}
                  alt="Standing calibration"
                  style={{ height: '100%', width: '100%', objectFit: 'contain', opacity: 0.88 }}
                />
              ) : (
                <svg viewBox="0 0 240 320" style={{ height: '94%', opacity: 0.85 }}>
                  {/* Proportion-Responsive Silhouette Guide */}
                  <circle cx="120" cy={bodyProfile.landmarks.headY * 320 + 18} r="18" fill="#D4CBB8" stroke="#8A8377" strokeWidth="1.5" />
                  <path
                    d={`M ${120 - bodyProfile.landmarks.shoulderHalfSpan * 240} ${
                      bodyProfile.landmarks.shoulderY * 320
                    } L ${120 + bodyProfile.landmarks.shoulderHalfSpan * 240} ${
                      bodyProfile.landmarks.shoulderY * 320
                    } L 146 ${bodyProfile.landmarks.waistY * 320} L 94 ${
                      bodyProfile.landmarks.waistY * 320
                    } Z`}
                    fill="#B68F66"
                    opacity="0.72"
                  />
                  <path
                    d={`M 94 ${bodyProfile.landmarks.waistY * 320} L 146 ${
                      bodyProfile.landmarks.waistY * 320
                    } L 150 ${bodyProfile.landmarks.ankleY * 320} L 128 ${
                      bodyProfile.landmarks.ankleY * 320
                    } L 120 ${bodyProfile.landmarks.waistY * 320 + 36} L 112 ${
                      bodyProfile.landmarks.ankleY * 320
                    } L 90 ${bodyProfile.landmarks.ankleY * 320} Z`}
                    fill="#2D4059"
                    opacity="0.72"
                  />
                </svg>
              )}

              <div className="calibration-line" style={{ top: `${bodyProfile.landmarks.shoulderY * 100}%` }}>
                <span>肩線 Y</span>
                <span>寬度 {(bodyProfile.shoulderWidthRatio * 100).toFixed(0)}%</span>
              </div>
              <div className="calibration-line" style={{ top: `${bodyProfile.landmarks.waistY * 100}%` }}>
                <span>腰線 Y (Tuck-in)</span>
                <span>軀幹 {(bodyProfile.torsoLengthRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="calibration-line" style={{ top: `${bodyProfile.landmarks.ankleY * 100}%` }}>
                <span>腳踝 Y</span>
                <span>腿長 {(bodyProfile.legLengthRatio * 100).toFixed(1)}%</span>
              </div>
            </div>

            {/* Landmark Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
              <div className="range-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>腰線位置（調整上身／下身比例）</span>
                  <span className="badge-mono">
                    軀幹 {(bodyProfile.torsoLengthRatio * 100).toFixed(0)}% : 腿長{' '}
                    {(bodyProfile.legLengthRatio * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.38}
                  max={0.56}
                  step={0.01}
                  value={bodyProfile.landmarks.waistY}
                  onChange={(e) => handleLandmarkChange('waistY', Number(e.target.value))}
                />
              </div>

              <div className="range-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>肩寬跨度（影響上衣／外套橫向比例）</span>
                  <span className="badge-mono">
                    {(bodyProfile.shoulderWidthRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.11}
                  max={0.19}
                  step={0.005}
                  value={bodyProfile.landmarks.shoulderHalfSpan}
                  onChange={(e) => handleLandmarkChange('shoulderHalfSpan', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Wardrobe Quick-Swap Selector */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">點選替換畫布單品</h3>
              <span className="badge badge-mono">{activeOutfitIds.length} 件已選</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                maxHeight: '280px',
                overflowY: 'auto',
              }}
            >
              {items.map((item) => {
                const isSelected = activeOutfitIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleGarment(item.id)}
                    style={{
                      border: isSelected ? '2px solid var(--accent-camel)' : '1px solid var(--border-hairline)',
                      borderRadius: '8px',
                      background: isSelected ? '#FAF3EB' : 'var(--bg-mat)',
                      padding: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      style={{ height: '56px', width: '56px', objectFit: 'contain' }}
                    />
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--ink-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                      }}
                    >
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive 2D Flat-Lay Canvas + Layer Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">2D 平面拼貼畫布（可直接拖曳微調）</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                  已依據您的真實身形比例縮放上下著長寬比，並套用統一 25° 柔和投影
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const selected = items.filter((i) => activeOutfitIds.includes(i.id));
                  setLayers(buildCalibratedCanvasLayout(selected, bodyProfile, tuckedIn));
                }}
              >
                <RotateCcw size={14} />
                <span>重設比例對齊</span>
              </button>
            </div>

            <div
              ref={matRef}
              className="flatlay-mat"
              onPointerMove={handlePointerMoveMat}
              onPointerUp={handlePointerUpMat}
              onClick={() => setSelectedLayerId(null)}
            >
              {/* Waistband Reference Line */}
              <div className="flatlay-guides">
                <div className="flatlay-waist-line" style={{ top: `${waistClipLineY}px` }}>
                  <span className="flatlay-waist-label">
                    {tuckedIn ? 'Tuck-in 褲頭裁切線' : '自然腰線參考'}
                  </span>
                </div>
              </div>

              {bodyProfile.useHeadAnchor && (
                <div className="head-anchor-node">
                  <img src={bodyProfile.headCutoutUrl} alt="Head anchor" />
                </div>
              )}

              {[...layers]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((layer) => {
                  const item = itemMap.get(layer.itemId);
                  if (!item) return null;
                  const isTopTucked = tuckedIn && item.category === 'top';
                  const halfBox = 120 * layer.scale;
                  const topEdge = layer.y - halfBox;
                  const visibleH = Math.max(40, waistClipLineY - topEdge);
                  const clipPct = isTopTucked
                    ? Math.max(0, 100 - (visibleH / (240 * layer.scale)) * 100)
                    : 0;

                  return (
                    <div
                      key={layer.itemId}
                      className={`canvas-layer-node ${
                        selectedLayerId === layer.itemId ? 'selected' : ''
                      }`}
                      style={{
                        left: `${layer.x}px`,
                        top: `${layer.y}px`,
                        zIndex: layer.zIndex,
                        transform: `translate(-50%, -50%) scale(${layer.scale})`,
                        clipPath: isTopTucked ? `inset(0px 0px ${clipPct.toFixed(1)}% 0px)` : undefined,
                      }}
                      onPointerDown={(e) => handlePointerDownLayer(e, layer)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLayerId(layer.itemId);
                      }}
                    >
                      <img src={item.imageUrl} alt={item.name} draggable={false} />
                    </div>
                  );
                })}
            </div>

            {/* Active Layer Z-Index & Scale Bar */}
            {selectedLayer && selectedGarment && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '12px 14px',
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
                <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                  選取圖層：{selectedGarment.name}
                  <span className="badge badge-mono" style={{ marginLeft: '8px' }}>
                    Z={selectedLayer.zIndex}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleAdjustZ(selectedLayer.itemId, 5)}
                  >
                    <ArrowUp size={13} /> 上移圖層
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleAdjustZ(selectedLayer.itemId, -5)}
                  >
                    <ArrowDown size={13} /> 下移圖層
                  </button>
                  <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    縮放
                    <input
                      type="range"
                      min={0.45}
                      max={1.35}
                      step={0.03}
                      value={selectedLayer.scale}
                      onChange={(e) =>
                        handleAdjustScale(selectedLayer.itemId, Number(e.target.value))
                      }
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Save to OOTD Calendar with Anti-Repeat Warning */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">定裝並寫入 OOTD 日曆（含 14 天防撞衫偵測）</h3>
            </div>

            {repeatCheck.hasConflict && (
              <div className="alert-box alert-warning" style={{ marginBottom: '12px' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>{repeatCheck.warningMessage}</div>
              </div>
            )}

            {saveFeedback && (
              <div className="alert-box alert-success" style={{ marginBottom: '12px' }}>
                <div>{saveFeedback}</div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="date"
                className="search-input"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleLogToOotd}
                disabled={activeOutfitIds.length === 0}
              >
                <CalendarPlus size={16} />
                <span>儲存此穿搭至 OOTD & 更新 CPW</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
