# 陸服衣櫃條件搜尋

本機以小工具頁對照陸服擴充衣櫃資料並可暫存匯出；**不可用瀏覽器直接開 `file://`**，否則無法載入 JSON（會被 CORS 擋）。

## 日常使用

**雙擊 [`開啟陸服搜尋.bat`](開啟陸服搜尋.bat)** → 自動啟動本機 HTTP 並開啟 `http://localhost:8000/cn-search/`。

- **不需要**在 `cn-search/` 內執行 `npm install`
- 日常瀏覽使用已產生的 JSON；開發依賴由根目錄 `npm ci` 安裝
- 只需系統已安裝 Node.js（`node.exe` 在 PATH 或 Program Files）

若伺服器已在背景執行，再次雙擊只會開新分頁，不會重複占用埠號。

關閉伺服器：工作管理員結束對應的 `node.exe` 程序。

## 首次或資料更新（建索引）

建索引腳本需要 `opencc-js`，由本 repository 的 npm workspace 與根目錄 lockfile 管理。

開發環境與品質檢查請見 [根目錄 README](../README.md#development--gate-1)。

1. **安裝開發依賴**（Node.js 24，在 repository 根目錄執行）：

   ```bash
   npm ci
   ```

2. **產生索引**（陸服或台服 `../data/wardrobe.js` 更新後請重跑）：

   **一鍵重建**：雙擊 [`重建搜尋索引.bat`](重建搜尋索引.bat)（使用 repository 內安裝的依賴並執行建索引）。

   或手動執行：

   ```bash
   cd cn-search
   npm run build:cn-index
   ```

   預設會找環境變數 `CN_WARDROBE_JS`、`vendor/nikkiup2u3-cn/wardrobe.js`，或 repo 上一層的 `nikkiup2u3_data-gh-pages/wardrobe.js`；並讀取 repo 根目錄的 `data/wardrobe.js`（台服）為每列寫入 `tagsTw`。輸出為 `data/cn_search_index.json`（約數 MB，`schema`=3）。

3. **手動啟動本機 HTTP**（可選）：

   ```bash
   npm run serve
   ```

   瀏覽器開 `http://localhost:8000/cn-search/`（埠號可用環境變數 `PORT` 覆寫）。

## 其他

- **快取**：若更新腳本後仍見舊行為，請強制重整（Ctrl+F5），或調高 [`index.html`](index.html) 底部 `cn-search.js?v=` 的版本號。
- **OpenCC**：頁面從 CDN 載入簡繁轉換；若狀態列出現 OpenCC 未載入警告，請檢查網路。
- **標籤同步**（進階）：`node scripts/sync-wardrobe-tags-from-cn.mjs` 會讀寫 repo 根目錄的 `data/wardrobe.js`。
- **GitHub Pages**：直接開啟網站的 `cn-search/`，不需 npm 或 Node server。

## 目錄說明

| 路徑 | 說明 |
|------|------|
| `index.html` / `cn-search.js` | 搜尋頁面 |
| `開啟陸服搜尋.bat` | 一鍵啟動本機 HTTP 並開啟搜尋頁 |
| `重建搜尋索引.bat` | 一鍵重建 `data/cn_search_index.json` |
| `data/cn_search_index.json` | 陸服索引（由 build 腳本產生） |
| `../data/wardrobe.js` | 台服衣櫃（與搭配器共用，勿搬移） |
| `../package-lock.json` | repository 開發依賴鎖定檔（含 opencc-js） |
| `scripts/` | 建索引、dev server、一鍵啟動 |
