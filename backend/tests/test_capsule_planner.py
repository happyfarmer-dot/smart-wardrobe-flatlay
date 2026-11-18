from app.schemas import HSLColor, TravelCapsuleRequest, WardrobeItemDTO
from app.services.capsule_planner import solve_travel_capsule


def _item(iid: str, cat: str, th: int, h: float, s: float, l: float, fit: str = "regular") -> WardrobeItemDTO:
    return WardrobeItemDTO(
        item_id=iid,
        name=iid,
        category=cat,  # type: ignore[arg-type]
        sub_category=cat,
        fit=fit,  # type: ignore[arg-type]
        length="regular",
        thermal_score=th,
        style_tags=["commute", "casual"],
        season=["spring", "autumn"],
        primary_hex="#E5E5E5",
        primary_hsl=HSLColor(h=h, s=s, l=l),
        purchase_price=1500,
        wear_count=5,
    )


def test_travel_capsule_covers_5_days_with_minimal_pack():
    wardrobe = [
        _item("top1", "top", 2, 0, 5, 95),
        _item("top2", "top", 2, 215, 35, 30),
        _item("top3", "top", 1, 35, 15, 88),
        _item("bot1", "bottom", 2, 220, 40, 25),
        _item("bot2", "bottom", 2, 35, 22, 70),
        _item("out1", "outerwear", 3, 30, 35, 55),
        _item("shoe1", "shoes", 1, 20, 25, 25),
    ]
    req = TravelCapsuleRequest(
        items=wardrobe,
        destination="Kyoto",
        trip_days=5,
        temp_min_c=13.0,
        temp_max_c=20.0,
        rain_expected=False,
    )
    res = solve_travel_capsule(req)
    assert len(res.daily_schedule) == 5
    assert res.packed_count <= 7
    assert res.reuse_efficiency >= 0.7
    # Ensure adjacent days do not repeat exact identical outfits
    for i in range(1, len(res.daily_schedule)):
        assert set(res.daily_schedule[i].item_ids) != set(res.daily_schedule[i - 1].item_ids)
