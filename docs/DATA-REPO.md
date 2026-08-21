# Setting up your data repo

## 1. Create the repo

Copy `template/data-repo/` into a new **private** GitHub repository (or
publish that folder once as a template repo and click "Use this template").
Private repos are free and keep your learning data yours; the app repo being
public is unrelated — it contains only code.

## 2. Mint the token (per GitHub account, once)

**Fastest path** — open this pre-filled link (it sets the name, expiry, and
*Contents: Read and write* for you):

> <https://github.com/settings/personal-access-tokens/new?name=learntree&description=LearnTree+progress+sync&contents=write&expires_in=366>

On that page you only need to set **Repository access → "Only select
repositories" → your data repo**, then **Generate** and copy the
`github_pat_…` value.

Doing it manually instead (Settings → Developer settings → Personal access
tokens → Fine-grained tokens → Generate new token):

1. **Repository access:** "Only select repositories" → your data repo.
   (Avoid "Public repositories" — that mode is read-only.)
2. Under **Permissions**, click **"+ Add permissions"** and search for the
   permission *name*: type **`Contents`**. (The search matches names only —
   typing "read" or "write" finds nothing.) Tick **Contents**.
3. Contents now appears as a row under the *Repositories* tab — set its
   access level to **Read and write** (it defaults to read-only). Metadata
   (read-only) is included automatically.
4. Pick an expiration you can live with — the app shows a clear "token
   rejected" error when it lapses — then **Generate**.

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
