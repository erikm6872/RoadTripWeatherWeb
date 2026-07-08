---
tags: [build, deploy]
---

# GitHub Pages Deploy — `.github/workflows/pages.yml`

Automatic deployment of the hosted PWA on every push to `master`.

```yaml
on:
  push:
    branches: [master]
  workflow_dispatch:

jobs:
  deploy:
    steps:
      - actions/checkout@v4
      - run: python3 build_www.py      # rebuild from source, not from the committed www/
      - actions/configure-pages@v5
      - actions/upload-pages-artifact@v3   (path: www)
      - actions/deploy-pages@v4
```

## Key design point: it rebuilds, it doesn't just deploy the committed `www/`

The workflow explicitly re-runs `build_www.py` from source before uploading,
with a comment in the YAML: *"Rebuild the bundle from source so deploys
can't go stale even if the committed www/ folder wasn't regenerated."* This
matters because `www/` is also committed to git for
[[Mobile-Packaging|Capacitor's]] benefit (see [[Build-Pipeline]]) — someone
could plausibly forget to re-run the build script locally before committing,
and this CI step means that mistake never reaches production, only local
Capacitor builds.

## Triggers

- Every push to `master` (i.e., every merged PR, going by the commit history
  — `91220fa`, `c1c9f90` are merge commits directly to `master`).
- Manual `workflow_dispatch` — can be triggered by hand from the GitHub
  Actions tab without a new commit.

## Permissions & concurrency

- `permissions: contents: read, pages: write, id-token: write` — the minimum
  needed to deploy to Pages via OIDC, nothing broader.
- `concurrency: group: pages, cancel-in-progress: true` — a new push cancels
  any in-flight deploy rather than queuing behind it, so Pages always ends up
  serving the *latest* pushed commit.

## What this means day to day

Once a PR merges to `master`, the live GitHub Pages site updates
automatically within a couple minutes — no manual deploy step, and no risk
of deploying a stale `www/` even if it wasn't rebuilt before the commit.
