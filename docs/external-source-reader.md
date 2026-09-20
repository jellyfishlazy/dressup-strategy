# Gate 12B — External Source Reader

Gate 12B introduces a read-only boundary for the external game-data source used during manual update work.

The purpose is to answer:

- Where are the external wardrobe and level files?
- Can both files be read safely?
- What wardrobe entries exist?
- What primary level entries exist?
- Which filter / bonus / skill / hint records belong to each level?
- Does the external source contain duplicate or orphan metadata that needs review?

Gate 12B does **not** update repository data and does **not** guess local mappings.

## Default source layout

The normal source is a local clone containing:

```text
wardrobe.js
levels.js
```

The resolver reuses the established wardrobe lookup from Gate 11 and looks for `levels.js` beside the resolved wardrobe source.

Current supported lookup inputs include:

- `CN_WARDROBE_JS` for an explicit external wardrobe file.
- `CN_LEVELS_JS` for an explicit external level file.
- existing vendored / sibling-clone wardrobe lookup paths from Gate 11.

When wardrobe and levels are in the same directory, the reader records one `sourceRoot`.

## Command

From the repository root:

```powershell
npm run data:inspect:external
```

Optional explicit files:

```powershell
npm run data:inspect:external -- --wardrobe=<path> --levels=<path>
```

This command is read-only.

It reports:

- resolved source paths;
- exact SHA-256 hashes;
- wardrobe row count and column-width distribution;
- external level bundle count;
- orphan metadata count;
- source warnings.

## External wardrobe format

The currently observed external wardrobe format has **20 columns per row**.

Gate 12B deliberately does not validate those rows against the repository's canonical 18-column wardrobe schema.

Instead each item exposes:

```text
row          complete external row
coreRow      first 18 columns
extraColumns external columns after the 18-column core
key          source category + "|" + source id
name
category
id
```

The complete source row is always retained so later gates cannot accidentally discard source-only metadata.

No language conversion, category mapping, or canonical-row conversion happens in Gate 12B.

## External level format

External `levels.js` uses the same major data surfaces already understood by Gate 11E:

```text
themeFilter

competitionsRaw
extraRaw
tasksRaw
levelsRaw
dreamWeavingRaw

levelFilters
levelBonus
addSkillsInfo
addHintInfo
```

Gate 12B reads those tables and assembles one **bundle** for every primary level entry.

A bundle contains:

```text
key
primaryTable
runtimeLabel
weights

filter
bonus
skills
hint

metadataPresence
themeGroups
```

This means later update UX can ask for one level and receive all related source data without manually searching several regions of `levels.js`.

## Runtime labels

The reader preserves the source runtime naming rules:

```text
extraRaw         -> 活动地图: <key>
competitionsRaw  -> 竞技场: <key>
tasksRaw         -> <key>
levelsRaw        -> 关卡: <key>
dreamWeavingRaw  -> 织梦人: <key>
```

Those labels are source information only.

They are **not** treated as local target names.

## No automatic local matching in Gate 12B

This boundary is intentional.

Examples of known differences include:

```text
external levelsRaw: 1-1
local levelsRaw:    I-1-1
```

Named levels may also differ for reasons beyond character conversion.

Therefore Gate 12B does not perform:

- Simplified/Traditional conversion for target identity;
- automatic chapter renaming;
- fuzzy name matching;
- automatic insertion into local data;
- automatic overwrite of an existing local level.

Later gates may introduce explicit, reviewable mapping rules.

## Source warnings

The reader preserves source debt as warnings rather than silently hiding it.

Examples:

- duplicate wardrobe identity;
- short or identity-less wardrobe row;
- duplicate level property key;
- primary-key collision across primary level tables;
- invalid primary/metadata shape;
- metadata with no matching primary level.

A warning does not modify the source.

The current real source is expected to be readable even when it contains documented legacy debt.

## Read-only guarantee

Gate 12B calculates hashes from the exact input bytes and never writes either source file.

Regression tests verify that reading a source leaves both files byte-identical.

The parser executes the local source JavaScript in a timeout-limited VM because these are trusted local data-source files. It is **not** an upload parser and must not be pointed at arbitrary untrusted JavaScript.

## Phase boundary

Gate 12B ends at reliable source reading.

It does not yet provide:

- an update-session UI;
- wardrobe selection;
- level selection;
- source-to-local mapping;
- completeness tracking;
- preview/apply.

Those belong to the following Gate 12 phases.
