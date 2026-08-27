# uma-team-trial-worker

A Cloudflare Worker that turns a batch of Uma Musume Team Stadium replay
JSON files (captured by [umadump](https://github.com/Werseter/umadump))
into a Team Trial leaderboard page - drag files in, get a rendered page
back. No storage, no accounts, nothing persisted server-side.

JS port of uma-utils' `scripts/build_team_trial_journal_external.py` and
`scripts/_race_scenario.py` - see `verify.mjs` for how the port was checked
against the Python output.

## Run locally

```bash
export NVM_DIR="$HOME/.nvm"; source "/opt/homebrew/opt/nvm/nvm.sh"   # if nvm isn't already loaded
npx wrangler dev
```

Open http://localhost:8787, drag a batch of replay `.json` files onto the
dropzone (or click it to pick files), then **Build leaderboard**. Runs
entirely locally via Miniflare - no Cloudflare account or network access
needed.

## Deploy

Pushes to `main` run tests then `wrangler deploy` via
`.github/workflows/deploy.yml`. Needs two repo secrets set in GitHub
(Settings -> Secrets and variables -> Actions):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

To deploy by hand instead: `npx wrangler deploy`.

## Structure

- `src/raceScenario.js` - binary decoder for the `race_scenario` blob (per-round race simulation data)
- `src/buildTeamTrial.js` - aggregates decoded replays into the leaderboard data shape
- `src/index.js` - Worker entry point (`POST /build` handles the upload)
- `public/` - static assets: the upload page, plus `team_trial.js`/`style.css` reused as-is from uma-utils' journal
- `src/data/` - static game-data lookups (uma/skill names), bundled at build time
- `verify.mjs` - one-off script diffing this port's output against the Python build on real replay data (not run in CI - depends on local files outside this repo)
