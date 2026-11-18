import {
  HSLColor,
  OOTDLog,
  OOTDRepeatCheck,
  OutfitSuggestion,
  WardrobeItem,
  WeatherContext,
} from '../types/wardrobe';

export const REFERENCE_TODAY = '2026-11-18';

export function targetThermalBounds(feelsLikeC: number, rainProb: number): [number, number] {
  let low: number;
  let high: number;

  if (feelsLikeC >= 27) {
    low = 2;
    high = 4;
  } else if (feelsLikeC >= 22) {
    low = 3;
    high = 5;
  } else if (feelsLikeC >= 16) {
    low = 4;
    high = 7;
  } else if (feelsLikeC >= 10) {
    low = 6;
    high = 9;
  } else {
    low = 8;
    high = 12;
  }

  if (rainProb >= 50) {
    low += 1;
    high += 1;
  }
  return [low, high];
}

export function isNeutralHsl(hsl: HSLColor): boolean {
  return hsl.s < 18 || hsl.l < 16 || hsl.l > 88;
}

export function circularHueDiff(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return Math.min(diff, 360 - diff);
}

export function evaluateColorHarmony(items: WardrobeItem[]): {
  ok: boolean;
  label: string;
  bonus: number;
} {
  const chromatics = items
    .map((item) => item.primaryHsl)
    .filter((hsl) => !isNeutralHsl(hsl));

  if (chromatics.length <= 1) {
    return { ok: true, label: '60-30-10 中性極簡平衡', bonus: 18 };
  }

  let bestBonus = 0;
  let bestLabel = '和諧配色';

  for (let i = 0; i < chromatics.length; i++) {
    for (let j = i + 1; j < chromatics.length; j++) {
      const c1 = chromatics[i];
      const c2 = chromatics[j];
      const delta = circularHueDiff(c1.h, c2.h);

      if (c1.s > 45 && c2.s > 45 && delta > 50 && delta < 140) {
        return { ok: false, label: '色彩飽和度衝突', bonus: -999 };
      }

      let bonus = 0;
      let label = '';
      if (delta <= 15) {
        bonus = 20;
        label = '同色系漸層 (Monochromatic)';
      } else if (delta <= 38) {
        bonus = 16;
        label = '鄰近和諧色 (Analogous)';
      } else if (delta >= 150 && delta <= 205) {
        bonus = 14;
        label = '60-30-10 互補對比 (Complementary)';
      } else if (c1.s <= 45 || c2.s <= 45) {
        bonus = 10;
        label = '低飽和莫蘭迪平衡';
      } else {
        return { ok: false, label: '多色相衝突', bonus: -999 };
      }

      if (bonus > bestBonus) {
        bestBonus = bonus;
        bestLabel = label;
      }
    }
  }

  return { ok: true, label: bestLabel, bonus: bestBonus };
}

export function checkSilhouetteBalance(
  top: WardrobeItem,
  bottom: WardrobeItem,
  allowOversized: boolean
): { ok: boolean; bonus: number } {
  const isDoubleLooseLong =
    top.fit === 'loose' &&
    top.length === 'long' &&
    bottom.fit === 'loose' &&
    bottom.length === 'long';

  if (isDoubleLooseLong && !allowOversized) {
    return { ok: false, bonus: -999 };
  }

  let bonus = 5;
  if ((top.length === 'cropped' || top.fit === 'slim') && bottom.fit === 'loose') {
    bonus = 12;
  } else if (top.fit === 'loose' && (bottom.fit === 'slim' || bottom.fit === 'regular')) {
    bonus = 10;
  } else if (top.fit === 'regular' && bottom.fit === 'regular') {
    bonus = 8;
  }

  return { ok: true, bonus };
}

export function computeCpw(item: WardrobeItem): number {
  return Math.round(item.purchasePrice / Math.max(1, item.wearCount));
}

export function daysSinceLastWorn(item: WardrobeItem, refIso: string = REFERENCE_TODAY): number {
  if (!item.lastWornAt) return 999;
  const tRef = new Date(refIso + 'T00:00:00').getTime();
  const tLast = new Date(item.lastWornAt + 'T00:00:00').getTime();
  return Math.max(0, Math.round((tRef - tLast) / (1000 * 60 * 60 * 24)));
}

export function isDormant90d(item: WardrobeItem, refIso: string = REFERENCE_TODAY): boolean {
  return daysSinceLastWorn(item, refIso) >= 90;
}

export function awakeningWeight(item: WardrobeItem, refIso: string = REFERENCE_TODAY): number {
  if (!isDormant90d(item, refIso)) return 0;
  return Number((Math.log1p(computeCpw(item)) * 1.8).toFixed(2));
}

export function stage1FilterAndScore(params: {
  items: WardrobeItem[];
  weather: WeatherContext;
  occasion: string;
  anchorItemId: string | null;
  allowOversized: boolean;
  preferDormant90d: boolean;
  refDate?: string;
}): {
  thermalBounds: [number, number];
  candidates: WardrobeItem[];
  outfits: OutfitSuggestion[];
  rejectedColorCount: number;
  rejectedSilhouetteCount: number;
} {
  const {
    items,
    weather,
    occasion,
    anchorItemId,
    allowOversized,
    preferDormant90d,
    refDate = REFERENCE_TODAY,
  } = params;

  const bounds = targetThermalBounds(weather.feelsLikeC, weather.rainProb);
  const [tMin, tMax] = bounds;

  const tops = items.filter((i) => i.category === 'top');
  const bottoms = items.filter((i) => i.category === 'bottom');
  const outers = items.filter((i) => i.category === 'outerwear');
  const shoes = items.filter((i) => i.category === 'shoes');

  if (!tops.length || !bottoms.length) {
    return {
      thermalBounds: bounds,
      candidates: [],
      outfits: [],
      rejectedColorCount: 0,
      rejectedSilhouetteCount: 0,
    };
  }

  const outerOpts: (WardrobeItem | null)[] = [null, ...outers];
  const shoeOpts: (WardrobeItem | null)[] = shoes.length ? shoes : [null];

  let rejectedColorCount = 0;
  let rejectedSilhouetteCount = 0;
  const scored: OutfitSuggestion[] = [];
  const candidateIdSet = new Set<string>();

  const evaluatePass = (relaxLevel: number) => {
    for (const top of tops) {
      for (const bottom of bottoms) {
        const sil = checkSilhouetteBalance(top, bottom, allowOversized);
        if (!sil.ok && relaxLevel < 2) {
          if (relaxLevel === 0) rejectedSilhouetteCount++;
          continue;
        }

        for (const outer of outerOpts) {
          if (weather.feelsLikeC < 17 && outers.length > 0 && outer === null && relaxLevel === 0) {
            continue;
          }

          for (const shoe of shoeOpts) {
            const combo = [top, bottom, ...(outer ? [outer] : []), ...(shoe ? [shoe] : [])];
            if (anchorItemId && !combo.some((c) => c.id === anchorItemId)) {
              continue;
            }

            const totalTh = combo.reduce((sum, c) => sum + c.thermalScore, 0);
            const tol = relaxLevel === 0 ? 0 : 1;
            if (totalTh < tMin - tol || totalTh > tMax + tol) {
              continue;
            }

            const harmony = evaluateColorHarmony(combo);
            if (!harmony.ok && relaxLevel === 0) {
              rejectedColorCount++;
              continue;
            }

            const occasionHits = combo.filter((c) =>
              c.styleTags.some((t) => t.toLowerCase() === occasion.toLowerCase())
            ).length;
            if (occasion !== 'all' && occasionHits === 0 && relaxLevel === 0) {
              continue;
            }

            const dormantItems = combo.filter((c) => isDormant90d(c, refDate));
            const dormBonus = preferDormant90d
              ? dormantItems.reduce((s, c) => s + awakeningWeight(c, refDate), 0)
              : 0;
            const rainBonus = weather.rainProb >= 50 && outer !== null ? 6 : 0;
            const colorScore = harmony.ok ? harmony.bonus : 3;
            const label = harmony.ok ? harmony.label : '混搭彈性配色';

            const score = Number(
              (
                colorScore +
                Math.max(0, sil.bonus) +
                occasionHits * 7.5 +
                dormBonus +
                rainBonus
              ).toFixed(2)
            );

            combo.forEach((c) => candidateIdSet.add(c.id));

            const dormNote =
              dormantItems.length && preferDormant90d
                ? `；特別喚醒超過 90 天未穿的「${dormantItems[0].name}」降低 CPW`
                : '';
            const weatherNote =
              weather.rainProb >= 50 && outer
                ? `，搭配外層應對 ${weather.rainProb}% 降雨機率`
                : '';

            scored.push({
              id: `outfit-${combo.map((c) => c.id).join('-')}`,
              styleTitle: `${translateOccasion(occasion)} · ${label.split(' ')[0]}`,
              itemIds: combo.map((c) => c.id),
              reason: `${label}，總保暖係數 ${totalTh} 貼合體感 ${weather.feelsLikeC}°C${weatherNote}${dormNote}。`,
              harmonyLabel: label,
              totalThermal: totalTh,
              score,
              includesDormantAwakening: dormantItems.length > 0,
            });
          }
        }
      }
    }
  };

  for (const level of [0, 1, 2]) {
    evaluatePass(level);
    if (scored.length >= 3) break;
  }

  scored.sort((a, b) => b.score - a.score);
  const distinct: OutfitSuggestion[] = [];
  const seenCores = new Set<string>();
  for (const o of scored) {
    const coreKey = [...o.itemIds].slice(0, 3).sort().join('|');
    if (!seenCores.has(coreKey)) {
      seenCores.add(coreKey);
      distinct.push(o);
    }
    if (distinct.length === 3) break;
  }

  let candidates = items.filter((i) => candidateIdSet.has(i.id)).slice(0, 16);
  if (candidates.length === 0) candidates = items.slice(0, 10);

  return {
    thermalBounds: bounds,
    candidates,
    outfits: distinct,
    rejectedColorCount,
    rejectedSilhouetteCount,
  };
}

export function translateOccasion(occasion: string): string {
  switch (occasion) {
    case 'commute':
      return '都會通勤';
    case 'date':
      return '質感約會';
    case 'vintage':
      return '美式復古';
    case 'minimal':
      return '極簡日常';
    case 'casual':
      return '輕鬆週末';
    default:
      return '精選風格';
  }
}

export function computeOutfitSignature(itemIds: string[]): string {
  return [...itemIds].sort().join('|');
}

export function checkOotdRepeat(
  plannedDate: string,
  plannedItemIds: string[],
  historyLogs: OOTDLog[],
  windowDays: number = 14
): OOTDRepeatCheck {
  if (plannedItemIds.length === 0) {
    return { hasConflict: false, conflictDates: [], overlapRatio: 0, warningMessage: null };
  }

  const plannedSet = new Set(plannedItemIds);
  const targetMs = new Date(plannedDate + 'T00:00:00').getTime();
  const conflictDates: string[] = [];
  let maxOverlap = 0;

  for (const log of historyLogs) {
    const logMs = new Date(log.wornDate + 'T00:00:00').getTime();
    const diffDays = Math.abs(Math.round((targetMs - logMs) / (1000 * 60 * 60 * 24)));
    if (diffDays === 0 || diffDays > windowDays) continue;

    const histSet = new Set(log.itemIds);
    let intersection = 0;
    plannedSet.forEach((id) => {
      if (histSet.has(id)) intersection++;
    });
    const union = new Set([...plannedItemIds, ...log.itemIds]).size;
    const overlap = union > 0 ? intersection / union : 0;

    if (overlap > maxOverlap) maxOverlap = overlap;
    if (overlap >= 0.65) {
      conflictDates.push(log.wornDate);
    }
  }

  const hasConflict = conflictDates.length > 0;
  return {
    hasConflict,
    conflictDates: conflictDates.sort(),
    overlapRatio: Number(maxOverlap.toFixed(2)),
    warningMessage: hasConflict
      ? `防撞衫提醒：此套組合與近 ${windowDays} 天內（${conflictDates.join('、')}）穿搭重疊率高達 ${Math.round(
          maxOverlap * 100
        )}%，建議微調上衣或外套以保持新鮮感。`
      : null,
  };
}
