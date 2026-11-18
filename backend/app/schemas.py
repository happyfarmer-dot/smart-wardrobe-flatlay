from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field

CategoryType = Literal["top", "bottom", "outerwear", "dress", "shoes", "accessory"]
FitType = Literal["slim", "regular", "loose"]
LengthType = Literal["cropped", "regular", "long"]
SeasonType = Literal["spring", "summer", "autumn", "winter"]


class HSLColor(BaseModel):
    h: float = Field(..., ge=0, le=360)
    s: float = Field(..., ge=0, le=100)
    l: float = Field(..., ge=0, le=100)


class AutoTagResult(BaseModel):
    """Strict Structured Output schema for one-time Gemini 2.5 Flash auto-tagging."""

    category: CategoryType
    sub_category: str = Field(..., min_length=2, max_length=48)
    fit: FitType
    length: LengthType
    thermal_score: int = Field(..., ge=1, le=5)
    style_tags: list[str] = Field(..., min_length=1, max_length=3)
    season: list[SeasonType] = Field(..., min_length=1, max_length=4)


class WardrobeItemDTO(BaseModel):
    item_id: str
    name: str
    category: CategoryType
    sub_category: str
    fit: FitType
    length: LengthType
    thermal_score: int = Field(..., ge=1, le=5)
    style_tags: list[str]
    season: list[SeasonType]
    primary_hex: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    primary_hsl: HSLColor
    secondary_hex: str | None = None
    secondary_hsl: HSLColor | None = None
    purchase_price: float = Field(default=0.0, ge=0)
    wear_count: int = Field(default=0, ge=0)
    last_worn_at: date | None = None
    image_url: str = ""

    @property
    def cpw(self) -> float:
        return round(self.purchase_price / max(self.wear_count, 1), 2)


class BodyProfileDTO(BaseModel):
    height_cm: float = Field(default=168.0, ge=100, le=230)
    shoulder_width_ratio: float = Field(default=0.28, ge=0.15, le=0.55)
    torso_length_ratio: float = Field(default=0.34, ge=0.20, le=0.50)
    leg_length_ratio: float = Field(default=0.48, ge=0.30, le=0.65)
    shoulder_to_hip_ratio: float = Field(default=1.08, ge=0.70, le=1.60)
    use_head_anchor: bool = False


class WeatherContext(BaseModel):
    feels_like_c: float = Field(default=19.0, ge=-30, le=50)
    rain_prob: int = Field(default=15, ge=0, le=100)
    city: str = "Taipei"


class StylingRequest(BaseModel):
    items: list[WardrobeItemDTO]
    weather: WeatherContext
    occasion: str = "commute"
    anchor_item_id: str | None = None
    allow_oversized: bool = False
    prefer_dormant_90d: bool = True
    reference_date: date | None = None


class OutfitSuggestion(BaseModel):
    style_title: str
    item_ids: list[str] = Field(..., min_length=2, max_length=5)
    reason: str
    harmony_label: str
    total_thermal: int
    score: float
    includes_dormant_awakening: bool = False


class LLMOutfitsResponse(BaseModel):
    """Strict Structured Output schema for Stage-2 Low-Token Gemini styling."""

    outfits: list[LLMOutfitItem] = Field(..., min_length=3, max_length=3)


class LLMOutfitItem(BaseModel):
    style_title: str
    item_ids: list[str] = Field(..., min_length=2, max_length=5)
    reason: str


LLMOutfitsResponse.model_rebuild()


class StylingResponse(BaseModel):
    cache_key: str
    cache_hit: bool
    thermal_bounds: tuple[int, int]
    stage1_candidate_count: int
    total_wardrobe_count: int
    compact_prompt_json: str
    estimated_tokens_compact: int
    estimated_tokens_multimodal_baseline: int
    token_savings_pct: float
    mode_used: Literal["offline_deterministic", "gemini_2_5_flash", "cache"]
    outfits: list[OutfitSuggestion]
    generated_at: datetime


class OOTDCheckRequest(BaseModel):
    planned_date: date
    planned_item_ids: list[str]
    history_logs: list[OOTDLogEntry]
    window_days: int = 14


class OOTDLogEntry(BaseModel):
    worn_date: date
    item_ids: list[str]


class OOTDCheckResponse(BaseModel):
    has_conflict: bool
    conflict_dates: list[date]
    overlap_ratio: float
    warning_message: str | None = None


class TravelCapsuleRequest(BaseModel):
    items: list[WardrobeItemDTO]
    destination: str = "Tokyo"
    trip_days: int = Field(default=5, ge=1, le=21)
    temp_min_c: float = Field(default=12.0, ge=-20, le=45)
    temp_max_c: float = Field(default=21.0, ge=-20, le=45)
    rain_expected: bool = False
    allow_oversized: bool = False


class DailyCapsuleOutfit(BaseModel):
    day: int
    item_ids: list[str]
    total_thermal: int
    harmony_label: str
    note: str


class TravelCapsuleResponse(BaseModel):
    destination: str
    trip_days: int
    selected_item_ids: list[str]
    packed_count: int
    daily_schedule: list[DailyCapsuleOutfit]
    reuse_efficiency: float
