# Project context

A Cloudflare Worker: drop Uma Musume Team Stadium replay JSON files (from
[umadump](https://github.com/Werseter/umadump)) onto a web page, get back a
rendered Team Trial leaderboard. Stateless request/response - no storage,
no accounts, nothing persisted server-side.

JS port of a sibling project's `build_team_trial_journal_external.py` and
`_race_scenario.py` (Python). See `README.md` for the breakdown and
`verify.mjs` for how the port was checked against the Python output
(byte-for-byte match on real replay data, except date formatting, which
deliberately uses UTC here vs. the Python version's local-machine time).

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
