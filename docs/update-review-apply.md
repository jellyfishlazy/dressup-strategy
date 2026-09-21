# Gate 12J — Review / Apply Integration

Gate 12J connects the Gate 12 reviewed update flow to the existing Gate 11F transactional update engine.

It is the first Gate 12 phase that may write canonical data, but only after a separate preview step and an exact generation-fingerprint confirmation.

## Workflow

The intended sequence is:

```text
Gate 12I staging
  ↓
Gate 12J preview
  ↓
review returned generation fingerprint
  ↓
Gate 12J apply --confirm=<same fingerprint>
  ↓
Gate 11F apply / derived rebuild / regression
  ↓
Gate 12K post-apply verification / session closeout
```

Preview is read-only.

Apply is explicit.

## CLI

Preview:

```powershell
npm run data:session:apply -- preview
```

A successful preview returns:

```text
readyForApply: true
confirmFingerprint: <generation-fingerprint>
```

Apply:

```powershell
npm run data:session:apply -- apply --confirm=<generation-fingerprint>
```

The confirmation value must exactly match the current Gate 12I generation fingerprint.

If the session, review decision, resolved payload, or target state changes and Gate 12I produces a different fingerprint, the old confirmation is rejected.

## No raw conflict-acceptance flag

Gate 12J intentionally does **not** expose:

```text
--accept-conflicts
--accept-wardrobe-conflicts
--accept-level-conflicts
```

Those Gate 11 flags are implementation details below the Gate 12 authorization boundary.

A Gate 11 conflict can be accepted by Gate 12J only when its exact identity appears in the current Gate 12I bundle.

## Exact conflict-set authorization

Before calling Gate 11F, Gate 12J reloads the persisted Gate 12I manifests and builds fresh Gate 11 previews.

Wardrobe conflict identities are:

```text
type|id
```

Level conflict identities are:

```text
table|key
```

The fresh Gate 11 conflict sets must exactly equal:

```text
bundle.gate11.wardrobe.approvedConflictKeys
bundle.gate11.levels.approvedConflictEntries
```

The check is equality, not subset membership.

Therefore all of these block:

- an unexpected extra Gate 11 conflict;
- a previously approved conflict disappearing;
- a tampered bundle that removes one conflict identity;
- a tampered bundle that adds an unrelated conflict identity.

Only after exact equality is proven does Gate 12J set the corresponding internal Gate 11 acceptance boolean.

## Why Gate 11 can still report conflicts

Gate 12G and Gate 11 use different semantics.

Gate 12G:

- `modified` means the mapping/difference is deterministic and does not require human conflict review.

Gate 11:

- `conflict` means an existing identity will be replaced with different content.

Therefore a Gate 12G `modified` item often becomes a Gate 11 conflict.

Gate 12I records those expected Gate 11 conflict identities.

Gate 12J verifies the exact set before acceptance.

## Preview

Gate 12J preview:

1. calls Gate 12I generation/reuse;
2. verifies persisted staging artifacts;
3. runs Gate 11 wardrobe preview;
4. runs Gate 11 level preview;
5. rejects integrity/stale/invalid/duplicate/ambiguous blockers;
6. verifies the exact Gate 11 conflict authorization set;
7. calls Gate 11F in preview mode;
8. writes Gate 12J authorization/report files.

A Gate 11 preview status of `review-required` is expected when the bundle contains authorized conflicts.

Gate 12J converts that into:

```text
status = ready
readyForApply = true
```

only after exact authorization succeeds.

If there are no Gate 11 conflicts, Gate 11 preview must report `ready`.

## Apply confirmation

Apply requires:

```text
--confirm=<current Gate 12I generation fingerprint>
```

The fingerprint binds the user's apply action to the reviewed staging generation.

Gate 12J first runs the current Gate 12I generation/reuse path again.

If the current fingerprint differs from the confirmation, apply stops before Gate 11F writes anything.

This protects against applying a different staging generation than the one the user previewed.

## Gate 11F integration

After authorization, Gate 12J delegates the actual write transaction to:

```text
runDataUpdate()
```

from Gate 11F.

Gate 12J does not duplicate the transaction engine.

The delegated apply retains Gate 11F behavior:

- wardrobe/level preflight;
- exact target SHA validation;
- snapshot backups;
- atomic wardrobe apply;
- atomic level apply;
- changed-source tracking;
- affected generated-data rebuild;
- generated freshness checks;
- full repository regression;
- rollback when later steps fail.

## Rollback

If any apply-stage operation fails after snapshots have been captured, Gate 11F restores the pre-run targets.

Gate 12J propagates that failure and records a failed Gate 12J report.

Regression failure after wardrobe/level writes therefore restores both targets.

Gate 12J does not mark the update session completed after apply.

The session remains `draft` so Gate 12K can perform post-apply verification and lifecycle closeout.

## Gate 11E serializer hardening found during 12J

Gate 12J exercised a combination not previously covered by Gate 11E:

```text
same level table
  + replace the final existing property
  + append a new property
```

The old text editor could independently add a trailing comma for the replacement and a leading separator for the insertion, producing:

```text
,,
```

Gate 12J work hardens `applyLevelEntriesToSource()` so insertion logic knows whether its anchor property is also being replaced with a trailing comma.

The fix covers object level tables and `themeFilter`.

A Gate 11E regression test locks the “replace final + append new in same table” case.

## Reports

Every Gate 12J run has its own directory under:

```text
<Gate 12I generation>/gate12j-runs/
```

or an explicit `--run-root`.

It contains Gate 11F's normal run report plus:

```text
gate12j-authorization.json
gate12j-report.json
```

### gate12j-authorization.json

Records:

- session id;
- generation fingerprint;
- preview/apply mode;
- exact actual vs approved wardrobe conflict identities;
- exact actual vs approved level conflict identities;
- whether each Gate 11 domain acceptance was authorized.

### gate12j-report.json

Records:

- Gate 12 session and generation fingerprint;
- mode;
- staging bundle path;
- Gate 11 preview summaries;
- authorization;
- Gate 11 run-report path/status;
- apply results;
- changed source ids;
- derived rebuild result;
- regression result;
- generated freshness;
- rollback state.

Preview also records the exact `confirmFingerprint` to use for apply.

## API

Use:

```js
import { runSessionReviewApply } from './scripts/update-review-apply.mjs';
```

Preview:

```js
await runSessionReviewApply({
  workspace,
  sessionId,
  apply: false,
});
```

Apply:

```js
await runSessionReviewApply({
  workspace,
  sessionId,
  apply: true,
  confirm: generationFingerprint,
});
```

The API accepts target/output/run overrides for isolated tests and audits.

Its second argument allows injected Gate 11F regression/derived handlers for isolated tests; normal CLI/runtime calls use the real Gate 11F handlers.

## CLI options

Common:

```text
--session=<session-id>
--workspace=<path>
--wardrobe-target=<path>
--levels-target=<path>
--output-root=<path>
--run-root=<path>
```

Apply-only:

```text
--confirm=<generation-fingerprint>
```

Help:

```powershell
npm run data:session:apply -- --help
```

## Safety boundary

Gate 12J does not:

- bypass Gate 12I staging validation;
- bypass Gate 11 preview;
- expose arbitrary conflict acceptance;
- infer new conflict approvals;
- accept a stale generation fingerprint;
- silently complete the update session.

Apply may modify canonical data, generated artifacts, and associated update outputs only through the Gate 11F guarded transaction.

## Files

Gate 12J adds:

- `scripts/update-review-apply.mjs`;
- `scripts/update-review-apply-cli.mjs`;
- `tests/gate12j-review-apply.test.mjs`;
- `tests/gate12j-review-apply-cli.test.mjs`;
- `docs/update-review-apply.md`;
- `package.json` entry `data:session:apply`.

Gate 12J also hardens:

- `scripts/level-pipeline.mjs`;
- `tests/gate11e-level-pipeline.test.mjs`.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12J core Review/Apply tests — 7/7.
- PASS: Gate 12J CLI tests — 5/5.
- PASS: Gate 11E serializer regression with Gate 12J integration — 21/21.
- PASS: integrated Gate 12C + 12D + 12E + 12F + 12G + 12H + 12I + 12J regression — 109/109.
- PASS: targeted ESLint for Gate 12J API/CLI/tests plus the Gate 11E serializer hardening with zero warnings/errors.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 317/317 Node tests; wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: exact Gate 11 conflict-set authorization rejects a tampered Gate 12I approved-conflict set.
- PASS: apply requires the exact current Gate 12I generation fingerprint; a stale/old confirmation is rejected when reviewed staging state changes.
- PASS: Gate 11F rollback restores both wardrobe and level targets when final regression fails.
- PASS: Gate 11E now safely handles replacing the final existing property and appending a new property in the same level table without producing a double comma.
- PASS: end-to-end isolated canonical-copy smoke — synthetic external source -> Gate 12 plan/collection -> Gate 12I staging -> Gate 12J preview -> exact fingerprint confirmation -> Gate 11F apply. Temporary copies of real canonical wardrobe/levels changed as expected; the real canonical files remained byte-identical; external fixtures remained byte-identical; session remained draft for Gate 12K.
- Browser tests were not run because Gate 12J adds no browser UI.

No commit, push, real canonical apply, or real session completion was performed.

## Phase boundary

Gate 12J ends after reviewed Gate 12 staging can be safely previewed and explicitly applied through the existing Gate 11 transactional pipeline.

It does not yet decide whether the resulting update session should be closed.

Gate 12K now performs post-apply evidence reconciliation and explicit session completion in [update-closeout.md](update-closeout.md).
