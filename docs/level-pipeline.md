# Gate 11E — Level Data Pipeline

Gate 11E provides a structured staging / preview / apply path for level data. It replaces direct hand-editing of `data/levels.js` and `data/biguse_levels.js` with JSON patches, schema validation, conflict review, and guarded atomic writes.

## Targets

The target must come from the Gate 11A data-source contract:

- `main-levels` → `data/levels.js` (canonical)
- `biguse-levels` → `data/biguse_levels.js` (independent)

Both are writable level sources. No filename inference is used.

## Commands

Validate both declared level sources without writing:

```powershell
npm run validate:levels
```

Stage a JSON patch:

```powershell
npm run data:stage:levels -- path\to\levels-update.json
```

Preview the manifest:

```powershell
npm run data:preview:levels -- .staging\levels\<manifest>.json
```

Apply a manifest with no conflicts:

```powershell
npm run data:apply:levels -- .staging\levels\<manifest>.json
```

Apply reviewed conflicts:

```powershell
npm run data:apply:levels -- .staging\levels\<manifest>.json --accept-conflicts
```

## Input format

Input is **JSON only**. Executable JavaScript is not accepted.

```json
{
  "formatVersion": 1,
  "target": "main-levels",
  "entries": [
    {
      "table": "levelsRaw",
      "key": "III-3-1",
      "value": [1.2, -1.3, 2, 1, 0.7]
    }
  ]
}
```

Each entry updates one table/key pair.

## Supported tables

### Primary level tables

These define level identity and the five scoring weights, ordered as:

```text
simple, cute, active, pure, cool
```

Supported primary tables:

- `competitionsRaw`
- `extraRaw`
- `tasksRaw`
- `levelsRaw`
- `dreamWeavingRaw`

A primary value must contain exactly five finite numbers.

A primary key may exist in only one primary table. Gate 11E blocks cross-table identity collisions.

### themeFilter

Example:

```json
{
  "table": "themeFilter",
  "key": "第三卷第四章",
  "value": "關卡: III-4-"
}
```

The key is the UI label and the value is the theme prefix.

### levelFilters

Structured form:

```json
{
  "table": "levelFilters",
  "key": "III-3-1",
  "value": {
    "tagWhitelist": "POP/運動系",
    "nameWhitelist": null,
    "weight": 10
  }
}
```

`weight: 10` serializes back to `normalFilter(...)`. Other positive finite weights serialize to `weightedFilter(...)`.

New tag tokens must exist in the canonical wardrobe. New `nameWhitelist` tokens must match at least one wardrobe item name. Existing legacy unknown references may remain when an existing entry is updated, but new unknown references are blocked.

### levelBonus

Structured form:

```json
{
  "table": "levelBonus",
  "key": "III-3-1",
  "value": [
    {
      "base": "B",
      "weight": 0.25,
      "tag": "POP",
      "replace": false
    }
  ]
}
```

Allowed bases are `SS / S / A / B / C`. Weight must be positive and finite. Tags must resolve to canonical wardrobe tags unless they are already present in the baseline entry.

`replace: false` serializes to `addBonusInfo(...)`; `replace: true` serializes to `replaceBonusInfo(...)`.

### addSkillsInfo

Must contain 2 or 3 slots. Each slot is either `null` or an array of strings.

Example:

```json
{
  "table": "addSkillsInfo",
  "key": "III-3-1",
  "value": [null, ["微笑", "挑剔", "沉睡", "反挑"]]
}
```

### addHintInfo

Must contain exactly three string-array slots.

Example:

```json
{
  "table": "addHintInfo",
  "key": "III-3-1",
  "value": [
    ["過關提示"],
    ["可穿戴部件"],
    ["會導致 F 的部件"]
  ]
}
```

## Metadata ownership rule

A **new** metadata key in `levelFilters / levelBonus / addSkillsInfo / addHintInfo` must reference an existing primary level or a primary level added in the same staging input.

Existing legacy orphan metadata is baseline debt. Gate 11E permits updating an already-existing orphan entry but does not permit creating a new orphan.

## Duplicate-key baseline

JavaScript object duplicate keys silently overwrite earlier entries at runtime, so Gate 11E scans source text in addition to evaluating the file.

Known historical duplicate debt is recorded in:

```text
scripts/known-level-duplicates.json
```

The baseline stores the exact duplicate expressions. Validation blocks:

- a new duplicate property;
- an extra occurrence in a known duplicate group;
- a changed expression inside a known duplicate group;
- stale baseline entries when validating the real repository source.

The current baseline covers the pre-existing duplicate keys in Main and BigUse level metadata. It is not permission to add more duplicates.

## Staging classification

Every table/key entry is classified as:

- `new`
- `unchanged`
- `conflict`
- `invalid`
- `duplicate`

Blocking cases include:

- malformed value shape;
- duplicate staged table/key;
- primary key collision across primary tables;
- new orphan metadata;
- unknown newly introduced tag/name references.

Manifests record the target SHA-256 and input SHA-256.

## Preview / apply safety

Preview is read-only and re-stages the original JSON input against the current target. It rejects manifest tampering and changed/missing original input.

Apply is blocked when:

- the target SHA changed after staging;
- the input SHA changed;
- the manifest no longer matches re-staging;
- blocking staging errors exist;
- conflicts exist without explicit `--accept-conflicts`.

A no-op apply leaves the target byte-identical.

## Source editing policy

Gate 11E edits only staged table/key properties. It does **not** reformat or globally regenerate the legacy level file.

- existing conflicts are replaced in place;
- new object properties are appended to the relevant object;
- new `themeFilter` pairs are appended to the array;
- comments and untouched data remain in place.

This deliberately avoids a huge unrelated diff in the historical level files.

## Atomic apply

A real write follows:

```text
preview current target
  -> verify hashes / input / conflicts
  -> patch source in memory
  -> write same-directory temp file
  -> fsync
  -> execute + structurally validate temp source
  -> verify staged values are present
  -> preserve mode when possible
  -> atomic rename over target
```

If validation fails before rename, the original source remains untouched.

## Current baseline audit

At Gate 11E implementation time:

- Main primary levels: 630
- Main invalid five-weight rows: 0
- primary cross-table duplicate keys: 0
- Main legacy metadata contains known orphan entries and 3 known duplicate groups
- BigUse contains 22 active primary entries and 5 known duplicate groups

Legacy orphan/duplicate debt is preserved as an explicit baseline; new debt is blocked.
