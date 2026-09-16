# 搭配器（自用）

## 陸服衣櫃條件搜尋

獨立模組位於 [`cn-search/`](cn-search/)。

- **日常**：雙擊 `cn-search/開啟陸服搜尋.bat`（不需 npm install）
- **建索引**：repository 的 npm workspace 管理 opencc-js，詳見 [`cn-search/README.md`](cn-search/README.md)

## Development / Gate 1

Use Node.js 24. Browser scripts remain classic scripts; there is no bundler.
All existing HTML paths and the repository-root GitHub Pages site are unchanged.
Deployed pages need no npm server. Local CN search still needs HTTP to load JSON;
its existing launcher works without installing development dependencies.

From the repository root:

```sh
npm ci
npm run lint
npm test
npm run validate:data
npm run check
```

The root `package-lock.json` locks development dependencies for the repository
and its `cn-search` workspace. CI installs them with `npm ci --ignore-scripts`
and runs `npm run check`.
Do not maintain a separate lockfile in `cn-search/`.

Tests use Node's built-in test runner: VM-loaded `tool.js` cloning and `model.js`
accessory scoring / identity formatting, CN tag mappings, repository OpenCC
resolution, and validator rejection cases. They do not assert known legacy bugs
as desired application behavior or claim browser/UI coverage.

Lint covers `tool.js`, `cn-search/scripts/*.mjs`, the validator, tests and ESLint
configuration. Rules catch undefined identifiers, accidental global assignments,
duplicate arguments/keys, unreachable code and invalid typeof comparisons.
Excluded at Gate 1: all other root browser scripts (including model/scoring/UI,
which use cross-script globals), `cn-search/cn-search.js`, inline HTML scripts,
generated data, vendor libraries (`jquery*`, `bootstrap/`, `knockout.js`,
`html2canvas.js`), and the older root `scripts/` audit/migration utilities.
These require separate review; a passing lint check is not whole-site coverage.

The validator executes repository-owned data in a timeout-limited VM and checks
non-empty wardrobe arrays, exactly 18 fields, non-empty string name/type/id, and
duplicate `(type,id)` identities independently in `wardrobe.js`,
`data/wardrobe.js`, `data/biguse_wardrobe.js`, and `data/material_wardrobe.js`.
`biguse_wardrobe.js` is application code, not another wardrobe array.
VM loading is for trusted repository data, not untrusted uploads.

`scripts/known-wardrobe-duplicates.json` records the exact rows for 6 existing
duplicate groups in the root wardrobe and 11 in the material wardrobe. These are
documented data debt, not endorsements of duplicate identities. The validator
reports them on every run and rejects new/changed duplicate groups and stale
exceptions. Fix duplicates upstream in a separate data ticket, then remove the
corresponding baseline entry; do not regenerate this baseline to hide failures.
No generated wardrobe data is changed by checks.

CI checks PRs targeting main, main pushes and manual runs. Deployment requires a
successful quality job **and** `refs/heads/main` (never a pull request). The deploy
job checks out a fresh root static site, so npm dependencies are not uploaded.
The external CN source/index rebuild is not a deployment prerequisite: the
existing generated index remains the deployed asset. To rebuild it deliberately:

```sh
npm run build:cn-index
```

Provide `CN_WARDROBE_JS` or use the existing CN source discovery paths documented
in `cn-search/README.md`. No sibling npm dependency directory is used.
