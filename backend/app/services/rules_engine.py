from __future__ import annotations

import hashlib
import math
from datetime import date
from itertools import product

from app.schemas import (
    HSLColor,
    OOTDCheckResponse,
    OOTDLogEntry,
    OutfitSuggestion,
    WardrobeItemDTO,
    WeatherContext,
)


def target_thermal_bounds(feels_like_c: float, rain_prob: int) -> tuple[int, int]:
    if feels_like_c >= 27:
        low, high = 2, 4
    elif feels_like_c >= 22:
        low, high = 3, 5
    elif feels_like_c >= 16:
        low, high = 4, 7
    elif feels_like_c >= 10:
        low, high = 6, 9
    else:
        low, high = 8, 12

    if rain_prob >= 50:
        low += 1
        high += 1
    return low, high


def is_neutral_hsl(hsl: HSLColor) -> bool:
    return hsl.s < 18.0 or hsl.l < 16.0 or hsl.l > 88.0


def circular_hue_diff(h1: float, h2: float) -> float:
    diff = abs(h1 - h2) % 360.0
    return min(diff, 360.0 - diff)


def evaluate_color_harmony(items: list[WardrobeItemDTO]) -> tuple[bool, str, float]:
    """Evaluate 60-30-10, monochromatic, analogous, or complementary color harmony."""
    chromatics = [item.primary_hsl for item in items if not is_neutral_hsl(item.primary_hsl)]

    if len(chromatics) <= 1:
        return True, "60-30-10 中性極簡平衡", 18.0

    best_bonus = 0.0
    best_label = "和諧配色"

    for i in range(len(chromatics)):
        for j in range(i + 1, len(chromatics)):
            c1, c2 = chromatics[i], chromatics[j]
            delta = circular_hue_diff(c1.h, c2.h)

            if c1.s > 45.0 and c2.s > 45.0 and 50.0 < delta < 140.0:
                return False, "色彩飽和度衝突", -999.0

            if delta <= 15.0:
                bonus, label = 20.0, "同色系漸層 (Monochromatic)"
            elif delta <= 38.0:
                bonus, label = 16.0, "鄰近和諧色 (Analogous)"
            elif 150.0 <= delta <= 205.0:
                bonus, label = 14.0, "60-30-10 互補對比 (Complementary)"
            elif c1.s <= 45.0 or c2.s <= 45.0:
                bonus, label = 10.0, "低飽和莫蘭迪平衡"
            else:
                return False, "多色相雜訊過高", -999.0

            if bonus > best_bonus:
                best_bonus = bonus
                best_label = label

    return True, best_label, best_bonus


def check_silhouette_balance(
    top: WardrobeItemDTO,
    bottom: WardrobeItemDTO,
    allow_oversized: bool = False,
) -> tuple[bool, float]:
    """Reject loose+long top paired with loose+long bottom unless oversized mode is enabled."""
    is_double_heavy = (
        top.fit == "loose"
        and top.length == "long"
        and bottom.fit == "loose"
        and bottom.length == "long"
    )
    if is_double_heavy and not allow_oversized:
        return False, -999.0

    bonus = 4.0
    if (top.length == "cropped" or top.fit == "slim") and bottom.fit == "loose":
        bonus = 12.0
    elif top.fit == "loose" and bottom.fit in ("slim", "regular"):
        bonus = 10.0
    elif top.fit == "regular" and bottom.fit == "regular":
        bonus = 8.0
    return True, bonus


def is_dormant_90d(item: WardrobeItemDTO, ref_date: date | None = None) -> bool:
    today = ref_date or date.today()
    if item.last_worn_at is None:
        return True
    return (today - item.last_worn_at).days >= 90


def awakening_weight(item: WardrobeItemDTO, ref_date: date | None = None) -> float:
    if not is_dormant_90d(item, ref_date):
        return 0.0
    return round(math.log1p(item.cpw) * 1.8, 3)


def stage1_filter_and_score(
    items: list[WardrobeItemDTO],
    weather: WeatherContext,
    occasion: str = "commute",
    anchor_item_id: str | None = None,
    allow_oversized: bool = False,
    prefer_dormant_90d: bool = True,
    ref_date: date | None = None,
) -> tuple[tuple[int, int], list[WardrobeItemDTO], list[OutfitSuggestion]]:
    """
    Stage-1 Local Physical & Aesthetic Rules Engine.
    Filters wardrobe down to viable candidate items and builds top scored legal outfits.
    """
    bounds = target_thermal_bounds(weather.feels_like_c, weather.rain_prob)
    t_min, t_max = bounds

    tops = [i for i in items if i.category == "top"]
    bottoms = [i for i in items if i.category == "bottom"]
    outers = [i for i in items if i.category == "outerwear"]
    shoes_list = [i for i in items if i.category == "shoes"]

    if not tops or not bottoms:
        return bounds, [], []

    if not shoes_list:
        shoes_list = []

    outer_options: list[WardrobeItemDTO | None] = [None] + outers
    shoe_options: list[WardrobeItemDTO | None] = shoes_list if shoes_list else [None]

    scored_outfits: list[OutfitSuggestion] = []
    candidate_ids_set: set[str] = set()

    def evaluate_combo(relax_level: int) -> None:
        for top, bottom, outer, shoe in product(tops, bottoms, outer_options, shoe_options):
            combo = [top, bottom]
            if outer:
                combo.append(outer)
            if shoe:
                combo.append(shoe)

            if anchor_item_id and all(c.item_id != anchor_item_id for c in combo):
                continue

            total_th = sum(c.thermal_score for c in combo)
            tolerance = 0 if relax_level == 0 else 1
            if not (t_min - tolerance <= total_th <= t_max + tolerance):
                continue

            # Require outerwear in rainy or chilly weather when available
            if weather.feels_like_c < 17 and outers and outer is None and relax_level == 0:
                continue

            sil_ok, sil_bonus = check_silhouette_balance(top, bottom, allow_oversized)
            if not sil_ok and relax_level < 2:
                continue

            color_ok, harmony_label, color_bonus = evaluate_color_harmony(combo)
            if not color_ok and relax_level == 0:
                continue
            if not color_ok:
                color_bonus = 2.0
                harmony_label = "風格彈性混搭"

            occasion_hits = sum(1 for c in combo if occasion.lower() in [t.lower() for t in c.style_tags])
            if occasion != "all" and occasion_hits == 0 and relax_level == 0:
                continue

            dormant_items = [c for c in combo if is_dormant_90d(c, ref_date)]
            dorm_bonus = (
                sum(awakening_weight(c, ref_date) for c in dormant_items)
                if prefer_dormant_90d
                else 0.0
            )
            rain_bonus = 6.0 if (weather.rain_prob >= 50 and outer is not None) else 0.0
            total_score = round(
                color_bonus + max(sil_bonus, 0.0) + occasion_hits * 7.5 + dorm_bonus + rain_bonus,
                2,
            )

            for c in combo:
                candidate_ids_set.add(c.item_id)

            dorm_note = (
                f"；喚醒冷凍單品「{dormant_items[0].name}」降本 CPW"
                if dormant_items and prefer_dormant_90d
                else ""
            )
            reason = (
                f"{harmony_label}，總保暖係數 {total_th} 貼合 {weather.feels_like_c:.0f}°C"
                f"{dorm_note}。"
            )
            scored_outfits.append(
                OutfitSuggestion(
                    style_title=f"{occasion.replace('_', ' ').title()} · {harmony_label.split(' ')[0]}",
                    item_ids=[c.item_id for c in combo],
                    reason=reason,
                    harmony_label=harmony_label,
                    total_thermal=total_th,
                    score=total_score,
                    includes_dormant_awakening=bool(dormant_items),
                )
            )

    for level in (0, 1, 2):
        evaluate_combo(level)
        if len(scored_outfits) >= 3:
            break

    # Deduplicate outfits keeping highest-scoring distinct core combinations
    scored_outfits.sort(key=lambda o: o.score, reverse=True)
    distinct: list[OutfitSuggestion] = []
    seen_cores: set[tuple[str, ...]] = set()
    for outfit in scored_outfits:
        core_key = tuple(sorted(outfit.item_ids[:3]))
        if core_key not in seen_cores:
            seen_cores.add(core_key)
            distinct.append(outfit)
        if len(distinct) == 3:
            break

    # Cap Stage-1 candidate items sent to Stage-2 LLM to <= 16 items
    candidates = [i for i in items if i.item_id in candidate_ids_set][:16]
    if not candidates:
        candidates = items[:12]

    return bounds, candidates, distinct


def build_compact_candidates_payload(
    candidates: list[WardrobeItemDTO],
    ref_date: date | None = None,
) -> list[dict]:
    return [
        {
            "id": item.item_id,
            "c": item.category,
            "sub": item.sub_category,
            "f": item.fit,
            "l": item.length,
            "th": item.thermal_score,
            "hx": item.primary_hex,
            "st": item.style_tags[:2],
            "dorm": is_dormant_90d(item, ref_date),
        }
        for item in candidates
    ]


def compute_outfit_signature(item_ids: list[str]) -> str:
    canonical = "|".join(sorted(item_ids))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def check_ootd_repeat(
    planned_date: date,
    planned_item_ids: list[str],
    history_logs: list[OOTDLogEntry],
    window_days: int = 14,
) -> OOTDCheckResponse:
    planned_set = set(planned_item_ids)
    if not planned_set:
        return OOTDCheckResponse(has_conflict=False, conflict_dates=[], overlap_ratio=0.0)

    conflict_dates: list[date] = []
    max_overlap = 0.0

    for entry in history_logs:
        day_diff = abs((planned_date - entry.worn_date).days)
        if day_diff == 0 or day_diff > window_days:
            continue
        hist_set = set(entry.item_ids)
        union_size = len(planned_set | hist_set)
        overlap = len(planned_set & hist_set) / union_size if union_size else 0.0
        if overlap > max_overlap:
            max_overlap = overlap
        if overlap >= 0.65:
            conflict_dates.append(entry.worn_date)

    has_conflict = len(conflict_dates) > 0
    warning = (
        f"注意：此穿搭與過去 {window_days} 天內（{', '.join(d.isoformat() for d in conflict_dates)}）重複度達 {round(max_overlap * 100)}%，建議替換上衣或外搭避免撞衫。"
        if has_conflict
        else None
    )
    return OOTDCheckResponse(
        has_conflict=has_conflict,
        conflict_dates=sorted(conflict_dates),
        overlap_ratio=round(max_overlap, 2),
        warning_message=warning,
    )
