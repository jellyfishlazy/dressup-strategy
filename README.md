# 搭配器（自用）

## 陸服衣櫃條件搜尋

獨立模組位於 [`cn-search/`](cn-search/)。

- **日常**：雙擊 `cn-search/開啟陸服搜尋.bat`（不需 npm install）
- **建索引**：repository 的 npm workspace 管理 opencc-js，詳見 [`cn-search/README.md`](cn-search/README.md)

## Development / Gate 1

Use Node.js 24. Browser scripts remain classic scripts; there is no bundler.
All existing HTML paths and the repository-root GitHub Pages site are unchanged.
Deployed pages need no npm server. Local CN search still needs HTTP to load JSON;
its existing launcher works without installing development dependencies.

From the repository root:

```sh
npm ci
npm run lint
npm test
npm run validate:data
npm run check
```

The root `package-lock.json` locks development dependencies for the repository
and its `cn-search` workspace. CI installs them with `npm ci --ignore-scripts`
and runs `npm run check`.
Do not maintain a separate lockfile in `cn-search/`.

Tests use Node's built-in test runner: VM-loaded `tool.js` cloning and `model.js`
accessory scoring / identity formatting, CN tag mappings, repository OpenCC
resolution, and validator rejection cases. They do not assert known legacy bugs
as desired application behavior or claim browser/UI coverage.

Lint covers `tool.js`, `cn-search/scripts/*.mjs`, `src/domain/wardrobe/*.mjs`, `scripts/*.mjs`, tests and ESLint
configuration. Rules catch undefined identifiers, accidental global assignments,
duplicate arguments/keys, unreachable code and invalid typeof comparisons.
Excluded at Gate 1: all other root browser scripts (including model/scoring/UI,
which use cross-script globals), `cn-search/cn-search.js`, inline HTML scripts,
generated data, vendor libraries (`jquery*`, `bootstrap/`, `knockout.js`,
`html2canvas.js`), and the older root `scripts/` audit/migration utilities.
These require separate review; a passing lint check is not whole-site coverage.

The validator executes repository-owned data in a timeout-limited VM and checks
non-empty wardrobe arrays, exactly 18 fields, non-empty string name/type/id, and
duplicate `(type,id)` identities independently in `wardrobe.js`,
`data/wardrobe.js`, `data/biguse_wardrobe.js`, and `data/material_wardrobe.js`.
`biguse_wardrobe.js` is application code, not another wardrobe array.
VM loading is for trusted repository data, not untrusted uploads.

`scripts/known-wardrobe-duplicates.json` records the exact rows for 6 existing
duplicate groups in the root wardrobe and 11 in the material wardrobe. These are
documented data debt, not endorsements of duplicate identities. The validator
reports them on every run and rejects new/changed duplicate groups and stale
exceptions. Fix duplicates upstream in a separate data ticket, then remove the
corresponding baseline entry; do not regenerate this baseline to hide failures.
No generated wardrobe data is changed by checks.

Gate 3 adds the ESM boundary in `src/domain/wardrobe/`: `schema.mjs` defines
the ordered fields, named indexes and row width; `adapter.mjs` exports
`rowToWardrobeItem` / `wardrobeItemToRow`. Items expose named properties with
the ten raw grades grouped under `ratings`. Tags, source, suit, version and
string IDs (including leading zeroes) pass through unchanged, without scoring,
splitting or normalization. The adapter checks row width and non-empty string
identities, sharing those checks with the validator; other values remain opaque.
The validator and maintained CN tooling use the shared schema. Raw persisted
and generated rows still have exactly the same 18 fields. Classic browser
scripts retain their existing model and behavior. Regression tests cover the
schema and exact round-trips of all four repository wardrobe arrays.

Gate 4 modularizes the CN search page with native browser ES Modules under
`cn-search/src/`. Category mapping, lexicon/normalization, search merge/filter,
staging serialization, and manual-entry data rules are separated from the DOM
orchestration in `cn-search/cn-search.js`. No bundler or runtime server is added;
the same static GitHub Pages deployment remains valid. CN-search domain modules
are covered by Node regression tests and share Gate 3's wardrobe schema.

Gate 5A migrates the main matcher onto the wardrobe boundary without converting legacy browser scripts to ESM yet. `src/domain/wardrobe/runtime.js` is a thin classic-script compatibility bridge whose field order and row conversion are regression-checked against Gate 3's canonical ESM schema/adapter. `model.js` converts raw rows to named items before scoring/model construction, so its `Clothes` parser no longer depends on numeric wardrobe indexes. Inventory serialization and storage access are isolated in `src/domain/inventory/runtime.js`; the existing `mainType:id,id|` data format, `myClothesNew` key, legacy fallback, and cookie fallback remain compatible. This bridge is temporary and can be removed when the remaining legacy runtime becomes ESM in the later cleanup gate.

Gate 5B migrates BigUse away from reverse-adapting `Clothes` through `toCsv()` and `clothesSet` lookups. `src/domain/biguse/runtime.js` owns A/B cart selection, the established ±10% score comparison rule, and legacy image-id derivation from named `Clothes` fields. BigUse buttons/autocomplete now pass the actual `Clothes` object into the selected cart, while rendering reads named type/id data. Cart isolation and score semantics remain unchanged and are covered by regression tests.

Gate 5C migrates Wardrobe Check and Material tools onto the same wardrobe/inventory boundaries. `wardrobechk.js` and `material_model.js` parse raw rows through `WardrobeDomain.rowToWardrobeItem()` while preserving Material's existing set/source/tag/rating semantics. Gate 5D then consolidates their duplicated inventory objects into `InventoryDomain.createInventory()` and centralizes localStorage/cookie fallback in `readBrowser()` / `writeBrowser()`. The public classic `MyClothes()` wrappers remain for callers such as `nikki.js` and `sharewardrobe.js`, but no longer own persistence logic. ESLint covers the migrated legacy scripts with explicit cross-script globals so accidental globals fail CI.

Gate 6A removes the legacy pieces that can be retired without rewriting the application UI. Active HTML entry points no longer use inline event handlers; `src/legacy/page-events.js` owns native DOM event binding and reproduces the Bootstrap 3 button-toggle behavior used by the matcher pages. Bootstrap JavaScript 3.3.5 and inherited Google Analytics are removed, while Bootstrap CSS remains to preserve layout/classes. Wardrobe Check is jQuery-free.

Gate 6B removes the main matcher's jQuery runtime dependency. `index.html` now loads `src/legacy/native-dom.js`, a repository-owned native DOM facade, instead of `jquery.js`; the main runtime (`model.js`, `ui.js`, `nikki.js`, both one-key strategy scripts, `clock.js`, and `sharewardrobe.js`) contains no jQuery API references and is covered by ESLint. The still-used sticky-header helpers formerly hidden inside `jquery.freezeheader.js` were reimplemented with native DOM APIs, allowing that plugin file to be retired as well.

Gate 6C removes BigUse's remaining jQuery dependency. `biguse.html` reuses `src/legacy/native-dom.js` and loads `src/legacy/native-autocomplete.js` instead of `jquery.js` / `jquery.autocomplete.min.js`; the old autocomplete plugin is retired and its missing CSS reference is removed. BigUse name matching is regression-tested in `BigUseDomain.autocompleteSuggestions()`, while `biguse_ui.js` and `biguse_nikki.js` are covered by ESLint and contain no jQuery APIs.

Gate 6D removes Material's remaining jQuery dependency and the unused Knockout load. `material.html` now uses the shared native DOM facade plus `src/legacy/material-actions.js`; generated Material links/selects use delegated `data-material-action` / `data-material-change` bindings instead of inline handlers. `material.js` is included in ESLint, and the retired `jquery.js` / `knockout.js` vendor files are removed from the repository. The classic `WardrobeDomain` / `InventoryDomain` browser bridges remain intentionally constrained to the three synchronous classic consumers (`model.js`, `material_model.js`, and `wardrobechk.js`). Removing those bridges safely requires converting those entry-point model chains to ESM or an equivalent synchronous module boundary; Gate 6D does not fake that conversion by breaking static page startup.

Gate 7-Prep adds a Playwright browser smoke harness before the ESM migration begins. `tests/browser/smoke.spec.mjs` boots the main matcher, BigUse, Material, and Wardrobe Check through the same static dev server used by local tooling; page errors, console errors, and same-origin HTTP failures fail the smoke gate. Each page also performs one small user-path assertion so a successful HTTP response alone cannot masquerade as a working runtime. The harness caught and fixed a native-DOM compatibility regression where `.attr(name, undefined)` incorrectly broke method chaining. Run it locally with `npm run test:browser`. CI installs Chromium and runs the smoke suite after the existing Node/data quality gate.

Gate 7A adds browser-native ESM domain entries without changing any page runtime yet. `src/domain/wardrobe/index.mjs` re-exports the canonical schema/adapter, while `src/domain/inventory/index.mjs` and `src/domain/biguse/index.mjs` expose ESM versions of the existing domain boundaries. Node parity tests lock their behavior to the temporary classic bridges, including legacy inventory serialization/error behavior and BigUse score/image/autocomplete semantics. The Playwright smoke suite also imports all three entries directly from the static server, proving that GitHub-Pages-style hosting serves the module graph correctly. Classic HTML consumers intentionally remain unchanged until Gate 7B starts migrating entry points.

CI checks PRs targeting main, main pushes and manual runs. Deployment requires a
successful quality job **and** `refs/heads/main` (never a pull request). The deploy
job checks out a fresh root static site, so npm dependencies are not uploaded.
The external CN source/index rebuild is not a deployment prerequisite: the
existing generated index remains the deployed asset. To rebuild it deliberately:

```sh
npm run build:cn-index
```

Provide `CN_WARDROBE_JS` or use the existing CN source discovery paths documented
in `cn-search/README.md`. No sibling npm dependency directory is used.
