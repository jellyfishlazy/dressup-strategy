# Gate 12D — 服裝搜尋 / 加入本次更新

Status (2026-09-21): core API and CLI integration complete; full `npm run check` PASS. Core ticket: `TICKET-G12D-CORE-20260921-A`, followed by parent GPT integration and independent validation. This gate supplies the collection backend and command-line entry, not a browser interface or canonical data apply.

## Synchronous API

Import named exports from `scripts/update-wardrobe.mjs`. All return plain JSON-compatible values and throw on invalid input or unavailable required data. Common options are `workspace` (defaults to `DEFAULT_UPDATE_WORKSPACE`) and optional `sessionId` (otherwise resolves the current session). Missing current sessions and unsafe session path components are rejected.

- `searchUpdateWardrobe(options = {})`: accepts `query`, `name`, `category`, `sourceId`, `suit`, `source`, `tag`, `version`, `offset` and `limit`. Returns `{sessionId, total, offset, limit, items, sourceHash, warnings}`.
- `addWardrobeToUpdate(options = {})`: requires a nonempty string array `keys`, optionally `expectedSourceHash`. Returns `{session, addedKeys, skippedKeys}`.
- `listUpdateWardrobe(options = {})`: returns `{sessionId, status, count, items}` from saved collection data only.
- `removeWardrobeFromUpdate(options = {})`: requires a nonempty string array `keys`. Returns `{session, removedKeys, skippedKeys}`.

Search items expose `key`, `index`, `name`, `category`, `id`, `suit`, `source`, `tags`, `version`, `collected`, `selectable`, and `warnings`. Index is zero-based source order. Text filters use case-insensitive AND tokens, reusing `tokens`/`matchAll`; all supplied filters must match. `query` searches the combined exposed source strings. Category and source ID compare exactly, including leading zeros and character variants. Omitted filters impose no restriction; an explicitly empty category or source ID matches that exact empty value. Pagination defaults to offset 0 / limit 50; offset must be a nonnegative safe integer and limit an integer from 1 to 500. Numeric strings, null, fractions and nonfinite numbers are rejected. Empty searches are allowed, with stable source-order pagination.

Terms operate on **external source text**. There is no simplified/traditional conversion, category mapping, fuzzy identity, canonical conversion, or local matching. Tags, source, suit and version use external columns 14, 15, 16 and 17 respectively.

## Pinned source and collection

Search and add call Gate 12B `readExternalWardrobe` with the session's saved absolute `sourceSnapshot.files.wardrobe`. They verify its SHA against `sourceSnapshot.hashes.wardrobe`, without refreshing the snapshot or consulting an index/environment fallback. Add re-reads the source and resolves every requested key before saving anything. An optional expected hash must also match. Missing files, drift, unknown keys, malformed keys or nonselectable records fail the whole batch without changing session bytes.

Duplicate identities remain searchable, with **every** occurrence nonselectable. Short rows (fewer than 18 cells), invalid cells and missing/invalid name or identity also remain searchable with warnings. Accepted cells are strings, finite numbers or booleans; null, undefined, structured values and nonfinite numbers are invalid. Names/categories must be nonempty strings; IDs must be nonempty strings or finite numbers. Category/ID cannot contain the `|` key delimiter. No canonical 18-column schema validation is imposed.

Each saved record contains `key,index,name,category,id,row,coreRow,extraColumns,sourcePath,sourceHash,collectedAt`. Full external rows, including all columns beyond 18, are retained. Repeated/already-collected keys are skipped without replacement. Skip arrays report each skipped occurrence in request order. A fully skipped batch performs no write, preserving timestamps and bytes. Successful mutations save once and return a freshly loaded, validated session.

Only draft sessions can add/remove. Collection changes leave plan, level collection, source provenance and lifecycle fields intact (the session update timestamp changes on a real save). Collection is not a plan or a completeness calculation. Search/list may inspect terminal sessions with an explicit ID. List/remove work without source access, even when the source is missing or drifted. Persisted records are checked for valid identity, unique keys, index bounds, row/core/extra consistency, pinned path/hash and ISO timestamp before use. Gate 12C empty collections remain valid. Offline validation cannot authenticate a deliberately forged record against unavailable source bytes.

## Concurrent saves

The minimal `update-session.mjs` safety change records the original file bytes in a private WeakMap when loading a session. `saveUpdateSession` requires that loaded object (or one returned by create/save), obtains an exclusive `session.json.lock` with `wx`, compares current bytes to the loaded revision, and only then performs the existing atomic write. Stale saves fail and require reload/retry. A deserialized/copied object cannot bypass the revision check. Lifecycle complete/cancel writers use this same save path, protecting against lost collection writes and stale draft resurrection.

Lock contention fails immediately. Only the writer's own token is eligible for cleanup; another process's lock is never reclaimed. A crash can leave a lock requiring manual recovery after confirming its owner has exited. This protects cooperating session persistence writers; direct file editors do not honor the lock. Current-session pointer activation is separate, not a transaction with collection saving; each operation resolves its session once. No-op operations do not acquire a write lock. No automatic retries or source refresh occur.

The source reader retains Gate 12B's trusted-local-JavaScript VM boundary. Search/add scan the source on each call; pagination bounds returned items, not parsing cost. Only the wardrobe hash is pinned/checked here; level source handling is Gate 12E work.

## CLI

The dedicated command is `npm run data:session:wardrobe -- <command>`. If PowerShell blocks the npm shim, use `npm.cmd` instead of `npm`.

```powershell
# Create the Gate 12C update container first, or activate an existing draft.
npm run data:session -- create --name="本次遊戲更新"

# Search using source text. More than one word means all words must match.
npm run data:session:wardrobe -- search --name="服裝名稱"
npm run data:session:wardrobe -- search --suit="來源套裝名稱" --limit=50
npm run data:session:wardrobe -- search --category="來源分類" --source-id="001"

# Copy exact key values from the search result; --key may be repeated.
npm run data:session:wardrobe -- add --key="來源分類|001" --key="來源分類|002"

# Saved collection inspection/removal does not require the source file.
npm run data:session:wardrobe -- list
npm run data:session:wardrobe -- remove --key="來源分類|001"

npm run data:session:wardrobe -- --help
```

Common flags are `--workspace=<path>` and `--session=<session-id>`; omission uses the current update. Search supports `--query`, `--name`, `--category`, `--source-id`, `--suit`, `--source`, `--tag`, `--version`, `--offset`, and `--limit`. Add also accepts `--source-hash=<search-result-SHA-256>`. Every flag requires the `--flag=value` form. Unknown/cross-command flags, repeated singleton flags, missing keys and malformed pagination fail with a nonzero exit code. Successful commands output JSON. An omitted command defaults to `list`.

`total` is the number of all matches, not just the current page. A page limit is not a suit-completeness assertion, and searching a suit does not implicitly add its full contents. Add only collects the explicitly supplied keys.

## Changed files and handoff

The complete Gate 12D changes are:

- `scripts/update-wardrobe.mjs` — four core API exports.
- `scripts/update-session.mjs` — safe session IDs/path identity, loaded revision tracking and exclusive stale-write protection.
- `scripts/update-wardrobe-cli.mjs` — strict search/add/list/remove CLI and help.
- `tests/gate12d-update-wardrobe.test.mjs` — independent temporary fixtures with cleanup and core/safety regression coverage.
- `tests/gate12d-update-wardrobe-cli.test.mjs` — parsing, subprocess and persistent collection integration tests.
- `package.json` — `data:session:wardrobe` entry.
- `README.md` — Gate 12D entry and explicit phase boundary.
- `docs/game-update-session.md` — cross-reference and updated persistence contract.
- `docs/update-wardrobe.md` — API, CLI, limitations and validated handoff (this file).

Existing Gate 12B/12C dirty work is preserved. No UI, dependency, canonical/generated dataset or external dataset changes were made. No commit, push, source refresh, real-session collection mutation or formal data apply was performed.

Validation executed on 2026-09-21:

- PASS: `node --test tests/gate12c-update-session.test.mjs tests/gate12d-update-wardrobe.test.mjs` — 16 tests passed, 0 failed (final run).
- PASS: `node node_modules/eslint/bin/eslint.js scripts/update-wardrobe.mjs scripts/update-session.mjs tests/gate12d-update-wardrobe.test.mjs` — exit 0. An initial test-only `structuredClone` lint error was corrected before the final run.

Parent integration validation executed on 2026-09-21:

- PASS: syntax checks and ESLint for the new CLI and CLI tests.
- PASS: `node --test tests/gate12d-update-wardrobe-cli.test.mjs` — 11/11 passed, including fresh subprocess reloads, all-or-nothing batches, byte-identical no-op repeats, source drift, offline removal and archived mutation guards.
- PASS: `npm.cmd run check` — lint with zero warnings; TypeScript baseline 0 known / 0 new diagnostics; 234/234 tests; wardrobe data validation with zero errors; Main and BigUse level validation PASS. Existing documented legacy duplicate groups remain unchanged.
- PASS: real external source smoke probe in an isolated temporary update workspace — 37,541 rows, all 20 columns; exact-ID and name searches; add 3, repeat without file changes, remove 1, reload count 2. Full rows preserved. Source wardrobe SHA-256: `74a38f6a4ced3ee22f77763f591a91dfd7a96071f30297a9ba9abdd48dec9b51`.
- The probe compared external wardrobe/level bytes, the six inspected canonical/compatibility files, and all existing files in the real `.update-workspace/` before/after; all were unchanged. Its temporary workspace was removed. An initial probe-only `Array.map(resolve)` argument error occurred before temporary-session creation; the corrected probe passed.

Browser/visual tests were not run because this gate adds no browser UI. `npm run check` does not include `test:browser`, so its PASS must not be represented as browser verification.

Gate 12E level search/collection is implemented separately in [update-levels.md](update-levels.md), Gate 12F provides the expected-item plan/completeness report in [update-completeness.md](update-completeness.md), and Gate 12G now performs deterministic read-only wardrobe/local diff classification in [update-diff-preview.md](update-diff-preview.md). Remaining phase work is conflict resolution/approval, apply integration and browser controls. Wardrobe search terms still use source text. Gate 12D does not automatically update formal wardrobe data or infer that an entire suit has been collected.
