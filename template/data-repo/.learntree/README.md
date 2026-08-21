# Machine-managed — do not edit

`progress.json` in this directory is written by the LearnTree app. It is the
user's completion state, keyed by module id, with tombstones for unchecks.

- **Agents must never modify this directory.** CI fails any PR that touches it.
- Entries are never deleted, even for modules that no longer exist — that is
  how progress survives module removal/re-addition and renames (via aliases).
