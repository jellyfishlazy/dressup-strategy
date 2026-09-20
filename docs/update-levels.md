# Gate 12E — 關卡搜尋 / 加入本次更新

Gate 12E provides the level-collection half of the persistent Game Update Session introduced by Gate 12C.

The gate is intentionally source-collection only. It does not map source level identities to local repository identities and does not write formal level data.

## Selection boundary

Only external `levelsRaw` entries are exposed as selectable game levels.

The other primary level tables understood by Gate 12B are not mixed into this list:

```text
competitionsRaw
extraRaw
tasksRaw
dreamWeavingRaw
```

This keeps ordinary level collection explicit and prevents unrelated runtime surfaces from being silently treated as story-level updates.

## Automatic collection bundle

Selecting one `levelsRaw` key automatically saves all related source data that Gate 12B can associate with that key:

```text
levelsRaw
levelFilters
levelBonus
skills       <- source addSkillsInfo
hint         <- source addHintInfo
themeFilter
```

A persisted level item has this shape:

```text
key
primaryTable
runtimeLabel

levelsRaw
levelFilters
levelBonus
skills
hint
metadataPresence
themeFilter

sourcePath
sourceHash
collectedAt
```

Missing optional metadata is stored as `null`, while `metadataPresence` records whether each source metadata table originally contained the selected key. This avoids confusing an absent record with a fabricated empty value.

`themeFilter` stores every source theme group whose prefix matches the selected level's source runtime label. It is an array of:

```json
[
  {
    "name": "source theme name",
    "prefix": "source runtime prefix"
  }
]
```

No theme group is invented when none matches.

## API

Import the named exports from `scripts/update-levels.mjs`.

### searchUpdateLevels(options)

Searches the pinned external level source for `levelsRaw` entries only.

Supported options:

```text
workspace
sessionId

query
sourceKey
theme
label

offset
limit
```

- `sourceKey` is an exact source-key comparison.
- `query` is a case-insensitive AND-token search across the source key, runtime label, theme groups, weights, filter, bonus, skills and hint data.
- `theme` is a case-insensitive AND-token search over matching theme names and prefixes.
- `label` searches the source runtime label.
- pagination defaults to offset 0 / limit 50.
- offset must be a nonnegative safe integer.
- limit must be an integer from 1 to 500.

The result contains:

```text
sessionId
total
offset
limit
items
sourceHash
warnings
```

Each search item already exposes the six-part automatic collection payload plus:

```text
collected
selectable
warnings
```

### addLevelsToUpdate(options)

Requires a non-empty `keys` array containing exact `levelsRaw` source keys.

Optional `expectedSourceHash` can pin the operation to the SHA returned by a prior search.

The whole requested batch is validated before any save. If one requested key is unknown, ambiguous, structurally invalid or otherwise nonselectable, the entire add fails and the session remains unchanged.

Already-collected keys are reported in `skippedKeys`. A fully skipped add is a true no-op and does not rewrite the session or change its timestamp.

### listUpdateLevels(options)

Reads only the persisted level collection and returns:

```text
sessionId
status
count
items
```

It does not require the external source to still exist.

### removeLevelsFromUpdate(options)

Requires a non-empty `keys` array.

Only draft sessions may be changed. Removal operates from persisted collection data, so a draft can still remove an item if the external source is temporarily missing or has drifted.

Repeated removal is idempotent and does not rewrite the session when nothing changes.

## Source pinning and drift

The Game Update Session created by Gate 12C records the absolute external level path and exact SHA-256.

Search and add always reread that pinned file and require its SHA to still equal:

```text
session.sourceSnapshot.hashes.levels
```

They do not refresh the snapshot and do not silently fall back to another source.

If the level source changes after the update session was created, search/add fail closed with a source-drift error. Existing saved collection data remains available for list, and a draft can still remove saved items.

## Source debt and selectability

Gate 12B preserves source problems as warnings. Gate 12E associates relevant warnings with each `levelsRaw` bundle and refuses to collect a bundle when its identity or related automatic metadata is ambiguous or structurally invalid.

Blocking examples include:

- duplicate `levelsRaw` keys;
- the same source level key owned by multiple primary tables;
- invalid primary weights;
- duplicate or invalid `levelFilters`;
- duplicate or invalid `levelBonus`;
- duplicate or invalid `addSkillsInfo`;
- duplicate or invalid `addHintInfo`;
- duplicate matching `themeFilter` labels.

These records can still appear in search results with `selectable: false` so the source problem is visible instead of disappearing.

## Persisted collection validation

Every saved level record is revalidated whenever the level collection is read.

Validation checks include:

- unique saved keys;
- `primaryTable === "levelsRaw"`;
- valid five-number primary weights;
- metadata values consistent with `metadataPresence`;
- valid filter / bonus / skills / hint shapes using the existing Gate 11E level validators;
- valid and unique theme-filter entries;
- theme prefixes still consistent with the saved runtime label;
- exact pinned source path and source hash;
- canonical ISO `collectedAt`.

Corrupt persisted collection data is rejected instead of being used as valid update state.

## Session lifecycle and concurrent writes

Only `draft` sessions can add or remove levels.

Completed and cancelled sessions may be inspected by explicit session ID but cannot be mutated.

Writes reuse Gate 12D's session revision/lock protection in `saveUpdateSession`, including stale-revision rejection and exclusive per-session locks. This prevents a stale level writer from silently overwriting a concurrent collection or lifecycle change.

## CLI

The command is:

```powershell
npm run data:session:levels -- <command>
```

Examples:

```powershell
# Search one exact external levelsRaw key.
npm run data:session:levels -- search --source-key="1-1"

# Search by source theme group.
npm run data:session:levels -- search --theme="章節名稱"

# General source-data search.
npm run data:session:levels -- search --query="關鍵字" --limit=50

# Add one or more exact levelsRaw keys.
npm run data:session:levels -- add --key="1-1" --key="1-2"

# Optionally pin add to the SHA returned by search.
npm run data:session:levels -- add --key="1-1" --source-hash="<SHA-256>"

# Inspect or remove saved collection data.
npm run data:session:levels -- list
npm run data:session:levels -- remove --key="1-1"

npm run data:session:levels -- --help
```

Common flags:

```text
--session=<session-id>
--workspace=<path>
```

Search flags:

```text
--query=
--source-key=
--theme=
--label=
--offset=
--limit=
```

Every option uses the strict `--option=value` form. Unknown options, duplicate singleton flags, cross-command options, malformed pagination, missing add/remove keys and malformed source hashes fail with a nonzero exit code.

## Files

Gate 12E adds:

- `scripts/update-levels.mjs` — search/add/list/remove API.
- `scripts/update-levels-cli.mjs` — strict CLI.
- `tests/gate12e-update-levels.test.mjs` — core persistence/source-safety coverage.
- `tests/gate12e-update-levels-cli.test.mjs` — subprocess and CLI integration coverage.
- `docs/update-levels.md` — this contract.
- `package.json` — `data:session:levels` command.
- `README.md` and Gate 12 cross-references — updated phase status.

No external data file, canonical level file or generated artifact is modified by Gate 12E.

## Validation

Validation completed on 2026-09-21:

- PASS: Gate 12E core tests — 8/8.
- PASS: Gate 12E CLI tests — 7/7.
- PASS: integrated Gate 12C + 12D + 12E regression — 42/42.
- PASS: targeted ESLint for the new API, CLI and tests with zero warnings/errors.
- PASS: full `npm run check` — TypeScript baseline 0 known / 0 new diagnostics; 249/249 Node tests; all wardrobe validators report zero errors; Main and BigUse level validation PASS.
- PASS: `npm run data:session:levels -- --help` through the npm entry point.
- PASS: isolated real-source smoke probe — 747 source level bundles, 519 `levelsRaw` entries, one existing source warning; search/add/list/remove succeeded using one selectable real `levelsRaw` key and all six automatic collection fields were present.
- PASS: external wardrobe and level source bytes remained unchanged during the real-source probe.
- PASS: `git diff --check`; only the existing Windows LF/CRLF conversion warnings are reported.
- Browser tests were not run because Gate 12E introduces no browser UI.

No commit, push, formal data apply or mutation of the real `.update-workspace/` was performed. The real-source smoke probe used a temporary isolated update workspace and removed it afterward.

## Phase boundary

Gate 12E ends after reliable source-level search and collection into the current Game Update Session.

It does not perform:

- source-to-local level identity mapping;
- local conflict classification;
- Gate 11E staging conversion;
- preview/apply into formal repository data;
- browser UI controls.

Completeness analysis is supplied by Gate 12F in [update-completeness.md](update-completeness.md), and deterministic source-key to local-key preview mapping is supplied by Gate 12G in [update-diff-preview.md](update-diff-preview.md). Conflict resolution, approval and apply remain later Gate 12 work.
