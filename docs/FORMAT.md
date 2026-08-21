# LearnTree data format (authoritative)

A **forest** is a directory (usually a private GitHub repo):

```
forest.yaml                 # name, settings, equivalences        (author-owned)
trees/<tree-id>.yaml        # one file per tree, filename = id    (author-owned)
.learntree/progress.json    # completion state                    (app-owned — never hand-edit)
```

Global rules:

- Every authored file starts with `learntree: 1` (format major version).
- **Unknown keys are errors** (typo protection).
- Ids are kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`), ≤ 64 chars.
  **Module ids are forest-unique**; node ids are tree-unique (independent
  namespaces). Ids are progress keys: they are forever (see aliases).
- All `trees/**/*.yaml` load automatically — there is no registry to maintain.
- YAML 1.2; plain style (no anchors/merge keys); quote strings containing `:`;
  use `|` block scalars for markdown.

## trees/<tree-id>.yaml

```yaml
learntree: 1
id: calculus                  # must match the filename
title: "Calculus"
order: 10                     # optional dashboard sort, ascending; gaps of 10 recommended
description: |                # optional markdown
nodes:                        # ≥ 1 node
  - id: limits
    title: "Limits"
    description: |            # optional markdown (outcome questions)
    display: group            # optional: group | card
    dependsOn: [other-node]   # optional extra edges, same tree only
    categories:               # optional ordered list
      - name: Resources       # author-defined name
        modules: [ … ]        # module definitions and/or refs (may be empty while drafting)
    children: [ … ]           # optional nested nodes, any depth
```

**Display semantics.** `group` renders a labeled box containing its children
stacked top-down (their order is the consumption order, and it participates in
cycle checking). `card` renders a standalone box; a card's children become
separate boxes wired with arrows. Default: `group` iff the node has children.
`dependsOn` adds a dashed arrow between boxes and must agree with the implied
top-down order (contradictions are `E-DEP-CYCLE`). Cross-tree relationships
are expressed with equivalences, never `dependsOn`.

**Module definition** (inside `categories[].modules`):

| Field | Required | Notes |
|---|---|---|
| `id` | ✔ | forest-unique, permanent |
| `title` | ✔ | non-empty |
| `url` | | valid URL |
| `tag` | | `book` `video` `website` `course` `paper` `exercise` `other` |
| `section` | | free text: `"Ch. 5, problems 1-10"`; also the place for self-authored exercise instructions |
| `difficulty` | | `easy` `medium` `hard` |
| `weight` | | finite number > 0, default 1 — progress-bar weight |
| `aliases` | | list of retired ids whose progress this module inherits |

A module should carry a `url` and/or a `section` (`W-MODULE-NO-POINTER`).

**Module reference:** `- ref: module-id` reuses a definition from anywhere in
the forest. A ref entry may contain no other fields (`E-REF-OVERRIDE`).
Re-*defining* the same id elsewhere is allowed only if the definitions are
deep-equal after defaults (alias order ignored); otherwise
`E-DUP-MODULE-DIVERGENT`.

## forest.yaml

```yaml
learntree: 1
name: "My Learning Forest"
description: |                 # optional markdown
settings:
  countSatisfied: complete     # complete | fractional | manual-only (default complete)
equivalences:
  - id: spivak-covers-intro
    sufficient: [spivak-ch5, spivak-ch5-problems]
    satisfies: [khan-limits-course]
    note: "optional rationale"
```

**Status model per module:** `done` (manual, green) → `satisfied` (grey, via a
mapping whose whole `sufficient` set is effectively done) → `partial`
(best-coverage ring, weighted) → `none`. Full satisfaction **chains** through
mappings (computed as a monotone fixpoint; cycles are safe). **Partial
coverage never chains.** `countSatisfied` controls progress-bar math:
`complete` counts done+satisfied as 1; `fractional` adds partial coverage
fractionally; `manual-only` counts only green. Equivalences must reference
canonical module ids (not aliases).

## .learntree/progress.json (app-owned)

```json
{ "learntree": 1, "modules": {
    "spivak-ch5":  { "state": "done",   "at": "2026-08-21T01:02:11.007Z" },
    "old-module":  { "state": "undone", "at": "2026-06-11T18:30:00.000Z" } } }
```

Deterministic serialization (sorted keys, 2-space indent, trailing newline).
Entries are **never deleted**: `undone` rows are tombstones so cross-device
merges cannot resurrect an uncheck, and orphaned ids are retained so removing
and re-adding a module (or aliasing it) restores its checkmark. The effective
state of a module is the latest-`at` entry among `{id} ∪ aliases` (ties:
`done` wins); on save the app writes the winner through to the canonical id.

## Diagnostic codes

Severity `E-` error (blocks CI, exit 1) · `W-` warning (fix before commit) ·
`I-` info.

| Code | Meaning |
|---|---|
| E-YAML-SYNTAX / E-YAML-DUPKEY | unparseable YAML / duplicate mapping key |
| E-VERSION-UNSUPPORTED | `learntree:` is not `1` |
| E-SCHEMA-REQUIRED / E-SCHEMA-TYPE | missing / wrongly-typed field |
| E-SCHEMA-UNKNOWN-KEY | unknown key (did-you-mean hint) |
| E-SCHEMA-ENUM | invalid enum value (did-you-mean hint) |
| E-ID-FORMAT / E-URL-INVALID / E-WEIGHT-INVALID | malformed id / url / weight |
| E-NODE-ID-DUP / E-TREE-ID-DUP / E-CATEGORY-DUP | duplicate node id in tree / tree id in forest / category name in node |
| E-REF-UNKNOWN / E-REF-OVERRIDE | ref to undefined module / extra fields on a ref |
| E-DEP-UNKNOWN / E-DEP-SELF / E-DEP-CROSS-TREE / E-DEP-CYCLE | bad `dependsOn` target / self / other tree / ordering contradiction |
| E-DUP-MODULE-DIVERGENT | same module id defined differently (field diff + both locations) |
| E-ALIAS-COLLISION / E-ALIAS-DUP | alias equals a live id / claimed by two modules |
| E-EQ-ID-DUP / E-EQ-UNKNOWN-MODULE / E-EQ-EMPTY-SET | equivalence id reuse / unknown module (alias hint) / empty set |
| E-FOREST-MISSING | no `forest.yaml` at the root |
| E-PROGRESS-ENTRY-INVALID | unreadable progress file/entry (quarantined, never overwritten) |
| W-CATEGORY-EMPTY / W-NODE-EMPTY | empty category / node with no content, children, or description |
| W-TREE-ID-FILENAME-MISMATCH / W-ORDER-DUP / W-CATEGORY-CASE | id ≠ filename / duplicate `order` / case-mismatched category names |
| W-MODULE-NO-POINTER | module with neither url nor section |
| W-EQ-SELF | module in both lists of one mapping |
| W-FILE-IGNORED | YAML outside `forest.yaml` / `trees/**` |
| I-PROGRESS-ORPHAN / I-PROGRESS-ALIAS | progress for ids not in any tree / recorded under an alias |

## Tooling

`node tools/learntree-validate.mjs <command>` (bundled in the data repo; also
`packages/cli` here):

- `validate [dir] [--json]` — full validation incl. progress info; exit 1 on errors
- `outline [dir]` — resolved forest as a text tree (`*` = shared module, `(wN)` = weight)
- `orphan-diff <base> <head>` — CI rename guard: fails when `head` orphans completed progress that `base` kept
- `emit-schemas <outdir>` — JSON Schemas (draft 2020-12) for editor/agent validation
