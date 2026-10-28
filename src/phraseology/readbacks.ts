import { findCallSign, type SlotChip } from "./taxi-call";
import { normalizeTransmission } from "./normalize";

export interface ReadbackResult {
  normalized: string;
  chips: SlotChip[];
  valid: boolean;
  critical?: boolean;
  /** Which piece of a taxi readback is still missing. */
  gap?: "crossing" | "hold" | "callsign";
}

const HOLD = /\bhold(?:ing)? short\b/;
const RUNWAY_31 = /\brunway 31\b/;

const RUNWAY_34 = /\brunway 34\b/;

/** Hold short of 31, the crossing of 34, and the call sign. */
export function parseHoldShort(text: string): ReadbackResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const holdOk = HOLD.test(normalized);
  const runwayOk = RUNWAY_31.test(normalized);
  const crossOk = /\bcross\b/.test(normalized) && RUNWAY_34.test(normalized);
  const valid = holdOk && runwayOk && crossOk && Boolean(callSign);
  const held = holdOk && runwayOk && Boolean(callSign);
  let gap: ReadbackResult["gap"];
  if (!valid) {
    if (holdOk && runwayOk && crossOk && !callSign) gap = "callsign";
    else if (held && !crossOk) gap = "crossing";
    else gap = "hold";
  }
  return {
    normalized,
    valid,
    gap,
    chips: [
      chip("hold-short", "Hold short", holdOk, "Hold short", "Read back hold short."),
      chip("runway", "Runway", runwayOk, "Runway 31", "Include runway 31."),
      chip("clearance", "Crossing", crossOk, "Cross Runway 34", "Read back the crossing of Runway 34."),
      chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "End with your call sign."),
    ],
  };
}

/** Taxi-back readback: cross runway 34 and the call sign. */
export function parseCrossing(text: string): ReadbackResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const crossOk = /\bcross\b/.test(normalized) && RUNWAY_34.test(normalized);
  return {
    normalized,
    valid: crossOk && Boolean(callSign),
    chips: [
      chip("clearance", "Crossing", crossOk, "Cross Runway 34", "Read back the crossing of Runway 34."),
      chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "Include your call sign."),
    ],
  };
}

/** Landing readback. "Cleared for takeoff" is a critical miss and the airplane stays on the approach. */
export function parseLanding(text: string): ReadbackResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const landed = /\bcleared to land\b/.test(normalized);
  const tookOff = /\bcleared for takeoff\b/.test(normalized);
  const runwayOk = RUNWAY_31.test(normalized);
  return {
    normalized,
    critical: tookOff,
    valid: landed && !tookOff && runwayOk && Boolean(callSign),
    chips: [
      chip(
        "clearance",
        "Clearance",
        landed && !tookOff,
        "Cleared to land",
        tookOff ? "Cleared for takeoff is not a landing clearance." : "Say cleared to land.",
      ),
      chip("runway", "Runway", runwayOk, "Runway 31", "Include runway 31."),
      chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "Include your call sign."),
    ],
  };
}

/** Ready call on Tower: facility, call sign, holding short of runway 31, and ready. */
export function parseReadyCall(text: string): ReadbackResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const facilityOk = /\bsalem\s+tower\b/.test(normalized);
  const positionOk = HOLD.test(normalized) && RUNWAY_31.test(normalized);
  const readyOk = /\bready\b/.test(normalized);
  return {
    normalized,
    valid: facilityOk && Boolean(callSign) && positionOk && readyOk,
    chips: [
      chip("facility", "Facility", facilityOk, "Salem Tower", "Call Salem Tower."),
      chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "Use your full call sign."),
      chip("position", "Position", positionOk, "Holding short Runway 31", "Say holding short of Runway 31."),
      chip("intent", "Intent", readyOk, "Ready for departure", "Say you are ready for departure."),
    ],
  };
}

/** JO 7110.65 3-9-10 readback: cleared for takeoff, runway 31, and the call sign. */
export function parseTakeoffReadback(text: string): ReadbackResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const clearanceOk = /\bcleared for takeoff\b/.test(normalized);
  const runwayOk = RUNWAY_31.test(normalized);
  const lineupOnly = /\bline up and wait\b/.test(normalized) && !clearanceOk;
  return {
    normalized,
    valid: clearanceOk && runwayOk && Boolean(callSign),
    chips: [
      chip(
        "clearance",
        "Clearance",
        clearanceOk,
        "Cleared for takeoff",
        lineupOnly ? "Line up and wait is not a takeoff clearance." : "Say cleared for takeoff.",
      ),
      chip("runway", "Runway", runwayOk, "Runway 31", "Include runway 31."),
      chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "Include your call sign."),
    ],
  };
}

/** JO 7110.65 3-9-4. "Cleared for takeoff" is a critical miss, not a pass. */
export function parseLineUpAndWait(text: string): ReadbackResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const phraseOk = /\bline up and wait\b/.test(normalized);
  const runwayOk = RUNWAY_31.test(normalized);
  const tookOff = /\bcleared for takeoff\b/.test(normalized);
  return {
    normalized,
    critical: tookOff,
    valid: phraseOk && runwayOk && Boolean(callSign) && !tookOff,
    chips: [
      chip(
        "clearance",
        "Clearance",
        phraseOk && !tookOff,
        "Line up and wait",
        tookOff ? "Line up and wait is not a takeoff clearance." : "Say line up and wait.",
      ),
      chip("runway", "Runway", runwayOk, "Runway 31", "Include runway 31."),
      chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "Include your call sign."),
    ],
  };
}

function chip(id: SlotChip["id"], label: string, ok: boolean, pass: string, fail: string): SlotChip {
  return { id, label, status: ok ? "pass" : "fail", detail: ok ? pass : fail };
}
