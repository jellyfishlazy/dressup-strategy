# Gate 12I — Apply-ready staging

Gate 12I converts the reviewed Gate 12 update session into the exact input + manifest artifacts consumed by the existing Gate 11 staging/preview/apply pipeline.

It is intentionally **staging-only**.

Gate 12I does not modify canonical wardrobe/level data and does not run apply.

## Preconditions

Generation requires:

1. a `draft` Game Update Session;
2. Gate 12F completeness = complete;
3. every current Gate 12G conflict has a current Gate 12H decision;
4. no stale Gate 12H decision;
5. canonical wardrobe / Main level targets still match the Gate 12G preview SHA.

If any condition changes during generation, Gate 12I aborts and removes the incomplete staging directory.

## Conversion rules

### Gate 12G new

The normalized Gate 12G candidate is staged.

### Gate 12G modified

The normalized candidate/differences are staged.

Gate 11 may classify these existing-target updates as its own `conflict` status. This is expected: Gate 11 uses `conflict` to mean “same identity, changed content”, while Gate 12G uses `modified` for changes that were deterministically safe to classify.

Gate 12I records these Gate 11 conflicts explicitly in the bundle so Gate 12J can distinguish reviewed/expected replacements from unrelated conflicts.

### Gate 12G conflict + Gate 12H keep-local

No staging payload is generated for that item.

The bundle records:

```text
action = skip-keep-local
```

### Gate 12G conflict + Gate 12H use-source

Gate 12I stages the validated `resolvedPayload` persisted by Gate 12H.

### Gate 12G conflict + Gate 12H manual-resolution

Gate 12I stages the validated manual `resolvedPayload`.

### Gate 12G unchanged

No staging payload is generated.

The bundle records:

```text
action = skip-unchanged
```

## Wardrobe staging

Gate 12I creates:

```text
wardrobe-input.json
wardrobe-manifest.json
```

`wardrobe-input.json` is a JSON array of canonical 18-column rows.

It is passed through the existing Gate 11B:

```text
buildWardrobeStagingManifest()
```

The resulting manifest therefore keeps all Gate 11 wardrobe protections:

- shared 18-column schema validation;
- exact `type|id` identity;
- duplicate staged identity blocking;
- target SHA;
- input SHA;
- new / unchanged / conflict classification.

Gate 12I refuses the output if Gate 11B reports parse, invalid-row or duplicate blockers.

## Level staging

Gate 12I creates:

```text
levels-input.json
levels-manifest.json
```

The input uses the existing Gate 11E JSON contract:

```json
{
  "formatVersion": 1,
  "target": "main-levels",
  "entries": []
}
```

It is passed through:

```text
buildLevelStagingManifest()
```

### New level

A new mapped level stages:

- `levelsRaw`;
- every source metadata surface present in the Gate 12G candidate;
- mapped `themeFilter` entries.

### Modified level

Only Gate 12G differences are staged.

This avoids reintroducing unrelated local metadata into the patch.

### Reviewed level conflict

The Gate 12H resolved level entries are staged exactly as saved.

### Shared level entries

Identical `table|key` entries produced by multiple levels are deduplicated.

If two Gate 12 items resolve to the same `table|key` with different values, generation is blocked rather than choosing one silently.

## Output layout

Default root:

```text
.staging/gate12/
```

One generation is stored at:

```text
.staging/gate12/
└─ <session-id>/
   └─ <generation-fingerprint>/
      ├─ bundle.json
      ├─ wardrobe-input.json
      ├─ wardrobe-manifest.json
      ├─ levels-input.json
      └─ levels-manifest.json
```

The entire `.staging/` tree is already ignored by Git.

## Generation fingerprint

The output directory is deterministic for the reviewed state.

The fingerprint covers:

- session identity;
- source snapshot;
- plan;
- collection;
- Gate 12H review data;
- Gate 12G target SHAs;
- resolved wardrobe rows;
- resolved level entries.

The timestamp is not part of this identity.

Therefore rerunning Gate 12I against the exact same state reuses the same output directory instead of producing another equivalent staging copy.

Before reuse, every persisted artifact SHA is verified.

## bundle.json

`bundle.json` connects Gate 12 review semantics to Gate 11 staging semantics.

It contains:

```text
formatVersion
kind = gate12-apply-ready-staging
sessionId
generatedAt
generationFingerprint
mode = staging-only

sourceSnapshotHashes
targets

gate12
  diffSummary
  review
  wardrobeActions[]
  levelActions[]

gate11
  wardrobe
    summary
    requiresConflictAcceptance
    approvedConflictKeys[]

  levels
    summary
    requiresConflictAcceptance
    approvedConflictEntries[]

artifacts
  wardrobeInput
  wardrobeManifest
  levelInput
  levelManifest
```

Each artifact descriptor records path and SHA-256.

## Gate 11 conflict acceptance metadata

Gate 11 deliberately treats updates to an existing identity as `conflict`.

Gate 12I does not suppress or rewrite that classification.

Instead the bundle records every Gate 11 conflict generated by the reviewed Gate 12 conversion:

```text
gate11.wardrobe.approvedConflictKeys
gate11.levels.approvedConflictEntries
```

This metadata is for the next integration gate.

Gate 12I itself does **not** invoke `--accept-conflicts`.

## Gate 11 preview revalidation

After writing the files, Gate 12I immediately reloads both manifests through the existing Gate 11 preview functions:

```text
buildWardrobePreview()
buildLevelPreview()
```

Generation fails if either preview reports:

- input/manifest integrity error;
- stale target SHA;
- blocking validation error;
- invalid/duplicate entry;
- ambiguous wardrobe target identity.

The generated input files must remain present because Gate 11 preview re-reads them and verifies their SHA/content against the manifest.

## Race protection

Gate 12I records the session dependency fingerprint before review/staging.

Before final success it verifies:

- canonical wardrobe SHA still matches Gate 12G;
- canonical levels SHA still matches Gate 12G;
- session sourceSnapshot / plan / collection / review are unchanged.

If any dependency changes, the staging output is discarded.

## CLI

Generate:

```powershell
npm run data:session:stage -- generate
```

`generate` is the default command.

Common options:

```text
--session=<session-id>
--workspace=<path>
```

Read-only target overrides for tests/audits:

```text
--wardrobe-target=<path>
--levels-target=<path>
```

Output override:

```text
--output-root=<path>
```

Help:

```powershell
npm run data:session:stage -- --help
```

## API

Use:

```js
import { generateApplyReadyStaging } from './scripts/update-staging.mjs';
```

The result contains:

```text
outputDir
bundlePath
bundle
reused
```

## Safety boundary

Gate 12I does not:

- alter the external source;
- alter the update session;
- alter canonical wardrobe;
- alter canonical Main levels;
- modify BigUse independent levels;
- apply Gate 11 manifests;
- automatically accept Gate 11 conflicts;
- rebuild generated artifacts;
- complete the update session.

## Files

Gate 12I adds:

- `scripts/update-staging.mjs`;
- `scripts/update-staging-cli.mjs`;
- `tests/gate12i-update-staging.test.mjs`;
- `tests/gate12i-update-staging-cli.test.mjs`;
- `docs/update-staging.md`;
- `package.json` entry `data:session:stage`.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12I core staging tests — 7/7.
- PASS: Gate 12I CLI tests — 6/6.
- PASS: integrated Gate 12C + 12D + 12E + 12F + 12G + 12H + 12I regression — 97/97.
- PASS: targeted ESLint for Gate 12I API, CLI and tests with zero warnings/errors.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 304/304 Node tests; wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: persisted Gate 12I artifacts successfully re-enter Gate 11 wardrobe/level preview with zero integrity blockers.
- PASS: idempotent generation reuses the same fingerprint directory and leaves artifact bytes unchanged.
- PASS: unresolved or stale Gate 12H decisions block generation; completed sessions block generation.
- PASS: isolated canonical-target smoke — one synthetic new wardrobe row and one synthetic new level were staged against the real canonical `data/wardrobe.js` and `data/levels.js`; Gate 11 classified one new wardrobe row and two new level entries (primary + theme). External fixture bytes and both canonical target SHAs remained unchanged.
- Browser tests were not run because Gate 12I adds no browser UI.

No commit, push, formal apply, canonical write, derived rebuild, or mutation of the real `.update-workspace/` was performed.

## Phase boundary

Gate 12I ends with Gate 11-compatible, integrity-checked staging artifacts and an explicit Gate 12 bundle describing which Gate 11 conflicts were expected by the reviewed update.

Gate 12J now consumes these artifacts for exact conflict-set authorization and explicit Gate 11 preview/apply orchestration in [update-review-apply.md](update-review-apply.md).

Post-apply reconciliation and session closeout remain Gate 12K work.
