// One-off verification script (not committed to CI) - confirms the JS port
// produces the same result as the Python build on the same real replay
// files. Run: node verify.mjs
import fs from "node:fs";
import path from "node:path";
import { buildTeamTrialData } from "./src/buildTeamTrial.js";
import characterNames from "./src/data/character_names.json" with { type: "json" };
import overrides from "./src/data/overrides.json" with { type: "json" };
import skills from "./src/data/skills.json" with { type: "json" };
import skillCatalog from "./src/data/skill_condition_catalog.json" with { type: "json" };

const REPLAY_DIR = path.join(process.env.HOME, "code/uma-utils/team_stadium");
const PYTHON_OUTPUT = path.join(process.env.HOME, "code/uma-utils/journal/team_trial_data_friend.js");

const files = fs.readdirSync(REPLAY_DIR).filter((f) => f.endsWith(".json")).sort();
const replays = files.map((f) => {
  const p = path.join(REPLAY_DIR, f);
  const stat = fs.statSync(p);
  return {
    name: path.basename(f, ".json"),
    lastModified: stat.mtimeMs,
    data: JSON.parse(fs.readFileSync(p, "utf-8")),
  };
});

const jsResult = await buildTeamTrialData(replays, { characterNames, overrides, skills, skillCatalog });

const pyRaw = fs.readFileSync(PYTHON_OUTPUT, "utf-8");
const pyResult = JSON.parse(pyRaw.slice("const TEAM_TRIAL_DATA = ".length).trimEnd().replace(/;$/, ""));

// date/current_team_date are derived from file mtime formatted as a
// calendar date - Python used the capturing machine's local timezone
// (a convenience of running on the same box), while the deployed Worker
// deliberately uses UTC (there's no well-defined "local" for a server
// handling uploads from anywhere). That's an intentional behavior
// difference, not a correctness bug, so it's excluded from this diff -
// everything else (scores, races, skills, distances, names) must match
// exactly.
function stripKeys(obj, keys) {
  if (Array.isArray(obj)) return obj.map((v) => stripKeys(v, keys));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (keys.has(k)) continue;
      out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return obj;
}

function normalize(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  delete clone.generated_at;
  delete clone.warnings;
  return stripKeys(clone, new Set(["date", "current_team_date"]));
}

const jsNorm = normalize(jsResult);
const pyNorm = normalize(pyResult);

function deepDiff(a, b, pathStr = "") {
  const diffs = [];
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 1e-6) diffs.push(`${pathStr}: ${a} != ${b}`);
    return diffs;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${pathStr}: length ${a.length} != ${b.length}`);
      return diffs;
    }
    for (let i = 0; i < a.length; i++) diffs.push(...deepDiff(a[i], b[i], `${pathStr}[${i}]`));
    return diffs;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diffs.push(...deepDiff(a[k], b[k], `${pathStr}.${k}`));
    return diffs;
  }
  if (a !== b) diffs.push(`${pathStr}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return diffs;
}

const diffs = deepDiff(pyNorm, jsNorm);
console.log(`JS umas: ${jsResult.umas.length}, Python umas: ${pyResult.umas.length}`);
console.log(`JS races: ${jsResult.race_count}, Python races: ${pyResult.race_count}`);
if (diffs.length === 0) {
  console.log("MATCH: no differences found.");
} else {
  console.log(`${diffs.length} differences found:`);
  for (const d of diffs.slice(0, 50)) console.log("  " + d);
  if (diffs.length > 50) console.log(`  ... and ${diffs.length - 50} more`);
  process.exitCode = 1;
}
