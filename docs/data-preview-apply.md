# Gate 11C — Wardrobe Preview / Apply

Gate 11C consumes the Gate 11B staging manifest and adds a guarded preview/apply boundary. Preview is read-only. Apply is explicit and uses a same-directory temp file plus validated rename replacement.

## Commands

Preview:

```powershell
npm run data:preview:wardrobe -- .staging\wardrobe\<manifest>.json
```

Apply a manifest that contains only new/unchanged rows:

```powershell
npm run data:apply:wardrobe -- .staging\wardrobe\<manifest>.json
```

Apply a reviewed manifest that contains conflicts:

```powershell
npm run data:apply:wardrobe -- .staging\wardrobe\<manifest>.json --accept-conflicts
```

A conflict is never accepted implicitly.

## Preview output

Preview reports:

- target contract id/path;
- current target SHA-256 and whether it matches staging time;
- new / unchanged / conflict / invalid / duplicate counts;
- every new row;
- every conflict with field-level before/after differences;
- integrity / ambiguity errors.

No file is modified by preview.

## Apply safety gates

Apply is blocked when any of these conditions is true:

1. manifest structure or summary was tampered with;
2. original staging input file is missing;
3. original input SHA-256 changed;
4. manifest rows or parse errors no longer match the original input;
5. manifest contains parse / invalid-row / duplicate blocking errors;
6. target SHA-256 differs from staging time;
7. an existing target identity is ambiguous;
8. a conflict exists without explicit `--accept-conflicts`;
9. a conflict baseline row no longer matches the target;
10. the merged wardrobe fails repository validation;
11. serialized temp data does not round-trip back to the expected rows.

The target itself is also resolved again through Gate 11A's data-source contract. A read-only legacy snapshot cannot be converted into a writable target by editing the manifest JSON.

## Merge semantics

Gate 11A audit showed that the current wardrobe is not globally sorted by category or numeric id. Gate 11C therefore avoids speculative reordering:

- `unchanged`: no operation;
- `conflict`: replace the existing unique row **in place**;
- `new`: append in staging order;
- all other existing rows keep their relative order.

This minimizes unrelated diffs.

## Atomic writer

For a real change, Gate 11C:

```text
current target
  -> verify staged SHA
  -> merge in memory
  -> validate merged rows
  -> serialize wardrobe array while preserving file tail metadata
  -> write same-directory temp file
  -> fsync temp file
  -> parse + validate temp file
  -> preserve target mode where possible
  -> rename temp over target
```

If validation fails before rename, the original target stays untouched and the temp file is removed.

The writer preserves `lastVersion`, category, `wardrobeTags`, skip/repel metadata, and other content outside `var wardrobe = [...] `. When an actual new/conflict change is applied, `wardrobe_lastupd` is updated to the local apply date. A no-op apply leaves the entire file byte-identical.

## Stale manifest policy

The SHA-256 recorded by Gate 11B is a hard optimistic-concurrency gate. If the target changed after staging, restage against the new target instead of forcing the old manifest.

## Phase boundary

Gate 11C does **not** rebuild dependent generated data. After a canonical wardrobe apply, Gate 11D will rebuild declared generated outputs such as the CN Search index.
