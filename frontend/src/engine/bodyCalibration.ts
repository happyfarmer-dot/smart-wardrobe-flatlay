import { BodyProfile, CanvasLayerItem, WardrobeItem } from '../types/wardrobe';

export function computeRatiosFromLandmarks(
  landmarks: BodyProfile['landmarks'],
  heightCm: number
): Pick<
  BodyProfile,
  'shoulderWidthRatio' | 'torsoLengthRatio' | 'legLengthRatio' | 'shoulderToHipRatio'
> {
  const totalHeight = Math.max(0.35, landmarks.ankleY - landmarks.headY);
  const torsoSpan = Math.max(0.12, landmarks.waistY - landmarks.shoulderY);
  const legSpan = Math.max(0.18, landmarks.ankleY - landmarks.waistY);

  const torsoLengthRatio = Number((torsoSpan / totalHeight).toFixed(4));
  const legLengthRatio = Number((legSpan / totalHeight).toFixed(4));
  const shoulderWidthRatio = Number(
    Math.min(0.45, Math.max(0.18, landmarks.shoulderHalfSpan * 2)).toFixed(4)
  );
  const shoulderToHipRatio = Number((shoulderWidthRatio / 0.255).toFixed(4));

  void heightCm; // reserved for absolute cm calibration overlays
  return {
    shoulderWidthRatio,
    torsoLengthRatio,
    legLengthRatio,
    shoulderToHipRatio,
  };
}

/**
 * Computes proportional 2D flat-lay canvas placements from calibrated user body ratios.
 */
export function buildCalibratedCanvasLayout(
  items: WardrobeItem[],
  profile: BodyProfile,
  tuckedIn: boolean
): CanvasLayerItem[] {
  const torsoScale = Math.max(0.84, Math.min(1.18, profile.torsoLengthRatio / 0.34));
  const legScale = Math.max(0.84, Math.min(1.22, profile.legLengthRatio / 0.48));
  const shoulderScale = Math.max(0.88, Math.min(1.16, profile.shoulderWidthRatio / 0.28));

  const layers: CanvasLayerItem[] = [];
  const headOffset = profile.useHeadAnchor ? 58 : 0;

  const top = items.find((i) => i.category === 'top' || i.category === 'dress');
  const bottom = items.find((i) => i.category === 'bottom');
  const outer = items.find((i) => i.category === 'outerwear');
  const shoes = items.find((i) => i.category === 'shoes');
  const hasBothTopAndOuter = Boolean(top && outer);

  if (bottom) {
    layers.push({
      itemId: bottom.id,
      x: 260,
      y: 382 + headOffset * 0.45,
      scale: Number((0.98 * legScale).toFixed(2)),
      zIndex: 10,
    });
  }

  if (top) {
    layers.push({
      itemId: top.id,
      x: hasBothTopAndOuter ? 216 : 260,
      y: (tuckedIn ? 226 : 212) + headOffset * 0.45,
      scale: Number((0.88 * ((torsoScale + shoulderScale) / 2)).toFixed(2)),
      zIndex: 20,
      tuckedIn,
    });
  }

  if (outer) {
    layers.push({
      itemId: outer.id,
      x: hasBothTopAndOuter ? 314 : 260,
      y: 238 + headOffset * 0.45,
      scale: Number((1.02 * ((torsoScale + shoulderScale) / 2)).toFixed(2)),
      zIndex: 30,
    });
  }

  if (shoes) {
    layers.push({
      itemId: shoes.id,
      x: 260,
      y: 604 + headOffset * 0.3,
      scale: 0.56,
      zIndex: 40,
    });
  }

  return layers;
}

export const BODY_PRESETS: {
  label: string;
  heightCm: number;
  landmarks: BodyProfile['landmarks'];
}[] = [
  {
    label: '標準均衡 (168 cm)',
    heightCm: 168,
    landmarks: { headY: 0.08, shoulderY: 0.22, waistY: 0.48, ankleY: 0.90, shoulderHalfSpan: 0.14 },
  },
  {
    label: '長腿高挑 (176 cm)',
    heightCm: 176,
    landmarks: { headY: 0.07, shoulderY: 0.20, waistY: 0.43, ankleY: 0.92, shoulderHalfSpan: 0.135 },
  },
  {
    label: '嬌小俐落 (156 cm)',
    heightCm: 156,
    landmarks: { headY: 0.10, shoulderY: 0.25, waistY: 0.51, ankleY: 0.89, shoulderHalfSpan: 0.13 },
  },
  {
    label: '寬肩倒三角 (178 cm)',
    heightCm: 178,
    landmarks: { headY: 0.07, shoulderY: 0.21, waistY: 0.48, ankleY: 0.91, shoulderHalfSpan: 0.168 },
  },
];
