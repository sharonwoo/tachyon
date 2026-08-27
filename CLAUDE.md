# Project context

A Cloudflare Worker: drop Uma Musume Team Stadium replay JSON files (from
[umadump](https://github.com/Werseter/umadump)) onto a web page, get back a
rendered Team Trial leaderboard. Stateless request/response - no storage,
no accounts, nothing persisted server-side.

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

## Current safety limits (src/index.js, src/raceScenario.js)

- 300 files per upload, 1MB per file, 200MB total
- `race_scenario` blobs capped at 128KB decompressed (aborts mid-stream, not
  after buffering - see the comment in `raceScenario.js`)
- All three were tightened down from much looser initial values after
  actually measuring real replay data rather than guessing - re-measure
  before loosening any of them back up.

## Security history (worth knowing before touching src/index.js again)

A confirmed, exploitable script-tag-breakout XSS was found and fixed here
(JSON embedded raw into a `<script>` tag via `JSON.stringify` doesn't escape
"/", so `</script>` in a replay's `trainer_name` broke out of the tag).
Also fixed: a decompression-bomb vector (no cap existed originally) and a
`__proto__`-keyed prototype pollution edge case in `buildTeamTrial.js`'s
`charaInfo`. Any new code that embeds request-derived data into HTML or
uses attacker-controlled strings as object keys should get the same
scrutiny - see git log around "Security fixes" for the specifics.

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
- `src/data/*.json` are static game-data snapshots (uma/skill names, a
  skill-condition catalog) copied in at a point in time - they go stale as
  the game adds new umas/skills and need to be manually refreshed from
  source.
- `public/example-leaderboard.jpg` is a real screenshot of actual account
  data, kept as a JPEG (not PNG) deliberately for file size - re-encode at
  ~85% quality if it's ever replaced.
