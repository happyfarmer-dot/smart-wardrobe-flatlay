from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.prompts import (
    STYLING_JSON_SCHEMA,
    STYLING_SYSTEM_INSTRUCTION,
    build_compact_styling_prompt,
)
from app.schemas import (
    LLMOutfitsResponse,
    OutfitSuggestion,
    StylingRequest,
    StylingResponse,
    WardrobeItemDTO,
)
from app.services.rules_engine import (
    build_compact_candidates_payload,
    evaluate_color_harmony,
    is_dormant_90d,
    stage1_filter_and_score,
)

# Simple in-process cache mirror (backed by outfit_recommendations_cache table in PostgreSQL)
_MEMORY_CACHE: dict[str, tuple[datetime, StylingResponse]] = {}


def compute_cache_key(
    candidate_ids: list[str],
    feels_like_c: float,
    rain_prob: int,
    occasion: str,
    anchor_item_id: str | None,
) -> str:
    temp_bucket = round(feels_like_c / 3.0) * 3
    rain_bucket = "wet" if rain_prob >= 50 else "dry"
    raw = json.dumps(
        {
            "ids": sorted(candidate_ids),
            "t": temp_bucket,
            "r": rain_bucket,
            "o": occasion,
            "a": anchor_item_id or "",
        },
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def estimate_tokens(text: str) -> int:
    # Conservative token estimate (~3.5 chars per token for compact JSON/CJK mix)
    return max(1, round(len(text) / 3.5))


def generate_hybrid_recommendations(request: StylingRequest) -> StylingResponse:
    bounds, candidates, offline_outfits = stage1_filter_and_score(
        items=request.items,
        weather=request.weather,
        occasion=request.occasion,
        anchor_item_id=request.anchor_item_id,
        allow_oversized=request.allow_oversized,
        prefer_dormant_90d=request.prefer_dormant_90d,
        ref_date=request.reference_date,
    )

    candidate_ids = [c.item_id for c in candidates]
    cache_key = compute_cache_key(
        candidate_ids=candidate_ids,
        feels_like_c=request.weather.feels_like_c,
        rain_prob=request.weather.rain_prob,
        occasion=request.occasion,
        anchor_item_id=request.anchor_item_id,
    )

    now = datetime.now(timezone.utc)
    cached = _MEMORY_CACHE.get(cache_key)
    if cached and cached[0] > now:
        hit_resp = cached[1].model_copy(update={"cache_hit": True, "mode_used": "cache"})
        return hit_resp

    compact_payload = build_compact_candidates_payload(candidates, request.reference_date)
    compact_prompt = build_compact_styling_prompt(
        feels_like_c=request.weather.feels_like_c,
        rain_prob=request.weather.rain_prob,
        thermal_bounds=bounds,
        occasion=request.occasion,
        anchor_item_id=request.anchor_item_id,
        compact_items=compact_payload,
    )
    compact_tokens = estimate_tokens(STYLING_SYSTEM_INSTRUCTION + "\n" + compact_prompt)
    baseline_tokens = max(compact_tokens + 200, len(request.items) * 520 + 400)
    savings_pct = round((1.0 - compact_tokens / baseline_tokens) * 100.0, 1)

    selected_outfits = offline_outfits
    mode_used: str = "offline_deterministic"

    if settings.gemini_api_key and candidates:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=settings.gemini_api_key)
            resp = client.models.generate_content(
                model=settings.gemini_model,
                contents=[compact_prompt],
                config=types.GenerateContentConfig(
                    system_instruction=STYLING_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=STYLING_JSON_SCHEMA,
                    temperature=0.25,
                    max_output_tokens=300,
                ),
            )
            parsed = LLMOutfitsResponse(**json.loads(resp.text))
            by_id: dict[str, WardrobeItemDTO] = {c.item_id: c for c in candidates}
            hydrated: list[OutfitSuggestion] = []
            for o in parsed.outfits:
                valid_items = [by_id[iid] for iid in o.item_ids if iid in by_id]
                if len(valid_items) >= 2:
                    _, label, _ = evaluate_color_harmony(valid_items)
                    hydrated.append(
                        OutfitSuggestion(
                            style_title=o.style_title,
                            item_ids=[i.item_id for i in valid_items],
                            reason=o.reason,
                            harmony_label=label,
                            total_thermal=sum(i.thermal_score for i in valid_items),
                            score=95.0,
                            includes_dormant_awakening=any(
                                is_dormant_90d(i, request.reference_date) for i in valid_items
                            ),
                        )
                    )
            if hydrated:
                selected_outfits = hydrated
                mode_used = "gemini_2_5_flash"
        except Exception:
            # Graceful fallback to local deterministic scorer
            pass

    response = StylingResponse(
        cache_key=cache_key,
        cache_hit=False,
        thermal_bounds=bounds,
        stage1_candidate_count=len(candidates),
        total_wardrobe_count=len(request.items),
        compact_prompt_json=compact_prompt,
        estimated_tokens_compact=compact_tokens,
        estimated_tokens_multimodal_baseline=baseline_tokens,
        token_savings_pct=savings_pct,
        mode_used=mode_used,  # type: ignore[arg-type]
        outfits=selected_outfits,
        generated_at=now,
    )

    _MEMORY_CACHE[cache_key] = (
        now + timedelta(hours=settings.recommendation_cache_ttl_hours),
        response,
    )
    return response
