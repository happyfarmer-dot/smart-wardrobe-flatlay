import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  Camera,
  ShoppingBag,
  Sparkles,
  Check,
  X,
  Flame,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CategoryType,
  FitType,
  LengthType,
  VisionPipelineOutput,
  WardrobeItem,
} from '../types/wardrobe';
import {
  computeCpw,
  daysSinceLastWorn,
  isDormant90d,
  REFERENCE_TODAY,
} from '../engine/rulesEngine';
import {
  createSampleRawGarmentDataUrl,
  runOnDeviceVisionPipeline,
} from '../engine/visionPipeline';

interface WardrobeVaultProps {
  items: WardrobeItem[];
  onAddItems: (newItems: WardrobeItem[]) => void;
  onLockAnchorItem: (itemId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: '全部單品',
  top: '上衣',
  bottom: '下著',
  outerwear: '外套',
  shoes: '鞋履',
  dress: '連身',
};

export const WardrobeVault: React.FC<WardrobeVaultProps> = ({
  items,
  onAddItems,
  onLockAnchorItem,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortMode, setSortMode] = useState<'default' | 'cpw_desc' | 'dormant'>('default');

  // Import Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string>('garment.png');
  const [tolerance, setTolerance] = useState<number>(34);
  const [pipelineResult, setPipelineResult] = useState<VisionPipelineOutput | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchQueuedCount, setBatchQueuedCount] = useState(0);

  // Editable Tag Form State
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<CategoryType>('top');
  const [editSubCat, setEditSubCat] = useState('cotton_shirt');
  const [editFit, setEditFit] = useState<FitType>('regular');
  const [editLength, setEditLength] = useState<LengthType>('regular');
  const [editThermal, setEditThermal] = useState<number>(2);
  const [editPrice, setEditPrice] = useState<number>(2200);
  const [editStyles, setEditStyles] = useState<string>('commute, minimal');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const filteredItems = useMemo(() => {
    let list = items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${item.name} ${item.subCategory} ${item.styleTags.join(' ')} ${item.primaryHex}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortMode === 'cpw_desc') {
      list = [...list].sort((a, b) => computeCpw(b) - computeCpw(a));
    } else if (sortMode === 'dormant') {
      list = [...list].sort(
        (a, b) => daysSinceLastWorn(b, REFERENCE_TODAY) - daysSinceLastWorn(a, REFERENCE_TODAY)
      );
    }
    return list;
  }, [items, categoryFilter, searchQuery, sortMode]);

  const dormantCount = useMemo(
    () => items.filter((i) => isDormant90d(i, REFERENCE_TODAY)).length,
    [items]
  );

  const avgCpw = useMemo(() => {
    if (!items.length) return 0;
    const total = items.reduce((sum, i) => sum + computeCpw(i), 0);
    return Math.round(total / items.length);
  }, [items]);

  const executePipeline = async (dataUrl: string, fileName: string, tol: number) => {
    setIsProcessing(true);
    try {
      const output = await runOnDeviceVisionPipeline(dataUrl, fileName, tol);
      setPipelineResult(output);
      setEditName(output.suggestedTag.name);
      setEditCategory(output.suggestedTag.category);
      setEditSubCat(output.suggestedTag.subCategory);
      setEditFit(output.suggestedTag.fit);
      setEditLength(output.suggestedTag.length);
      setEditThermal(output.suggestedTag.thermalScore);
      setEditStyles(output.suggestedTag.styleTags.join(', '));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenImportWithSample = async (variant: 'terracotta-jacket' | 'sky-shirt') => {
    const sampleUrl = createSampleRawGarmentDataUrl(variant);
    const fname = variant === 'terracotta-jacket' ? 'terracotta_jacket.png' : 'sky_oxford_shirt.png';
    setSourceDataUrl(sampleUrl);
    setSourceFileName(fname);
    setIsModalOpen(true);
    await executePipeline(sampleUrl, fname, tolerance);
  };

  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (files.length > 1) {
      // Batch import mode: process all selected photos on-device immediately
      setIsProcessing(true);
      setBatchQueuedCount(files.length);
      const batchItems: WardrobeItem[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await runOnDeviceVisionPipeline(dataUrl, file.name, tolerance);
        batchItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name.replace(/\.[^.]+$/, '') || res.suggestedTag.name,
          imageUrl: res.standardizedDataUrl,
          imageSha256: res.imageSha256,
          category: res.suggestedTag.category,
          subCategory: res.suggestedTag.subCategory,
          fit: res.suggestedTag.fit,
          length: res.suggestedTag.length,
          thermalScore: res.suggestedTag.thermalScore,
          styleTags: res.suggestedTag.styleTags,
          season: res.suggestedTag.season,
          primaryHex: res.primaryHex,
          primaryHsl: res.primaryHsl,
          primaryShare: res.primaryShare,
          secondaryHex: res.secondaryHex,
          secondaryHsl: res.secondaryHsl,
          secondaryShare: res.secondaryShare,
          purchasePrice: 1800,
          wearCount: 0,
          lastWornAt: null,
        });
      }
      onAddItems(batchItems);
      setIsProcessing(false);
      setBatchQueuedCount(0);
      setIsModalOpen(false);
      return;
    }

    const file = files[0];
    const dataUrl = await readFileAsDataUrl(file);
    setSourceDataUrl(dataUrl);
    setSourceFileName(file.name);
    setIsModalOpen(true);
    await executePipeline(dataUrl, file.name, tolerance);
  };

  const handleConfirmAddSingle = () => {
    if (!pipelineResult) return;
    const duplicate = items.some((i) => i.imageSha256 === pipelineResult.imageSha256);
    if (duplicate) {
      alert('偵測到相同影像 SHA-256 指紋，已自動去重略過重複入庫！');
      return;
    }

    const tags = editStyles
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    const newItem: WardrobeItem = {
      id: `item-${Date.now()}`,
      name: editName.trim() || '新匯入衣物',
      imageUrl: pipelineResult.standardizedDataUrl,
      imageSha256: pipelineResult.imageSha256,
      category: editCategory,
      subCategory: editSubCat.trim() || 'custom_item',
      fit: editFit,
      length: editLength,
      thermalScore: editThermal,
      styleTags: tags.length ? tags : ['minimal'],
      season: pipelineResult.suggestedTag.season,
      primaryHex: pipelineResult.primaryHex,
      primaryHsl: pipelineResult.primaryHsl,
      primaryShare: pipelineResult.primaryShare,
      secondaryHex: pipelineResult.secondaryHex,
      secondaryHsl: pipelineResult.secondaryHsl,
      secondaryShare: pipelineResult.secondaryShare,
      purchasePrice: Number(editPrice) || 0,
      wearCount: 0,
      lastWornAt: null,
    };

    onAddItems([newItem]);
    setIsModalOpen(false);
    setPipelineResult(null);
  };

  return (
    <section>
      <div className="section-header">
        <div>
          <div className="section-kicker">Module 01 · On-Device Vision & Digitization</div>
          <h2 className="section-title">端側視覺數位衣櫃</h2>
          <p className="section-desc">
            本地執行主體去背、Gray-World 自動白平衡、25° 統一柔和投影與 K-Means++ 主色提取，入庫僅需一次輕量結構化打標，徹底消除雲端視覺試穿與重複算力浪費。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleFileSelection(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => handleFileSelection(e.target.files)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera size={16} />
            <span>相機拍攝</span>
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            <span>相簿批次匯入</span>
          </button>
          <button
            type="button"
            id="btn-demo-import"
            className="btn btn-primary"
            onClick={() => handleOpenImportWithSample('terracotta-jacket')}
          >
            <ShoppingBag size={16} />
            <span>模擬網購/黃光匯入</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="metric-strip" style={{ marginBottom: '20px' }}>
        <div className="metric-tile">
          <div className="metric-label">數位建檔單品</div>
          <div className="metric-value">{items.length} 件</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">全衣櫃平均 CPW</div>
          <div className="metric-value">NT$ {avgCpw.toLocaleString()}</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">&gt;90 天未穿冷凍單品</div>
          <div className="metric-value" style={{ color: dormantCount > 0 ? 'var(--accent-amber)' : undefined }}>
            {dormantCount} 件
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">推薦階段雲端圖片傳輸</div>
          <div className="metric-value" style={{ color: 'var(--accent-sage)' }}>
            0 KB
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="wardrobe-toolbar">
        <div className="pill-group">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`pill ${categoryFilter === key ? 'active' : ''}`}
              onClick={() => setCategoryFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            className="search-input"
            placeholder="搜尋單品名稱、風格或 HEX..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="search-input"
            style={{ minWidth: '170px' }}
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
          >
            <option value="default">預設衣櫃排序</option>
            <option value="cpw_desc">CPW 單次成本由高到低</option>
            <option value="dormant">優先顯示 90 天+ 冷凍單品</option>
          </select>
        </div>
      </div>

      {/* Garment Grid */}
      <div className="garment-grid">
        {filteredItems.map((item) => {
          const cpw = computeCpw(item);
          const dormant = isDormant90d(item, REFERENCE_TODAY);
          const daysAgo = daysSinceLastWorn(item, REFERENCE_TODAY);

          return (
            <article key={item.id} className="garment-card">
              <div className="garment-stage">
                <div className="garment-stage-top">
                  <span className="badge badge-mono">
                    <Flame size={11} /> 保暖 {item.thermalScore}/5
                  </span>
                  {dormant && (
                    <span className="badge badge-dormant">
                      <Clock size={11} /> {daysAgo === 999 ? '未曾穿著' : `${daysAgo}天未穿`}
                    </span>
                  )}
                </div>
                <img src={item.imageUrl} alt={item.name} loading="lazy" />
              </div>

              <div className="garment-body">
                <div>
                  <h3 className="garment-name">{item.name}</h3>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <span className="badge">{CATEGORY_LABELS[item.category] || item.category}</span>
                    <span className="badge">{item.fit}</span>
                    <span className="badge">{item.length}</span>
                    {item.styleTags.slice(0, 2).map((tag) => (
                      <span key={tag} className="badge badge-sage">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* K-Means Top-2 Colors */}
                <div className="swatch-row">
                  <span className="swatch-chip" title={`HSL(${item.primaryHsl.h}, ${item.primaryHsl.s}%, ${item.primaryHsl.l}%)`}>
                    <span className="swatch-dot" style={{ backgroundColor: item.primaryHex }} />
                    {item.primaryHex}
                  </span>
                  {item.secondaryHex && (
                    <span className="swatch-chip">
                      <span className="swatch-dot" style={{ backgroundColor: item.secondaryHex }} />
                      {item.secondaryHex}
                    </span>
                  )}
                </div>

                <div className="garment-meta-row">
                  <span className="badge-mono">
                    CPW <strong>${cpw.toLocaleString()}</strong> ({item.wearCount}次)
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onLockAnchorItem(item.id)}
                    title="以這件單品為核心進行一衣多穿推薦"
                  >
                    <Sparkles size={12} />
                    <span>一衣多穿</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* On-Device Vision Pipeline Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="端側視覺處理管線">
          <div className="modal-sheet">
            <div className="panel-header">
              <div>
                <div className="section-kicker">On-Device Pipeline · 0 Cloud GPU</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.35rem' }}>
                  端側視覺標準化與結構化入庫精靈
                </h3>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setIsModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Quick Sample Switchers */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleOpenImportWithSample('terracotta-jacket')}
              >
                測試樣本 A：黃光居家夾克
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleOpenImportWithSample('sky-shirt')}
              >
                測試樣本 B：網購白底襯衫截圖
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                上傳本機圖片 / 批次多選
              </button>
            </div>

            {isProcessing ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-secondary)' }}>
                {batchQueuedCount > 0
                  ? `正在裝置端批次處理 ${batchQueuedCount} 件衣物影像...`
                  : '正在裝置端執行邊界去背、Gray-World 白平衡與 K-Means++ 色彩聚類...'}
              </div>
            ) : (
              pipelineResult && (
                <>
                  {/* 3-Step Visual Comparison */}
                  <div className="pipeline-steps-grid">
                    <div className="pipeline-preview-box">
                      <span className="badge">1. 原始拍攝 / 截圖</span>
                      <img src={pipelineResult.rawDataUrl} alt="Raw input" />
                    </div>
                    <div className="pipeline-preview-box">
                      <span className="badge">2. 端側去背 (前景 {pipelineResult.foregroundCoveragePct}%)</span>
                      <img src={pipelineResult.segmentedDataUrl} alt="Segmented cutout" />
                    </div>
                    <div className="pipeline-preview-box">
                      <span className="badge badge-sage">3. AWB + 25° 柔和投影</span>
                      <img src={pipelineResult.standardizedDataUrl} alt="Standardized garment" />
                    </div>
                  </div>

                  {/* Segmentation Tolerance Slider */}
                  <div className="panel" style={{ marginBottom: '16px', padding: '14px' }}>
                    <div className="range-row">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <SlidersHorizontal size={14} /> 去背色彩容差微調：{tolerance}
                        </span>
                        <span className="badge badge-mono">
                          端側耗時 {pipelineResult.processingMs} ms · AWB Gain ({pipelineResult.awbGain.r}, {pipelineResult.awbGain.g}, {pipelineResult.awbGain.b})
                        </span>
                      </div>
                      <input
                        type="range"
                        min={14}
                        max={64}
                        value={tolerance}
                        onChange={(e) => {
                          const nextTol = Number(e.target.value);
                          setTolerance(nextTol);
                          if (sourceDataUrl) {
                            executePipeline(sourceDataUrl, sourceFileName, nextTol);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* K-Means + Tag Editor */}
                  <div className="studio-split-wide">
                    <div className="panel" style={{ padding: '16px' }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: '0.94rem' }}>
                        K-Means++ 主色提取結果 & 入庫屬性確認
                      </h4>

                      <div className="swatch-row" style={{ marginBottom: '14px' }}>
                        <div className="badge badge-mono" style={{ padding: '6px 10px' }}>
                          <span className="swatch-dot" style={{ backgroundColor: pipelineResult.primaryHex }} />
                          主色 {pipelineResult.primaryHex} ({pipelineResult.primaryShare}%) · HSL({pipelineResult.primaryHsl.h}°, {pipelineResult.primaryHsl.s}%, {pipelineResult.primaryHsl.l}%)
                        </div>
                        <div className="badge badge-mono" style={{ padding: '6px 10px' }}>
                          <span className="swatch-dot" style={{ backgroundColor: pipelineResult.secondaryHex }} />
                          輔色 {pipelineResult.secondaryHex} ({pipelineResult.secondaryShare}%)
                        </div>
                      </div>

                      <div className="field-grid">
                        <div className="field">
                          <label>單品名稱</label>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>類別 (category)</label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as CategoryType)}
                          >
                            <option value="top">上衣 (top)</option>
                            <option value="bottom">下著 (bottom)</option>
                            <option value="outerwear">外套 (outerwear)</option>
                            <option value="shoes">鞋履 (shoes)</option>
                            <option value="dress">連身 (dress)</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>版型 (fit)</label>
                          <select value={editFit} onChange={(e) => setEditFit(e.target.value as FitType)}>
                            <option value="slim">緊身/合身 (slim)</option>
                            <option value="regular">常規 (regular)</option>
                            <option value="loose">寬鬆 (loose)</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>衣長 (length)</label>
                          <select
                            value={editLength}
                            onChange={(e) => setEditLength(e.target.value as LengthType)}
                          >
                            <option value="cropped">短版 (cropped)</option>
                            <option value="regular">常規 (regular)</option>
                            <option value="long">長版 (long)</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>保暖係數 (1~5)</label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={editThermal}
                            onChange={(e) => setEditThermal(Math.max(1, Math.min(5, Number(e.target.value))))}
                          />
                        </div>
                        <div className="field">
                          <label>購入價格 (NT$ 計算 CPW)</label>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={editPrice}
                            onChange={(e) => setEditPrice(Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="field" style={{ marginTop: '10px' }}>
                        <label>風格標籤 (逗號分隔)</label>
                        <input value={editStyles} onChange={(e) => setEditStyles(e.target.value)} />
                      </div>
                    </div>

                    <div className="panel" style={{ padding: '16px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '0.94rem' }}>
                        單次入庫 Structured Output JSON 預覽
                      </h4>
                      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                        已於本地端完成 SHA-256 指紋去重與主色提取，正式版後端僅需在入庫時調用 Gemini 2.5 Flash 一次即可寫入 PostgreSQL：
                      </p>
                      <pre className="code-block">
                        {JSON.stringify(
                          {
                            image_sha256: pipelineResult.imageSha256.slice(0, 16) + '...',
                            primary_hex: pipelineResult.primaryHex,
                            primary_hsl: pipelineResult.primaryHsl,
                            category: editCategory,
                            sub_category: editSubCat,
                            fit: editFit,
                            length: editLength,
                            thermal_score: editThermal,
                            style_tags: editStyles.split(',').map((s) => s.trim()).filter(Boolean),
                            season: pipelineResult.suggestedTag.season,
                          },
                          null,
                          2
                        )}
                      </pre>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                        <button type="button" className="btn" onClick={() => setIsModalOpen(false)}>
                          取消
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleConfirmAddSingle}>
                          <Check size={16} />
                          <span>確認建檔入庫</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.readAsDataURL(file);
  });
}
