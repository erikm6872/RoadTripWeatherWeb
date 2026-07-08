---
tags: [build]
---

# Build Pipeline — `build_www.py`

There is no bundler, transpiler, or minifier. "Building" the app means
assembling the already-static source files into one `www/` folder that can
be uploaded as-is to any static host, or used as
[[Mobile-Packaging|Capacitor's]] web root.

## What it does (`build_www.py`, 39 lines)

```
1. Delete www/ if it exists, recreate it empty.
2. Copy templates/index.html   → www/index.html
3. Copy manifest.webmanifest   → www/manifest.webmanifest
4. Copy sw.js                  → www/sw.js
5. Copy static/ (recursive)    → www/static/
6. Print every file written, for a quick sanity check.
```

Run it with:

```bash
python build_www.py
```

## Why `www/` is committed to git

Commit `e410306` ("Track the built www/ bundle and deploy it to GitHub
Pages") added `www/` to version control, even though it's a derived
artifact. Two consumers need it as a real folder on disk, not just a build
step:

- **Capacitor** reads `webDir: "www"` directly from `capacitor.config.json`
  when creating/syncing the native Android/iOS projects — see
  [[Mobile-Packaging]].
- **GitHub Pages** deploys whatever's in `www/` — though see
  [[GitHub-Pages-Deploy]]: the CI workflow actually *rebuilds* `www/` from
  source on every deploy, specifically so a stale committed copy can't ship
  to production. The committed copy mainly matters for local Capacitor
  workflows and anyone browsing the repo without running the build script.

## Practical implication

**Any change to `templates/index.html`, `static/*`, `manifest.webmanifest`,
or `sw.js` needs `python build_www.py` re-run before it'll show up for
Capacitor builds or a manual `www/` deploy.** GitHub Pages deploys don't need
this — they rebuild automatically (see [[GitHub-Pages-Deploy]]) — but it's
easy to forget for local Android/iOS builds, where a stale `www/` will
silently ship old code.
