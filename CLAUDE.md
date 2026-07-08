# Road Trip Weather

A fully client-side PWA that plans a driving route and shows weather timed to
arrival at each stop. See [docs/Home.md](docs/Home.md) for the full
architecture/data-sources/features documentation (an Obsidian vault).

## Keep the docs vault in sync

`docs/` is a maintained Obsidian vault, not a one-off snapshot. **Whenever
you make a code change, update the relevant page(s) in `docs/` in the same
change** — new features, architecture changes, new data sources or API
usage, and changed limitations should all be reflected there. Use
`docs/Home.md` to find the right page(s) to update, and keep cross-links
(`[[Page Name]]`) consistent with existing filenames.

`docs/.obsidian/` is local Obsidian workspace state and is gitignored —
never commit it.

## Keep the test suite in sync

There's a real test suite under `tests/` (Vitest for `static/api.js` /
`static/app.js`, pytest for the legacy Flask backend — see
[docs/Testing.md](docs/Testing.md)) and it runs in CI on every PR
(`.github/workflows/tests.yml`). **Whenever you change behavior in
`static/api.js`, `static/app.js`, `app.py`, `services.py`, or
`weather_codes.py`, update the tests in the same change**: add coverage for
new logic, update assertions that a deliberate behavior change makes
outdated, and add a regression test for any bug fix. Run `npm test` and
`pytest` (or `.venv/bin/pytest`) before considering a change done — don't
leave the suite red or stale.
