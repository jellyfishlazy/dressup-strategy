# Gate 11A — Data Source Contract

本文件定義 repository 內各資料檔的責任：哪些是正式來源、哪些是產物、哪些彼此獨立、哪些只是歷史快照。機器可讀版本位於 `scripts/data-source-contract.mjs`，後續 Gate 11B～11F 的自動化都必須以它為依據。

## 核心規則

1. **看到檔名像 wardrobe，不代表要一起更新。**
2. `data/wardrobe.js` 是目前台服衣櫃的唯一正式來源。
3. generated artifact 只能重建，不手動維護。
4. independent dataset 各自維護，除非後續 Gate 明確建立 converter。
5. legacy snapshot 在日常資料更新流程中一律唯讀。
6. Pipeline 只能寫入 contract 中明確標示 `writable: true` 的來源。
7. generated source 必須先宣告 builder 與 inputs，才能交給自動化重建。

## 衣櫃資料

| 路徑 | 角色 | 日常更新方式 | Active consumer |
| --- | --- | --- | --- |
| `data/wardrobe.js` | **Canonical** | 正式服裝更新寫這裡 | Main、BigUse、Wardrobe Check、CN Search 對齊工具 |
| `wardrobe.js` | Legacy snapshot | 日常流程禁止寫入 | 無 active HTML runtime |
| `data/biguse_wardrobe.js` | Legacy snapshot | 日常流程禁止寫入 | 無 active runtime consumer |
| `biguse_wardrobe.js` | Independent metadata | BigUse 圖片尺寸／顏色資料另行維護 | BigUse |
| `data/material_wardrobe.js` | Independent wardrobe | Material 自己維護 | Material |
| `cn-search/data/cn_search_index.json` | **Generated** | 由 builder 重建 | CN Search |

### 為什麼 `data/wardrobe.js` 是 canonical

Gate 11A 實際盤點結果：

- `data/wardrobe.js`：32,486 筆，`wardrobe_lastupd = 2026/8/12`
- 根目錄 `wardrobe.js`：31,682 筆，`wardrobe_lastupd = 2026/5/31`
- 根目錄 `wardrobe.js` 的所有 `(type,id)` 都能在 `data/wardrobe.js` 找到
- Main、BigUse、Wardrobe Check 都直接載入 `data/wardrobe.js`
- CN Search 頁面直接載入 `data/wardrobe.js`
- CN Search build / tag-sync tooling 也把 `data/wardrobe.js` 當台服對齊輸入

因此根目錄 `wardrobe.js` 是較舊快照，不是第二份正式來源。

### 名稱很像但不能混在一起的檔案

`biguse_wardrobe.js` 與 `data/biguse_wardrobe.js` 完全不是同一種資料：

- 根目錄 `biguse_wardrobe.js` 定義的是 `wardrobe2`，內容是 BigUse 圖片尺寸與顏色 metadata。
- `data/biguse_wardrobe.js` 是舊 18 欄 wardrobe array，目前沒有 active runtime consumer。

`data/material_wardrobe.js` 也不是 `data/wardrobe.js` 的鏡像。它是 Material 專用資料集，目前仍有 canonical wardrobe 中不存在的 identity，因此不能用 canonical 直接覆寫。

## 外部更新來源

Gate 12B 將外部更新來源正式擴充為兩個唯讀 input：

1. `external-cn-wardrobe`：外部 `wardrobe.js`，目前實際格式為 20 欄；Gate 12B 保留完整原始列，不直接套用本地 18 欄 validator。
2. `external-cn-levels`：外部 `levels.js`，包含 primary level tables 與 filter / bonus / skills / hint metadata。

來源解析規則與唯讀 bundle 規格見 [`external-source-reader.md`](external-source-reader.md)。外部來源本身不屬於 repository writable target。

## CN Search generated data

`cn-search/data/cn_search_index.json` 有兩個邏輯輸入：

1. `external-cn-wardrobe`，由 `CN_WARDROBE_JS`、vendor 或 sibling clone 路徑解析。
2. 正式台服 `data/wardrobe.js`，用於台服 tag / wording 對齊。

Builder：

```text
cn-search/scripts/build-cn-search-index.mjs
```

只要任一輸入被正式更新，在資料 milestone closeout 前就必須重建 index。

## 關卡資料

| 路徑 | 角色 | 說明 |
| --- | --- | --- |
| `data/levels.js` | **Canonical** | Main 的關卡／主題／評分資料正式來源 |
| `data/biguse_levels.js` | Independent | BigUse 專用，不是由 Main levels 自動生成 |

Level import / validation 已由 Gate 11E [`level-pipeline.md`](level-pipeline.md) 實作；11A 負責固定 ownership，11E 依此 contract 執行 staging / preview / apply。

## Gate 11 寫入政策

後續資料自動化必須遵守：

```text
new / external data
  -> staging
  -> validate
  -> preview diff
  -> explicit apply to writable canonical / independent source
  -> rebuild declared generated outputs
  -> regression tests
```

禁止依照「檔名很像」自行推導同步關係。

## 目前正式邊界

- 一般服裝更新只寫 `data/wardrobe.js`。
- CN Search staging 輸出正式目標就是 `data/wardrobe.js`。
- Material wardrobe 是另一條更新流程。
- BigUse visual metadata 是另一條更新流程。
- 根目錄 `wardrobe.js` 與 `data/biguse_wardrobe.js` 不參與普通更新寫入。
- 是否刪除／退休 legacy snapshot 不屬於 Gate 11A，需另案 review。
