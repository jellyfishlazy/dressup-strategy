# 搭配器（自用）

## 陸服衣櫃條件搜尋

獨立模組位於 [`cn-search/`](cn-search/)。

- **日常**：雙擊 `cn-search/開啟陸服搜尋.bat`（不需 npm install）
- **建索引**：repository 的 npm workspace 管理 opencc-js，詳見 [`cn-search/README.md`](cn-search/README.md)

## Development / Gate 1

Use Node.js 24. Modernized page runtimes use browser-native ES modules while remaining legacy compatibility scripts stay explicit; there is no bundler.
All existing HTML paths and the repository-root GitHub Pages site are unchanged.
Deployed pages need no npm server. Local CN search still needs HTTP to load JSON;
its existing launcher works without installing development dependencies.

From the repository root:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run validate:data
npm run check
```

The root `package-lock.json` locks development dependencies for the repository
and its `cn-search` workspace. CI installs them with `npm ci --ignore-scripts`
and runs `npm run check`.
Do not maintain a separate lockfile in `cn-search/`.

Tests use Node's built-in test runner: VM-loaded `tool.js` cloning plus ESM `model.mjs`
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

Gate 5A originally introduced thin classic wardrobe/inventory compatibility bridges so the main matcher could adopt named wardrobe fields without a full module migration. That bridge preserved the existing `mainType:id,id|` inventory format, `myClothesNew` key, legacy fallback, and cookie fallback while removing numeric wardrobe indexes from model construction. Gates 7B–7E later moved every active consumer to the canonical ESM boundaries and retired those classic bridge files entirely.

Gate 5B migrates BigUse away from reverse-adapting `Clothes` through `toCsv()` and `clothesSet` lookups. The BigUse domain owns A/B cart selection, the established ±10% score comparison rule, and legacy image-id derivation from named `Clothes` fields. Gate 7A later made `src/domain/biguse/index.mjs` the canonical browser entry and Gate 7E retired the old classic runtime bridge. BigUse buttons/autocomplete pass the actual `Clothes` object into the selected cart, while rendering reads named type/id data.

Gate 5C originally migrated Wardrobe Check and Material tools onto the same wardrobe/inventory boundaries while both were still classic scripts. Those entry points have since moved to direct ESM imports in Gates 7B/7C. Gate 5D consolidates duplicated inventory behavior into the shared inventory domain and centralizes localStorage/cookie fallback in `readBrowser()` / `writeBrowser()`. Later ESM gates consume that shared boundary directly, and Gate 7E removes the final BigUse compatibility chain. ESLint covers the modernized runtimes so accidental globals fail CI.

Gate 6A removes the legacy pieces that can be retired without rewriting the application UI. Active HTML entry points no longer use inline event handlers; `src/legacy/page-events.js` owns native DOM event binding and reproduces the Bootstrap 3 button-toggle behavior used by the matcher pages. Bootstrap JavaScript 3.3.5 and inherited Google Analytics are removed, while Bootstrap CSS remains to preserve layout/classes. Wardrobe Check is jQuery-free.

Gate 6B removes the main matcher's jQuery runtime dependency. `index.html` uses `src/legacy/native-dom.js`, a repository-owned native DOM facade, instead of `jquery.js`; the then-classic Main runtime was migrated to `.mjs` in Gate 7D and the classic copies were deleted in Gate 7E. The sticky-header helpers formerly hidden inside `jquery.freezeheader.js` were reimplemented with native DOM APIs, allowing that plugin file to be retired as well.

Gate 6C removes BigUse's remaining jQuery dependency. `biguse.html` reuses `src/legacy/native-dom.js` and loads `src/legacy/native-autocomplete.js` instead of `jquery.js` / `jquery.autocomplete.min.js`; the old autocomplete plugin is retired and its missing CSS reference is removed. BigUse name matching remains regression-tested through the canonical ESM domain, and Gate 7E migrates the remaining BigUse runtime to `biguse*.mjs`.

Gate 6D removes Material's remaining jQuery dependency and the unused Knockout load. Material uses the shared native DOM facade plus `src/legacy/material-actions.js`; generated links/selects use delegated `data-material-action` / `data-material-change` bindings instead of inline handlers, and the retired `jquery.js` / `knockout.js` vendor files are removed from the repository. Gate 7C later migrates the Material runtime itself to ESM while preserving this delegated event boundary.

Gate 7-Prep adds a Playwright browser smoke harness before the ESM migration begins. `tests/browser/smoke.spec.mjs` boots the main matcher, BigUse, Material, and Wardrobe Check through the same static dev server used by local tooling; page errors, console errors, and same-origin HTTP failures fail the smoke gate. Each page also performs one small user-path assertion so a successful HTTP response alone cannot masquerade as a working runtime. The harness caught and fixed a native-DOM compatibility regression where `.attr(name, undefined)` incorrectly broke method chaining. Run it locally with `npm run test:browser`. CI installs Chromium and runs the smoke suite after the existing Node/data quality gate.

Gate 7A adds browser-native ESM domain entries without changing page runtime at that stage. `src/domain/wardrobe/index.mjs` re-exports the canonical schema/adapter, while `src/domain/inventory/index.mjs` and `src/domain/biguse/index.mjs` expose ESM versions of the existing domain boundaries. Node parity tests lock their behavior to the temporary classic bridges, including legacy inventory serialization/error behavior and BigUse score/image/autocomplete semantics. The Playwright smoke suite also imports all three entries directly from the static server, proving that GitHub-Pages-style hosting serves the module graph correctly.

Gate 7B makes Wardrobe Check the first active page to consume those ESM APIs directly. `wardrobechk.html` now loads `wardrobechk.mjs` with `type="module"` and no longer loads the wardrobe/inventory classic bridges. The module imports `rowToWardrobeItem`, `createInventory`, and `readBrowser` directly, and generated category links use native event listeners rather than global inline handlers. Browser smoke asserts the page boots while `WardrobeDomain` and `InventoryDomain` remain absent from `globalThis`, reducing the classic bridge consumer set from three entry chains to two.

Gate 7C migrates Material's model/UI chain to ESM. `material.html` loads `material.mjs`; `material.mjs` imports `material_model.mjs`, and the model imports the wardrobe/inventory ESM entries directly. The old `material.js` / `material_model.js` files are retired. Material's generated actions use an explicit `MaterialActions.register()` registry so module-scoped functions do not need to be leaked back onto `window`. The migration also removes two classic-script assumptions exposed by ESM strict/deferred execution: shopping-cart initialization no longer relies on top-level `this`, and app startup occurs only after module state/action registration is complete.

Gate 7D migrates the Main Matcher runtime to a single browser-native `main.mjs` entry. The model imports wardrobe/inventory ESM APIs directly, UI/controller/strategy/support files are explicit modules, and the pure `accMul()` helper moves from controller ownership into `model.mjs` to avoid a model-to-controller cycle. Main page events use an explicit `MainActions.register()` registry rather than leaking module functions back onto `window`. At the end of Gate 7D, BigUse temporarily remained on the old classic Main chain because it relied on late-binding function overrides; Gate 7E removes that final compatibility dependency.

Gate 7E migrates BigUse to `biguse.mjs`, `biguse_model.mjs`, `biguse_ui.mjs`, and `biguse_nikki.mjs`. The former load-order overrides for `drawTable`, `chooseAccessories`, and `switchCate` are now explicit runtime hooks configured by the BigUse entry before shared Main initialization. BigUse imports the canonical Main and BigUse ESM APIs directly, while its A/B cart buttons and autocomplete remain behavior-compatible. With all active pages on ESM boundaries, the old root Main/BigUse `.js` compatibility files and `src/domain/{wardrobe,inventory,biguse}/runtime.js` bridges are deleted. Browser smoke asserts BigUse boots with no `WardrobeDomain`, `InventoryDomain`, or `BigUseDomain` globals.

Gate 8A adds TypeScript 7 in check-only mode without converting runtime files to `.ts` or adding a bundler. `tsconfig.json` uses `allowJs`, `checkJs`, and `noEmit` over the active browser ESM application graph with strict mode deliberately deferred. The first baseline contains 76 known diagnostics, primarily string/number reuse, inferred variable-type conflicts, DOM narrowing, and a few legacy API/signature issues. `npm run typecheck` compares current diagnostics against the committed `typecheck-baseline.json`; any new, resolved, or changed diagnostic fails until the baseline change is deliberately reviewed with `npm run typecheck:update`. `npm run typecheck:raw` exposes the underlying `tsc` failures directly. `npm run check` includes the baseline-aware typecheck, so CI enforces that the TypeScript debt cannot silently grow while later Gate 8 batches reduce it.

Gate 8B adds explicit type contracts to the canonical `wardrobe`, `inventory`, and `biguse` domains while keeping runtime files as browser-native `.mjs`. Wardrobe types lock the 18-column row shape, identity fields, and named rating keys; non-identity persisted values remain intentionally opaque until the model/scoring gate refines their normalized runtime meaning. Inventory types cover serialized state, generic inventory instances, storage/cookie boundaries, and browser storage compatibility. BigUse types cover score comparisons, piece identity, and autocomplete suggestions. Domain implementation files use JSDoc type imports only, so no `.d.ts` file is loaded at runtime. The inventory cookie expiry path now uses the standard `Date.toUTCString()` API, reducing the TypeScript baseline from 76 to 75 diagnostics with zero diagnostics remaining under `src/domain/**`.

Gate 8C adds shared model/scoring contracts in `src/domain/scoring/types.d.ts` for feature names, rating tuples, clothes types, criteria/bonus shapes, score buckets, and scoring clothing dependencies. Both `model.mjs` and `material_model.mjs` consume those contracts through JSDoc type imports while remaining browser-native `.mjs`. The migration removes legacy `var` index reuse that made one variable alternate between string keys and numeric loop indexes, replaces implicit `toFixed()` string coercion with explicit numeric conversion, and keeps rating conversion semantics explicit through `Number(...)`/string lookup boundaries. The TypeScript baseline drops from 75 to 57 diagnostics, with zero diagnostics remaining in either model file. Gate 8C validation is `npm run check` PASS with 87/87 Node tests and all four wardrobe validators at zero errors, plus Playwright browser smoke 5/5 PASS. Gate 8D can therefore focus on inventory/shopping-cart typing without inheriting unresolved model diagnostics.

Gate 8D adds `src/domain/shopping-cart/types.d.ts` with explicit cart map, total-summary, comparator, matcher-cart, and Material-cart contracts. Main and Material inventory factories now expose concrete `Inventory<ScoringClothing>` JSDoc boundaries; Main/BigUse carts use the matcher contract while Material keeps its existing count-style `contains()` and nullable initialization summary instead of pretending both implementations are identical. Wardrobe Check also exposes a concrete inventory item/instance type. The legacy third UI argument accepted by `toggleInventory()` is now explicit and optional, removing the three existing TypeScript call-signature diagnostics without changing behavior. The TypeScript baseline drops from 57 to 54 diagnostics; remaining DOM narrowing and unrelated controller/UI diagnostics are deferred to Gate 8E. Gate 8D validation is `npm run check` PASS with 91/91 Node tests and all four wardrobe validators at zero errors, plus Playwright browser smoke 5/5 PASS.

Gate 8E clears the remaining non-strict application diagnostics across `material.mjs`, `nikki.mjs`, `clock.mjs`, `sharewardrobe.mjs`, `onekeystrategy.mjs`, `onekeystrategy_lan.mjs`, and `wardrobechk.mjs`, with regression coverage in `tests/gate8e-ui-app-typing.test.mjs` and the baseline updated in `typecheck-baseline.json`. DOM reads are narrowed to their concrete element types, `for...in` indexes are converted or renamed where numeric intent is required, boolean state no longer relies on bitwise assignment, legacy Date usage moves to `getFullYear()`, and share/clock helpers make string-number conversion explicit. Material and lazy-strategy loops keep their established behavior while removing function-scoped `var` type collisions. `npm run typecheck:raw` now exits successfully with zero diagnostics and the committed baseline is empty. Gate 8E validation is `npm run check` PASS with 95/95 Node tests and all four wardrobe validators at zero errors, plus Playwright browser smoke 5/5 PASS. No generated wardrobe data or active HTML entry point is changed. Gate 8F can therefore focus exclusively on enabling stricter compiler options rather than paying down pre-existing non-strict diagnostics.

Gate 8F-1 enables runtime/null strictness while deliberately leaving implicit-`any` migration for later sub-gates. `tsconfig.json` keeps `strict: false` and `noImplicitAny: false`, but now enables `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, and `useUnknownInCatchVariables`. The branch also adds a type-only native DOM facade contract so event callbacks receive contextual element types without changing browser runtime loading, and preserves the empty TypeScript baseline. Strictness probes exposed and fixed several concrete legacy defects during this work: lazy-strategy tag cleanup now decrements the current `tagSet[i]` entry instead of a stale `tagCate`, bulk inventory emptiness checks use `Object.keys(...)` rather than nonexistent object `.length`, and inventory size aggregation reads the actual persisted subtype key. Full `noImplicitAny` remains separate follow-up work rather than being silently bundled into Gate 8F-1. Gate 8F-1 validation is `npm run check` PASS with 101/101 Node tests and all four wardrobe validators at zero errors, plus Playwright browser smoke 5/5 PASS and a zero-diagnostic TypeScript baseline.

Gate 8F-2 enables `noUncheckedIndexedAccess` on the same active ESM graph while keeping `strict: false` and `noImplicitAny: false`. The index-safety work prepared during Gate 8F-1 replaces unchecked array/map reads with local guards, `for...of` iteration, tuple typing, and explicit fallbacks across inventory, wardrobe check, scoring/cart validation, Material, Nikki, share encoding, and lazy-strategy code. No new diagnostic baseline is introduced: `npm run typecheck` remains at zero known diagnostics. Gate 8F-2 validation is `npm run check` PASS with 102/102 Node tests and all four wardrobe validators at zero errors, plus Playwright browser smoke 5/5 PASS. The gate therefore hardens array/map access without mixing in the separate implicit-`any` migration planned for later Gate 8F sub-gates.

Gate 8F-3 enables `exactOptionalPropertyTypes` while retaining the same deliberate `strict: false` / `noImplicitAny: false` boundary. The active ESM graph required no runtime changes for this compiler option after the earlier domain/model/UI contract work: a fresh probe and the committed configuration both remain at zero TypeScript diagnostics. Regression coverage now asserts the option stays enabled independently of later implicit-`any` work. Gate 8F-3 validation is `npm run check` PASS with the TypeScript baseline still empty, 103/103 Node regression tests passing, all four wardrobe validators at zero errors, and Playwright browser smoke 5/5 PASS.

Gate 8F-4 enables `noImplicitThis` across the active ESM graph while continuing to defer the much larger `noImplicitAny` migration. A fresh compiler probe with `noImplicitThis` enabled reports zero diagnostics, so this gate requires no runtime edits and simply makes accidental implicit `this` usage a compiler error. Regression coverage locks the option on while preserving `strict: false`, `noImplicitAny: false`, and the empty TypeScript baseline. Gate 8F-4 validation is `npm run check` PASS with 104/104 Node regression tests and all four wardrobe validators at zero errors, plus Playwright browser smoke 5/5 PASS.

Gate 8F-5 begins the staged `noImplicitAny` migration with the canonical `src/domain/**` graph rather than enabling the option across the entire legacy application at once. `tsconfig.no-implicit-any.json` extends the main check-only configuration, enables `noImplicitAny`, and initially scopes enforcement to domain modules; `npm run check` now runs this stricter subgraph gate in CI. The remaining domain diagnostics were limited to two untyped browser codec fallbacks and one unchecked BigUse image-prefix key, all fixed with type-only JSDoc/narrowing and no behavioral change. The main `tsconfig.json` intentionally keeps `noImplicitAny: false` until later sub-gates absorb the legacy application/UI graph. Gate 8F-5 validation is `npm run check` PASS with the strict domain subgraph at zero diagnostics, the global TypeScript baseline still empty, 105/105 Node regression tests passing, all four wardrobe validators at zero errors, and Playwright browser smoke 5/5 PASS.

Gate 8F-6 expands staged `noImplicitAny` enforcement from the canonical domain graph to eight smaller application/UI boundaries: `clock.mjs`, `main.mjs`, `biguse.mjs`, `biguse_nikki.mjs`, `sharewardrobe.mjs`, `wardrobechk.mjs`, `biguse_ui.mjs`, and `ui.mjs`. Because those modules import larger legacy files that are reserved for later sub-gates, the staged checker now type-checks the full active ESM graph with `noImplicitAny: true` but fails CI only for diagnostics belonging to already-migrated files; this preserves real imported types without accidentally absorbing the remaining legacy graph into Gate 8F-6. The initial 91 diagnostics in these eight boundaries are reduced to zero with JSDoc contracts, browser-global typing, dictionary/tuple narrowing, and index guards while preserving runtime behavior and existing source-level regression contracts. Gate 8F-6 validation is `npm run check` PASS with the global TypeScript baseline still empty, the staged strict scope at zero diagnostics, 106/106 Node regression tests passing, all four wardrobe validators at zero errors, and Playwright browser smoke 5/5 PASS. The remaining application graph stays outside staged enforcement for later `noImplicitAny` gates.

Gate 8F-7 adds `onekeystrategy.mjs` to staged `noImplicitAny` enforcement as a deliberately single-file batch rather than absorbing the larger model/controller/material graphs. The file started with 69 strict diagnostics and now reaches zero through JSDoc contracts for scoring/criteria/browser globals, explicit result/category dictionaries, and guarded indexed reads while keeping the existing strategy rendering flow and category keys intact. The staged strict scope is now `src/domain/**` plus nine application/UI modules, with 927 diagnostics remaining outside enforcement for later gates. Gate 8F-7 validation is `npm run check` PASS with the global TypeScript baseline still empty, 107/107 Node regression tests passing, all four wardrobe validators at zero errors, and Playwright browser smoke 5/5 PASS. A direct browser probe also clicks the one-key strategy control and confirms the strategy panel renders without page or console errors.

Gate 8F-8 adds `model.mjs` to staged `noImplicitAny` enforcement as a single-file model batch. The file begins with 75 strict diagnostics and reaches zero through typed browser globals, explicit model/factory contracts, local `ModelClothing` state, FeatureName-safe score-map iteration, guarded indexed reads, and typed shopping-cart/inventory boundaries. Because the not-yet-migrated controller and lazy-strategy consumers still depend on the model's historically loose collection surface, internal work uses strict `typedClothes` / `typedClothesSet` collections while exported `clothes` / `clothesSet` remain narrow legacy `any` aliases that reference those same objects without copies or runtime changes. This keeps the global TypeScript baseline at zero instead of leaking 85 premature diagnostics into later consumer gates. The staged scope is now `src/domain/**` plus ten application/UI modules, with 771 diagnostics remaining outside enforcement. Gate 8F-8 validation is `npm run check` PASS with 108/108 Node regression tests, all four wardrobe validators at zero errors, the main TypeScript baseline at zero, the staged strict scope at zero diagnostics, and Playwright browser smoke 5/5 PASS.

Gate 8F-9 adds `onekeystrategy_lan.mjs` to staged `noImplicitAny` enforcement as a single-file lazy-strategy batch. The file starts with 148 diagnostics and reaches zero by typing browser globals, function/callback parameters, state arrays, and dynamic strategy maps while deliberately keeping the historically flexible keyword/tag/result objects behind a local explicit `LegacyDict = Record<string, any>` seam. This gate therefore removes implicit `any` without pretending the legacy dynamic dictionaries are a newly designed structural model, and it preserves the Gate 8F-1 tag cleanup fix that decrements `tagSet[i]` rather than the stale category key. The staged scope is now `src/domain/**` plus eleven application/UI modules, with 623 diagnostics remaining outside enforcement. Gate 8F-9 validation is `npm run check` PASS with 109/109 Node regression tests, all four wardrobe validators at zero errors, the main TypeScript baseline at zero, the staged strict scope at zero diagnostics, and Playwright browser smoke 5/5 PASS. A direct browser probe also enables the lazy-strategy filter, runs the one-key strategy action, renders the strategy panel successfully, and reports no page or console errors.

Gate 8F-10 adds `material_model.mjs` to staged `noImplicitAny` enforcement as a single-file Material model batch. The file starts with 82 diagnostics and reaches zero by typing browser-global boundaries, wardrobe rows, scoring criteria/raw-score callbacks, numeric helpers, and Material model function parameters; score-bucket iteration now uses the canonical feature list instead of unconstrained string keys, and nullable level/bonus/pattern reads are narrowed locally. The still-unmigrated `material.mjs` consumer remains deferred: exported `clothes` and `clothesSet` intentionally retain explicit loose legacy collection seams while deterministic model internals consume the existing wardrobe/scoring/inventory/cart contracts. This keeps the main TypeScript baseline at zero and avoids pulling the Material UI migration into this gate. The staged scope is now `src/domain/**` plus twelve application/UI modules, with 385 diagnostics remaining outside enforcement. Gate 8F-10 validation is `npm run check` PASS with 110/110 Node regression tests, all four wardrobe validators at zero errors, the main TypeScript baseline at zero, the staged strict scope at zero diagnostics, and Playwright browser smoke 5/5 PASS including the Material page boot/dynamic-scope smoke.

Gate 8F-11 extends staged `noImplicitAny` enforcement to the complete `cn-search/src/**` graph rather than listing individual search modules. The five previously-untyped search files begin with 54 diagnostics and reach zero through explicit wardrobe-row, search-dependency, staging-entry, manual-input, and rendering contracts; category-map indexing is narrowed through a typed lookup boundary, staging collections become explicit, and result rendering guards indexed row reads under `noUncheckedIndexedAccess`. The checker now treats both `src/domain/**` and `cn-search/src/**` as directory-wide enforced graphs while retaining the twelve already-migrated root application/UI modules. Gate 8F-11 validation is `npm run check` PASS with 111/111 Node regression tests, all four wardrobe validators at zero errors, the main TypeScript baseline at zero, the staged strict scope at zero diagnostics, and Playwright browser smoke 5/5 PASS. The remaining not-yet-enforced application graph reports 331 diagnostics for later gates.

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
