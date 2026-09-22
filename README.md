# Dressup Strategy（自用）

這是一個以瀏覽器為主的《奇跡暖暖》搭配／資料工具專案，包含主搭配器、BigUse、材料查詢、衣櫃比對、外部資料搜尋，以及本機 Guided Update 資料更新流程。

目前日常開發分支為 `development`；`main` 保留作為穩定基準，不直接承接日常開發變更。

## 快速開始

### 搭配器

Windows 可直接雙擊：

```text
開啟搭配器.bat
```

或執行：

```powershell
npm run start:main
```

### 資料更新

日常資料更新建議直接使用 Guided Update，不需要手動記住 Gate 12 的 CLI 流程。

Windows 雙擊：

```text
開啟資料更新.bat
```

或執行：

```powershell
npm run start:update
```

預設會開啟本機介面：

```text
http://127.0.0.1:8127/guided-update/
```

### 外部服裝資料搜尋

獨立搜尋工具位於 [`cn-search/`](cn-search/)。

Windows 日常使用：

```text
cn-search/開啟陸服搜尋.bat
```

詳細說明見 [`cn-search/README.md`](cn-search/README.md)。

## 主要功能

| 功能 | 入口 | 用途 |
| --- | --- | --- |
| 主搭配器 | `index.html` | 關卡搭配、分數與衣櫃操作 |
| BigUse | `biguse.html` | A/B 搭配比較與相關工具 |
| Material | `material.html` | 材料、製作與需求查詢 |
| Wardrobe Check | `wardrobechk.html` | 衣櫃資料比對 |
| Guided Update | `guided-update/` | 本機資料更新、審查、Apply 與 Closeout |
| 外部服裝搜尋 | `cn-search/` | 搜尋外部 wardrobe 資料與輔助索引 |

## Guided Update

Guided Update 將 Gate 12 的完整資料更新 lifecycle 包成單一操作介面：

```text
建立更新
→ 搜尋／加入服裝與關卡
→ 完整度檢查
→ 差異預覽／衝突審查
→ Staging
→ Preview
→ Apply
→ Apply 後驗證
→ 完成本次更新
```

重要安全邊界：

- Apply 前必須先完成 Preview。
- Apply 綁定當次 generation fingerprint。
- 衝突只能使用 Gate 12H 已保存的決策。
- Gate 11F 仍負責 backup、rollback、derived rebuild 與 regression。
- Closeout 會再次驗證 canonical data、generated freshness 與 repository regression。
- Privileged API 只在主動啟動 Guided Update 時綁定 `127.0.0.1`，不掛在一般靜態頁面 server。

完整操作與安全設計見 [`docs/guided-update-ui.md`](docs/guided-update-ui.md)。

## 開發環境

需要：

```text
Node.js 24
npm
```

第一次安裝：

```powershell
npm ci
```

主要品質檢查：

```powershell
npm run check
```

此指令會依序執行：

```text
ESLint
TypeScript baseline check
Node regression tests
Wardrobe validation
Level validation
```

瀏覽器測試另外執行：

```powershell
npm run test:browser
```

專案使用 browser-native ES Modules，沒有 bundler。主要頁面仍維持靜態網站架構；只有本機搜尋／Guided Update 等需要檔案或 privileged 操作的工具會啟動 localhost server。

## 專案結構

```text
data/
  主要 wardrobe / levels 與其他正式資料

src/
  共用 domain 與仍保留的 legacy browser boundary

scripts/
  資料驗證、Gate 11/12 pipeline、launcher 與本機服務

guided-update/
  Guided Update 前端介面

cn-search/
  外部服裝搜尋與 generated search index

docs/
  資料流程、更新契約、UI 與歷史文件

tests/
  Node regression tests 與 Playwright browser tests
```

## 主要資料

目前資料 ownership 以 [`docs/data-source-contract.md`](docs/data-source-contract.md) 為準。

常用 canonical / runtime 資料包括：

- `data/wardrobe.js`：主要 canonical wardrobe。
- `data/levels.js`：主搭配器關卡資料。
- `data/biguse_levels.js`：BigUse 獨立關卡資料。
- `cn-search/data/cn_search_index.json`：由來源資料重建的 generated search index。

不要只依檔名推測兩份資料應該同步；正式 ownership、generated dependency 與 rebuild 規則請依 Data Source Contract。

## 文件索引

### 日常資料更新

- [Guided Update UI / 日常操作入口](docs/guided-update-ui.md)
- [External Source Reader](docs/external-source-reader.md)
- [Game Update Session](docs/game-update-session.md)
- [服裝搜尋 / 收集](docs/update-wardrobe.md)
- [關卡搜尋 / 收集](docs/update-levels.md)
- [完整度檢查](docs/update-completeness.md)
- [差異預覽](docs/update-diff-preview.md)
- [衝突審查 / 決策保存](docs/update-conflict-review.md)
- [Apply-ready Staging](docs/update-staging.md)
- [Review / Apply](docs/update-review-apply.md)
- [Apply 後驗證 / Closeout](docs/update-closeout.md)

### 底層資料 Pipeline

- [Data Source Contract](docs/data-source-contract.md)
- [Wardrobe Staging](docs/data-staging.md)
- [Wardrobe Preview / Apply](docs/data-preview-apply.md)
- [Derived Rebuild](docs/derived-rebuild.md)
- [Level Pipeline](docs/level-pipeline.md)
- [One-command Data Update](docs/one-command-update.md)

### 歷史紀錄

原 README 中 Gate 1～10 的現代化、ESM、TypeScript、UI migration 與驗收紀錄已移至：

- [Project History](docs/project-history.md)

Git commit history 仍是實際變更的最終依據。

## Git 分支

目前保留兩條 branch：

```text
main         穩定基準
development  日常開發
```

日常修改、測試與 milestone commit 都先放在 `development`；需要正式合併時再另外決定如何處理 `main`。
