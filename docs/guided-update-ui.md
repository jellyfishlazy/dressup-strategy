# Gate 12L — Guided Update UI / 日常操作入口

Gate 12L 將 Gate 12B～12K 已完成的後端更新 lifecycle 包成一個本機 Guided Update 操作介面。

目標是讓日常更新不需要記住一串 npm/CLI 指令，同時不複製後端規則，也不降低 Gate 12J / 12K 的 Apply 與 Closeout 安全門。

## 日常啟動

Windows 可直接雙擊 repository 根目錄：

```text
開啟資料更新.bat
```

等價 npm 入口：

```powershell
npm run start:update
```

預設會啟動：

```text
http://127.0.0.1:8127/guided-update/
```

這是一個獨立的 privileged localhost server，不是一般搭配器使用的 static dev server。

## 為什麼使用獨立 server

Guided Update 必須執行：

- Session 檔案寫入；
- 外部來源讀取；
- staging；
- canonical Apply；
- rollback / regression；
- closeout / session completion。

這些行為不能由純 static GitHub Pages 前端安全執行。

因此 Gate 12L 不把資料寫入 API 掛在平常的搭配器 server。

只有主動執行 Guided Update launcher 時，才啟動：

```text
127.0.0.1:8127
```

上的 privileged API。

一般 `開啟搭配器.bat` / GitHub Pages 不會啟用這些寫入端點。

## 來源就緒檢查

Guided Update 首頁會在建立 Session 前先解析 Gate 12B 的外部來源位置。

若 wardrobe / levels 來源都可讀，畫面顯示「外部來源已就緒」，才允許建立本次更新。

若來源缺少，建立按鈕會停用，並直接顯示 resolver 的錯誤與設定提示，不會等到建立 Session 後才失敗。

來源仍沿用既有 Gate 12B resolver，可使用預設候選位置，或透過環境變數：

```text
CN_WARDROBE_JS
CN_LEVELS_JS
```

指定來源檔案。Gate 12L 不另外引入檔案上傳或 browser file picker，避免把「資料從哪裡來」退回手動搬檔流程。

## 單頁流程

Guided Update 使用一個 responsive 單頁，固定分成六段。

### Step 1 — 建立本次更新

可：

- 建立新的 Game Update Session；
- 填寫更新名稱與備註；
- 查看目前 Session；
- 查看歷史 Session；
- 切換其他 draft Session；
- 取消目前更新。

UI 不自行保存另一份 Session state，所有資料仍來自 Gate 12C。

### 流程防呆與可見錯誤

Step 2～6 都要求目前存在一個 `draft` Game Update Session。

若尚未建立或啟用 Session：

- 各步驟會在卡片頂端顯示「請先完成 Step 1」提示；
- 搜尋、完整度、差異審查、Staging、Apply、Closeout 等控制會停用；
- 前端會在送出 API request 前再次檢查 Session，避免把正常的流程前置條件錯誤變成 HTTP 400；
- 若仍因狀態過期或其他 API 錯誤失敗，頁面會顯示持續可見、可聚焦的全域錯誤提示，Activity log 同時保留紀錄；DevTools console 只作開發診斷，不是主要使用者提示介面。

Guided Update privileged server 也提供 `/favicon.ico`，避免瀏覽器自動請求產生與更新流程無關的 404 雜訊。

### Step 2 — 搜尋並加入本次更新

分成：

```text
服裝
關卡
```

兩個區塊。

#### 服裝繁簡對齊搜尋

Guided Update 的服裝搜尋不直接把 Gate 12D raw-source substring search 暴露給日常 UI。

它會將目前 Session 鎖定的外部 wardrobe 與 canonical `data/wardrobe.js` 建立一份唯讀搜尋模型，重用既有 CN Search domain：

- category mapping；
- canonical wardrobe identity 對齊；
- OpenCC cn→tw / tw→cn（Node 與舊版 browser CN Search 都固定使用 `opencc-js 1.3.0`，避免字典版本造成繁中搜尋落差）；
- canonical TW lexicon；
- tag override / normalization；
- TW + 原始來源雙語 haystack。

因此使用者可輸入繁中或來源原文；結果顯示繁中優先，同時保留 exact source key 供 Gate 12D 收集。

如果本地已有相同 mapped identity，名稱／套裝／來源／標籤／版本優先使用 canonical TW 資料；外部獨有項目才使用 deterministic conversion 顯示。

搜尋模型依：

```text
external wardrobe SHA
+
canonical wardrobe SHA
```

快取。來源或 canonical 資料改變時會建立新模型，不沿用舊轉換結果。

服裝可搜尋：

- 名稱；
- 分類；
- ID；
- 套裝；
- 來源；
- 標籤；
- 版本。

關卡可搜尋：

- source key；
- runtime label；
- theme；
- 已收集 metadata 文字。

按下：

```text
加入本次更新
```

Guided Update service 會將同一 key：

1. 加入 Gate 12F plan；
2. 加入 Gate 12D / 12E collection。

因此日常 UI 不需要使用者分開操作「預計」與「收集」。

若第二步失敗，service 會補償移除本次新增的 plan 項目，避免畫面顯示與 Session 狀態分裂。

「移除」同樣會從 collection + plan 一起移除；若 plan 移除失敗，會嘗試補回 collection。

所有 mutation 在 privileged service 內序列化執行，避免使用者快速連點造成兩個 Session writer 同時搶寫。

#### 加入全部搜尋結果

服裝搜尋回應會保存：

```text
session id
external wardrobe SHA
canonical wardrobe SHA
normalized filters
```

計算出的 search fingerprint。

畫面可以只分批顯示結果，但「加入全部」不會依賴目前 DOM 或只加入目前頁面；server 會用相同 filters 重新解析完整 matched set，並要求 fingerprint 仍然一致。

若 Session、來源、canonical wardrobe 或搜尋條件改變，舊 fingerprint 不能用於批次加入，必須重新搜尋。

批次加入會：

1. 排除 nonselectable source rows；
2. 排除已在 Collection 的 exact source keys；
3. 對剩餘完整結果執行既有 Gate 12F Plan + Gate 12D Collection；
4. 回報 new / already collected / nonselectable / concurrent skipped 摘要。

所以新版保留舊搜尋的「＋全部」語意，但不再回到 browser staging / 複製 JS 片段的舊流程。

## Step 3 — 完整度

直接顯示 Gate 12F：

```text
預計
已收集
缺少
完成率
```

並列出 missing wardrobe / levels。

空 plan 不顯示為 100%。

## Step 4 — 差異與衝突

「產生差異預覽」直接呼叫 Gate 12G。

摘要顯示：

```text
new
modified
conflict
unchanged
total
```

若有 conflict，UI 使用 Gate 12H review state 顯示：

- source key；
- mapped target key；
- conflict kind；
- reasons / differences；
- 目前 decision / state。

可直接選：

```text
保留本地
採用來源
手動調整 JSON
```

### 手動 JSON

UI 會用 Gate 12G candidate 產生一份起始 JSON。

服裝：

```json
{
  "kind": "wardrobe-row",
  "targetKey": "...",
  "row": []
}
```

關卡：

```json
{
  "kind": "level-entries",
  "targetKey": "...",
  "entries": []
}
```

儲存仍由 Gate 12H schema 驗證；前端不繞過 validator。

## Step 5 — Staging / Preview / Apply

### Generate Staging

呼叫 Gate 12I。

顯示：

- generation fingerprint；
- staging reuse / new；
- Gate 11 summary。

### Preview

呼叫 Gate 12J preview。

成功後畫面取得：

```text
confirmFingerprint
```

此時「正式 Apply」才會啟用。

### Apply

使用者仍須再次點擊確認。

UI 將剛才 Preview 的 exact fingerprint 傳回 Gate 12J：

```text
apply --confirm=<same fingerprint>
```

UI 沒有提供：

```text
--accept-conflicts
```

Gate 11 conflict acceptance 仍只能由 Gate 12I bundle exact identity authorization 推導。

## Step 6 — Apply 後驗證 / 完成

### Verify

呼叫 Gate 12K verify。

成功後顯示：

```text
closeoutFingerprint
```

並顯示實際確認的 wardrobe / level staging 數量。

### Complete

只有 verify 成功後按鈕才可使用。

再確認後，將 exact closeout fingerprint 傳給 Gate 12K complete。

成功時：

```text
session.status = completed
current.json removed
closeout evidence persisted
```

## Desktop layout

桌機以兩欄收集區 + 多欄摘要顯示資訊：

```text
┌──────────────────────────────────────────────────────────┐
│ Guided Update                         [Local API] [Refresh]│
├──────────────────────────────────────────────────────────┤
│ 1 建立 │ 2 收集 │ 3 完整度 │ 4 審查 │ 5 Apply │ 6 完成 │
├──────────────────────────────────────────────────────────┤
│ Step 1 目前 Session / 建立 Session                        │
├──────────────────────────┬───────────────────────────────┤
│ Step 2 服裝搜尋           │ Step 2 關卡搜尋                │
│ Results / Selected       │ Results / Selected             │
├──────────────────────────┴───────────────────────────────┤
│ Step 3 完整度                                              │
├──────────────────────────────────────────────────────────┤
│ Step 4 差異摘要 / conflict cards                          │
├──────────────────────────────────────────────────────────┤
│ Step 5 Staging → Preview → Apply                           │
├──────────────────────────────────────────────────────────┤
│ Step 6 Verify → Complete                                   │
└──────────────────────────────────────────────────────────┘
```

## Mobile layout

Canonical mobile breakpoint 仍沿用 UI modernization 的：

```text
650px
```

手機：

- Step navigation 變 2 欄；
- 服裝 / 關卡收集改單欄；
- metrics 改單欄；
- action buttons 撐滿；
- selected / result cards 改單欄；
- fingerprint 可自動換行。

沒有另外維護一套 mobile HTML。

## Local API security

Privileged server：

```text
host = 127.0.0.1
default port = 8127
```

不監聽 LAN interface。

### Token

Server 啟動時產生隨機 256-bit token。

Browser 必須先從 same-origin bootstrap 取得 token。

所有 mutation API 都要求：

```text
X-Guided-Update-Token
Content-Type: application/json
```

### Same-origin

API 同時驗證：

- `Origin`；
- `Sec-Fetch-Site`；
- token。

跨來源 browser request 會被拒絕。

JSON custom header 也會使跨來源瀏覽器必須 preflight，而 server 不提供 CORS。

### Static exposure

Privileged server 只提供：

- `guided-update/index.html`；
- `guided-update/app.mjs`；
- `guided-update/guided-update.css`；
- `ui-foundation.css`。

例如：

```text
/package.json
/scripts/update-session.mjs
```

不會由 privileged server 對 browser 提供。

### Browser security headers

回應包含：

- CSP；
- X-Content-Type-Options；
- Referrer-Policy；
- X-Frame-Options；
- no-store cache。

CSP 禁止外部 script / style、iframe embedding 與非同源 connect。

## Service composition

Browser API 不直接 import Gate 模組。

架構：

```text
guided-update/app.mjs
       ↓ localhost JSON
guided-update-server.mjs
       ↓
guided-update-service.mjs
       ↓
Gate 12C–12K existing modules
```

`guided-update-service.mjs` 僅做日常 workflow composition。

它不重新定義：

- diff 規則；
- conflict schema；
- staging contract；
- Apply authorization；
- rollback；
- Closeout verification。

## Launcher

新增：

```text
開啟資料更新.bat
scripts/launch-guided-update.mjs
scripts/guided-update-server.mjs
```

Launcher 會：

1. 檢查 8127；
2. 計算目前 Guided Update backend runtime fingerprint；
3. 若既有 server 屬於同一 repo 且 fingerprint 相同就沿用；
4. 若既有 server 屬於同一 repo但 fingerprint 已過期，會先停止舊 server 再啟動目前版本；
5. 若未啟動就啟動；
6. 若被其他服務占用就拒絕，不會終止未知程序；
7. 開啟 browser。

Browser 的 wardrobe search UI 也會驗證新版 payload contract；若收到 legacy / incompatible payload，會顯示前後端版本不一致錯誤，不會把缺少欄位渲染成 `undefined`。

測試用：

```powershell
node scripts/launch-guided-update.mjs --no-open --ephemeral --port=8139
```

不會留下 server process。

## Files

Gate 12L adds:

- `guided-update/index.html`;
- `guided-update/guided-update.css`;
- `guided-update/app.mjs`;
- `scripts/guided-update-service.mjs`;
- `scripts/guided-wardrobe-search.mjs`;
- `scripts/guided-update-server.mjs`;
- `scripts/launch-guided-update.mjs`;
- `開啟資料更新.bat`;
- `tests/gate12l-guided-update.test.mjs`;
- `tests/gate12l1-guided-wardrobe-search.test.mjs`;
- `tests/browser/guided-update.spec.mjs`;
- `docs/guided-update-ui.md`;
- npm script `start:update`.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12L service / privileged local server / static UI tests — 8/8.
- PASS: Gate 12L.1 bilingual wardrobe search adapter tests — 7/7.
- PASS: targeted ESLint for Guided Update search adapter, service, server, browser UI and tests with zero warnings/errors.
- PASS: Guided Update Playwright desktop/mobile coverage — 2/2; desktop flow creates a Session, searches external source data with Traditional input, renders Traditional results, and batch-adds the complete matched set without browser errors.
- PASS: no-Session guard blocks Step 2–6 controls before API dispatch; forced submit produces the visible Step 1 prerequisite error without an HTTP 400 request.
- PASS: `/favicon.ico` is served by the privileged server and no longer produces unrelated 404 noise.
- PASS: launcher replaces a stale same-repo Guided Update server automatically using runtime fingerprints.
- PASS: wardrobe UI rejects legacy/incompatible search payloads with a visible front/back-end version mismatch message instead of rendering undefined counters.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 348/348 Node tests; wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: bilingual search keeps exact Gate 12D source identity while displaying mapped Traditional category/name/source data.
- PASS: batch add uses the complete server-side matched set rather than only the visible page, excludes already-collected/nonselectable rows, and rejects stale search fingerprints.
- PASS: daily collect/remove composition keeps Gate 12F Plan and Gate 12D/12E Collection synchronized.

No commit, push, real canonical apply, or real update-session completion was performed by Gate 12L validation.

## Phase boundary

Gate 12L provides the normal human-facing entry point for the complete Gate 12 backend lifecycle.

The browser UI remains a thin orchestrator over Gate 12C–12K and does not weaken their validation or confirmation requirements.
