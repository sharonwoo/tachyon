/**
 * Decode a Team Stadium race result's `race_scenario` blob into per-uma
 * skill activation events.
 *
 * Ported 1:1 from uma-utils' scripts/_race_scenario.py (Python). That file's
 * own docstring has the full account of what this format means (green vs.
 * white skill activations, the distance-recovery math, DefeatType codes) -
 * repeated here only where it affects the port itself. Despite the
 * "race_data.proto" origin, none of this is real protobuf wire decoding -
 * it's a fixed-layout binary format read via explicit byte offsets, so the
 * only encoding-specific pieces are gzip + base64, both native to the
 * Workers runtime (DecompressionStream, atob) - no protobuf library needed
 * here, mirroring the Python side (which only uses protobuf-generated
 * classes as typed containers, not for actual decoding).
 *
 * IMPORTANT: several loops advance the read offset by a *stride* value read
 * from the stream (horse_frame_size, frame_size, horse_result_size,
 * event_size) rather than by however many bytes the field-level parse
 * actually consumed - this is intentional (skips trailing padding/fields
 * this format doesn't decode) and must be preserved exactly as in the
 * Python source, not "cleaned up" into a self-advancing cursor.
 */

// Gallop.RaceDefine.DefeatType, from repos/umadump/game_structs.py
export const DEFEAT_TYPE_NAMES = {
  0: "Null", 1: "Win", 2: "Lose", 3: "RunningStyleMany", 4: "Temptation",
  5: "GutsOrder", 6: "Stamina", 7: "LastSpurtFalse", 8: "LastSpurtTargetSpeedDec",
  9: "PassiveSkillNum", 10: "BlockFrontTime", 11: "Speed", 12: "ProperDistance",
  13: "ProperGround", 14: "Motivation",
};

function deserializeHeader(dv) {
  const maxLength = dv.getInt32(0, true);
  const version = dv.getInt32(4, true);
  return { header: { maxLength, version }, offset: 4 + maxLength };
}

function deserializeHorseFrame(dv, offset) {
  return {
    distance: dv.getFloat32(offset, true),
    lanePosition: dv.getUint16(offset + 4, true),
    speed: dv.getUint16(offset + 6, true),
    hp: dv.getUint16(offset + 8, true),
    temptationMode: dv.getInt8(offset + 10),
    blockFrontHorseIndex: dv.getInt8(offset + 11),
  };
}

function deserializeFrame(dv, offset, horseNum, horseFrameSize) {
  const time = dv.getFloat32(offset, true);
  offset += 4;
  const horseFrame = [];
  for (let i = 0; i < horseNum; i++) {
    horseFrame.push(deserializeHorseFrame(dv, offset));
    offset += horseFrameSize;
  }
  return { time, horseFrame };
}

function deserializeHorseResult(dv, offset) {
  // '<ifffBBfBif'
  let o = offset;
  const finishOrder = dv.getInt32(o, true); o += 4;
  const finishTime = dv.getFloat32(o, true); o += 4;
  const finishDiffTime = dv.getFloat32(o, true); o += 4;
  const startDelayTime = dv.getFloat32(o, true); o += 4;
  const gutsOrder = dv.getUint8(o); o += 1;
  const wizOrder = dv.getUint8(o); o += 1;
  const lastSpurtStartDistance = dv.getFloat32(o, true); o += 4;
  const runningStyle = dv.getUint8(o); o += 1;
  const defeat = dv.getInt32(o, true); o += 4;
  const finishTimeRaw = dv.getFloat32(o, true); o += 4;
  return {
    finishOrder, finishTime, finishDiffTime, startDelayTime, gutsOrder,
    wizOrder, lastSpurtStartDistance, runningStyle, defeat, finishTimeRaw,
  };
}

function deserializeEvent(dv, offset) {
  // '<fbb' header, then param_count x int32 - internal offset advance here
  // is discarded by the caller (see note above); event_size dictates the
  // real stride.
  let o = offset;
  const frameTime = dv.getFloat32(o, true); o += 4;
  const type = dv.getInt8(o); o += 1;
  const paramCount = dv.getInt8(o); o += 1;
  const param = [];
  for (let i = 0; i < paramCount; i++) {
    param.push(dv.getInt32(o, true));
    o += 4;
  }
  return { frameTime, type, paramCount, param };
}

function deserialize(buf) {
  const dv = new DataView(buf);
  const { header, offset: afterHeaderOffset } = deserializeHeader(dv);
  let offset = afterHeaderOffset;

  // '<fiii': distance_diff_max, horse_num, horse_frame_size, horse_result_size
  const distanceDiffMax = dv.getFloat32(offset, true);
  const horseNum = dv.getInt32(offset + 4, true);
  const horseFrameSize = dv.getInt32(offset + 8, true);
  const horseResultSize = dv.getInt32(offset + 12, true);
  offset += 16;

  const pad1 = dv.getInt32(offset, true);
  offset += 4 + pad1;

  // '<ii': frame_count, frame_size
  const frameCount = dv.getInt32(offset, true);
  const frameSize = dv.getInt32(offset + 4, true);
  offset += 8;

  const frame = [];
  for (let i = 0; i < frameCount; i++) {
    frame.push(deserializeFrame(dv, offset, horseNum, horseFrameSize));
    offset += frameSize;
  }

  const pad2 = dv.getInt32(offset, true);
  offset += 4 + pad2;

  const horseResult = [];
  for (let i = 0; i < horseNum; i++) {
    horseResult.push(deserializeHorseResult(dv, offset));
    offset += horseResultSize;
  }

  const pad3 = dv.getInt32(offset, true);
  offset += 4 + pad3;

  const eventCount = dv.getInt32(offset, true);
  offset += 4;

  const event = [];
  for (let i = 0; i < eventCount; i++) {
    const eventSize = dv.getInt16(offset, true); // '<h'
    offset += 2;
    event.push(deserializeEvent(dv, offset));
    offset += eventSize;
  }

  return {
    header, distanceDiffMax, horseNum, horseFrameSize, horseResultSize,
    frameCount, frameSize, frame, horseResult, eventCount, event,
  };
}

const MAX_DECOMPRESSED_BYTES = 1024 * 1024; // 1MB - real scenario blobs measured at 18-46KB, ~20x headroom

async function base64GzipDecompress(b64) {
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));

  // Read incrementally and abort as soon as the cap is exceeded, rather than
  // materializing the whole decompressed output first - a small gzip payload
  // can expand enormously (decompression bomb), and checking only after
  // buffering it all defeats the point of capping it.
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DECOMPRESSED_BYTES) {
      reader.cancel();
      throw new Error(`race_scenario decompressed past ${MAX_DECOMPRESSED_BYTES / 1024 / 1024}MB - refusing to continue`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** Decode a raw `race_scenario` field into the deserialized race data. */
export async function parse(raceScenarioB64) {
  const buf = await base64GzipDecompress(raceScenarioB64);
  return deserialize(buf);
}

/** Python's round() uses round-half-to-even; Math.round() rounds
 * half-up. Distances here are always non-negative, so this suffices. */
function pyRoundHalfEven(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

const DISTANCE_CATEGORY_BOUNDS = [[1400, "Sprint"], [1800, "Mile"], [2400, "Medium"]];

/** Bucket a decoded race distance into the game's short/mile/medium/long
 * aptitude bands. */
export function distanceCategory(meters) {
  for (const [bound, name] of DISTANCE_CATEGORY_BOUNDS) {
    if (meters <= bound) return name;
  }
  return "Long";
}

/**
 * Return, per horse_index (0-based, == frame_order - 1):
 *   { activations: [[frameTime, skillId, effect], ...],  // white skills
 *     greenActivations: [skillId, ...],                  // green/aptitude skills
 *     defeat: DefeatType int }
 * plus a "_distance_m" key with the race's actual course distance.
 */
export async function horseActivity(raceScenarioB64) {
  const scenario = await parse(raceScenarioB64);
  const result = {};
  for (let i = 0; i < scenario.horseNum; i++) {
    result[i] = { activations: [], greenActivations: [], defeat: scenario.horseResult[i].defeat };
  }
  for (const e of scenario.event) {
    if (e.type !== 3) continue; // SKILL
    const [horseIndex, skillId, effect] = e.param;
    if (!(horseIndex in result)) continue;
    if (e.frameTime === 0.0 && effect === -1) {
      result[horseIndex].greenActivations.push(skillId);
    } else {
      result[horseIndex].activations.push([e.frameTime, skillId, effect]);
    }
  }
  const lastFrame = scenario.frame[scenario.frame.length - 1];
  const maxPos = Math.max(...lastFrame.horseFrame.map((hf) => hf.distance));
  result._distance_m = pyRoundHalfEven((maxPos - scenario.distanceDiffMax) / 100.0) * 100;
  return result;
}
