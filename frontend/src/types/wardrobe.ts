export type CategoryType = 'top' | 'bottom' | 'outerwear' | 'dress' | 'shoes' | 'accessory';
export type FitType = 'slim' | 'regular' | 'loose';
export type LengthType = 'cropped' | 'regular' | 'long';
export type SeasonType = 'spring' | 'summer' | 'autumn' | 'winter';

export interface HSLColor {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

export interface WardrobeItem {
  id: string;
  name: string;
  imageUrl: string;
  imageSha256: string;
  category: CategoryType;
  subCategory: string;
  fit: FitType;
  length: LengthType;
  thermalScore: number; // 1..5
  styleTags: string[];
  season: SeasonType[];
  primaryHex: string;
  primaryHsl: HSLColor;
  primaryShare?: number;
  secondaryHex?: string;
  secondaryHsl?: HSLColor;
  secondaryShare?: number;
  purchasePrice: number;
  wearCount: number;
  lastWornAt: string | null; // ISO YYYY-MM-DD
}

export interface BodyProfile {
  heightCm: number;
  shoulderWidthRatio: number; // ~0.22..0.38
  torsoLengthRatio: number;   // ~0.26..0.42
  legLengthRatio: number;     // ~0.40..0.58
  shoulderToHipRatio: number; // ~0.85..1.35
  useHeadAnchor: boolean;
  headCutoutUrl: string;
  landmarks: {
    headY: number;     // normalized 0..1
    shoulderY: number; // normalized 0..1
    waistY: number;    // normalized 0..1
    ankleY: number;    // normalized 0..1
    shoulderHalfSpan: number; // normalized 0..0.4
  };
}

export interface WeatherContext {
  city: string;
  feelsLikeC: number;
  rainProb: number;
}

export interface OutfitSuggestion {
  id: string;
  styleTitle: string;
  itemIds: string[];
  reason: string;
  harmonyLabel: string;
  totalThermal: number;
  score: number;
  includesDormantAwakening: boolean;
}

export interface StylingResult {
  cacheKey: string;
  cacheHit: boolean;
  thermalBounds: [number, number];
  stage1CandidateCount: number;
  totalWardrobeCount: number;
  rejectedColorCount: number;
  rejectedSilhouetteCount: number;
  compactPromptJson: string;
  estimatedTokensCompact: number;
  estimatedTokensMultimodalBaseline: number;
  tokenSavingsPct: number;
  outfits: OutfitSuggestion[];
}

export interface OOTDLog {
  id: string;
  wornDate: string; // YYYY-MM-DD
  itemIds: string[];
  signatureHash: string;
  occasion: string;
  weatherTempC: number;
  tuckedIn: boolean;
  notes?: string;
}

export interface OOTDRepeatCheck {
  hasConflict: boolean;
  conflictDates: string[];
  overlapRatio: number;
  warningMessage: string | null;
}

export interface DailyCapsuleOutfit {
  day: number;
  itemIds: string[];
  totalThermal: number;
  harmonyLabel: string;
  note: string;
}

export interface TravelCapsuleResult {
  destination: string;
  tripDays: number;
  selectedItemIds: string[];
  packedCount: number;
  dailySchedule: DailyCapsuleOutfit[];
  reuseEfficiency: number;
}

export interface CanvasLayerItem {
  itemId: string;
  x: number;       // center X inside 520x700 canvas
  y: number;       // center Y inside 520x700 canvas
  scale: number;   // multiplier
  zIndex: number;
  tuckedIn?: boolean;
}

export interface VisionPipelineOutput {
  rawDataUrl: string;
  segmentedDataUrl: string;
  standardizedDataUrl: string;
  primaryHex: string;
  primaryHsl: HSLColor;
  primaryShare: number;
  secondaryHex: string;
  secondaryHsl: HSLColor;
  secondaryShare: number;
  foregroundCoveragePct: number;
  awbGain: { r: number; g: number; b: number };
  aspectRatio: number;
  processingMs: number;
  imageSha256: string;
  suggestedTag: {
    name: string;
    category: CategoryType;
    subCategory: string;
    fit: FitType;
    length: LengthType;
    thermalScore: number;
    styleTags: string[];
    season: SeasonType[];
  };
}
