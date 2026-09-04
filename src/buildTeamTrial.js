/**
 * Build TEAM_TRIAL_DATA (the shape journal/team_trial.js expects) from
 * uploaded Team Stadium replay JSON, without needing archive.json.
 *
 * Ported from uma-utils' scripts/build_team_trial_journal_external.py -
 * see that file's docstring for why archive.json isn't used: it's
 * per-account (trained_chara_id ranges collide across accounts), whereas
 * every replay's own race_horse_data_array already carries card_id + full
 * stats for its own team_id==1, self-contained per replay. card_id ->
 * display name still goes through character_names.json/overrides.json
 * (static game data, bundled in src/data/).
 *
 * train_rank/rank_score/scenario are always null here (that's training-run
 * metadata, not present anywhere in replay data) - everything else (races,
 * wins, scores, skills, distance splits) matches the Python output exactly.
 */
import { horseActivity, distanceCategory, DEFEAT_TYPE_NAMES } from "./raceScenario.js";

const MY_TEAM_ID = 1;

function buildUmaNames(characterNames) {
  const names = {};
  for (const [baseId, info] of Object.entries(characterNames)) {
    const baseName = info.name;
    for (const [skin, skinName] of Object.entries(info.skins || {})) {
      const cardId = `${baseId}${skin}`;
      if (skinName && skinName.toLowerCase() !== "original") {
        names[cardId] = `${baseName} (${skinName})`;
      } else {
        names[cardId] = baseName;
      }
    }
  }
  return names;
}

function percentile(sortedValues, pct) {
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = (pct / 100) * (sortedValues.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.min(lo + 1, sortedValues.length - 1);
  const frac = rank - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * frac;
}

function pstdev(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

function raceStats(matches) {
  const races = matches.length;
  const wins = matches.filter((m) => m.win).length;
  const top1s = matches.filter((m) => m.finish_order === 1).length;
  const top3s = matches.filter((m) => m.finish_order <= 3).length;
  const totalScore = matches.reduce((a, m) => a + m.score, 0);
  const avgScore = totalScore / races;
  const scoresSorted = matches.map((m) => m.score).sort((a, b) => a - b);
  const scoreStddev = races > 1 ? pstdev(scoresSorted) : 0;
  // A handful of races have undecodable race_scenario blobs, which leaves
  // spurted/full_spurt as null on those matches - excluded from the
  // denominator here rather than counted as a non-spurt.
  const spurtKnown = matches.filter((m) => m.spurted != null);
  const fullSpurtRate = spurtKnown.length
    ? spurtKnown.filter((m) => m.full_spurt).length / spurtKnown.length
    : null;
  return {
    races,
    wins,
    win_rate: wins / races,
    top1s,
    top1_rate: top1s / races,
    top3s,
    top3_rate: top3s / races,
    total_score: totalScore,
    avg_score: avgScore,
    score_stddev: scoreStddev,
    score_cv: avgScore ? scoreStddev / avgScore : 0,
    score_min: scoresSorted[0],
    score_p25: percentile(scoresSorted, 25),
    score_median: percentile(scoresSorted, 50),
    score_p75: percentile(scoresSorted, 75),
    score_max: scoresSorted[scoresSorted.length - 1],
    avg_finish_order: matches.reduce((a, m) => a + m.finish_order, 0) / races,
    best_finish_order: Math.min(...matches.map((m) => m.finish_order)),
    full_spurt_rate: fullSpurtRate,
  };
}

/**
 * @param {Array<{name: string, lastModified: number, data: object}>} replays
 *   Parsed replay JSON plus the browser-reported file mtime (proxy for
 *   capture time, same caveat as the Python script's use of file mtime).
 * @param {{characterNames: object, overrides: object, skills: Array, skillCatalog: object}} staticData
 */
export async function buildTeamTrialData(replays, staticData) {
  const umaNames = { ...buildUmaNames(staticData.characterNames), ...(staticData.overrides.umas || {}) };
  const skillNames = {};
  for (const s of staticData.skillCatalog.skills || []) skillNames[s.skill_id] = s.name;
  for (const s of staticData.skills || []) skillNames[s.skill_id] = s.name;

  if (replays.length === 0) throw new Error("No replay files provided");

  const unknownUmas = new Set();
  const unmatchedTeam = [];

  // local per-replay substitute for archive.json, keyed by trained_chara_id.
  // Object.create(null) - trained_chara_id comes straight from uploaded
  // (attacker-controlled) replay JSON, and a plain {} would let a crafted
  // "__proto__" key reassign this object's own prototype via the inherited
  // accessor; a null-prototype object has no such accessor to trigger.
  const charaInfo = Object.create(null);

  const perUma = new Map(); // tid -> { uma, total_stats, matches: [] }
  let matchCount = 0;
  let raceCount = 0;
  let winCount = 0;
  let top1Count = 0;
  let top3Count = 0;
  let scenarioDecodeFailures = 0;

  // tid -> skillId -> { racesFired: Set<raceId>, totalActivations, effectSum, effectCount, isGreen }
  const perUmaSkills = new Map();
  // tid -> DefeatType -> count
  const perUmaDefeats = new Map();
  const roundDistanceByMatch = new Map(); // `${matchKey} ${round}` -> [distance, distanceCategory]

  let latestMtime = null;
  let latestReplay = null;
  for (const r of replays) {
    if (latestMtime === null || r.lastModified > latestMtime) {
      latestMtime = r.lastModified;
      latestReplay = r;
    }
  }

  for (const r of replays) {
    const data = r.data;
    const matchKey = r.name;
    if (!Array.isArray(data.race_start_params_array) || !data.race_start_params_array.length) {
      throw new Error(`"${matchKey}" doesn't look like a Team Stadium replay (missing race_start_params_array)`);
    }
    if (!Array.isArray(data.race_result_array)) {
      throw new Error(`"${matchKey}" doesn't look like a Team Stadium replay (missing race_result_array)`);
    }
    const raceStart = data.race_start_params_array[0];
    if (!Array.isArray(raceStart.race_horse_data_array)) {
      throw new Error(`"${matchKey}" doesn't look like a Team Stadium replay (missing race_horse_data_array)`);
    }
    const opponentHorse = raceStart.race_horse_data_array.find(
      (h) => h.team_id && h.team_id !== MY_TEAM_ID
    );
    const opponent = opponentHorse ? opponentHorse.trainer_name : "Unknown opponent";
    const myIds = new Set(
      raceStart.race_horse_data_array.filter((h) => h.team_id === MY_TEAM_ID).map((h) => h.viewer_id)
    );
    if (myIds.size !== 1) {
      unmatchedTeam.push(matchKey);
      continue;
    }

    for (const rsp of data.race_start_params_array) {
      for (const h of rsp.race_horse_data_array) {
        if (h.team_id === MY_TEAM_ID) {
          charaInfo[h.trained_chara_id] = {
            cardId: String(h.card_id),
            totalStats: h.speed + h.stamina + h.pow + h.guts + h.wiz,
          };
        }
      }
    }

    const matchDate = new Date(r.lastModified).toISOString().slice(0, 10);
    matchCount++;

    for (const roundResult of data.race_result_array) {
      const won = roundResult.win_type === 1;

      let skillActivity = {};
      let raceDistance = null;
      let raceDistanceCat = null;
      try {
        skillActivity = await horseActivity(roundResult.race_scenario);
        raceDistance = skillActivity._distance_m;
        raceDistanceCat = distanceCategory(raceDistance);
      } catch {
        scenarioDecodeFailures++;
      }

      roundDistanceByMatch.set(`${matchKey} ${roundResult.round}`, [raceDistance, raceDistanceCat]);

      for (const cr of roundResult.chara_result_array) {
        if (cr.team_id !== MY_TEAM_ID) continue;
        raceCount++;
        if (won) winCount++;
        if (cr.finish_order === 1) top1Count++;
        if (cr.finish_order <= 3) top3Count++;

        const tid = cr.trained_chara_id;
        const score = cr.score_array.reduce((a, s) => a + s.score, 0);

        const raceId = `${matchKey} ${roundResult.round}`;
        const horseIdx = cr.frame_order - 1;
        const horse = skillActivity[horseIdx];

        if (!perUmaSkills.has(tid)) perUmaSkills.set(tid, new Map());
        const skillMap = perUmaSkills.get(tid);
        for (const [, skillId, effect] of horse?.activations || []) {
          if (!skillMap.has(skillId)) {
            skillMap.set(skillId, { racesFired: new Set(), totalActivations: 0, effectSum: 0, effectCount: 0, isGreen: false });
          }
          const stat = skillMap.get(skillId);
          stat.racesFired.add(raceId);
          stat.totalActivations++;
          stat.effectSum += effect / 100000;
          stat.effectCount++;
        }
        for (const skillId of horse?.greenActivations || []) {
          if (!skillMap.has(skillId)) {
            skillMap.set(skillId, { racesFired: new Set(), totalActivations: 0, effectSum: 0, effectCount: 0, isGreen: false });
          }
          const stat = skillMap.get(skillId);
          stat.racesFired.add(raceId);
          stat.totalActivations++;
          stat.isGreen = true;
        }
        let spurted = null;
        let fullSpurt = null;
        if (horse) {
          if (!perUmaDefeats.has(tid)) perUmaDefeats.set(tid, new Map());
          const defeatMap = perUmaDefeats.get(tid);
          defeatMap.set(horse.defeat, (defeatMap.get(horse.defeat) || 0) + 1);
          // See raceScenario.js's horseActivity docstring for how these two
          // derive from lastSpurtStartDistance and defeat.
          spurted = horse.lastSpurtStartDistance !== -1;
          fullSpurt = spurted && horse.defeat !== 8; // LastSpurtTargetSpeedDec
        }

        const info = charaInfo[tid];
        const cardId = info ? info.cardId : null;
        let umaName = cardId ? umaNames[cardId] : null;
        if (!umaName) {
          unknownUmas.add(tid);
          umaName = `Unknown uma (trained_chara_id ${tid})`;
        }

        if (!perUma.has(tid)) perUma.set(tid, { matches: [] });
        const entry = perUma.get(tid);
        entry.uma = umaName;
        if (info) entry.total_stats = info.totalStats;
        entry.matches.push({
          match_key: matchKey,
          date: matchDate,
          opponent,
          round: roundResult.round,
          distance: raceDistance,
          distance_category: raceDistanceCat,
          finish_order: cr.finish_order,
          score,
          win: won,
          team_total_score: roundResult.team_total_score,
          spurted,
          full_spurt: fullSpurt,
        });
      }
    }
  }

  const currentTeam = new Map(); // tid -> { round, distance, distance_category }
  if (latestReplay) {
    for (const rsp of latestReplay.data.race_start_params_array) {
      const [distance, distanceCat] = roundDistanceByMatch.get(`${latestReplay.name} ${rsp.round}`) || [null, null];
      for (const h of rsp.race_horse_data_array) {
        if (h.team_id === MY_TEAM_ID) {
          currentTeam.set(h.trained_chara_id, { round: rsp.round, distance, distance_category: distanceCat });
        }
      }
    }
  }

  const umas = [];
  for (const [tid, entry] of perUma.entries()) {
    const matches = [...entry.matches].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.match_key < b.match_key ? 1 : a.match_key > b.match_key ? -1 : 0;
    });
    const overall = raceStats(matches);

    const distanceStats = {};
    for (const cat of ["Sprint", "Mile", "Medium", "Long"]) {
      const catMatches = matches.filter((m) => m.distance_category === cat);
      if (catMatches.length) distanceStats[cat] = raceStats(catMatches);
    }

    const skills = [];
    for (const [skillId, stat] of (perUmaSkills.get(tid) || new Map()).entries()) {
      const racesFired = stat.racesFired.size;
      skills.push({
        skill_id: skillId,
        name: skillNames[skillId] || `Skill #${skillId}`,
        races_fired: racesFired,
        rate: racesFired / overall.races,
        total_activations: stat.totalActivations,
        avg_effect: stat.effectCount ? stat.effectSum / stat.effectCount : null,
        is_green: stat.isGreen,
      });
    }
    skills.sort((a, b) => b.rate - a.rate || b.races_fired - a.races_fired);

    const defeatCounts = perUmaDefeats.get(tid) || new Map();
    const defeatBreakdown = {};
    for (const [code, n] of [...defeatCounts.entries()].sort((a, b) => b[1] - a[1])) {
      defeatBreakdown[DEFEAT_TYPE_NAMES[code] ?? String(code)] = n;
    }
    const staminaCollapses = defeatCounts.get(6) || 0; // DefeatType.Stamina

    const teamInfo = currentTeam.get(tid) || {};

    umas.push({
      trained_chara_id: tid,
      uma: entry.uma,
      train_rank: null,
      rank_score: null,
      scenario: null,
      total_stats: entry.total_stats ?? null,
      ...overall,
      distance_stats: distanceStats,
      in_current_team: currentTeam.has(tid),
      current_team_round: teamInfo.round ?? null,
      current_team_distance: teamInfo.distance ?? null,
      current_team_distance_category: teamInfo.distance_category ?? null,
      skills,
      stamina_collapses: staminaCollapses,
      defeat_breakdown: defeatBreakdown,
      switches_distance: Object.keys(distanceStats).length > 1,
      matches,
    });
  }

  umas.sort((a, b) => b.avg_score - a.avg_score);

  const warnings = [];
  if (unknownUmas.size) {
    warnings.push(`${unknownUmas.size} unknown trained_chara_id(s) - card_id not found in character_names.json/overrides.json: ${[...unknownUmas].sort((a, b) => a - b).join(", ")}`);
  }
  if (unmatchedTeam.length) {
    warnings.push(`${unmatchedTeam.length} replay(s) skipped - couldn't identify a single team_id=${MY_TEAM_ID} account: ${unmatchedTeam.join(", ")}`);
  }
  if (scenarioDecodeFailures) {
    warnings.push(`${scenarioDecodeFailures} round(s) had an undecodable race_scenario blob`);
  }

  return {
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    match_count: matchCount,
    race_count: raceCount,
    win_count: winCount,
    top1_count: top1Count,
    top3_count: top3Count,
    current_team_match_key: latestReplay ? latestReplay.name : null,
    current_team_date: latestMtime !== null ? new Date(latestMtime).toISOString().slice(0, 10) : null,
    current_team_size: currentTeam.size,
    umas,
    warnings,
  };
}
