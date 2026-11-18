import {
  CategoryType,
  FitType,
  HSLColor,
  LengthType,
  SeasonType,
  VisionPipelineOutput,
} from '../types/wardrobe';

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function rgbToHsl(r: number, g: number, b: number): HSLColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Generates a synthetic raw "bedroom warm-light" garment photo on canvas
 * so users can test the full segmentation + AWB + Drop Shadow + K-Means pipeline in 1 click.
 */
export function createSampleRawGarmentDataUrl(variant: 'terracotta-jacket' | 'sky-shirt' = 'terracotta-jacket'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  // Simulated warm yellowish room wall / tabletop background
  const bg = ctx.createLinearGradient(0, 0, 480, 480);
  bg.addColorStop(0, '#F3EBD8');
  bg.addColorStop(1, '#E6DCC4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 480, 480);

  if (variant === 'terracotta-jacket') {
    // Draw a warm terracotta chore jacket with buttons & pockets under yellow light tint
    ctx.fillStyle = '#A8583B';
    ctx.strokeStyle = '#6F3522';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(140, 96);
    ctx.lineTo(54, 232);
    ctx.lineTo(100, 266);
    ctx.lineTo(156, 174);
    ctx.lineTo(150, 398);
    ctx.lineTo(330, 398);
    ctx.lineTo(324, 174);
    ctx.lineTo(380, 266);
    ctx.lineTo(426, 232);
    ctx.lineTo(340, 96);
    ctx.lineTo(286, 74);
    ctx.lineTo(194, 74);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Collar & pockets
    ctx.fillStyle = '#B86548';
    ctx.fillRect(172, 165, 50, 56);
    ctx.strokeRect(172, 165, 50, 56);
    ctx.fillRect(258, 165, 50, 56);
    ctx.strokeRect(258, 165, 50, 56);
    ctx.fillStyle = '#2F2621';
    for (let y = 120; y <= 360; y += 54) {
      ctx.beginPath();
      ctx.arc(240, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Sky-blue crisp shirt on studio off-white screenshot background
    ctx.fillStyle = '#D2E2EE';
    ctx.strokeStyle = '#92B0C7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(148, 96);
    ctx.lineTo(66, 226);
    ctx.lineTo(114, 258);
    ctx.lineTo(164, 176);
    ctx.lineTo(158, 392);
    ctx.lineTo(322, 392);
    ctx.lineTo(316, 176);
    ctx.lineTo(366, 258);
    ctx.lineTo(414, 226);
    ctx.lineTo(332, 96);
    ctx.lineTo(280, 76);
    ctx.lineTo(200, 76);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#E6F0F7';
    for (let y = 126; y <= 354; y += 46) {
      ctx.beginPath();
      ctx.arc(240, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Browser-side On-Device Vision Pipeline:
 * 1. Border Flood-Fill Subject Segmentation with Luminance Gradient Guard
 * 2. Foreground-Only Gray-World Auto White Balance (clamped gain)
 * 3. Unified 25° Soft Drop Shadow Composite
 * 4. K-Means++ Top-2 Dominant HEX & HSL Color Extraction
 * 5. Deterministic Offline Rule Auto-Tagger
 */
export async function runOnDeviceVisionPipeline(
  sourceDataUrl: string,
  fileName: string = 'garment.png',
  tolerance: number = 34
): Promise<VisionPipelineOutput> {
  const t0 = performance.now();

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('無法載入圖片檔案'));
    el.src = sourceDataUrl;
  });

  const maxDim = 440;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(64, Math.round(img.width * scale));
  const h = Math.max(64, Math.round(img.height * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const wCtx = workCanvas.getContext('2d', { willReadFrequently: true })!;
  wCtx.drawImage(img, 0, 0, w, h);

  const rawDataUrl = workCanvas.toDataURL('image/png');
  const srcImage = wCtx.getImageData(0, 0, w, h);
  const data = srcImage.data;

  // Check if image already has transparent margins
  let alreadyTransparentCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 20) alreadyTransparentCount++;
  }
  const hasExistingAlpha = alreadyTransparentCount > w * h * 0.08;

  // Step 1: Subject Segmentation (Border Flood-Fill + Edge Gradient Protection)
  const bgMask = new Uint8Array(w * h);
  if (!hasExistingAlpha) {
    // Estimate border background median-like color from 4 corners + edge samples
    const samples: [number, number, number][] = [];
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 16))) {
      const topIdx = x * 4;
      const botIdx = ((h - 1) * w + x) * 4;
      samples.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
      samples.push([data[botIdx], data[botIdx + 1], data[botIdx + 2]]);
    }
    for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 16))) {
      const leftIdx = y * w * 4;
      const rightIdx = (y * w + (w - 1)) * 4;
      samples.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
      samples.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
    }

    const bgR = samples.reduce((a, c) => a + c[0], 0) / samples.length;
    const bgG = samples.reduce((a, c) => a + c[1], 0) / samples.length;
    const bgB = samples.reduce((a, c) => a + c[2], 0) / samples.length;

    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let qHead = 0;
    let qTail = 0;

    const colorDist = (idx: number, refR: number, refG: number, refB: number) => {
      const p = idx * 4;
      const dr = data[p] - refR;
      const dg = data[p + 1] - refG;
      const db = data[p + 2] - refB;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    const tryPush = (idx: number, refR: number, refG: number, refB: number) => {
      if (visited[idx]) return;
      const dBg = colorDist(idx, bgR, bgG, bgB);
      const dPrev = colorDist(idx, refR, refG, refB);
      if (dBg < tolerance * 1.45 && dPrev < tolerance * 0.85) {
        visited[idx] = 1;
        bgMask[idx] = 1;
        queue[qTail++] = idx;
      }
    };

    for (let x = 0; x < w; x++) {
      tryPush(x, bgR, bgG, bgB);
      tryPush((h - 1) * w + x, bgR, bgG, bgB);
    }
    for (let y = 0; y < h; y++) {
      tryPush(y * w, bgR, bgG, bgB);
      tryPush(y * w + (w - 1), bgR, bgG, bgB);
    }

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const cx = idx % w;
      const cy = Math.floor(idx / w);
      const p = idx * 4;
      const r0 = data[p];
      const g0 = data[p + 1];
      const b0 = data[p + 2];

      if (cx > 0) tryPush(idx - 1, r0, g0, b0);
      if (cx < w - 1) tryPush(idx + 1, r0, g0, b0);
      if (cy > 0) tryPush(idx - w, r0, g0, b0);
      if (cy < h - 1) tryPush(idx + w, r0, g0, b0);
    }
  } else {
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] < 24) bgMask[i] = 1;
    }
  }

  // Apply segmented alpha & compute foreground bounding box
  const segImage = wCtx.createImageData(w, h);
  segImage.data.set(data);
  let fgCount = 0;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (bgMask[i]) {
      segImage.data[p + 3] = 0;
    } else {
      const x = i % w;
      const y = Math.floor(i / w);
      // Feather 1px boundary adjacent to background
      const adjBg =
        (x > 0 && bgMask[i - 1]) ||
        (x < w - 1 && bgMask[i + 1]) ||
        (y > 0 && bgMask[i - w]) ||
        (y < h - 1 && bgMask[i + w]);
      segImage.data[p + 3] = adjBg ? 155 : 255;
      fgCount++;
      sumR += segImage.data[p];
      sumG += segImage.data[p + 1];
      sumB += segImage.data[p + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const segCanvas = document.createElement('canvas');
  segCanvas.width = w;
  segCanvas.height = h;
  segCanvas.getContext('2d')!.putImageData(segImage, 0, 0);
  const segmentedDataUrl = segCanvas.toDataURL('image/png');

  // Step 2: Foreground-Only Gray-World Auto White Balance (clamped gain)
  const safeFg = Math.max(1, fgCount);
  const avgR = sumR / safeFg;
  const avgG = sumG / safeFg;
  const avgB = sumB / safeFg;
  const gray = (avgR + avgG + avgB) / 3;
  // Blend 45% toward gray-world to preserve garment authentic hues while removing yellow/blue cast
  const clampGain = (gVal: number) => Math.max(0.86, Math.min(1.16, 1 + (gVal - 1) * 0.45));
  const gainR = clampGain(gray / Math.max(1, avgR));
  const gainG = clampGain(gray / Math.max(1, avgG));
  const gainB = clampGain(gray / Math.max(1, avgB));

  const awbImage = wCtx.createImageData(w, h);
  awbImage.data.set(segImage.data);
  const fgSamples: [number, number, number][] = [];

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (awbImage.data[p + 3] > 64) {
      const nr = Math.min(255, Math.round(awbImage.data[p] * gainR));
      const ng = Math.min(255, Math.round(awbImage.data[p + 1] * gainG));
      const nb = Math.min(255, Math.round(awbImage.data[p + 2] * gainB));
      awbImage.data[p] = nr;
      awbImage.data[p + 1] = ng;
      awbImage.data[p + 2] = nb;
      if (i % 5 === 0) fgSamples.push([nr, ng, nb]);
    }
  }

  const awbCanvas = document.createElement('canvas');
  awbCanvas.width = w;
  awbCanvas.height = h;
  awbCanvas.getContext('2d')!.putImageData(awbImage, 0, 0);

  // Step 3: Crop tightly + Apply Unified 25° Soft Drop Shadow on standardized 512x512 canvas
  const stdSize = 512;
  const stdCanvas = document.createElement('canvas');
  stdCanvas.width = stdSize;
  stdCanvas.height = stdSize;
  const sCtx = stdCanvas.getContext('2d')!;

  const cropW = Math.max(16, maxX - minX + 1);
  const cropH = Math.max(16, maxY - minY + 1);
  const fitScale = Math.min((stdSize * 0.82) / cropW, (stdSize * 0.82) / cropH);
  const drawW = cropW * fitScale;
  const drawH = cropH * fitScale;
  const drawX = (stdSize - drawW) / 2;
  const drawY = (stdSize - drawH) / 2;

  sCtx.save();
  sCtx.shadowColor = 'rgba(26, 25, 23, 0.22)';
  sCtx.shadowBlur = 18;
  sCtx.shadowOffsetX = 8; // ~25° lighting angle
  sCtx.shadowOffsetY = 16;
  sCtx.drawImage(awbCanvas, minX, minY, cropW, cropH, drawX, drawY, drawW, drawH);
  sCtx.restore();

  const standardizedDataUrl = stdCanvas.toDataURL('image/png');

  // Step 4: K-Means++ (k=4) Top-2 Dominant HEX & HSL Extraction
  const { primary, secondary, primaryShare, secondaryShare } = runKMeansTop2(fgSamples);

  // Compute deterministic SHA-256 hash of foreground buffer
  let hashHex = 'sha256_local_fallback';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', awbImage.data.buffer);
    hashHex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Step 5: Deterministic Rule-Based Auto-Tagging (Zero Cloud Token)
  const aspectRatio = Number((cropW / Math.max(1, cropH)).toFixed(2));
  const suggestedTag = inferLocalTags(fileName, aspectRatio, primary.hsl);

  return {
    rawDataUrl,
    segmentedDataUrl,
    standardizedDataUrl,
    primaryHex: primary.hex,
    primaryHsl: primary.hsl,
    primaryShare,
    secondaryHex: secondary.hex,
    secondaryHsl: secondary.hsl,
    secondaryShare,
    foregroundCoveragePct: Math.round((fgCount / (w * h)) * 100),
    awbGain: {
      r: Number(gainR.toFixed(2)),
      g: Number(gainG.toFixed(2)),
      b: Number(gainB.toFixed(2)),
    },
    aspectRatio,
    processingMs: Math.round(performance.now() - t0),
    imageSha256: hashHex,
    suggestedTag,
  };
}

function runKMeansTop2(samples: [number, number, number][]): {
  primary: { hex: string; hsl: HSLColor };
  secondary: { hex: string; hsl: HSLColor };
  primaryShare: number;
  secondaryShare: number;
} {
  if (samples.length === 0) {
    return {
      primary: { hex: '#DCD6CA', hsl: { h: 40, s: 20, l: 83 } },
      secondary: { hex: '#A59E90', hsl: { h: 40, s: 12, l: 61 } },
      primaryShare: 75,
      secondaryShare: 25,
    };
  }

  const k = Math.min(4, samples.length);
  // Deterministic K-Means++ style seeding
  const centroids: [number, number, number][] = [samples[0]];
  for (let c = 1; c < k; c++) {
    let farthest = samples[0];
    let bestDist = -1;
    for (const s of samples) {
      let minD = Infinity;
      for (const cen of centroids) {
        const d = (s[0] - cen[0]) ** 2 + (s[1] - cen[1]) ** 2 + (s[2] - cen[2]) ** 2;
        if (d < minD) minD = d;
      }
      if (minD > bestDist) {
        bestDist = minD;
        farthest = s;
      }
    }
    centroids.push([...farthest]);
  }

  const counts = new Array<number>(k).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    const sums: [number, number, number][] = Array.from({ length: k }, () => [0, 0, 0]);
    counts.fill(0);
    for (const s of samples) {
      let bestIdx = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d =
          (s[0] - centroids[c][0]) ** 2 +
          (s[1] - centroids[c][1]) ** 2 +
          (s[2] - centroids[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          bestIdx = c;
        }
      }
      sums[bestIdx][0] += s[0];
      sums[bestIdx][1] += s[1];
      sums[bestIdx][2] += s[2];
      counts[bestIdx]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
      }
    }
  }

  const ranked = centroids
    .map((rgb, i) => ({ rgb, count: counts[i] }))
    .sort((a, b) => b.count - a.count);

  const total = Math.max(1, samples.length);
  const c1 = ranked[0].rgb;
  const c2 = ranked[1]?.count > 0 ? ranked[1].rgb : ranked[0].rgb;

  const pShare = Math.round((ranked[0].count / total) * 100);
  const sShare = Math.max(0, 100 - pShare);

  return {
    primary: { hex: rgbToHex(c1[0], c1[1], c1[2]), hsl: rgbToHsl(c1[0], c1[1], c1[2]) },
    secondary: { hex: rgbToHex(c2[0], c2[1], c2[2]), hsl: rgbToHsl(c2[0], c2[1], c2[2]) },
    primaryShare: pShare,
    secondaryShare: sShare,
  };
}

function inferLocalTags(
  fileName: string,
  aspectRatio: number,
  hsl: HSLColor
): VisionPipelineOutput['suggestedTag'] {
  const lower = fileName.toLowerCase();
  let category: CategoryType = 'top';
  let subCategory = 'cotton_shirt';
  let fit: FitType = 'regular';
  let length: LengthType = 'regular';
  let thermalScore = 2;
  let styleTags = ['commute', 'minimal'];
  let season: SeasonType[] = ['spring', 'autumn'];
  let name = '新匯入單品';

  if (/pant|jean|trouser|chino|skirt|denim|褲|裙/.test(lower)) {
    category = 'bottom';
    subCategory = /jean|denim/.test(lower) ? 'straight_denim' : 'tailored_trousers';
    length = 'long';
    name = '修身長褲';
  } else if (/coat|jacket|blazer|trench|parka|cardigan|外|風衣|西裝/.test(lower)) {
    category = 'outerwear';
    subCategory = /trench/.test(lower) ? 'trench_coat' : 'chore_jacket';
    thermalScore = 3;
    length = /trench|coat/.test(lower) ? 'long' : 'regular';
    styleTags = ['commute', 'vintage'];
    season = ['autumn', 'winter'];
    name = /terracotta/.test(lower) ? '磚紅工裝夾克' : '輕量機能外搭';
  } else if (/shoe|loafer|sneaker|boot|鞋/.test(lower)) {
    category = 'shoes';
    subCategory = 'leather_shoes';
    thermalScore = 1;
    name = '極簡日常鞋款';
  } else if (/dress|洋裝/.test(lower)) {
    category = 'dress';
    subCategory = 'midi_dress';
    length = 'long';
    name = '連身剪裁洋裝';
  } else if (/tee|tshirt|短袖/.test(lower)) {
    category = 'top';
    subCategory = 'boxy_tee';
    thermalScore = 1;
    season = ['spring', 'summer'];
    name = '日常圓領短袖';
  } else if (aspectRatio < 0.72) {
    category = 'bottom';
    subCategory = 'straight_trousers';
    length = 'long';
    name = '長版下著單品';
  } else if (aspectRatio > 1.15) {
    category = 'top';
    subCategory = 'relaxed_top';
    fit = 'loose';
    name = '寬版剪裁上衣';
  } else {
    name = hsl.h > 190 && hsl.h < 230 ? '天空藍牛津襯衫' : '經典剪裁上衣';
  }

  return {
    name,
    category,
    subCategory,
    fit,
    length,
    thermalScore,
    styleTags,
    season,
  };
}
