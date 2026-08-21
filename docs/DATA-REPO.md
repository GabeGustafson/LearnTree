# Setting up your data repo

## 1. Create the repo

Copy `template/data-repo/` into a new **private** GitHub repository (or
publish that folder once as a template repo and click "Use this template").
Private repos are free and keep your learning data yours; the app repo being
public is unrelated — it contains only code.

## 2. Mint the token (per GitHub account, once)

GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token. **Order matters** — the write
option only appears after step 2:

1. Name it (e.g. `learntree`) and pick an expiration you can live with; the
   app shows a clear "token rejected" error when it lapses — minting a fresh
   one takes a minute.
2. **Repository access:** choose **"Only select repositories"** and pick your
   data repo. Do *not* choose "Public repositories" — that mode is read-only
   by design and hides the write permission levels entirely (the usual reason
   "Read and write" seems to be missing).
3. Expand **Repository permissions** (not "Account permissions") → find
   **Contents** → change its dropdown from "No access" to **"Read and
   write"**. GitHub adds *Metadata: Read-only* by itself.
4. Generate, and copy the `github_pat_…` value.

## 3. Connect each device

Open the deployed app → **Settings → Connect GitHub repo…** → owner, repo,
branch (`main`), token → **Test connection** (it names the exact missing
permission on failure) → **Connect**. Repeat the paste on each device — the
token lives only in that browser's localStorage.

## Security notes, honestly

- The token can read/write **one repo**. If it ever leaked (e.g. via a
  malicious browser extension), the blast radius is your learning data — not
  your account, not your other repos. Revoke it in GitHub settings at any time.
- The app ships no third-party scripts, pins a CSP that only allows talking to
  `api.github.com`, and renders agent-authored markdown with raw HTML disabled.
- Safari's tracking protection may evict localStorage for rarely-visited
  sites; on an iPhone, add the app to your Home Screen and expect to re-paste
  the token occasionally.

## Day-to-day

- **You:** check things off; the pill in the header shows sync state. Changes
  are committed to `.learntree/progress.json` a few seconds after you pause.
- **Agents:** clone the data repo, edit YAML, run
  `node tools/learntree-validate.mjs validate .`, push. `CLAUDE.md` in the
  repo teaches them everything; CI blocks the two dangerous mistakes
  (touching `.learntree/`, renaming ids without aliases).
- **Preview before pushing** (agent loop): the app's *local folder* mode
  (Chromium) renders a working copy straight from disk — refocus the tab to
  reload after each edit.
- **History:** `git log --oneline -- .learntree/progress.json` is your
  complete, timestamped study record — the raw material for future
  history-chart features.
