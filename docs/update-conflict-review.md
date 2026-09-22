# Gate 12H — 衝突審查 / 決策保存

Gate 12H consumes the conflicts produced by Gate 12G and turns human review into durable, auditable decisions stored inside the current Game Update Session.

It does **not** apply changes. Its job is to answer:

- Which current conflicts have been reviewed?
- What decision was made for each one?
- Is the decision still valid against the current canonical target?
- Which conflicts still need review before staging can be generated?

## Decision model

Each current Gate 12G conflict can receive exactly one saved decision:

```text
keep-local
use-source
manual-resolution
```

### keep-local

Keep the current local value for this conflict.

No resolved payload is stored because later staging should skip this conflict.

### use-source

Use the Gate 12G source candidate as the resolved result.

This is allowed only when Gate 12H can safely express that choice as an apply-ready payload.

Examples:

- wardrobe `localized-field-difference`: supported;
- level conflicts that would require deleting local metadata because the source record is absent: rejected.

Unsafe `use-source` requests fail and require either `keep-local` or `manual-resolution`.

### manual-resolution

Persist an explicit reviewed payload supplied by the user.

Wardrobe resolution shape:

```json
{
  "kind": "wardrobe-row",
  "targetKey": "連身裙|003",
  "row": ["...", "連身裙", "003", "..."]
}
```

The row must pass the canonical 18-column wardrobe validator and its `type|id` identity must equal `targetKey`.

Level resolution shape:

```json
{
  "kind": "level-entries",
  "targetKey": "I-1-1",
  "entries": [
    {
      "table": "levelsRaw",
      "key": "I-1-1",
      "value": [1, 1, 1, 1, 1]
    }
  ]
}
```

Allowed level tables are:

```text
themeFilter
levelsRaw
levelFilters
levelBonus
addSkillsInfo
addHintInfo
```

A manual level resolution must include one valid `levelsRaw` entry for `targetKey`. Non-theme metadata entries must use the same target key.

## Persistence

Gate 12H stores decisions in the session under:

```text
review
  formatVersion
  kind
  conflictDecisions[]
```

Each saved decision records:

```text
domain
sourceKey
previewTargetKey
resolvedTargetKey
conflictKind
decision
previewFingerprint
targetSha256
resolvedPayload
note
decidedAt
```

The session review container is optional for older Gate 12C sessions. The first saved decision creates it.

Only one decision may exist for the same `domain + sourceKey`.

## Fingerprint and stale-decision protection

A decision is bound to the exact Gate 12G conflict that was reviewed.

The fingerprint includes:

- domain;
- source key;
- mapped target key;
- conflict kind;
- the complete Gate 12G conflict payload;
- current canonical target SHA-256.

When decisions are listed again, Gate 12H rebuilds Gate 12G and classifies each saved decision as:

```text
current
stale
obsolete
```

### current

The conflict fingerprint, target SHA, mapped target identity and conflict kind still match.

### stale

The conflict still exists, but the reviewed state changed.

Examples:

- canonical target changed;
- conflict content changed;
- mapping changed;
- conflict kind changed.

A stale decision does not count as reviewed.

### obsolete

The saved source item is no longer a current Gate 12G conflict.

The decision remains visible for audit until explicitly removed or cleared, but it does not satisfy current review requirements.

## Session-race protection

Saving a decision is guarded in two directions.

Gate 12H:

1. loads the current session and records a dependency fingerprint for status/sourceSnapshot/plan/collection;
2. builds a fresh Gate 12G preview;
3. verifies the canonical target still has the preview SHA;
4. reloads the session;
5. rejects the save if plan/collection/session dependencies changed during review;
6. saves through Gate 12D's existing optimistic revision + exclusive lock path.

This prevents a decision from silently binding to a different collection or target than the one that was reviewed.

## Review readiness

`listConflictReview()` returns current conflicts together with their saved decision state.

It reports:

```text
conflictCount
reviewedCount
unresolvedCount
staleDecisionCount
conflicts[]
nonCurrentDecisions[]
readyForNextGate
```

A current conflict is reviewed only when it has a saved decision whose state is `current`.

`readyForNextGate` is true only when:

1. Gate 12F completeness is complete;
2. every current Gate 12G conflict has a current decision;
3. no stale decision remains.

New / modified / unchanged items do not need Gate 12H decisions.

## API

Use:

```js
import {
  listConflictReview,
  listConflictDecisions,
  showConflictDecision,
  saveConflictDecision,
  removeConflictDecision,
  clearConflictDecisions
} from './scripts/update-conflict-review.mjs';
```

### listConflictReview(options)

Builds a fresh Gate 12G preview and returns all current conflicts with decision status.

### listConflictDecisions(options)

Returns every saved decision decorated with its current / stale / obsolete state.

### showConflictDecision(options)

Requires:

```text
domain
sourceKey
```

Returns one saved decision with current validity state.

### saveConflictDecision(options)

Requires:

```text
domain
sourceKey
decision
```

Optional:

```text
note
resolvedPayload
```

`resolvedPayload` is required for `manual-resolution` and generated automatically for supported `use-source`.

The operation is idempotent: saving an identical decision against the same conflict fingerprint does not rewrite the session.

### removeConflictDecision(options)

Removes one saved decision by `domain + sourceKey`.

### clearConflictDecisions(options)

Removes all saved conflict decisions.

A no-op clear does not rewrite session bytes.

## Lifecycle

Only `draft` sessions may:

- save decisions;
- replace decisions;
- remove decisions;
- clear decisions.

Completed / cancelled sessions may still:

- list conflict review state;
- list decisions;
- show decisions.

This keeps archived review history readable without allowing retrospective mutation.

## CLI

The npm command is:

```powershell
npm run data:session:review -- <command>
```

### Current conflicts

```powershell
npm run data:session:review -- conflicts
```

This is the default command.

### Saved decisions

```powershell
npm run data:session:review -- list

npm run data:session:review -- show   --domain=wardrobe   --source-key="來源分類|001"
```

### Save keep-local

```powershell
npm run data:session:review -- set   --domain=wardrobe   --source-key="來源分類|001"   --decision=keep-local
```

### Save use-source

```powershell
npm run data:session:review -- set   --domain=wardrobe   --source-key="來源分類|001"   --decision=use-source
```

Unsafe use-source decisions are rejected rather than approximated.

### Save manual resolution

```powershell
npm run data:session:review -- set   --domain=levels   --source-key="1-1"   --decision=manual-resolution   --resolution-file="resolution.json"
```

The resolution file is strict JSON and is validated before the session is written.

### Remove / clear

```powershell
npm run data:session:review -- remove   --domain=wardrobe   --source-key="來源分類|001"

npm run data:session:review -- clear
```

### Common options

```text
--session=<session-id>
--workspace=<path>
--wardrobe-target=<path>
--levels-target=<path>
```

Target overrides are read-only audit/test inputs inherited from Gate 12G.

## Safety boundary

Gate 12H does not:

- modify external source data;
- modify canonical wardrobe or levels;
- mutate Gate 12 plan or collection;
- create Gate 11 staging manifests;
- accept a stale decision;
- infer unsafe deletion semantics;
- apply formal data changes;
- rebuild generated artifacts.

## Files

Gate 12H adds:

- `scripts/update-conflict-review.mjs`;
- `scripts/update-conflict-review-cli.mjs`;
- `tests/gate12h-conflict-review.test.mjs`;
- `tests/gate12h-conflict-review-cli.test.mjs`;
- `docs/update-conflict-review.md`;
- `package.json` entry `data:session:review`.

It also extends `scripts/update-session.mjs` so an optional persisted conflict-review container receives basic session-level integrity checks.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12H core conflict-review tests — 10/10.
- PASS: Gate 12H CLI tests — 7/7.
- PASS: integrated Gate 12C + 12D + 12E + 12F + 12G + 12H regression — 84/84.
- PASS: targeted ESLint for the Gate 12H API, CLI, session validation and tests with zero warnings/errors.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 291/291 Node tests; wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: session persistence guards cover current/stale decisions, non-conflict rejection, idempotent repeated decisions, terminal-session read-only behavior, schema validation and unsafe use-source rejection.
- ENVIRONMENT LIMITATION: an isolated real-source smoke was attempted on the company PC, but this machine does not currently contain the external wardrobe/levels source clone or an override path. The smoke failed before creating a session or writing any project data. No source was downloaded or fabricated to force this check.
- Browser tests were not run because Gate 12H adds no browser UI.

No commit, push, staging generation, formal data apply, generated rebuild, or mutation of the real `.update-workspace/` was performed.

## Phase boundary

Gate 12H ends when every current Gate 12G conflict can be explicitly reviewed and the resulting decision can be durably validated as current, stale, or obsolete.

It does not yet:

- convert reviewed decisions into Gate 11 staging payloads;
- perform final Gate 11 preview/apply integration;
- write canonical data;
- rebuild derived data;
- provide browser Guided Update controls.

Gate 12I now converts current reviewed decisions into Gate 11-compatible apply-ready staging in [update-staging.md](update-staging.md). Final preview/apply orchestration, canonical writes and browser controls remain later Gate 12 phases.
