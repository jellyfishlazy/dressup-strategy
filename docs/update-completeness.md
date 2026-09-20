# Gate 12F — 完整度檢查

Gate 12F turns the `plan` containers created by Gate 12C into an explicit update checklist and compares that checklist with the source records already collected by Gate 12D and Gate 12E.

The question answered by this gate is:

> Which items were expected for this game update, and which of those expected items have not been collected yet?

This gate does not perform source-to-local mapping and does not write formal repository data.

## Plan versus collection

The Game Update Session now has two distinct concepts:

```text
plan
  wardrobe[]   expected wardrobe items for this update
  levels[]     expected levelsRaw items for this update

collection
  wardrobe[]   source wardrobe rows actually collected by Gate 12D
  levels[]     source level bundles actually collected by Gate 12E
```

The plan is the denominator for completeness.

Collecting an item does not automatically add it to the plan, and planning an item does not automatically collect it.

That separation is intentional:

- planned but not collected = missing;
- planned and collected = completed;
- collected but not planned = unplannedCollected;
- no plan at all = completeness is undefined, not 100%.

## Planned wardrobe records

A planned wardrobe item stores only the source identity/provenance needed for a durable checklist:

```text
key
name
category
id
sourcePath
sourceHash
plannedAt
```

The full source wardrobe row remains the responsibility of Gate 12D collection.

Plan-add validates the exact source key against the session's pinned wardrobe source. Duplicate/ambiguous or structurally invalid source rows cannot be added to the plan.

## Planned level records

A planned level stores:

```text
key
runtimeLabel
themeFilter
sourcePath
sourceHash
plannedAt
```

Only external `levelsRaw` keys can be planned.

The `themeFilter` summary is retained so the missing-item report can remain understandable even when the external source is temporarily unavailable.

The full `levelsRaw / levelFilters / levelBonus / skills / hint / themeFilter` source bundle remains the responsibility of Gate 12E collection.

## API

Import from `scripts/update-completeness.mjs`.

### addPlannedItems(options)

Supported fields:

```text
workspace
sessionId

wardrobeKeys[]
levelKeys[]

expectedWardrobeSourceHash
expectedLevelsSourceHash
```

At least one wardrobe or level key is required.

All requested keys are validated before the session is written. A mixed wardrobe+level plan-add is therefore all-or-nothing: if any requested key is unknown, ambiguous, invalid, or belongs to drifted source data, neither domain is changed.

Already-planned keys are reported as skipped. A fully skipped operation is a true no-op and does not rewrite the session.

Only draft sessions may modify the plan.

### removePlannedItems(options)

Supported fields:

```text
workspace
sessionId
wardrobeKeys[]
levelKeys[]
```

Removal uses persisted plan data only. It therefore continues to work when the external source is missing or has drifted.

Repeated removal is idempotent and a no-op removal leaves session bytes unchanged.

Only draft sessions may modify the plan.

### listUpdatePlan(options)

Returns the saved plan without requiring external source access:

```text
sessionId
status
wardrobe[]
levels[]
```

### checkUpdateCompleteness(options)

Returns:

```text
sessionId
status
planDefined
complete
overall
wardrobe
levels
```

Overall contains:

```text
planned
completed
missing
percent
```

Each domain additionally contains:

```text
planned
completed
missing
percent
complete

missingItems[]
completedItems[]

unplannedCollected
unplannedCollectedItems[]
```

## Completeness rules

For each domain:

```text
planned   = number of plan records
completed = planned keys that also exist in collection
missing   = planned keys absent from collection
percent   = completed / planned * 100
```

Percent is rounded to two decimal places.

Overall totals combine wardrobe and levels.

A session is reported as completeness `complete: true` only when:

1. at least one planned item exists; and
2. every planned wardrobe/level item exists in its corresponding collection.

If the plan is empty:

```json
{
  "planDefined": false,
  "complete": false,
  "overall": {
    "planned": 0,
    "completed": 0,
    "missing": 0,
    "percent": null
  }
}
```

An empty checklist is deliberately not treated as 100% complete.

## Unplanned collected items

Items may already exist in collection without being listed in the plan.

These are reported separately as `unplannedCollected`.

They do not:

- increase the planned count;
- increase the completed numerator;
- reduce the missing count;
- prevent completeness once every planned item is collected.

This makes the report useful both for missing work and for spotting extra source data collected during the update.

## Offline behavior

`check`, `plan-list`, and `plan-remove` use persisted session state and do not require the external wardrobe or level source to exist.

`plan-add` does require the relevant pinned source because it must verify that new expected keys are real, unique and selectable.

Gate 12D/12E collection validators are reused by completeness checking, so corrupt persisted collection records are not silently counted as completed.

Plan records are also validated on every Gate 12F read.

## Source pinning

Plan-add reads the source paths saved by Gate 12C and verifies the exact pinned SHA-256.

Optional expected SHA values can additionally pin the plan operation to a prior search/inspection result.

A source drift failure does not refresh the session snapshot and does not write the plan.

## Session lifecycle

Draft sessions:

- may add/remove plan items;
- may run completeness checks.

Completed/cancelled sessions:

- may list their saved plan;
- may run completeness checks;
- may not change the plan.

Gate 12F does not change Gate 12C lifecycle semantics. It reports checklist completeness independently from the session's lifecycle `status`; it does not automatically block or invoke `completeUpdateSession`.

## CLI

The command is:

```powershell
npm run data:session:completeness -- <command>
```

### Add expected items

```powershell
npm run data:session:completeness -- plan-add --wardrobe-key="分類|001"

npm run data:session:completeness -- plan-add --level-key="1-1"

npm run data:session:completeness -- plan-add \
  --wardrobe-key="分類|001" \
  --wardrobe-key="分類|002" \
  --level-key="1-1"
```

Optional source pins:

```text
--wardrobe-source-hash=<SHA-256>
--levels-source-hash=<SHA-256>
```

### Check what is still missing

```powershell
npm run data:session:completeness -- check
```

The default command is also `check`.

### View / edit the checklist

```powershell
npm run data:session:completeness -- plan-list

npm run data:session:completeness -- plan-remove --wardrobe-key="分類|001"

npm run data:session:completeness -- plan-remove --level-key="1-1"
```

Common options:

```text
--session=<session-id>
--workspace=<path>
```

Every flag uses strict `--option=value` syntax. Wardrobe/level key options may repeat. Singleton options may not repeat.

## Example result

If the update expects two wardrobe items and two levels, but one item in each domain has not yet been collected:

```json
{
  "planDefined": true,
  "complete": false,
  "overall": {
    "planned": 4,
    "completed": 2,
    "missing": 2,
    "percent": 50
  },
  "wardrobe": {
    "planned": 2,
    "completed": 1,
    "missing": 1,
    "missingItems": [
      {
        "key": "Shoes|002",
        "name": "Expected Shoes"
      }
    ]
  },
  "levels": {
    "planned": 2,
    "completed": 1,
    "missing": 1,
    "missingItems": [
      {
        "key": "1-2",
        "runtimeLabel": "source runtime label"
      }
    ]
  }
}
```

## Files

Gate 12F adds:

- `scripts/update-completeness.mjs` — plan persistence and completeness API.
- `scripts/update-completeness-cli.mjs` — strict plan/check CLI.
- `tests/gate12f-completeness.test.mjs` — core checklist/comparison tests.
- `tests/gate12f-completeness-cli.test.mjs` — subprocess/CLI integration tests.
- `docs/update-completeness.md` — this contract.
- `package.json` — `data:session:completeness` npm entry.
- Gate 12 cross-references / README — updated phase status.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12F core tests — 8/8.
- PASS: Gate 12F CLI tests — 7/7.
- PASS: integrated Gate 12C + 12D + 12E + 12F regression — 57/57.
- PASS: targeted ESLint for Gate 12F API, CLI and tests with zero warnings/errors.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 264/264 Node tests; wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: isolated real-source smoke probe — two selectable wardrobe items and two selectable `levelsRaw` items were planned, one from each domain was collected, and completeness reported planned 4 / completed 2 / missing 2 / 50% with the exact remaining keys.
- PASS: external wardrobe and level source bytes remained unchanged during the real-source probe.
- Browser tests were not run because Gate 12F adds no browser UI.

No commit, push, formal data apply or mutation of the real `.update-workspace/` was performed. The real-source smoke probe used a temporary isolated update workspace and removed it afterward.

## Phase boundary

Gate 12F ends after a reliable persisted expected-item checklist and an offline-capable report of:

- what was expected;
- what has been collected;
- what expected items are still missing;
- what extra items were collected outside the plan.

It does not perform:

- conflict resolution / approval;
- Gate 11 staging generation;
- preview/apply into formal repository data;
- browser UI controls.

Gate 12G now consumes this checklist for deterministic read-only mapping and diff classification in [update-diff-preview.md](update-diff-preview.md). Conflict resolution and formal apply remain later Gate 12 phases.
