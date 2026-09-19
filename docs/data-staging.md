# Gate 11B — Wardrobe Staging Import

Gate 11B introduces a read-only staging boundary for wardrobe updates. It accepts exported wardrobe rows, validates them against the shared 18-column schema, compares them with the declared target dataset, and writes a staging manifest. It **does not modify the target wardrobe**.

## Command

From the repository root:

```powershell
npm run data:stage:wardrobe -- path\to\wardrobe-staging.js
```

The default target is the canonical wardrobe declared by Gate 11A:

```text
data/wardrobe.js
```

An explicit writable 18-column target may be selected:

```powershell
npm run data:stage:wardrobe -- path\to\rows.js --target=material-wardrobe
```

Read-only or non-wardrobe contract targets are rejected.

## Accepted input

### CN Search snippet

The existing CN Search "download staging" output can be passed directly to the command:

```javascript
// data/wardrobe.js 片段（2 筆）
  ['Example A','髮型','900001','5', ...],
  ['Example B','鞋子','900002','4', ...],
```

The snippet parser is intentionally strict. It accepts row arrays containing primitive literals and does not execute JavaScript expressions.

### JSON

Either a raw array of rows:

```json
[
  ["Example A", "髮型", "900001", "5", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
]
```

or:

```json
{
  "rows": [
    ["Example A", "髮型", "900001", "5", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
  ]
}
```

## Validation and classification

Every parsed row is checked with the shared wardrobe schema boundary from `src/domain/wardrobe/`.

Rows are classified as:

- `new`: the target has no matching `(type,id)`.
- `unchanged`: an identical row already exists.
- `conflict`: the same `(type,id)` exists but row content differs.
- `invalid`: row width or identity fields are invalid.
- `duplicate`: the staging input repeats the same `(type,id)`.

Parse, invalid-row, and duplicate errors are blocking. A `conflict` is not automatically invalid because Gate 11C will provide the reviewed diff/apply decision.

## Manifest

Default output is local-only:

```text
.staging/wardrobe/<timestamp>-<input-name>.json
```

The entire `.staging/` directory is ignored by Git.

Manifest format version 1 records:

- target source id/path/role;
- target SHA-256 at staging time;
- input path/format/SHA-256;
- classification counts;
- validation errors;
- each staged row;
- the baseline target row for `unchanged` and `conflict` entries.

The target SHA-256 is intentionally recorded for Gate 11C. Apply must reject a manifest if the target changed after staging.

## Next step: Gate 11C Preview / Apply

通過 staging 後，不要直接修改 canonical。先執行：

```powershell
npm run data:preview:wardrobe -- .staging\wardrobe\<manifest>.json
```

確認 diff 後才進入 Gate 11C apply。完整安全門見 [`data-preview-apply.md`](data-preview-apply.md)。

## Safety boundary

Gate 11B must never:

- rewrite `data/wardrobe.js`;
- rewrite Material or other independent datasets unless a later apply step is explicitly requested;
- rebuild generated artifacts;
- resolve conflicts automatically;
- infer targets from similar filenames.

Those actions belong to later Gate 11 phases.
