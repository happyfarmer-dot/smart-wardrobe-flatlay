import {
  DailyCapsuleOutfit,
  TravelCapsuleResult,
  WardrobeItem,
} from '../types/wardrobe';
import {
  checkSilhouetteBalance,
  evaluateColorHarmony,
  targetThermalBounds,
} from './rulesEngine';

export function solveTravelCapsule(params: {
  items: WardrobeItem[];
  destination: string;
  tripDays: number;
  tempMinC: number;
  tempMaxC: number;
  rainExpected: boolean;
  allowOversized?: boolean;
}): TravelCapsuleResult {
  const {
    items,
    destination,
    tripDays,
    tempMinC,
    tempMaxC,
    rainExpected,
    allowOversized = false,
  } = params;

  const tops = items.filter((i) => i.category === 'top');
  const bottoms = items.filter((i) => i.category === 'bottom');
  const outers = items.filter((i) => i.category === 'outerwear');
  const shoes = items.filter((i) => i.category === 'shoes');

  if (!tops.length || !bottoms.length) {
    return {
      destination,
      tripDays,
      selectedItemIds: [],
      packedCount: 0,
      dailySchedule: [],
      reuseEfficiency: 0,
    };
  }

  const [lowMin] = targetThermalBounds(tempMinC, rainExpected ? 65 : 10);
  const [, highMax] = targetThermalBounds(tempMaxC, rainExpected ? 65 : 10);
  const envMin = Math.max(2, Math.min(lowMin, highMax) - 1);
  const envMax = Math.max(lowMin, highMax) + 1;

  const outerOpts: (WardrobeItem | null)[] = [null, ...outers];
  const shoeOpts: (WardrobeItem | null)[] = shoes.length ? shoes.slice(0, 2) : [null];

  interface ValidCombo {
    combo: WardrobeItem[];
    thermal: number;
    label: string;
    score: number;
  }

  const validCombos: ValidCombo[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      const sil = checkSilhouetteBalance(top, bottom, allowOversized);
      if (!sil.ok) continue;

      for (const outer of outerOpts) {
        for (const shoe of shoeOpts) {
          const combo = [top, bottom, ...(outer ? [outer] : []), ...(shoe ? [shoe] : [])];
          const thermal = combo.reduce((s, c) => s + c.thermalScore, 0);
          if (thermal < envMin || thermal > envMax) continue;

          const harmony = evaluateColorHarmony(combo);
          if (!harmony.ok) continue;

          const score =
            harmony.bonus + sil.bonus + (rainExpected && outer !== null ? 4 : 0);
          validCombos.push({ combo, thermal, label: harmony.label, score });
        }
      }
    }
  }

  if (validCombos.length < tripDays) {
    for (const top of tops) {
      for (const bottom of bottoms) {
        const combo = [
          top,
          bottom,
          ...(tempMinC < 18 && outers[0] ? [outers[0]] : []),
          ...(shoes[0] ? [shoes[0]] : []),
        ];
        validCombos.push({
          combo,
          thermal: combo.reduce((s, c) => s + c.thermalScore, 0),
          label: '精簡膠囊混搭',
          score: 8,
        });
      }
    }
  }

  validCombos.sort((a, b) => b.score - a.score);

  const unlockedCombos = (idSet: Set<string>): ValidCombo[] => {
    const res: ValidCombo[] = [];
    const seenPairs = new Set<string>();
    for (const vc of validCombos) {
      if (vc.combo.every((c) => idSet.has(c.id))) {
        const tbKey = `${vc.combo[0].id}|${vc.combo[1].id}`;
        if (!seenPairs.has(tbKey)) {
          seenPairs.add(tbKey);
          res.push(vc);
        }
      }
    }
    return res;
  };

  let selectedIds = new Set<string>();
  if (validCombos.length > 0) {
    validCombos[0].combo.forEach((c) => selectedIds.add(c.id));
  }

  while (unlockedCombos(selectedIds).length < tripDays) {
    let bestId: string | null = null;
    let bestEffectiveGain = -1;
    const currentCount = unlockedCombos(selectedIds).length;

    for (const candidate of items) {
      if (selectedIds.has(candidate.id)) continue;
      const trial = new Set(selectedIds);
      trial.add(candidate.id);
      const gain = unlockedCombos(trial).length - currentCount;
      const bulkPenalty =
        candidate.category === 'outerwear' || candidate.category === 'shoes' ? 0.6 : 0;
      const effectiveGain = gain - bulkPenalty;
      if (gain > 0 && effectiveGain > bestEffectiveGain) {
        bestEffectiveGain = effectiveGain;
        bestId = candidate.id;
      }
    }

    if (!bestId) break;
    selectedIds.add(bestId);
  }

  // Prune redundant items while preserving target distinct day coverage
  const itemById = new Map(items.map((i) => [i.id, i]));
  const targetCoverage = Math.min(tripDays, unlockedCombos(selectedIds).length);
  for (const id of Array.from(selectedIds)) {
    const trial = new Set(selectedIds);
    trial.delete(id);
    if (trial.size > 0 && unlockedCombos(trial).length >= targetCoverage) {
      if (
        itemById.get(id)?.category === 'shoes' &&
        !Array.from(trial).some((tid) => itemById.get(tid)?.category === 'shoes')
      ) {
        continue;
      }
      selectedIds = trial;
    }
  }

  const pool = unlockedCombos(selectedIds).sort((a, b) => b.score - a.score);
  const schedule: DailyCapsuleOutfit[] = [];

  if (pool.length > 0) {
    let lastTopId: string | null = null;
    const usedIndices = new Set<number>();

    for (let day = 1; day <= tripDays; day++) {
      let chosenIdx = pool.findIndex(
        (vc, idx) => !usedIndices.has(idx) && vc.combo[0].id !== lastTopId
      );
      if (chosenIdx === -1) {
        chosenIdx = pool.findIndex((_, idx) => !usedIndices.has(idx));
      }
      if (chosenIdx === -1) {
        chosenIdx = (day - 1) % pool.length;
      }
      usedIndices.add(chosenIdx);
      const chosen = pool[chosenIdx];
      lastTopId = chosen.combo[0].id;

      schedule.push({
        day,
        itemIds: chosen.combo.map((c) => c.id),
        totalThermal: chosen.thermal,
        harmonyLabel: chosen.label,
        note: `Day ${day} · ${chosen.label}（保暖指數 ${chosen.thermal}）`,
      });
    }
  }

  const packedCount = selectedIds.size;
  return {
    destination,
    tripDays,
    selectedItemIds: Array.from(selectedIds),
    packedCount,
    dailySchedule: schedule,
    reuseEfficiency: Number((tripDays / Math.max(1, packedCount)).toFixed(2)),
  };
}
