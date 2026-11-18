# 3. 極致省 Token 的多模態打標 Prompt 與穿搭推薦 Prompt 模板

為確保雲端 AI 成本壓到最低，我們對 Gemini 2.5 Flash 採取以下三項極限省 Token 工程策略：
1. **入庫單次調用（One-Time Multimodal Call）**：圖像僅在衣物入庫時傳入一次（並先於端側縮圖至長邊 `512px` JPEG/WebP），之後的所有推薦流程 **永遠不再上傳任何圖片**。
2. **Strict Structured Outputs (`response_schema`)**：透過 API 原生 JSON Schema 約束輸出欄位與 Enum 值，無需在 Prompt 中撰寫冗長格式範例或「請不要輸出 markdown code block」等廢話。
3. **短鍵名緊湊負載（Compact Payload Keys）**：推薦階段僅將 Stage-1 規則漏斗篩選後之候選清單（`<= 18` 件）以精簡短鍵 (`id`, `c`, `sub`, `f`, `l`, `th`, `hx`, `st`, `dorm`) 傳送，單次推薦含系統提示詞僅約 **250~480 input tokens**。

---

## 3.1 衣物入庫自動打標（One-Time Auto-Tagging）

### System Instruction（僅 ~58 tokens）
```text
Apparel attribute extractor. Output strictly valid JSON matching the schema.
Thermal guide: 1=tank/linen tee, 2=cotton shirt/chinos/denim, 3=knit/blazer/trench, 4=heavy wool/padded jacket, 5=down parka.
Use concise lowercase snake_case sub_category and 1-3 style_tags.
```

### User Prompt（僅 ~18 tokens + 512px Image）
```text
Classify this isolated garment image. Local dominant colors already extracted: primary={{primary_hex}}, secondary={{secondary_hex}}.
```

### Strict JSON Schema（`response_schema`）
```json
{
  "type": "OBJECT",
  "required": [
    "category",
    "sub_category",
    "fit",
    "length",
    "thermal_score",
    "style_tags",
    "season"
  ],
  "properties": {
    "category": {
      "type": "STRING",
      "enum": ["top", "bottom", "outerwear", "dress", "shoes", "accessory"]
    },
    "sub_category": {
      "type": "STRING",
      "description": "e.g., oxford_shirt, crewneck_knit, straight_denim, trench_coat, penny_loafer"
    },
    "fit": {
      "type": "STRING",
      "enum": ["slim", "regular", "loose"]
    },
    "length": {
      "type": "STRING",
      "enum": ["cropped", "regular", "long"]
    },
    "thermal_score": {
      "type": "INTEGER",
      "minimum": 1,
      "maximum": 5
    },
    "style_tags": {
      "type": "ARRAY",
      "minItems": 1,
      "maxItems": 3,
      "items": { "type": "STRING" }
    },
    "season": {
      "type": "ARRAY",
      "minItems": 1,
      "maxItems": 4,
      "items": {
        "type": "STRING",
        "enum": ["spring", "summer", "autumn", "winter"]
      }
    }
  }
}
```

---

## 3.2 混合式低 Token 穿搭推薦（Stage-2 ID-Only Styling）

> **注意**：Stage-1 規則引擎已先過濾出符合體感溫度、HSL 配色和諧與版型防呆的單品子集（且不含圖片）。

### System Instruction（僅 ~65 tokens）
```text
You are a minimalist stylist. Select exactly 3 distinct outfits using ONLY provided item ids.
Each outfit needs a coherent base (top+bottom or dress) + shoes, optional outerwear if thermal target needs it.
Prioritize items with "dorm":true when aesthetically balanced.
Write "reason" in Traditional Chinese (<= 22 words).
```

### User Prompt Template（動態注入緊湊 JSON）
```text
ctx: temp={{feels_like_c}}C, rain={{rain_prob}}%, target_thermal={{thermal_min}}-{{thermal_max}}, occasion={{occasion}}, anchor={{anchor_id_or_none}}
items:
{{compact_candidates_json}}
```

#### `compact_candidates_json` 實際範例（10 件單品僅 ~210 tokens！）
```json
[
  {"id":"i1","c":"top","sub":"oxford_shirt","f":"regular","l":"regular","th":2,"hx":"#F5F4EF","st":["commute","minimal"],"dorm":false},
  {"id":"i2","c":"top","sub":"crewneck_knit","f":"regular","l":"regular","th":3,"hx":"#233044","st":["commute","smart_casual"],"dorm":true},
  {"id":"i5","c":"outerwear","sub":"trench_coat","f":"regular","l":"long","th":3,"hx":"#B68F66","st":["commute","classic"],"dorm":true},
  {"id":"i8","c":"bottom","sub":"straight_denim","f":"regular","l":"long","th":2,"hx":"#2D4059","st":["casual","vintage"],"dorm":false},
  {"id":"i9","c":"bottom","sub":"pleated_chino","f":"loose","l":"long","th":2,"hx":"#C8B9A6","st":["commute","minimal"],"dorm":false},
  {"id":"i11","c":"shoes","sub":"penny_loafer","f":"regular","l":"regular","th":1,"hx":"#4A3228","st":["commute","classic"],"dorm":false}
]
```

### Strict JSON Schema（`response_schema`）
```json
{
  "type": "OBJECT",
  "required": ["outfits"],
  "properties": {
    "outfits": {
      "type": "ARRAY",
      "minItems": 3,
      "maxItems": 3,
      "items": {
        "type": "OBJECT",
        "required": ["item_ids", "reason", "style_title"],
        "properties": {
          "style_title": { "type": "STRING" },
          "item_ids": {
            "type": "ARRAY",
            "minItems": 2,
            "maxItems": 5,
            "items": { "type": "STRING" }
          },
          "reason": { "type": "STRING" }
        }
      }
    }
  }
}
```

## 3.3 Token 成本對比估算

| 方案 | 單次推薦 Input | 單次推薦 Output | 備註 |
| --- | --- | --- | --- |
| 傳統多模態直接傳 40 件衣櫃縮圖 | ~14,500–22,000 tokens | ~450 tokens | 每次推薦重複編碼圖片，延遲高且易超過免費額度 |
| **本專案混合管線 (Stage 1 + ID JSON)** | **~240–420 tokens** | **~160 tokens** | 結合 `outfit_recommendations_cache` 命中時為 **0 tokens**，成本下降 **97.5%** |
| **純前端離線語意評分模式** | **0 tokens** | **0 tokens** | 瀏覽器／裝置端即可完成完整推薦與理由生成 |
