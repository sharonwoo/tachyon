# tachyon

A static site (served by Cloudflare Workers assets) that turns a batch of
Uma Musume Team Stadium replay JSON files (captured by
[umadump](https://github.com/Werseter/umadump)) into a Team Trial
leaderboard page - drag files in, get a rendered page back. Everything runs
in the browser: no uploads, no storage, no accounts, no server-side code.

JS port of uma-utils' `scripts/build_team_trial_journal_external.py` and
`scripts/_race_scenario.py` - see `verify.mjs` for how the port was checked
against the Python output.

## Run locally

```bash
export NVM_DIR="$HOME/.nvm"; source "/opt/homebrew/opt/nvm/nvm.sh"   # if nvm isn't already loaded
npx wrangler dev
```

Open http://localhost:8787, drag a batch of replay `.json` files onto the
dropzone (or click it to pick files), then **Build leaderboard**. Serves
the static files locally - no Cloudflare account or network access needed.

## Deploy

Pushes to `main` run tests then `wrangler deploy` via
`.github/workflows/deploy.yml`. Needs two repo secrets set in GitHub
(Settings -> Secrets and variables -> Actions):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

To deploy by hand instead: `npx wrangler deploy`.

## Structure

- `public/js/raceScenario.js` - binary decoder for the `race_scenario` blob (per-round race simulation data)
- `public/js/buildTeamTrial.js` - aggregates decoded replays into the leaderboard data shape
- `public/index.html` - upload page; reads the files, runs the build in the browser, then swaps in the leaderboard
- `public/team_trial.js` / `style.css` - copied as-is from uma-utils' journal (plus a few GitHub-link styles)
- `public/data/` - static game-data lookups (uma/skill names, score-row table), fetched by the page
- `test/` - vitest unit tests for the builder (`npx vitest run`)
- `verify.mjs` - one-off script diffing this port's output against the Python build on real replay data (not run in CI - depends on local files outside this repo)
