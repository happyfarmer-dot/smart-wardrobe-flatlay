# ATELIER 2D — 低雲端算力成本智慧衣櫃與平拍穿搭推薦系統

> **Zero Cloud VTON · On-Device Vision + Hybrid Rules & Low-Token LLM**  
> React + Vite + TypeScript（瀏覽器端即開即用）＋ Python FastAPI + PostgreSQL 16 + Gemini 2.5 Flash

---

## 核心技術亮點

1. **端側視覺零雲端成本（On-Device Vision Pipeline）**
   - 瀏覽器端 HTML5 Canvas（行動端對應 ML Kit Subject Segmentation / iOS VisionKit）執行主體去背。
   - **影像一致化標準**：Gray-World 自動白平衡（AWB）＋ 統一 `25°` 柔和投影（Drop Shadow）。
   - **本地 K-Means++ 主色提取**：萃取前 2 名主色 HEX 與 HSL 數值並計算 `image_sha256` 去重指紋。
   - **入庫單次打標**：僅於單品入庫時調用一次 `Gemini 2.5 Flash` Structured Outputs（前端靜態版亦可 100% 離線規則運行）。
2. **身形比例校準與 2D 平面拼貼畫布**
   - 依全身照量測肩寬、軀幹與腿長比例動態縮放上下著尺寸（選配頭部去背錨點）。
   - 支援 Z-Index 圖層排序、一鍵「**紮衣服（Tuck-in）**」褲頭裁切遮罩，以及實時 PNG 匯出。
3. **兩階段混合式智慧穿搭推薦**
   - **Stage 1 本地漏斗**：體感溫度與降雨保暖係數篩選 $\rightarrow$ HSL 60-30-10 配色和諧與撞色排除 $\rightarrow$ 版型比例防呆 $\rightarrow$ 90 天高 CPW 冷凍單品喚醒加權。
   - **Stage 2 低 Token ID-Only 推理**：禁傳圖片與完整衣櫃，僅傳精簡候選 JSON 並搭配 SHA-256 快取鍵，單次節省 **95%+ Token**。
4. **生命週期與旅行膠囊工具**
   - OOTD 月曆排程與 14 天防撞衫重疊警示。
   - $\text{CPW} = \text{購入價格} \div \text{穿著次數}$ 自動計算（含 PostgreSQL Trigger 原子更新）。
   - 旅行膠囊 Set-Cover ＋ 剪枝最佳化生成器。

---

## 技術交付文件索引（Deliverables）

1. [系統整體架構圖（Mermaid）與資料流說明](docs/01_SYSTEM_ARCHITECTURE.md)
2. [關聯式資料庫完整 Schema (PostgreSQL 16 DDL)](database/schema.sql) 與 [ER 模型設計說明](docs/02_DATABASE_SCHEMA.md)
3. [極致省 Token 的多模態打標與推薦 Prompt 模板](docs/03_PROMPTS_AND_SCHEMAS.md)
4. [本地端核心演算法虛擬碼與實作對照](docs/04_CORE_ALGORITHMS.md)
5. [分階段 MVP 開發路線圖與風險緩解檢查表](docs/05_ROADMAP_AND_RISKS.md)

---

## 快速啟動（Local Full-Stack）

### 1. 前端網頁版（100% 瀏覽器端運行，免 API Key）
```bash
cd frontend
npm install
npm run dev
```

### 2. 後端 Python FastAPI + PostgreSQL 16
```bash
cd backend
cp .env.example .env   # 選填 GEMINI_API_KEY
docker compose up --build
```
或本地以 `uv` 執行測試與伺服器：
```bash
cd backend
uv run --extra dev pytest -v
uv run uvicorn app.main:app --reload
```

---

## GitHub Pages 網頁版開啟說明

本專案已於 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) 內建 GitHub Pages 自動建置部署管線：
1. 若本儲存庫為 **Private**，GitHub 免費帳號需先至儲存庫 **Settings → General → Danger Zone** 切換為 **Public**（或使用 GitHub Pro/Team）。
2. 至 **Settings → Pages → Build and deployment** 將 Source 設為 **GitHub Actions**。
3. 推送或手動觸發 `CI & Deploy Web App to GitHub Pages` 後，即可透過 `https://<username>.github.io/smart-wardrobe-flatlay/` 直接開啟使用網頁版！
