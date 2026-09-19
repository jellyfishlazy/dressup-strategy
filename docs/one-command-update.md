# Gate 11F — One-command Data Update

Gate 11F composes the completed Gate 11 data pipeline into one orchestration entry point without removing the safety gates from the individual phases.

The command can process wardrobe input, level input, or both in the same run.

## Commands

Preview only, no formal data writes:

```powershell
npm run data:update -- --wardrobe=path\to\wardrobe-staging.js
```

```powershell
npm run data:update -- --levels=path\to\levels-update.json
```

Preview both domains in one run:

```powershell
npm run data:update -- --wardrobe=path\to\wardrobe-staging.js --levels=path\to\levels-update.json
```

Apply a reviewed run:

```powershell
npm run data:update -- --wardrobe=path\to\wardrobe-staging.js --levels=path\to\levels-update.json --apply
```

Wardrobe target defaults to the canonical `wardrobe`. A different writable wardrobe target can be selected explicitly:

```powershell
npm run data:update -- --wardrobe=input.js --wardrobe-target=material-wardrobe
```

Level target normally comes from the JSON patch's `target` field. It can also be supplied explicitly:

```powershell
npm run data:update -- --levels=levels.json --level-target=biguse-levels
```

## Conflict acceptance

A run never accepts conflicts implicitly.

After previewing wardrobe conflicts:

```powershell
npm run data:update -- --wardrobe=input.js --apply --accept-wardrobe-conflicts
```

After previewing level conflicts:

```powershell
npm run data:update -- --levels=levels.json --apply --accept-level-conflicts
```

If both domains have been reviewed:

```powershell
npm run data:update -- --wardrobe=input.js --levels=levels.json --apply --accept-conflicts
```

`--accept-conflicts` is shorthand for accepting conflicts in both domains. It should only be used after reviewing the preview output.

## Preview behavior

Without `--apply`, Gate 11F:

1. stages every supplied input;
2. writes local manifests under `.staging/runs/<timestamp>/`;
3. reuses Gate 11C / 11E preview validation;
4. prints new / unchanged / conflict / invalid / duplicate summaries;
5. writes `run-report.json`;
6. does not modify canonical, independent, or generated repository data.

Possible preview statuses:

- `ready`: no blocking errors or conflicts;
- `review-required`: structurally safe, but one or more conflicts require review;
- `blocked`: invalid/stale/tampered input or another hard safety error.

## Apply sequence

With `--apply`, all supplied inputs are preflighted **before any formal write begins**.

The run then performs:

```text
stage every input
  -> preview every input
  -> preflight all safety gates
  -> snapshot every target that may change
  -> snapshot every affected generated artifact
  -> apply wardrobe changes
  -> apply level changes
  -> rebuild generated outputs affected by actual changed source ids
  -> verify all declared generated outputs are fresh
  -> npm run check
  -> write final run report
```

A wardrobe apply triggers only generated sources whose Gate 11A contract inputs include that wardrobe source. For the canonical wardrobe, this currently means the CN Search index.

Level changes do not rebuild unrelated generated artifacts.

## Transactional rollback

Gate 11F adds a run-level rollback boundary above the individual atomic writers.

Before applying anything, files that may be modified are copied to:

```text
.staging/runs/<timestamp>/backups/
```

If a later phase fails after an earlier apply succeeded, Gate 11F restores the pre-run files.

This includes generated artifacts. For example:

```text
wardrobe apply succeeds
  -> CN index rebuild writes new output
  -> final regression fails
  -> restore original wardrobe
  -> restore original CN index
  -> report status: rolled-back
```

Rollback replacement uses a same-directory temporary file, fsync, and rename.

If rollback itself fails, the run report is marked `rollback-failed` and includes the restore errors. The automation does not pretend the run was safe.

## Final regression gate

A successful apply run executes:

```powershell
npm run check
```

This includes:

- ESLint;
- strict TypeScript baseline;
- Node regression tests;
- wardrobe validation;
- level validation.

Gate 11F also verifies generated-artifact freshness after rebuild.

Browser regression remains a separate project acceptance layer because the full Playwright suite is substantially slower and data-only updates do not change browser runtime code.

## Run reports

Each run creates:

```text
.staging/runs/<timestamp>/
  wardrobe-manifest.json   # when wardrobe input was supplied
  level-manifest.json      # when level input was supplied
  run-report.json
  backups/                 # apply runs that may write files
```

The entire `.staging/` tree is ignored by Git.

The report records:

- preview/apply mode;
- input paths;
- manifest locations;
- preview summaries;
- actual changed source ids;
- apply results;
- derived rebuild results;
- generated freshness result;
- regression result;
- rollback status when applicable.

## Failure policy

Any of these stops an apply run:

- malformed or blocking staging data;
- stale target SHA;
- manifest/input provenance mismatch;
- unaccepted conflict;
- derived rebuild failure;
- generated output remaining stale;
- repository regression failure.

No later phase is attempted after a failure.

## Recommended day-to-day flow

For a normal update:

```text
1. Export / prepare input
2. Run data:update without --apply
3. Review preview
4. If clean, rerun with --apply
5. If conflicts are intentional, add the appropriate explicit acceptance flag
6. Keep the generated run report until the update is committed
```

This preserves human review for ambiguous changes while removing the mechanical multi-command choreography.
