import { buildTeamTrialData } from "./buildTeamTrial.js";
import characterNames from "./data/character_names.json";
import overrides from "./data/overrides.json";
import skills from "./data/skills.json";
import skillCatalog from "./data/skill_condition_catalog.json";

const STATIC_DATA = { characterNames, overrides, skills, skillCatalog };

const MAX_FILES = 300; // generous headroom over the ~100-file expected case
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB total
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file - real replays observed at ~350-410KB, ~5x headroom

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
      <a href="https://github.com/sharonwoo/tachyon" class="nav-link">Source on GitHub</a>
    </div>
    <div id="summary" class="summary"></div>
  </header>
  ${warningsHtml}
  <section class="team-overview-section">
    <h2 class="section-heading">Current team - score distribution</h2>
    <div id="team-overview"></div>
  </section>
  <section class="filter-section">
    <div id="filters" class="filters"></div>
  </section>
  <section class="timeline-section">
    <div id="team-trial-count" class="timeline-count"></div>
    <div id="team-trial-list"></div>
  </section>
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
