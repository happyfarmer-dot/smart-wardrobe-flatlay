import { StylingResult, WardrobeItem, WeatherContext } from '../types/wardrobe';
import {
  isDormant90d,
  REFERENCE_TODAY,
  stage1FilterAndScore,
} from './rulesEngine';

const FRONTEND_CACHE = new Map<string, StylingResult>();

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function runHybridStylistEngine(params: {
  items: WardrobeItem[];
  weather: WeatherContext;
  occasion: string;
  anchorItemId: string | null;
  allowOversized: boolean;
  preferDormant90d: boolean;
}): StylingResult {
  const {
    items,
    weather,
    occasion,
    anchorItemId,
    allowOversized,
    preferDormant90d,
  } = params;

  const {
    thermalBounds,
    candidates,
    outfits,
    rejectedColorCount,
    rejectedSilhouetteCount,
  } = stage1FilterAndScore({
    items,
    weather,
    occasion,
    anchorItemId,
    allowOversized,
    preferDormant90d,
    refDate: REFERENCE_TODAY,
  });

  const tempBucket = Math.round(weather.feelsLikeC / 3) * 3;
  const rainBucket = weather.rainProb >= 50 ? 'wet' : 'dry';
  const cacheKey = simpleHash(
    JSON.stringify({
      ids: candidates.map((c) => c.id).sort(),
      tempBucket,
      rainBucket,
      occasion,
      anchorItemId: anchorItemId || '',
      allowOversized,
      preferDormant90d,
    })
  );

  const cached = FRONTEND_CACHE.get(cacheKey);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const compactCandidates = candidates.map((item) => ({
    id: item.id.replace('item-', ''),
    c: item.category,
    sub: item.subCategory,
    f: item.fit,
    l: item.length,
    th: item.thermalScore,
    hx: item.primaryHex,
    st: item.styleTags.slice(0, 2),
    dorm: isDormant90d(item, REFERENCE_TODAY),
  }));

  const compactPromptJson =
    `ctx: temp=${weather.feelsLikeC}C, rain=${weather.rainProb}%, target_thermal=${thermalBounds[0]}-${thermalBounds[1]}, occasion=${occasion}, anchor=${
      anchorItemId ? anchorItemId.replace('item-', '') : 'none'
    }\nitems:\n` + JSON.stringify(compactCandidates);

  const estimatedTokensCompact = Math.max(48, Math.round((compactPromptJson.length + 220) / 3.5));
  const estimatedTokensMultimodalBaseline = Math.max(
    estimatedTokensCompact + 500,
    items.length * 540 + 420
  );
  const tokenSavingsPct = Number(
    ((1 - estimatedTokensCompact / estimatedTokensMultimodalBaseline) * 100).toFixed(1)
  );

  const result: StylingResult = {
    cacheKey,
    cacheHit: false,
    thermalBounds,
    stage1CandidateCount: candidates.length,
    totalWardrobeCount: items.length,
    rejectedColorCount,
    rejectedSilhouetteCount,
    compactPromptJson,
    estimatedTokensCompact,
    estimatedTokensMultimodalBaseline,
    tokenSavingsPct,
    outfits,
  };

  FRONTEND_CACHE.set(cacheKey, result);
  return result;
}
