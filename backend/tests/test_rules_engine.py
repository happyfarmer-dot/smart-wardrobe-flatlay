from datetime import date, timedelta

from app.schemas import HSLColor, OOTDLogEntry, WardrobeItemDTO, WeatherContext
from app.services.rules_engine import (
    check_ootd_repeat,
    check_silhouette_balance,
    evaluate_color_harmony,
    stage1_filter_and_score,
    target_thermal_bounds,
)


def make_item(
    item_id: str,
    category: str = "top",
    fit: str = "regular",
    length: str = "regular",
    thermal: int = 2,
    h: float = 0.0,
    s: float = 0.0,
    l: float = 95.0,
    price: float = 2000.0,
    wear_count: int = 10,
    last_worn_at: date | None = None,
    style_tags: list[str] | None = None,
) -> WardrobeItemDTO:
    return WardrobeItemDTO(
        item_id=item_id,
        name=f"Item {item_id}",
        category=category,  # type: ignore[arg-type]
        sub_category="test_item",
        fit=fit,  # type: ignore[arg-type]
        length=length,  # type: ignore[arg-type]
        thermal_score=thermal,
        style_tags=style_tags or ["commute"],
        season=["spring", "autumn"],
        primary_hex="#FFFFFF",
        primary_hsl=HSLColor(h=h, s=s, l=l),
        purchase_price=price,
        wear_count=wear_count,
        last_worn_at=last_worn_at,
    )


def test_thermal_bounds_shift_with_rain():
    assert target_thermal_bounds(20.0, 10) == (4, 7)
    assert target_thermal_bounds(20.0, 80) == (5, 8)
    assert target_thermal_bounds(8.0, 20) == (8, 12)


def test_silhouette_blocks_double_loose_long_by_default():
    top = make_item("t1", category="top", fit="loose", length="long")
    bottom = make_item("b1", category="bottom", fit="loose", length="long")

    ok_default, _ = check_silhouette_balance(top, bottom, allow_oversized=False)
    ok_oversized, _ = check_silhouette_balance(top, bottom, allow_oversized=True)

    assert not ok_default
    assert ok_oversized


def test_color_harmony_rejects_high_saturation_clash():
    bright_orange = make_item("t1", category="top", h=25, s=85, l=50)
    bright_green = make_item("b1", category="bottom", h=125, s=80, l=45)
    ok, label, _ = evaluate_color_harmony([bright_orange, bright_green])
    assert not ok
    assert "衝突" in label


def test_color_harmony_accepts_neutral_plus_accent():
    white_shirt = make_item("t1", category="top", h=40, s=5, l=94)
    navy_jeans = make_item("b1", category="bottom", h=215, s=45, l=28)
    ok, _, score = evaluate_color_harmony([white_shirt, navy_jeans])
    assert ok
    assert score > 10


def test_dormant_90d_item_receives_awakening_boost():
    today = date(2026, 11, 18)
    recent = make_item("t_recent", category="top", price=1000, wear_count=20, last_worn_at=today - timedelta(days=5))
    dormant = make_item("t_dormant", category="top", price=4500, wear_count=1, last_worn_at=today - timedelta(days=120))
    bottom = make_item("b1", category="bottom", price=2000, wear_count=10, last_worn_at=today - timedelta(days=10))
    shoes = make_item("s1", category="shoes", thermal=1, price=3000, wear_count=15, last_worn_at=today - timedelta(days=3))

    _, _, outfits = stage1_filter_and_score(
        items=[recent, dormant, bottom, shoes],
        weather=WeatherContext(feels_like_c=23.0, rain_prob=10),
        occasion="commute",
        prefer_dormant_90d=True,
        ref_date=today,
    )
    assert outfits
    assert "t_dormant" in outfits[0].item_ids
    assert outfits[0].includes_dormant_awakening


def test_ootd_anti_repeat_detects_overlap():
    today = date(2026, 11, 18)
    history = [
        OOTDLogEntry(worn_date=today - timedelta(days=4), item_ids=["t1", "b1", "s1"]),
    ]
    res = check_ootd_repeat(today, ["t1", "b1", "s1"], history, window_days=14)
    assert res.has_conflict
    assert res.overlap_ratio == 1.0
    assert res.warning_message is not None
