# LearnTree

A personal learning-progress tracker in the style of getcracked.io's progress
trees, built to be **agent-authored**: AI agents (e.g. Claude Code) write YAML
learning trees in a data repo; LearnTree renders them as pan/zoom trees with
per-module checkboxes, weighted progress bars, and cross-tree equivalences —
and tracks your completion without ever losing it to a content edit.

- **Forest → Tree → Node → Module.** Modules are atomic checkable units
  (a chapter, a video, a problem set) with global, cross-tree completion.
- **Equivalences.** "Completing these modules is sufficient for those" —
  satisfied modules show grey checks; partial coverage shows a % ring.
- **No backend.** A static SPA (GitHub Pages) talks straight to the GitHub
  API; your private data repo is the database, and every progress change is a
  commit. A Chromium-only local-folder mode covers the agent preview loop.
- **Progress is sacred.** Tombstoned merges across devices, alias-based
  renames, orphan retention, per-file last-good rendering when an agent pushes
  a broken file, and CI guards in the data repo.

## Repo layout

| Path | What |
|---|---|
| `packages/core` | Pure-TS domain: schemas, positioned validation, module registry, status fixpoint + rollups, progress merge. Zero DOM/Node imports (lint-enforced). |
| `packages/cli` | `learntree` validator (`validate` / `outline` / `orphan-diff` / `emit-schemas`), bundled to a single zero-install file. |
| `packages/web` | Vite + React SPA: React Flow canvas (elk layout), storage providers (GitHub / local folder / sample), sync controller. |
| `template/data-repo` | The data-repo template: starter forest, `CLAUDE.md` agent guide, schemas, validator bundle, CI (validate + `.learntree/` guard + rename guard). |
| `scripts/` | `dev-drive*.mjs` Playwright verification drivers; `refresh-template.mjs` re-emits template artifacts after core changes. |

## Development

```bash
npm install
npm run dev        # app on http://localhost:5173 (bundled sample forest)
npm test           # 100 tests incl. fast-check properties and a perf gate
npm run typecheck && npm run lint && npm run build
node scripts/dev-drive.mjs          # Playwright: sample-forest UI walkthrough
node scripts/dev-drive-local.mjs    # Playwright: local-folder agent-loop rehearsal (OPFS)
node scripts/dev-drive-github.mjs   # Playwright: GitHub sync incl. 409-merge (mocked API)
node scripts/refresh-template.mjs   # after core/schema changes
```

The drive scripts expect the dev server running and Google Chrome installed.

## Deploying (one-time)

1. Push this repo to GitHub (public — Pages on the free plan requires it).
2. Repo → Settings → Pages → Source: **GitHub Actions**. The included
   `deploy.yml` builds and publishes on every push to `main`;
   the app appears at `https://<user>.github.io/<repo>/`.
3. Create your data repo from `template/data-repo` (copy its contents into a
   new **private** repo — or publish it once as a template repo and use
   "Use this template").
4. Follow [docs/DATA-REPO.md](docs/DATA-REPO.md) to mint the token and connect.

## Docs

- [docs/FORMAT.md](docs/FORMAT.md) — the authoritative YAML format + every diagnostic code
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — engine and sync invariants
- [docs/DATA-REPO.md](docs/DATA-REPO.md) — data repo + token setup, security notes
