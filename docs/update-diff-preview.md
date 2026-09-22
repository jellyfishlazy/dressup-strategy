# Gate 12G — 差異預覽

Gate 12G compares the source data already collected into the current Game Update Session with the current local canonical targets.

It is **read-only**. It does not write wardrobe data, level data, staging manifests, generated artifacts, or session collection state.

The preview answers:

- Which planned/collected items are new locally?
- Which map to one existing local target but contain changes?
- Which cannot be treated as an ordinary modification because identity/localization/shared metadata needs manual review?
- Which already match the local target?
- Is Gate 12F still missing planned items?

## Preview scope

Gate 12G previews only items that satisfy both conditions:

1. the item exists in Gate 12F `plan`;
2. the corresponding source record has been collected by Gate 12D / Gate 12E.

Planned-but-missing items are reported as blockers.

Collected-but-unplanned items are reported under `ignoredUnplannedCollected` and do not participate in diff classification.

This keeps the preview aligned with the explicit update checklist instead of silently expanding the update because extra source data happened to be collected.

## Status model

Every previewed item receives one status:

```text
new
modified
conflict
unchanged
```

### new

A deterministic local target identity can be derived, but no local target currently exists.

### modified

A deterministic one-to-one local target exists and there are differences that can be represented as an ordinary data change.

### conflict

The preview refuses to treat the item as a normal modification because at least one condition requires manual review.

Examples:

- local wardrobe identity is ambiguous;
- source wardrobe category cannot be mapped;
- translated/localized wardrobe name, source, or suit differs;
- mapped level key belongs to a different primary level table;
- local level metadata exists while the source bundle says that metadata is absent;
- a shared `themeFilter` name/prefix cannot be matched safely.

### unchanged

A deterministic local target exists and all comparable data matches after the documented normalization/mapping rules.

## Wardrobe mapping

The local target is the canonical Gate 11A wardrobe:

```text
data/wardrobe.js
```

Source wardrobe identity is mapped as:

```text
source category + source id
    ↓
explicit CN2TW category map when defined
    ↓
otherwise exact category pass-through only when the local category exists
    ↓
target category + exact string id
```

IDs retain leading zeroes.

No fuzzy identity matching is used.

If the mapped target key appears more than once locally, the item is a conflict.

### Wardrobe candidate normalization

For comparison only, the first 18 collected source columns are converted into a local candidate:

- name: OpenCC CN→TW conversion;
- category: explicit category mapping;
- id: exact string identity;
- stars / ratings: source values preserved;
- tags: explicit known tag overrides, then TW normalization / OpenCC fallback;
- source / suit: aligned against the current local wardrobe lexicon;
- version: aligned against the current local lexicon, with OpenCC fallback.

External columns after the canonical 18-column core remain source provenance and are not compared against the local 18-column target.

### Wardrobe modified versus conflict

Differences in the following localized fields require manual review and therefore produce `conflict`:

```text
name
source
suit
```

Other deterministic field differences produce `modified`, for example rating/star changes or canonicalized tag/version changes.

The preview includes field-level `before` / `after` differences.

## Level mapping

Gate 12G previews collected external `levelsRaw` records against canonical Main levels:

```text
data/levels.js
```

The real-source audit on 2026-09-21 established the deterministic key rules used by the preview:

```text
external 1-1        -> local I-1-1
external 12-3       -> local I-12-3

external II-1-1     -> local II-1-1
external III-4-1    -> local III-4-1
```

Rule:

- keys beginning with an Arabic digit receive the local `I-` prefix;
- keys already beginning with `II-` or `III-` remain unchanged;
- other patterns are not guessed and become mapping conflicts.

The audit found:

- 519 external `levelsRaw` entries;
- 186 matching local keys directly;
- 240 matching through the `I-` rule;
- 93 not yet present locally;
- all 93 not-yet-present keys were `III-*` entries.

No fuzzy level-name matching is used.

## Level surfaces compared

For an existing mapped `levelsRaw` target, Gate 12G compares:

```text
levelsRaw
levelFilters
levelBonus
addSkillsInfo   <- collected as skills
addHintInfo     <- collected as hint
themeFilter
```

Source strings inside level metadata are converted CN→TW before comparison.

### Metadata absence

A source metadata record that exists locally but is absent from the collected source bundle is treated as a conflict, not an automatic deletion.

Gate 12G does not infer that local metadata should be removed.

### themeFilter

Collected source theme groups are normalized for preview:

- theme names use CN→TW conversion;
- `關卡: 1-` style first-volume prefixes receive the same `I-` key convention;
- exact local name+prefix is unchanged;
- one existing local theme using the same prefix is accepted as an alias;
- missing theme is an ordinary add/modify difference;
- conflicting or ambiguous shared prefixes are conflicts.

Because `themeFilter` is shared by multiple levels, unsafe replacement is never inferred.

## Completeness and blockers

Gate 12G reuses Gate 12F completeness before classification.

Possible blockers include:

```text
plan-not-defined
missing-planned-wardrobe
missing-planned-level
diff-conflict
```

A preview may still show differences for the planned items already collected even when other planned items are missing.

`readyForNextGate` is true only when:

1. Gate 12F reports the plan complete; and
2. Gate 12G reports zero conflicts.

New and modified items are not blockers by themselves.

## Output shape

The API returns:

```text
sessionId
sessionStatus
mode = read-only-preview

targets
  wardrobe
    id
    path
    sha256
  levels
    id
    path
    sha256

completeness

summary
  total
  new
  modified
  conflict
  unchanged

wardrobe
  summary
  items[]
  ignoredUnplannedCollected[]

levels
  summary
  items[]
  ignoredUnplannedCollected[]

blockers[]
readyForNextGate
```

Each modified/conflict record contains detailed differences and mapping information.

## API

Use:

```js
import { buildUpdateDiffPreview } from './scripts/update-diff-preview.mjs';
```

The function is asynchronous because the comparison uses the repository OpenCC dependency for deterministic CN→TW normalization.

Normal options:

```text
workspace
sessionId
```

Read-only target overrides exist for testing/audit:

```text
wardrobeTargetPath
levelsTargetPath
```

They change only what files are read for preview. Gate 12G never writes them.

## CLI

Run:

```powershell
npm run data:session:diff -- preview
```

`preview` is the default command, so this is equivalent:

```powershell
npm run data:session:diff
```

Common options:

```text
--session=<session-id>
--workspace=<path>
```

Read-only audit overrides:

```text
--wardrobe-target=<path>
--levels-target=<path>
```

Help:

```powershell
npm run data:session:diff -- --help
```

## Safety boundary

Gate 12G must never:

- write `data/wardrobe.js`;
- write `data/levels.js`;
- change the update session;
- add/remove plan items;
- add/remove collected items;
- accept conflicts;
- generate Gate 11 staging manifests;
- apply changes;
- rebuild generated artifacts.

Those actions remain explicit later phases.

## Files

Gate 12G adds:

- `scripts/update-diff-preview.mjs`;
- `scripts/update-diff-preview-cli.mjs`;
- `tests/gate12g-diff-preview.test.mjs`;
- `tests/gate12g-diff-preview-cli.test.mjs`;
- `docs/update-diff-preview.md`;
- `package.json` entry `data:session:diff`.

Gate 12 cross-references and README are updated to reflect the new preview stage.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12G core preview tests — 5/5.
- PASS: Gate 12G CLI tests — 5/5.
- PASS: integrated Gate 12C + 12D + 12E + 12F + 12G regression — 67/67.
- PASS: targeted ESLint for the Gate 12G API, CLI and tests with zero warnings/errors.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 274/274 Node tests; wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: real-source mapping audit — 519 external `levelsRaw` entries: 186 direct-key matches, 240 deterministic `I-` matches, 93 not yet local; all 93 not-yet-local entries are `III-*`. External wardrobe: 37,541 source rows, 31,561 current local mapped identities, 5,980 missing local identities, zero unmapped source categories.
- PASS: isolated real-source smoke preview — selected source wardrobe keys `发型|489` / `发型|001` and level keys `1-1` / `III-4-1`; preview classified two new and two conflict records while preserving exact mapped local keys.
- PASS: external wardrobe, external levels, canonical wardrobe and canonical Main levels remained byte-identical during the real-source preview.
- Browser tests were not run because Gate 12G adds no browser UI.

No commit, push, conflict acceptance, staging generation, formal data apply, generated rebuild, or mutation of the real `.update-workspace/` was performed. Real-source probes used isolated temporary update workspaces and removed them afterward.

## Phase boundary

Gate 12G ends at a deterministic, read-only comparison of the planned collected source data against the current canonical local targets.

It does not:

- resolve a conflict;
- create an approval decision;
- generate an apply-ready staging payload;
- write formal repository data;
- rebuild derived artifacts;
- provide browser UI controls.

Conflict review and durable decisions are now supplied by Gate 12H in [update-conflict-review.md](update-conflict-review.md). Apply-ready staging generation, formal apply and browser controls remain later Gate 12 phases.
