# Project context

A static site (Cloudflare Workers assets, no Worker script): drop Uma Musume
Team Stadium replay JSON files (from
[umadump](https://github.com/Werseter/umadump)) onto a web page and the
leaderboard is built in the browser (`public/js/`). No uploads, storage or
accounts. It was originally a Worker doing the build server-side; that hit
the free plan's 10ms CPU limit on ~124 files, hence the move to the browser.

**Live** at https://tachyon.satki.org. Public repo at
github.com/sharonwoo/tachyon (MIT licensed).

JS port of a sibling project's `build_team_trial_journal_external.py` and
`_race_scenario.py` (Python). See `README.md` for the breakdown and
`verify.mjs` for how the port was checked against the Python output
(byte-for-byte match on real replay data, except date formatting, which
deliberately uses UTC here vs. the Python version's local-machine time).
The sibling project's own repo has more context at
`notes/tachyon-worker.md` and `notes/team_trial_surface_split-todo.md`
(not-started work - turf/dirt split within distance categories).

## Deploy

Push to `main` -> GitHub Actions (`.github/workflows/deploy.yml`) runs
tests, then `wrangler deploy`, authenticated via `CLOUDFLARE_API_TOKEN`/
`CLOUDFLARE_ACCOUNT_ID` repo secrets (token scope documented in the sibling
project's `notes/tachyon-worker.md`, not duplicated here). Watch a run with:

```bash
gh run list --repo sharonwoo/tachyon --limit 1
gh run watch <run-id> --repo sharonwoo/tachyon --exit-status
```

Always run `npx vitest run` and `node verify.mjs` locally before pushing -
both are cheap and have caught real regressions during this project.

## Safety notes (public/js/, public/index.html)

- `race_scenario` blobs are capped at 128KB decompressed (aborts mid-stream,
  not after buffering - see the comment in `raceScenario.js`). Re-measure
  before loosening it.
- There are no file-count/size caps any more (the browser is the only
  victim of a huge input).
- The Worker-era XSS history: JSON embedded raw into a `<script>` tag broke
  out via `</script>` in a replay's `trainer_name`. The browser version sets
  `window.TEAM_TRIAL_DATA` directly instead of embedding HTML, and
  `team_trial.js` escapes every string it renders - keep it that way.
- `buildTeamTrial.js` still handles attacker-controlled JSON: `charaInfo`
  is `Object.create(null)` and `own()` guards lookups by replay-supplied
  keys (`__proto__` edge cases). New code that uses replay strings as
  object keys needs the same care.

## Gotcha: node/npm/npx aren't on PATH by default

Node is installed via `nvm` (Homebrew-installed). A fresh non-interactive
shell (tool-invoked shells, scripts, CI-adjacent contexts - not just literal
new terminal windows) won't have `node`/`npx` resolvable until `nvm` is
sourced:

```bash
export NVM_DIR="$HOME/.nvm"
source "/opt/homebrew/opt/nvm/nvm.sh"
```

If `node -v` 404s with "command not found," run the two lines above first.

## Notes

- `verify.mjs` depends on files outside this repo (a sibling project's local
  replay data) - it's a personal verification tool, not run in CI, and will
  fail for anyone else who clones this.
- `public/data/*.json` are static game-data snapshots (uma/skill names, a
  skill-condition catalog) copied in at a point in time - they go stale as
  the game adds new umas/skills and need to be manually refreshed from
  source.
- `public/example-leaderboard.jpg` is a real screenshot of actual account
  data, kept as a JPEG (not PNG) deliberately for file size - re-encode at
  ~85% quality if it's ever replaced.
