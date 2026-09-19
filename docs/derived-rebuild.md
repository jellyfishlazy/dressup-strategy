# Gate 11D — Derived Data Rebuild

Gate 11D turns generated-data maintenance into a contract-driven rebuild step. Generated artifacts are selected from `scripts/data-source-contract.mjs`; filename similarity is never used to infer dependencies.

## Current generated artifact

`cn-search/data/cn_search_index.json` is generated from:

- `external-cn-wardrobe`
- canonical `wardrobe` (`data/wardrobe.js`)

The relationship is declared in the Gate 11A contract.

## Commands

Check all declared generated outputs without writing:

```powershell
npm run data:check:derived
```

Check only outputs affected by a source change:

```powershell
npm run data:check:derived -- --changed=wardrobe
```

Rebuild stale generated outputs:

```powershell
npm run data:rebuild:derived
```

Rebuild only outputs affected by a known source change:

```powershell
npm run data:rebuild:derived -- --changed=wardrobe
```

Force a rebuild even if hashes already match:

```powershell
npm run data:rebuild:derived -- --force
```

A specific generated source can be selected with `--source=cn-search-index`.

## Freshness model

New CN Search index builds include:

```json
{
  "inputHashes": {
    "external-cn-wardrobe": "<sha256>",
    "wardrobe": "<sha256>"
  }
}
```

A generated artifact is stale when:

- the output is missing or invalid;
- it predates Gate 11D and has no input hashes;
- any declared input SHA-256 differs from the value stored in the artifact.

Hashes are computed from the same bytes that the builder parsed. This prevents a build-time race where rows could come from one input version while metadata accidentally records another.

## External source resolution

The external wardrobe resolver checks, in order:

1. `CN_WARDROBE_JS`;
2. CN Search-local vendor copy;
3. repository vendor copy;
4. sibling clone next to the repository;
5. sibling clone above a workspace grouping directory such as `Projects/development/`.

This supports the current MSI workspace layout without requiring a machine-specific hard-coded absolute path.

## Atomic rebuild

Gate 11D never asks the builder to overwrite the committed artifact directly.

```text
resolve declared inputs
  -> hash inputs
  -> build to same-directory temp file
  -> fsync temp
  -> validate JSON/schema/count/input hashes
  -> re-hash inputs
  -> reject if an input changed during build
  -> preserve target mode when possible
  -> atomic rename over generated artifact
  -> inspect freshness again
```

If build or validation fails before rename, the previous generated artifact remains intact and the temp file is removed.

## Phase boundary

Gate 11D rebuilds generated artifacts only. It does not import new wardrobe rows, resolve conflicts, or update level data.

Gate 11E handles level-data staging / validation / preview / apply separately from derived rebuilds. Gate 11F [`one-command-update.md`](one-command-update.md) now composes the completed data gates into the guarded one-command update workflow.
