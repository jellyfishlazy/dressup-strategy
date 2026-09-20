# Gate 12C — Game Update Session

Gate 12C introduces a persistent local workspace for one real game update cycle.

The purpose is to give later Gate 12 phases a durable answer to:

- Which game update are we currently working on?
- When was that update session created?
- Which external source snapshot did it start from?
- Which wardrobe / level items are planned for this update?
- Which wardrobe / level items have already been collected?
- Has this update session been completed or cancelled?

Gate 12C does **not** itself collect wardrobe or level records. It establishes the container that later gates fill. Gate 12D supplies wardrobe search/collection through [update-wardrobe.md](update-wardrobe.md), Gate 12E supplies levelsRaw search plus automatic related level-data collection through [update-levels.md](update-levels.md), Gate 12F turns the plan containers into an explicit expected-item checklist through [update-completeness.md](update-completeness.md), and Gate 12G provides deterministic read-only local diff classification through [update-diff-preview.md](update-diff-preview.md). Browser controls remain later-phase work.

## Local workspace

Update sessions are stored under:

```text
.update-workspace/
├─ current.json
└─ sessions/
   └─ <session-id>/
      └─ session.json
```

This path is ignored by Git.

It is deliberately **not** stored under `.staging/`.

Gate 11 staging is temporary pipeline state and may be cleaned after tests or update runs. An in-progress game update must survive those cleanups.

## Session shape

A session contains:

```text
formatVersion
kind
id
name
note
status
createdAt
updatedAt

sourceSnapshot
plan
collection
```

Status is one of:

```text
draft
completed
cancelled
```

Only a `draft` session can be selected as the current session.

## Source snapshot

Creating a session reads the Gate 12B external source and stores a **summary snapshot**:

- resolved source paths;
- exact SHA-256 hashes for external wardrobe and levels;
- wardrobe count / column-width distribution / last-updated value;
- level table counts / bundle count / orphan-metadata count;
- source warnings.

The session does **not** copy all 37k+ wardrobe rows or all level bundles.

This lets later gates detect that the external source changed after the user began an update session, without duplicating the source dataset.

## Plan and collection

Every new session starts with:

```json
{
  "plan": {
    "wardrobe": [],
    "levels": []
  },
  "collection": {
    "wardrobe": [],
    "levels": []
  }
}
```

Later phases own population of these arrays.

Gate 12C only fixes their durable location and lifecycle.

## CLI

Create a session:

```powershell
npm run data:session -- create --name="2026/09/20 遊戲更新"
```

Optional note:

```powershell
npm run data:session -- create --name="2026/09/20 遊戲更新" --note="新章節與活動服裝"
```

The newly created session automatically becomes current.

Show current session:

```powershell
npm run data:session -- current
```

List sessions:

```powershell
npm run data:session -- list
```

Show one session:

```powershell
npm run data:session -- show --id=<session-id>
```

Switch current session:

```powershell
npm run data:session -- activate --id=<session-id>
```

Finish or cancel:

```powershell
npm run data:session -- complete --id=<session-id>
npm run data:session -- cancel --id=<session-id>
```

Completed / cancelled sessions cannot be reactivated.

## Session identifiers

Session IDs contain:

- creation timestamp;
- a readable ASCII slug when possible;
- an 8-character SHA-256 fingerprint of the original name.

The fingerprint is required because an all-Chinese update name may not produce a useful ASCII slug.

Example shape:

```text
20260920102030-update-a1b2c3d4
```

## Persistence rules

- session JSON writes use a same-directory temporary file + fsync + rename;
- an existing session ID is never silently overwritten;
- malformed persisted session data is rejected;
- the current pointer is stored separately in `current.json`;
- only one session is current at a time;
- multiple draft sessions may exist;
- Gate 12D hardens session IDs to a single safe path component and verifies that the saved ID matches the selected file;
- saving an existing session requires the object returned by `loadUpdateSession`, `getCurrentSession`, `createUpdateSession`, or `saveUpdateSession`, not a JSON copy;
- save acquires an exclusive per-session lock and rejects stale loaded revisions, including lifecycle complete/cancel saves; a contending writer must reload/retry rather than overwrite another change;
- abandoned locks are not automatically reclaimed; confirm the owner has exited before manual recovery. See the Gate 12D document for the concurrency boundary.

## Phase boundary

Gate 12C ends at reliable update-session lifecycle.

It does not yet provide:

- conflict resolution / approval;
- apply;
- user-facing browser UI.

Those belong to following Gate 12 phases.
