from __future__ import annotations

from itertools import product

from app.schemas import (
    DailyCapsuleOutfit,
    TravelCapsuleRequest,
    TravelCapsuleResponse,
    WardrobeItemDTO,
)
from app.services.rules_engine import (
    check_silhouette_balance,
    evaluate_color_harmony,
    target_thermal_bounds,
)


def solve_travel_capsule(request: TravelCapsuleRequest) -> TravelCapsuleResponse:
    """
    Combinatorial Travel Capsule Optimizer (Greedy Set-Cover + Pruning).
    Minimizes packed garment count while maximizing non-repeating daily outfits
    within the destination's [temp_min_c, temp_max_c] temperature band.
    """
    items = request.items
    tops = [i for i in items if i.category == "top"]
    bottoms = [i for i in items if i.category == "bottom"]
    outers = [i for i in items if i.category == "outerwear"]
    shoes = [i for i in items if i.category == "shoes"]

    if not tops or not bottoms:
        return TravelCapsuleResponse(
            destination=request.destination,
            trip_days=request.trip_days,
            selected_item_ids=[],
            packed_count=0,
            daily_schedule=[],
            reuse_efficiency=0.0,
        )

    low_min, _ = target_thermal_bounds(request.temp_min_c, 60 if request.rain_expected else 10)
    _, high_max = target_thermal_bounds(request.temp_max_c, 60 if request.rain_expected else 10)
    # Use a practical capsule envelope across day/night swings
    env_min = max(2, min(low_min, high_max) - 1)
    env_max = max(low_min, high_max) + 1

    outer_opts: list[WardrobeItemDTO | None] = [None] + outers
    shoe_opts: list[WardrobeItemDTO | None] = shoes[:2] if shoes else [None]

    valid_combos: list[tuple[list[WardrobeItemDTO], int, str, float]] = []
    for top, bottom, outer, shoe in product(tops, bottoms, outer_opts, shoe_opts):
        combo = [top, bottom]
        if outer:
            combo.append(outer)
        if shoe:
            combo.append(shoe)

        total_th = sum(c.thermal_score for c in combo)
        if not (env_min <= total_th <= env_max):
            continue

        sil_ok, sil_score = check_silhouette_balance(top, bottom, request.allow_oversized)
        if not sil_ok:
            continue

        color_ok, label, color_score = evaluate_color_harmony(combo)
        if not color_ok:
            continue

        combo_score = color_score + sil_score + (3.0 if (request.rain_expected and outer) else 0.0)
        valid_combos.append((combo, total_th, label, combo_score))

    # Fallback relaxation if extreme weather filter yields too few combos
    if len(valid_combos) < request.trip_days:
        for top, bottom in product(tops, bottoms):
            combo = [top, bottom] + (outers[:1] if request.temp_min_c < 18 and outers else []) + (shoes[:1] if shoes else [])
            valid_combos.append((combo, sum(c.thermal_score for c in combo), "精簡實穿膠囊", 8.0))

    # Greedy Set-Cover: iteratively pick item maximizing newly unlocked distinct (top, bottom) pairs
    selected_ids: set[str] = set()
    all_items_by_id = {i.item_id: i for i in items}

    def unlocked_combos(item_id_set: set[str]) -> list[tuple[list[WardrobeItemDTO], int, str, float]]:
        res = []
        seen_tb: set[tuple[str, str]] = set()
        for combo, th, label, score in valid_combos:
            if all(c.item_id in item_id_set for c in combo):
                tb_key = (combo[0].item_id, combo[1].item_id)
                if tb_key not in seen_tb:
                    seen_tb.add(tb_key)
                    res.append((combo, th, label, score))
        return res

    # Seed with the highest-scoring base combo
    valid_combos.sort(key=lambda x: x[3], reverse=True)
    if valid_combos:
        for c in valid_combos[0][0]:
            selected_ids.add(c.item_id)

    while len(unlocked_combos(selected_ids)) < request.trip_days:
        best_next_id: str | None = None
        best_gain = -1.0
        current_count = len(unlocked_combos(selected_ids))

        for candidate in items:
            if candidate.item_id in selected_ids:
                continue
            trial_set = selected_ids | {candidate.item_id}
            new_count = len(unlocked_combos(trial_set))
            gain = new_count - current_count
            # Prefer lighter packing (penalize extra outerwear/shoes slightly)
            bulk_penalty = 0.6 if candidate.category in ("outerwear", "shoes") else 0.0
            effective_gain = gain - bulk_penalty
            if gain > 0 and effective_gain > best_gain:
                best_gain = effective_gain
                best_next_id = candidate.item_id

        if best_next_id is None:
            break
        selected_ids.add(best_next_id)

    # Prune redundant items while preserving >= trip_days distinct combinations
    target_combos = min(request.trip_days, len(unlocked_combos(selected_ids)))
    for candidate_id in list(selected_ids):
        reduced = selected_ids - {candidate_id}
        if len(unlocked_combos(reduced)) >= target_combos and reduced:
            # Keep at least 1 shoe if original had shoes
            if all_items_by_id[candidate_id].category == "shoes" and not any(
                all_items_by_id[i].category == "shoes" for i in reduced
            ):
                continue
            selected_ids = reduced

    pool = unlocked_combos(selected_ids)
    pool.sort(key=lambda x: x[3], reverse=True)

    schedule: list[DailyCapsuleOutfit] = []
    if pool:
        last_top_id: str | None = None
        used_indices: set[int] = set()
        for day in range(1, request.trip_days + 1):
            chosen_idx = None
            for idx, (combo, _, _, _) in enumerate(pool):
                if idx not in used_indices and combo[0].item_id != last_top_id:
                    chosen_idx = idx
                    break
            if chosen_idx is None:
                for idx in range(len(pool)):
                    if idx not in used_indices:
                        chosen_idx = idx
                        break
            if chosen_idx is None:
                chosen_idx = (day - 1) % len(pool)

            used_indices.add(chosen_idx)
            combo, th, label, _ = pool[chosen_idx]
            last_top_id = combo[0].item_id
            schedule.append(
                DailyCapsuleOutfit(
                    day=day,
                    item_ids=[c.item_id for c in combo],
                    total_thermal=th,
                    harmony_label=label,
                    note=f"Day {day} · {label}（保暖指數 {th}）",
                )
            )

    packed_count = len(selected_ids)
    efficiency = round(request.trip_days / max(packed_count, 1), 2)
    return TravelCapsuleResponse(
        destination=request.destination,
        trip_days=request.trip_days,
        selected_item_ids=sorted(selected_ids),
        packed_count=packed_count,
        daily_schedule=schedule,
        reuse_efficiency=efficiency,
    )
