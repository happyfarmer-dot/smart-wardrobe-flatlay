import json

AUTO_TAG_SYSTEM_INSTRUCTION = (
    "Apparel attribute extractor. Output strictly valid JSON matching the schema.\n"
    "Thermal guide: 1=tank/linen tee, 2=cotton shirt/chinos/denim, "
    "3=knit/blazer/trench, 4=heavy wool/padded jacket, 5=down parka.\n"
    "Use concise lowercase snake_case sub_category and 1-3 style_tags."
)

AUTO_TAG_JSON_SCHEMA = {
    "type": "OBJECT",
    "required": [
        "category",
        "sub_category",
        "fit",
        "length",
        "thermal_score",
        "style_tags",
        "season",
    ],
    "properties": {
        "category": {
            "type": "STRING",
            "enum": ["top", "bottom", "outerwear", "dress", "shoes", "accessory"],
        },
        "sub_category": {"type": "STRING"},
        "fit": {"type": "STRING", "enum": ["slim", "regular", "loose"]},
        "length": {"type": "STRING", "enum": ["cropped", "regular", "long"]},
        "thermal_score": {"type": "INTEGER", "minimum": 1, "maximum": 5},
        "style_tags": {
            "type": "ARRAY",
            "minItems": 1,
            "maxItems": 3,
            "items": {"type": "STRING"},
        },
        "season": {
            "type": "ARRAY",
            "minItems": 1,
            "maxItems": 4,
            "items": {
                "type": "STRING",
                "enum": ["spring", "summer", "autumn", "winter"],
            },
        },
    },
}

STYLING_SYSTEM_INSTRUCTION = (
    "You are a minimalist stylist. Select exactly 3 distinct outfits using ONLY provided item ids.\n"
    "Each outfit needs a coherent base (top+bottom or dress) + shoes, optional outerwear if thermal target needs it.\n"
    'Prioritize items with "dorm":true when aesthetically balanced.\n'
    'Write "reason" in Traditional Chinese (<= 22 words).'
)

STYLING_JSON_SCHEMA = {
    "type": "OBJECT",
    "required": ["outfits"],
    "properties": {
        "outfits": {
            "type": "ARRAY",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "OBJECT",
                "required": ["style_title", "item_ids", "reason"],
                "properties": {
                    "style_title": {"type": "STRING"},
                    "item_ids": {
                        "type": "ARRAY",
                        "minItems": 2,
                        "maxItems": 5,
                        "items": {"type": "STRING"},
                    },
                    "reason": {"type": "STRING"},
                },
            },
        }
    },
}


def build_auto_tag_prompt(primary_hex: str, secondary_hex: str | None) -> str:
    sec = secondary_hex or "none"
    return (
        "Classify this isolated garment image. "
        f"Local dominant colors already extracted: primary={primary_hex}, secondary={sec}."
    )


def build_compact_styling_prompt(
    feels_like_c: float,
    rain_prob: int,
    thermal_bounds: tuple[int, int],
    occasion: str,
    anchor_item_id: str | None,
    compact_items: list[dict],
) -> str:
    compact_json = json.dumps(compact_items, separators=(",", ":"), ensure_ascii=False)
    anchor_str = anchor_item_id or "none"
    return (
        f"ctx: temp={feels_like_c}C, rain={rain_prob}%, "
        f"target_thermal={thermal_bounds[0]}-{thermal_bounds[1]}, "
        f"occasion={occasion}, anchor={anchor_str}\n"
        f"items:\n{compact_json}"
    )
