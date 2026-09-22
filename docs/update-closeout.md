# Gate 12K — Apply 後驗證 / Session 收尾

Gate 12K is the lifecycle closeout gate after a successful Gate 12J apply.

Its job is not to write update data again. Its job is to prove that the reviewed/apply result still matches the session and canonical data, persist durable closeout evidence, and only then allow the Game Update Session to move from `draft` to `completed`.

## Two-step closeout

Gate 12K deliberately uses two steps:

```text
verify
  ↓
closeoutFingerprint
  ↓
complete --confirm=<same fingerprint>
```

This mirrors Gate 12J's preview/apply confirmation pattern.

### Verify

```powershell
npm run data:session:closeout -- verify --report=<gate12j-report.json>
```

A successful verification returns:

```text
readyToComplete = true
closeoutFingerprint = <SHA-256>
```

The session remains `draft`.

### Complete

```powershell
npm run data:session:closeout -- complete \
  --report=<gate12j-report.json> \
  --confirm=<closeoutFingerprint>
```

The fingerprint must exactly match a fresh Gate 12K verification.

Only then is the session marked `completed` and the current-session pointer cleared.

## Required Gate 12J evidence

Gate 12K accepts only a Gate 12J report with:

```text
kind = gate12-review-apply
mode = apply
status = applied
gate11.status = applied
```

A Gate 12J preview report cannot be used to close a session.

The report must also show:

- no rollback attempt on the successful run;
- passing Gate 11 regression evidence;
- generated-freshness evidence with no stale result.

## Evidence chain

Gate 12K cross-checks four persisted layers.

### Gate 12J report

The supplied `gate12j-report.json` is parsed and hashed.

### Gate 11 run report

Gate 12K reloads Gate 11F's `run-report.json` and checks that the embedded Gate 12J summary still matches:

- status;
- changed source ids;
- apply results;
- derived rebuild result;
- regression result;
- generated freshness;
- rollback state.

Tampering either report breaks closeout.

### Gate 12J authorization

The authorization file must match:

- session id;
- generation fingerprint;
- apply mode;
- exact authorization payload embedded in the Gate 12J report.

### Gate 12I bundle and artifacts

The Gate 12I bundle must match the Gate 12J session/fingerprint.

Every recorded artifact is SHA-verified:

- wardrobe input;
- wardrobe manifest;
- level input;
- level manifest.

The bundle also stores:

```text
sessionDependencyFingerprint
sessionUpdatedAt
```

Gate 12K requires both to still match the current draft session.

Therefore any saved session mutation after staging/apply invalidates closeout, even when the changed field would not affect staging semantics.

## Gate 12F / 12H reconciliation

Gate 12K does not recalculate Gate 12H decisions against the new post-apply canonical target.

That would be semantically wrong: the target was intentionally changed by the reviewed apply, so old review fingerprints would naturally appear stale.

Instead Gate 12K verifies:

1. current session content still matches the exact Gate 12I session fingerprint;
2. Gate 12F completeness is still complete;
3. the Gate 12I bundle records:
   - zero unresolved conflicts;
   - zero stale decisions;
   - reviewed count equals conflict count;
4. the current persisted review container is structurally valid.

This proves that the apply was generated from the same reviewed session that is now being closed.

## Canonical target verification

Gate 12K compares the current targets with Gate 11F's recorded post-apply SHA:

```text
wardrobe current SHA == Gate 11 wardrobe afterSha256
levels current SHA   == Gate 11 levels afterSha256
```

If either file changed after Gate 12J apply, closeout is blocked.

Gate 12K also verifies `changedSourceIds` against the actual Gate 11 apply-domain results.

## Semantic post-apply verification

Hash equality is not the only check.

### Wardrobe

Gate 12K:

- loads the current wardrobe target;
- runs wardrobe validation;
- indexes exact `type|id` identities;
- verifies every accepted Gate 12I wardrobe manifest row exists exactly once;
- verifies the current row exactly equals the staged row.

### Levels

Gate 12K:

- validates the current level source;
- reads normalized level tables;
- verifies every accepted Gate 12I level manifest entry exists with the exact staged value.

This independently proves that staged results survived apply.

## Freshness and regression recheck

Gate 12J already ran derived freshness and repository regression as part of Gate 11F.

Gate 12K runs both checks again before allowing completion.

Default runtime checks use:

```text
assertGeneratedFresh()
runRepositoryRegression()
```

Therefore a system that changed after apply cannot be closed merely because the original Gate 12J run once passed.

## Durable closeout report

Gate 12K reports are not stored under `.staging/`.

They are persisted beside the session:

```text
.update-workspace/
└─ sessions/
   └─ <session-id>/
      └─ closeout/
         └─ <generation-fingerprint>/
            └─ <closeout-fingerprint>.json
```

The report records:

- Gate 12J apply report path/hash;
- Gate 11 report path/hash;
- authorization path/hash;
- Gate 12I bundle path/hash;
- session dependency fingerprint;
- generation fingerprint;
- current canonical target SHA;
- Gate 12F completeness;
- staged Gate 12H review summary;
- semantic verification counts;
- generated freshness recheck;
- repository regression recheck.

## Closeout fingerprint

The closeout fingerprint covers the evidence that determines whether completion is safe.

It includes:

- session id / update timestamp / dependency fingerprint;
- Gate 12I generation fingerprint;
- hashes of Gate 12J / Gate 11 / authorization / bundle evidence;
- post-apply target hashes;
- completeness result;
- staged review result;
- semantic verification result;
- freshness result;
- regression result.

The verification timestamp is not part of the fingerprint.

If relevant evidence changes, the fingerprint changes or verification fails.

## Session completion metadata

When completion succeeds, the session gains:

```text
closeout
  formatVersion
  kind = gate12-closeout-summary
  generationFingerprint
  closeoutFingerprint
  reportPath
  verifiedAt
```

The normal lifecycle fields are also set:

```text
status = completed
completedAt
updatedAt
```

If this session was current, `current.json` is removed by the existing Gate 12C lifecycle path.

## Race protection

Gate 12K records the session `updatedAt` during verification.

Completion calls the session lifecycle function with that expected timestamp.

If another writer saves the session between verification and completion, completion fails and requires a new verification.

The existing Gate 12D session revision/lock protection still guards the actual save.

Immediately before completion Gate 12K also rechecks the persisted apply-report, Gate 11 report, authorization, bundle and target hashes.

## Repeated closeout

A completed session cannot be completed again through Gate 12K.

This is intentional.

The persisted closeout metadata/report remains available for audit, but lifecycle completion is one-way.

## API

Use:

```js
import {
  verifyPostApplyCloseout,
  completePostApplyCloseout
} from './scripts/update-closeout.mjs';
```

Verification:

```js
const result = await verifyPostApplyCloseout({
  workspace,
  sessionId,
  applyReportPath,
});
```

Completion:

```js
await completePostApplyCloseout({
  workspace,
  sessionId,
  applyReportPath,
  confirm: result.closeoutFingerprint,
});
```

Test/audit callers can inject freshness/regression services. Normal CLI use runs the real repository checks.

## CLI

Verify:

```powershell
npm run data:session:closeout -- verify --report=<gate12j-report.json>
```

Complete:

```powershell
npm run data:session:closeout -- complete \
  --report=<gate12j-report.json> \
  --confirm=<closeoutFingerprint>
```

Common options:

```text
--report=<path>
--session=<session-id>
--workspace=<path>
```

Help:

```powershell
npm run data:session:closeout -- --help
```

## Safety boundary

Gate 12K does not:

- reapply wardrobe/level data;
- accept a preview-only Gate 12J report;
- trust an old closeout fingerprint;
- close a mutated/stale session;
- close after post-apply canonical changes;
- close with stale generated data;
- close with failed repository regression;
- silently re-complete a completed session.

## Files

Gate 12K adds:

- `scripts/update-closeout.mjs`;
- `scripts/update-closeout-cli.mjs`;
- `tests/gate12k-closeout.test.mjs`;
- `tests/gate12k-closeout-cli.test.mjs`;
- `docs/update-closeout.md`;
- `package.json` entry `data:session:closeout`.

Gate 12K also extends:

- `scripts/update-staging.mjs` with session closeout provenance;
- `scripts/update-session.mjs` with optional closeout metadata and expected-session guard.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12K core closeout tests — 9/9.
- PASS: Gate 12K CLI tests — 5/5.
- PASS: integrated Gate 12C + 12D + 12E + 12F + 12G + 12H + 12I + 12J + 12K regression — 123/123.
- PASS: targeted ESLint for Gate 12K API/CLI/tests plus session/staging provenance changes with zero warnings/errors.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 331/331 Node tests; wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: successful closeout verification persists durable evidence under the session workspace while leaving the session draft.
- PASS: exact closeout fingerprint is required before completion; wrong confirmation leaves the session draft.
- PASS: preview-only Gate 12J reports, changed post-apply targets, changed session state, stale generated data, failed regression and tampered Gate 12J evidence all block completion.
- PASS: successful completion stores closeout metadata in the session, marks it completed and clears the current-session pointer.
- PASS: repeated completion of an already completed session is rejected.
- PASS: isolated canonical-copy end-to-end smoke — synthetic external source -> Gate 12J preview/apply against temporary copies of the real canonical wardrobe/levels -> Gate 12K verify -> exact closeout confirmation -> completed session. Canonical copies changed as expected; real canonical files remained byte-identical; current session was cleared.
- Browser tests were not run because Gate 12K adds no browser UI.

No commit, push, real canonical apply, or completion of a real user update session was performed.

## Phase boundary

Gate 12K completes the backend Gate 12 update lifecycle:

```text
source
→ session
→ collect
→ completeness
→ diff
→ review
→ staging
→ preview/apply
→ post-apply verification
→ completed session
```

Gate 12L now provides the user-facing Guided Update entry in [guided-update-ui.md](guided-update-ui.md).
