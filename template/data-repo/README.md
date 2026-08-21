# My Learning Forest

A [LearnTree](https://github.com/GabeGustafson/learntree) data repository:
YAML learning trees + your completion state, rendered by the LearnTree web app.

## Setup (once)

1. **Create your repo from this template** (private is fine — recommended).
2. **Mint a fine-grained personal access token** for the app:
   GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate:
   - *Repository access*: **only this repo**
   - *Permissions*: **Contents — Read and write** (Metadata is added automatically)
3. Open the LearnTree app → **Settings → Connect GitHub repo…** → enter
   owner / repo / branch / token → **Test connection** → **Connect**.
   Repeat the token paste on each device (laptop, phone).

## Layout

| Path | Owner | Purpose |
|---|---|---|
| `forest.yaml` | you / your agent | forest name, settings, equivalences |
| `trees/*.yaml` | you / your agent | one file per tree |
| `.learntree/progress.json` | **the app** | completion state — never edit |
| `schemas/` | template | JSON Schemas for editor/agent validation |
| `tools/learntree-validate.mjs` | template | zero-install validator (`node tools/learntree-validate.mjs validate .`) |
| `CLAUDE.md` | template | the full authoring guide for AI agents |

## Authoring trees

Point an agent (e.g. Claude Code) at this repo and ask for a tree — CLAUDE.md
teaches it the format, the validation loop, and the rules that protect your
progress. Hand-editing works too; every file has editor autocomplete via the
schema modelines.

Before committing anything:

```bash
node tools/learntree-validate.mjs validate .   # exit 0 or fix what it says
node tools/learntree-validate.mjs outline .    # eyeball the structure
```

CI runs the same validation on every push/PR, blocks PRs that touch
`.learntree/`, and blocks renames that would orphan your completed progress
(see `aliases` in CLAUDE.md).

## Progress history

Every sync is a commit by you to `.learntree/progress.json` with messages like
`progress: Spivak Ch. 5 (+2 more)` — `git log -- .learntree/progress.json` is
your complete study history.
