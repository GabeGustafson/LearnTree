# Architecture & invariants

```
┌─ app repo (public) ────────────────┐       ┌─ data repo (private) ──────────┐
│ GitHub Pages static SPA            │ REST  │ forest.yaml, trees/*.yaml      │
│  core: schemas/validate/engine     │◄─────►│   ← agent-owned                │
│  web: canvas, providers, sync      │  PAT  │ .learntree/progress.json       │
│  cli: validate/outline/orphan-diff │       │   ← app-owned                  │
└────────────────────────────────────┘       └────────────────────────────────┘
```

`@learntree/core` is platform-pure (no DOM/Node imports — ESLint-enforced) so
the browser app and the CLI validate with literally the same code.

## Load pipeline (core)

parse YAML (positions via `LineCounter`) → zod strict schemas (issues mapped
to coded diagnostics with file:line:col + did-you-mean) → per-tree structural
resolution (display defaults, dep records, cycle check over dependsOn ∪
implied order edges) → cross-tree module registry (deep-equal dedupe, refs,
aliases) → referential checks (deps, equivalences) → `ResolvedForest`.

**Per-file quarantine:** a file failing parse/schema is excluded and reported;
the rest of the forest resolves. The web app adds **per-file last-good
substitution** on top (`web/src/state/lastGood.ts`): broken updates render the
previous valid version with a banner; file deletion is respected.

## Status engine (core/engine)

- `done` set = manual completions (alias-aware, latest-`at`, ties→done) grown
  to a **monotone fixpoint** over equivalences: any mapping whose whole
  `sufficient` set is done marks its `satisfies` done. Growth-only ⇒
  terminates on any graph, including cycles; full satisfaction chains.
- `coverage(id)` = best weighted fraction of a sufficient set among mappings
  targeting `id`, computed against the final done set. **Partials never feed
  back** (predictability rule).
- Rollups dedupe module ids per scope first (a module twice in one node counts
  once), then weight: `pct = Σ value·weight / Σ weight`; empty ⇒ `null`.
  Category aggregation is per-tree by exact name.
- Everything recomputes fully on every change — ~1 ms at 500 modules
  (perf-gated in `core/test/perf.test.ts`); there is no cache invalidation to
  get wrong.

## Progress invariants (core/progress)

1. Entries are never deleted; `undone` entries are tombstones.
2. `mergeProgress` keeps the latest-`at` entry per id (ties → `done`);
   commutative/associative/idempotent over valid entries and can never
   resurrect an uncheck (fast-check-proven).
3. Orphans are retained forever; the validator reports them as info.
4. Alias resolution and merge use the same ordering, so they cannot disagree;
   winners are written through to canonical ids on save, alias rows remain.
5. Invalid entries are quarantined verbatim: excluded from math, preserved on
   save. An unreadable file marks the state corrupt and blocks all writes.

## Sync (web/src/sync/SyncController.ts)

Optimistic local state → immediate localStorage mirror (crash safety) →
debounced (2.5 s GitHub / 0.6 s local) single-flight write with a **10 s floor
between GitHub writes** (secondary limit: ~80 content-writes/min, 500/hr) →
contents-API PUT with the blob sha. On 409/422: fetch remote, `mergeProgress`,
retry with the remote sha (≤ 5 attempts, exponential backoff) — tombstones
make the merge safe by construction. Network failure parks in `offline` and
retries on `online`/focus/next change. Tab-hide flushes with `keepalive`.
Commit messages batch toggle labels (`progress: Spivak Ch. 5 (+2 more)`), so
`git log -- .learntree/progress.json` is the user's study history.

Reads: `GET git/ref` with ETag (304s are rate-limit-free) → recursive tree →
blobs fetched only when their sha changed (localStorage sha cache). Reload on
focus (5 s throttle) and via the Refresh button; a reload merges rather than
replaces in-memory progress, so an in-flight toggle can't be lost.

**Provider switching** always starts from fresh progress state (`freshProgress`)
— cross-provider contamination is impossible; mirrors are scoped by
`provider.cacheKey`.

## Rendering (web)

`buildRenderGraph` turns a tree into boxed roots (groups render their subtree
inline; card children become separate boxes) + structure/depends edges, lifted
to boxed ancestors. `stack.ts` sizes boxes deterministically (no
measure→relayout loop), elk `layered` lays out only the top-level box graph
(lazy-loaded), and React Flow renders one custom node per box — inner stacking
is plain DOM, which sidesteps subflow complexity entirely.

## Security posture

Fine-grained PAT (Contents R/W on one repo) in localStorage; production builds
carry a CSP (`connect-src 'self' https://api.github.com`, `script-src 'self'`,
no third-party scripts); markdown renders with raw HTML inert; the token is
never rendered or logged. Worst-case XSS blast radius is the learning data
repo. See docs/DATA-REPO.md.
