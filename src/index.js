import { buildTeamTrialData } from "./buildTeamTrial.js";
import characterNames from "./data/character_names.json";
import overrides from "./data/overrides.json";
import skills from "./data/skills.json";
import skillCatalog from "./data/skill_condition_catalog.json";
import rawScoreTable from "./data/team_stadium_raw_score.json";

const STATIC_DATA = { characterNames, overrides, skills, skillCatalog, rawScoreTable };

const MAX_FILES = 300; // generous headroom over the ~100-file expected case
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB total
const MAX_FILE_BYTES = 1024 * 1024; // 1MB per file - real replays observed at ~350-410KB, ~2.5x headroom

function errorPage(message, status) {
  const html = `<!doctype html>
<title>Build failed</title>
<style>body{font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#222}</style>
<h1>Build failed</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/">&larr; Back</a></p>`;
  return new Response(html, { status, headers: { "content-type": "text/html;charset=utf-8" } });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function handleBuild(request) {
  const formData = await request.formData();
  const files = formData.getAll("files");
  const metaRaw = formData.get("meta");

  if (!files.length) return errorPage("No replay files were uploaded.", 400);
  if (files.length > MAX_FILES) return errorPage(`Too many files (${files.length}); max is ${MAX_FILES}.`, 400);

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return errorPage("Missing or malformed upload metadata.", 400);
  }
  if (!Array.isArray(meta) || meta.length !== files.length) {
    return errorPage("Upload metadata didn't match the number of files.", 400);
  }

  let totalBytes = 0;
  const replays = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > MAX_FILE_BYTES) {
      return errorPage(`"${meta[i]?.name ?? file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_FILE_BYTES / 1024 / 1024}MB per-file limit.`, 400);
    }
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_BYTES) return errorPage("Uploaded files are too large in total.", 400);

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return errorPage(`"${meta[i]?.name ?? file.name}" isn't valid JSON.`, 400);
    }
    replays.push({ name: meta[i].name, lastModified: meta[i].lastModified, data: parsed });
  }

  let result;
  try {
    result = await buildTeamTrialData(replays, STATIC_DATA);
  } catch (err) {
    return errorPage(`Couldn't build the leaderboard: ${err.message}`, 400);
  }

  const warningsHtml = result.warnings.length
    ? `<div class="tt-build-warnings"><strong>Warnings:</strong><ul>${result.warnings
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join("")}</ul></div>`
    : "";
  const { warnings, ...data } = result;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Trial Leaderboard</title>
  <link rel="stylesheet" href="/style.css">
  <style>.tt-build-warnings{background:#fff3cd;border:1px solid #ffe69c;border-radius:8px;padding:.75rem 1rem;margin:1rem 0;font-size:.9rem}</style>
</head>
<body>
  <header class="page-header">
    <div class="page-header-top">
      <h1>Team Trial Leaderboard</h1>
      <a href="/" class="nav-link">&larr; Build another</a>
      <a href="https://github.com/sharonwoo/tachyon" class="tt-gh-link">
        <svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
        Source on GitHub
      </a>
    </div>
    <div id="summary" class="summary"></div>
  </header>
  ${warningsHtml}
  <details class="team-overview-section" open>
    <summary class="section-heading">Current team - score and where the points come from</summary>
    <p class="tt-overview-key">Each row is a current team member, weakest average first. The <strong>bar</strong> is her <em>average</em> score split by where the points come from (decoded from <code>score_array</code>), on a shared points axis so segment length is absolute. <strong>Finishing position</strong> is finish place plus win margin; <strong>white</strong>, <strong>gold</strong> and <strong>unique skills</strong> are points per skill activation by rarity; <strong>strong start</strong> is the bonus for leaving the gate within 0.02s; <strong>style lead &amp; other</strong> is the same-style-lead bonuses plus small extras. Under each bar, the <strong>thin line</strong> is the middle half of her single-race scores (25th to 75th percentile), the <strong>short tick</strong> is her median, and the two <strong>dots</strong> are her worst and best single race. The dashed line is the team average. Hover for the split with each skill slice's proc rate; click a row to jump to her card.</p>
    <div id="team-components"></div>
  </details>
  <details class="team-overview-section" open>
    <summary class="section-heading">Score trend by day</summary>
    <p class="tt-overview-key">Average team score per round, by day - a round is one full Team Trial run (a single replay, up to 5 races), scored as the sum of <code>team_total_score</code> across its races, then averaged across the day's rounds. The day is the replay's own capture timestamp when its filename has one (<code>TT-YYYYMMDD_HHMMSS_mmm</code>); otherwise it falls back to the file's save date - those points are amber and flagged, since a save date isn't reliably the capture date.</p>
    <div id="score-trend"></div>
  </details>
  <details class="filter-section" open>
    <summary class="section-heading">Filters</summary>
    <div id="filters" class="filters"></div>
  </details>
  <details class="timeline-section" open>
    <summary class="section-heading">Uma leaderboard</summary>
    <div id="team-trial-count" class="timeline-count"></div>
    <div id="team-trial-list"></div>
  </details>
  <!-- JSON.stringify doesn't escape "/", so a replay whose trainer_name
       contains a literal "</script>" would otherwise close this tag early
       and inject arbitrary markup - escaping "<" to \u003c keeps it a valid
       JS string while removing anything the HTML parser could act on. -->
  <script>const TEAM_TRIAL_DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};</script>
  <script src="/team_trial.js"></script>
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/build") {
      try {
        return await handleBuild(request);
      } catch (err) {
        return errorPage(err.message || "Unexpected error.", 500);
      }
    }
    // Static assets (public/) are served automatically before this handler
    // runs for any matching GET request; anything else falls through here.
    return new Response("Not found", { status: 404 });
  },
};
