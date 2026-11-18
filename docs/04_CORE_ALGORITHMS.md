# 4. 本地端核心演算法虛擬碼與實作說明

系統內建五組核心本地演算法，前端 TypeScript 版本位於 [`frontend/src/engine/`](../frontend/src/engine/)，後端 Python 版本位於 [`backend/app/services/`](../backend/app/services/)。

---

## 4.1 端側影像標準化管線（On-Device Vision Pipeline）

1. **主體去背（Subject Segmentation）**：
   - 行動端：呼叫 Android `ML Kit Subject Segmentation` / iOS `VisionKit VNGenerateForegroundInstanceMaskRequest`。
   - 網頁端（[`visionPipeline.ts`](../frontend/src/engine/visionPipeline.ts)）：採用邊界種子 Flood-Fill + CIE76 色彩距離與梯度邊緣保護，將背景像素 Alpha 設為 `0`，對邊緣 `1.5px` 進行雙線性羽化柔邊。
2. **Gray-World 自動白平衡（Auto White Balance）**：
   - 只針對前景不透明像素（`alpha > 128`）計算平均通道 $\bar{R}, \bar{G}, \bar{B}$ 與全域灰度 $K = (\bar{R}+\bar{G}+\bar{B})/3$，並限制增益係數於 `[0.82, 1.22]` 防止純色衣物被誤拉成灰色。
3. **統一柔和投影（25° Drop Shadow）**：
   - 依固定光源向量 $(\Delta x = 8, \Delta y = 14)$、模糊半徑 $\sigma = 14\text{px}$、透明度 `0.18` 合成陰影於底層，消除「剪貼簿割裂感」。
4. **K-Means++ 前 2 主色提取**：
   - 取樣前景色素（排除高光過曝與過暗陰影雜訊），執行 $k=4$ K-Means++ 聚類，合併相近簇後回傳前 2 大群心之 `HEX` 與 `HSL`。

---

## 4.2 氣象與保暖係數過濾（Weather & Thermal Score Filter）

```text
function targetThermalBounds(feelsLikeC, rainProb):
    if feelsLikeC >= 27:      bounds = (2, 4)
    else if feelsLikeC >= 22: bounds = (3, 5)
    else if feelsLikeC >= 16: bounds = (4, 7)
    else if feelsLikeC >= 10: bounds = (6, 9)
    else:                     bounds = (8, 12)

    if rainProb >= 50:
        # 下雨體感降低並需優先包含外搭/防水鞋款
        bounds = (bounds.min + 1, bounds.max + 1)
    return bounds
```

---

## 4.3 HSL 60-30-10 色彩和諧與衝突排除（Color Harmony Engine）

- **中性色定義**：$S < 18\%$（黑白灰米燕麥）或 $L < 16\%$ 或 $L > 88\%$。中性色可與任何色相自由搭配，不觸發衝突。
- **有彩色配對法則**：計算兩主色最小圓周色相差 $\Delta H = \min(|H_1 - H_2|, 360 - |H_1 - H_2|)$：
  - **同色系 / 單色漸層（Monochromatic）**：$\Delta H \le 15^\circ$（加分 `+20`）。
  - **鄰近和諧色（Analogous）**：$15^\circ < \Delta H \le 38^\circ$（加分 `+15`）。
  - **互補強調色（Complementary）**：$150^\circ \le \Delta H \le 205^\circ$ 且低飽和對高飽和時符合 **60-30-10 主次比例**（主色面積 60%＋輔色 30%＋點綴 10%，加分 `+12`）。
  - **高飽和撞色衝突（Clash Rejection）**：若兩件核心單品皆為高飽和有彩色（$S_1 > 45\%, S_2 > 45\%$）且 $\Delta H \in (50^\circ, 140^\circ)$，判定為色彩衝突直接剔除。

---

## 4.4 版型比例防呆與身形畫布縮放

1. **版型比例防呆（Silhouette Anti-Fool）**：
   - 預設檢核：`if top.fit == "loose" and top.length == "long" and bottom.fit == "loose" and bottom.length == "long"` 且未啟用 `allow_oversized` 模式，則排除該組合（避免五五身拖沓感）。
   - 若上衣為 `cropped` 或開啟 **Tuck-in（紮衣服）** 並搭配 `regular/loose` 長褲，給予比例加分 `+12`。
2. **全身照動態比例縮放**：
   - 依 `torso_length_ratio` 與 `leg_length_ratio` 動態換算 2D 畫布上下著高度權重：
     $$\text{topDisplayScale} = \frac{\text{torsoRatio}}{0.34}, \quad \text{bottomDisplayScale} = \frac{\text{legRatio}}{0.48}$$

---

## 4.5 旅行膠囊衣櫃組合最佳化（Travel Capsule Optimizer）

目標：給定旅遊天數 $D$、氣溫區間 $[T_{\min}, T_{\max}]$ 與是否降雨，選出**最少單品數 $K$** 使得可組成之不重複穿搭天數 $\ge D$。

```text
function solveTravelCapsule(wardrobe, tripDays, tempMin, tempMax, rainExpected):
    # 1. 依旅行極端溫差篩選可覆蓋日夜溫差的單品池
    # 2. 預計算所有符合 HSL 和諧 + 版型防呆 + 溫區覆蓋的合法基礎組合 (top, bottom, optional outer, shoes)
    # 3. 採用「邊際覆蓋增益最大化」貪婪集合覆蓋 (Greedy Set-Cover + Reuse Ratio Bonus)：
         score(item) = new_valid_outfits_unlocked(item) * 3.0
                     + compatibility_degree(item) * 1.2
                     - is_bulky_outerwear(item) * 1.5
    # 4. 逐一加入最高分單品直到 distinct_outfits(selected) >= tripDays 或無新增益
    # 5. 剪枝 (Pruning): 移除任何移除後仍可維持 >= tripDays 套不重複穿搭的冗餘單品
    # 6. 指派 Day 1 .. Day D 排程，相鄰兩天強制不重複核心上衣＋褲款
    return { selectedItems, dailyOutfits, reuseEfficiency }
```
