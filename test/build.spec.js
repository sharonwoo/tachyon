import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { buildTeamTrialData } from "../public/js/buildTeamTrial.js";

const readJson = (n) => JSON.parse(fs.readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), "utf-8"));
const staticData = {
  characterNames: readJson("character_names"),
  overrides: readJson("overrides"),
  skills: readJson("skills"),
  skillCatalog: readJson("skill_condition_catalog"),
  rawScoreTable: readJson("team_stadium_raw_score"),
};

// Smallest replay shape the builder accepts. race_scenario is deliberately
// garbage: the builder tolerates undecodable rounds (score/finish data still
// counts, and a warning is raised), which lets this run without a real blob.
function fakeReplay({ trainedCharaId = 7, trainerName = "Me" } = {}) {
  const horse = (team_id, tid) => ({
    team_id, viewer_id: 100 + team_id, trained_chara_id: tid, trainer_name: team_id === 1 ? trainerName : "Rival",
    card_id: 100101, speed: 1, stamina: 1, pow: 1, guts: 1, wiz: 1, running_style: 1, skill_array: [],
  });
  return {
    race_start_params_array: [{ round: 1, race_horse_data_array: [horse(1, trainedCharaId), horse(2, 99)] }],
    race_result_array: [{
      round: 1, win_type: 1, team_total_score: 5000, distance_type: 2, race_scenario: "bm90IGEgc2NlbmFyaW8=",
      chara_result_array: [{
        team_id: 1, trained_chara_id: trainedCharaId, frame_order: 1, finish_order: 1,
        score_array: [{ raw_score_id: 1, num: 1, score: 5000, bonus_num: 0 }],
      }],
    }],
  };
}

describe("buildTeamTrialData", () => {
  it("aggregates a replay into per-uma stats", async () => {
    const result = await buildTeamTrialData(
      [{ name: "TT-20261001_120000_000.json", lastModified: 0, data: fakeReplay() }],
      staticData
    );
    expect(result.match_count).toBe(1);
    expect(result.race_count).toBe(1);
    expect(result.current_team_date).toBe("2026-10-01");
    const [uma] = result.umas;
    expect(uma.trained_chara_id).toBe(7);
    expect(uma.avg_score).toBe(5000);
    expect(uma.matches[0].date_source).toBe("capture");
    expect(uma.matches[0].team).toBe("Mile");
    expect(result.warnings.join(" ")).toContain("undecodable");
  });

  it("flags mtime-derived dates as assumed", async () => {
    const result = await buildTeamTrialData(
      [{ name: "abc123.json", lastModified: Date.UTC(2026, 7, 9), data: fakeReplay() }],
      staticData
    );
    expect(result.umas[0].matches[0]).toMatchObject({ date: "2026-08-09", date_source: "assumed" });
  });

  it("rejects files that aren't Team Stadium replays", async () => {
    await expect(buildTeamTrialData([{ name: "x.json", lastModified: 0, data: {} }], staticData))
      .rejects.toThrow(/doesn't look like a Team Stadium replay/);
  });

  it("survives a __proto__ trained_chara_id", async () => {
    const result = await buildTeamTrialData(
      [{ name: "p.json", lastModified: 0, data: fakeReplay({ trainedCharaId: "__proto__" }) }],
      staticData
    );
    expect(result.umas).toHaveLength(1);
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it("reports progress", async () => {
    const calls = [];
    const replays = ["a", "b", "c"].map((n) => ({ name: `${n}.json`, lastModified: 0, data: fakeReplay() }));
    await buildTeamTrialData(replays, staticData, (done, total) => calls.push([done, total]));
    expect(calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
});
