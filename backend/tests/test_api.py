from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_hybrid_styling_endpoint_and_cache_hit():
    payload = {
        "items": [
            {
                "item_id": "t1",
                "name": "White Oxford",
                "category": "top",
                "sub_category": "oxford_shirt",
                "fit": "regular",
                "length": "regular",
                "thermal_score": 2,
                "style_tags": ["commute"],
                "season": ["spring", "autumn"],
                "primary_hex": "#F5F4EF",
                "primary_hsl": {"h": 48, "s": 22, "l": 95},
                "purchase_price": 2400,
                "wear_count": 8,
            },
            {
                "item_id": "b1",
                "name": "Indigo Jeans",
                "category": "bottom",
                "sub_category": "straight_denim",
                "fit": "regular",
                "length": "long",
                "thermal_score": 2,
                "style_tags": ["commute", "vintage"],
                "season": ["spring", "autumn", "winter"],
                "primary_hex": "#2D4059",
                "primary_hsl": {"h": 214, "s": 33, "l": 26},
                "purchase_price": 3800,
                "wear_count": 12,
            },
            {
                "item_id": "s1",
                "name": "Espresso Loafers",
                "category": "shoes",
                "sub_category": "penny_loafer",
                "fit": "regular",
                "length": "regular",
                "thermal_score": 1,
                "style_tags": ["commute"],
                "season": ["spring", "autumn"],
                "primary_hex": "#4A3228",
                "primary_hsl": {"h": 18, "s": 30, "l": 23},
                "purchase_price": 5200,
                "wear_count": 1,
            },
        ],
        "weather": {"feels_like_c": 21.0, "rain_prob": 10, "city": "Taipei"},
        "occasion": "commute",
    }

    r1 = client.post("/api/v1/styling/recommend", json=payload)
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["cache_hit"] is False
    assert d1["token_savings_pct"] > 50.0
    assert len(d1["outfits"]) >= 1

    r2 = client.post("/api/v1/styling/recommend", json=payload)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["cache_hit"] is True
    assert d2["mode_used"] == "cache"
