# LearnTree data repo — agent authoring guide

This repository is a **LearnTree forest**: YAML learning trees rendered by the
LearnTree web app, which tracks the user's completion per atomic module. You
(the agent) own the content files; the app owns the progress state. Everything
you need to author correctly is in this file, the `schemas/`, and the bundled
validator.

## The one loop that matters

```
edit forest.yaml / trees/*.yaml
  → node tools/learntree-validate.mjs validate .     # must report 0 errors AND 0 warnings
  → node tools/learntree-validate.mjs outline .      # sanity-check the shape
  → commit + push (or open a PR)
  → the user refreshes the app; their progress is untouched
```

Run the validator **before every commit**. The bar is **zero errors and zero
warnings** (warnings don't block the exit code, but they always indicate
something worth fixing). It reports positioned, coded messages
(`trees/x.yaml:41:7 error E-REF-UNKNOWN: … Did you mean 'spivak-ch5'?`).

Validator commands: `validate [dir] [--json]` · `outline [dir]` ·
`orphan-diff <base> <head>` (the CI rename guard) · `emit-schemas <outdir>`.
`outline` prints the resolved forest as a text tree — use it to check
structure, module reuse (`*` marks shared modules), and equivalence wiring
without a browser.

## Hard rules (CI enforces the first two)

1. **Never touch `.learntree/`.** It is the user's progress. PRs modifying it fail.
2. **Never rename or delete a module id the user may have completed without
   adding the old id to `aliases`.** The rename guard fails PRs that would
   orphan completed progress. Renaming with an alias is always safe:
   ```yaml
   - id: new-clearer-name
     title: "…"
     aliases: [old-name]     # the user's checkmark follows automatically
   ```
3. **Module ids are forever.** Choose descriptive kebab-case ids
   (`ostep-ch4-4`, `strang-lec21-problems`) on first writing; they are the
   progress keys and the forest-wide vocabulary.

## Anatomy

```
Forest  (this repo: forest.yaml + trees/*.yaml)
└─ Tree  (trees/<tree-id>.yaml — one file per tree, filename = id)
   └─ Node  (title + markdown description + categories; nests via children)
      └─ Category  (author-named list section: Resources / Questions / Problems / …)
         └─ Module  (atomic checkable unit: one video, one chapter, one problem set)
```

Completion is **forest-global**: the same module id appearing in several trees
is one checkbox everywhere. Reuse modules with `- ref: module-id`.

**Adding a tree = creating `trees/<tree-id>.yaml`. There is nothing to
register** — every YAML file under `trees/` loads automatically, and
`forest.yaml` has no tree list.

## File reference

Every file starts with `learntree: 1`. Unknown keys are **errors** (typo
protection). Ids: kebab-case, `[a-z0-9]+(-[a-z0-9]+)*`, ≤ 64 chars. Module ids
are forest-unique; node ids tree-unique.

### trees/<tree-id>.yaml

```yaml
learntree: 1
id: calculus            # must equal the filename
title: "Calculus"
order: 10               # optional dashboard sort (ascending)
description: |          # optional markdown
nodes:                  # ≥ 1 top-level node
  - id: <node-id>
    title: "…"
    description: |      # optional markdown; “after this node you should be able to answer …”
    display: group      # optional; default: group iff children present, else card
    dependsOn: [other-node-id]   # optional extra arrows; SAME TREE only
    categories:         # optional
      - name: Resources
        modules:
          - id: <module-id>        # a definition …
            title: "…"             # required
            url: "https://…"       # optional
            tag: book              # optional: book|video|website|course|paper|exercise|other
            section: "Ch. 5, problems 1-10"   # optional; give url and/or section
            difficulty: medium     # optional: easy|medium|hard
            weight: 2              # optional; default 1; progress-bar weight
            aliases: [old-id]      # optional; retired ids for renames
          - ref: <module-id>       # … or a reuse; NO other fields allowed on a ref
    children: []        # optional nested nodes (same shape, any depth)
```

Rendering model: a `group` node is a labeled box containing its children
stacked top-to-bottom (consumed in order). A `card` node is a standalone box;
a card's children become separate boxes connected by arrows — use a card with
children for "Introduction → branches" topology. `dependsOn` adds a dashed
arrow and must not contradict the top-down order (cycles are errors).

### forest.yaml

```yaml
learntree: 1
name: "…"
description: |          # optional markdown
settings:
  countSatisfied: complete   # complete | fractional | manual-only
equivalences:
  - id: <kebab-id>
    sufficient: [mod-a, mod-b]   # completing ALL of these …
    satisfies: [mod-x, mod-y]    # … auto-satisfies (grey-checks) ALL of these
    note: "why this is sound"    # optional but recommended
```

Equivalence semantics (worth internalizing before designing them):

- Full satisfaction **chains**: if A satisfies B and B is sufficient for C,
  completing A greys out both B and C. Cycles are harmless.
- **Partial coverage does not chain.** A module whose sufficient set is 60%
  done shows a 60% ring, contributes nothing further, and (in the default
  `complete` mode) does not move progress bars.
- With several mappings targeting one module, the best coverage wins.
- Reference **canonical module ids** only (never aliases).
- Use equivalences for cross-tree relationships; `dependsOn` is same-tree.

## Methodology: what a good tree looks like

- **Node = one sitting's theme; module = one atomic act** (watch one lecture,
  read one chapter, solve one problem set). If the user can half-finish a
  module, split it.
- Every module needs a pointer: a `url`, a `section`, or both — the validator
  warns otherwise. For **self-contained exercises you author yourself** (no
  external link), put the instructions in `section:` — e.g.
  `section: "Init a repo, make 3 commits, inspect them with git log -p"` —
  with a short `title`.
- Write node descriptions as **outcome questions** ("After this node you
  should be able to answer: …"). They are the user's self-check and the
  interview-prep payload.
- Keep category names **consistent across the whole tree** (`Resources`,
  `Questions`, `Problems` — exact spelling). Aggregation is **per tree**: each
  tree's summary panel groups by exact name (case mismatches warn), so a new
  name in one tree never fragments another tree's stats — but reusing the
  forest's existing vocabulary keeps the dashboard uniform.
- Order resources so the first questions are answerable from the first
  resource.
- Use `weight:` sparingly to reflect real effort (a 3-hour problem set vs a
  10-minute video), not as a reward knob.
- Prefer **stable, canonical URLs** (publisher pages, cppreference, OCW) over
  ephemeral links.
- Structure: top-level `Introduction` card (description only) → children
  groups for themes → optional deeper groups. Look at
  `trees/linear-algebra.yaml` before writing your first tree.
- `order`: use multiples of 10 (10, 20, 30…) so later trees slot in between
  without renumbering.
- Plain YAML only: no anchors/aliases (`&`/`*`), no merge keys — the validator
  tolerates them but reviewers and diffs do not.
- Quote titles containing `:` and use `|` block scalars for markdown.

## Iterating on user feedback

The user will progress through a draft and come back with change requests.
When editing a live tree:

- Adding modules/nodes/trees: always safe.
- Rewording titles/descriptions/urls: always safe (ids unchanged).
- Moving a module between nodes/categories/trees: safe — identity is the id.
- Renaming an id: **only with `aliases`** (rule 2).
- Deleting a module the user completed: allowed; their progress is retained
  invisibly and returns if you re-add the id (or alias it) later. Say so in
  the PR description because the rename guard will ask.
- Splitting one module into several: keep the old id on the closest successor
  via `aliases`, create the rest fresh.

## Editor support

Files carry `# yaml-language-server: $schema=…` modelines; any editor with the
YAML language server (VS Code + YAML extension) gets autocomplete and inline
validation from `schemas/`. The same schemas are what the app enforces.
