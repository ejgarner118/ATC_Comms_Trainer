import scenarioData from "../../data/ksle.json";
import { normalizeTransmission } from "../phraseology/normalize";
import {
  parseCrossing,
  parseHoldShort,
  parseLanding,
  parseLineUpAndWait,
  parseReadyCall,
  parseTakeoffReadback,
} from "../phraseology/readbacks";
import { parseInbound, parseTaxiCall, parseTaxiIn, type RadioPromptId, type SlotChip } from "../phraseology/taxi-call";
import type { LessonBeat, LessonGrade } from "./lesson";

export type Phase =
  | "at-ramp"
  | "await-taxi-readback"
  | "taxiing"
  | "holding-short"
  | "await-luaw-readback"
  | "lining-up"
  | "lined-up"
  | "await-takeoff-readback"
  | "rolling"
  | "complete"
  | "inbound"
  | "await-landing-readback"
  | "landing"
  | "clear-of-runway"
  | "await-taxi-in-readback"
  | "taxiing-in"
  | "parked";

export type LessonMode = "depart" | "arrive";

export type Motion = "none" | "taxi" | "lineup" | "depart" | "land" | "taxi-in";

export interface RadioLine {
  id: RadioPromptId;
  speaker: string;
  display: string;
}

export interface CallResponse {
  phase: Phase;
  chips: SlotChip[];
  coaching: string[];
  hud: string;
  radio: RadioLine | null;
  motion: Motion;
  beat: LessonBeat | null;
  grade: LessonGrade | null;
}

export const scenario = scenarioData;
export const ATIS_MHZ = "124.55";
export const GROUND_MHZ = "121.9";
export const TOWER_MHZ = "119.1";

const transmissions = scenarioData.transmissions;

export function frequencyName(mhz: string): string {
  const match = scenarioData.frequencies.find((item) => item.mhz === mhz);
  return match ? match.callSign : mhz;
}

export function radioLine(id: RadioPromptId): RadioLine {
  const line = transmissions[id];
  return { id, speaker: line.speaker, display: line.display };
}

export function respondToCall(input: {
  text: string;
  activeMhz: string;
  phase: Phase;
  radioBusy: boolean;
  lineUpAndWait?: boolean;
  lesson?: LessonMode;
}): CallResponse {
  if (input.radioBusy) return hold(input.phase, "The frequency is busy. Wait until it is quiet.");
  if (input.phase === "taxiing") return hold(input.phase, "You are still taxiing. Hold short of Runway 31.");
  if (input.phase === "lining-up") return hold(input.phase, "You are lining up on Runway 31. Hold there.");
  if (input.phase === "rolling") return hold(input.phase, "You are on the departure roll.");
  if (input.phase === "landing") return hold(input.phase, "You are on the landing roll.");
  if (input.phase === "taxiing-in") return hold(input.phase, "You are taxiing to the GA apron.");
  if (input.phase === "complete" || input.phase === "parked") {
    return hold(input.phase, "The hop is done. Reset to fly it again.");
  }
  if (input.activeMhz === ATIS_MHZ) {
    return hold(input.phase, "You transmitted on Salem ATIS. Nobody answered.");
  }

  if ((input.lesson ?? "depart") === "arrive") return respondArrival(input);

  const onGround = input.activeMhz === GROUND_MHZ;
  const onTower = input.activeMhz === TOWER_MHZ;

  if (input.phase === "at-ramp" || input.phase === "await-taxi-readback") {
    if (!onGround) {
      return hold(
        input.phase,
        `You transmitted on ${frequencyName(input.activeMhz)}. Salem Ground is on 121.9 and did not answer.`,
      );
    }
    if (/\bsalem\s+tower\b/.test(normalizeTransmission(input.text))) return contactTower(input.phase);
    if (input.phase === "at-ramp") return initialTaxi(input.text);
    return holdShortReadback(input.text);
  }

  if (input.phase === "holding-short") {
    if (!onTower) return contactTower(input.phase);
    return readyForDeparture(input.text, input.lineUpAndWait ?? false);
  }

  if (input.phase === "await-luaw-readback") {
    if (!onTower) return contactTower(input.phase);
    return lineUpReadback(input.text);
  }

  if (input.phase === "lined-up") {
    if (!onTower) return contactTower(input.phase);
    return linedUpCall(input.text);
  }

  if (!onTower) return contactTower(input.phase);
  return takeoffReadback(input.text);
}

/** Tower issues 3-9-10 after the airplane is in position on the runway. */
export function clearanceAfterLineup(): CallResponse {
  return {
    phase: "await-takeoff-readback",
    chips: [],
    coaching: [],
    hud: "Tower cleared you for takeoff. Read back the runway and your call sign.",
    radio: radioLine("takeoff-clearance"),
    motion: "none",
    beat: null,
    grade: null,
  };
}

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "await-taxi-readback":
      return "Read back hold short";
    case "taxiing":
      return "Taxiing via Charlie";
    case "holding-short":
      return "Holding short Runway 31";
    case "await-luaw-readback":
      return "Line up and wait";
    case "lining-up":
      return "Lining up Runway 31";
    case "lined-up":
      return "Holding on Runway 31";
    case "await-takeoff-readback":
      return "Cleared for takeoff";
    case "rolling":
      return "Departure roll";
    case "complete":
      return "Frequency change approved";
    case "inbound":
      return "Straight in Runway 31";
    case "await-landing-readback":
      return "Cleared to land";
    case "landing":
      return "Landing Runway 31";
    case "clear-of-runway":
      return "Clear of Runway 31";
    case "await-taxi-in-readback":
      return "Read back the crossing";
    case "taxiing-in":
      return "Taxiing to the apron";
    case "parked":
      return "Parked on the GA apron";
    default:
      return "At the GA apron";
  }
}

function initialTaxi(text: string): CallResponse {
  const parsed = parseTaxiCall(text);
  if (!parsed.valid) {
    return {
      phase: "at-ramp",
      chips: parsed.chips,
      coaching: parsed.coaching,
      hud: "Ground did not issue a taxi clearance.",
      radio: radioLine(parsed.prompt),
      motion: "none",
      beat: "taxi",
      grade: "miss",
    };
  }
  return {
    phase: "await-taxi-readback",
    chips: parsed.chips,
    coaching: parsed.coaching,
    hud: "Ground issued the taxi clearance. Read back the crossing of Runway 34 and hold short of Runway 31 before you move.",
    radio: radioLine("clearance"),
    motion: "none",
    beat: "taxi",
    grade: parsed.coaching.length > 0 || parsed.chips.some((chip) => chip.status === "coach") ? "coach" : "pass",
  };
}

function holdShortReadback(text: string): CallResponse {
  const parsed = parseHoldShort(text);
  if (!parsed.valid) {
    const crossing = parsed.gap === "crossing";
    const callSign = parsed.gap === "callsign";
    return {
      phase: "await-taxi-readback",
      chips: parsed.chips,
      coaching: [],
      hud: crossing
        ? "Ground did not hear the runway crossing. Read back cross Runway 34."
        : callSign
          ? "Ground did not hear the call sign. Say Skyhawk three six niner four sierra."
          : "Ground did not hear a complete hold-short readback.",
      radio: radioLine(crossing ? "read-back-crossing" : callSign ? "say-again-call-sign" : "read-back-hold"),
      motion: "none",
      beat: "hold-short",
      grade: "miss",
    };
  }
  return {
    phase: "taxiing",
    chips: parsed.chips,
    coaching: [],
    hud: "Readback complete. Taxi via Charlie, cross Runway 34, via Foxtrot, and hold short of Runway 31.",
    radio: null,
    motion: "taxi",
    beat: "hold-short",
    grade: "pass",
  };
}

function readyForDeparture(text: string, lineUpAndWait: boolean): CallResponse {
  const parsed = parseReadyCall(text);
  if (!parsed.valid) {
    return {
      phase: "holding-short",
      chips: parsed.chips,
      coaching: [],
      hud: "Tower did not take that as a ready call. Say your call sign, holding short of Runway 31, and ready for departure.",
      radio: radioLine("say-again"),
      motion: "none",
      beat: "ready",
      grade: "miss",
    };
  }
  if (lineUpAndWait) {
    return {
      phase: "await-luaw-readback",
      chips: parsed.chips,
      coaching: [],
      hud: "Tower said line up and wait. Read back the runway and your call sign. That is not a takeoff clearance.",
      radio: radioLine("line-up-and-wait"),
      motion: "none",
      beat: "ready",
      grade: "pass",
    };
  }
  return {
    phase: "await-takeoff-readback",
    chips: parsed.chips,
    coaching: [],
    hud: "Tower cleared you for takeoff. Read back the runway and your call sign.",
    radio: radioLine("takeoff-clearance"),
    motion: "none",
    beat: "ready",
    grade: "pass",
  };
}

function lineUpReadback(text: string): CallResponse {
  const parsed = parseLineUpAndWait(text);
  if (!parsed.valid) {
    return {
      phase: "await-luaw-readback",
      chips: parsed.chips,
      coaching: [],
      hud: parsed.critical
        ? "Line up and wait is not a takeoff clearance. The airplane stays short of Runway 31."
        : "Read back line up and wait, runway 31, and your call sign. The airplane stays short.",
      radio: radioLine("line-up-and-wait"),
      motion: "none",
      beat: "line-up",
      grade: parsed.critical ? "critical" : "miss",
    };
  }
  return {
    phase: "lining-up",
    chips: parsed.chips,
    coaching: [],
    hud: "Readback complete. Line up on Runway 31 and hold.",
    radio: null,
    motion: "lineup",
    beat: "line-up",
    grade: "pass",
  };
}

function linedUpCall(text: string): CallResponse {
  const parsed = parseLineUpAndWait(text);
  if (parsed.critical) {
    return {
      phase: "lined-up",
      chips: parsed.chips,
      coaching: [],
      hud: "Line up and wait is not a takeoff clearance. Hold your position on the runway.",
      radio: radioLine("line-up-and-wait"),
      motion: "none",
      beat: "line-up",
      grade: "critical",
    };
  }
  return hold("lined-up", "Hold your position on the runway. Tower has not cleared you for takeoff.");
}

function takeoffReadback(text: string): CallResponse {
  const parsed = parseTakeoffReadback(text);
  if (!parsed.valid) {
    return {
      phase: "await-takeoff-readback",
      chips: parsed.chips,
      coaching: [],
      hud: "Say again the runway and your call sign. The airplane stays short of the runway.",
      radio: radioLine("say-again"),
      motion: "none",
      beat: "takeoff",
      grade: "miss",
    };
  }
  return {
    phase: "rolling",
    chips: parsed.chips,
    coaching: [],
    hud: "Readback complete. Runway 31, cleared for takeoff.",
    radio: null,
    motion: "depart",
    beat: "takeoff",
    grade: "pass",
  };
}

function contactTower(phase: Phase): CallResponse {
  return {
    phase,
    chips: [],
    coaching: [],
    hud: "Ground heard you. Tower is on 119.1.",
    radio: radioLine("contact-tower"),
    motion: "none",
    beat: null,
    grade: null,
  };
}

/** Tower sends the airplane to Ground once it is clear at Foxtrot. */
export function clearOfRunway(): CallResponse {
  return {
    phase: "clear-of-runway",
    chips: [],
    coaching: [],
    hud: "Exit at Foxtrot. Contact Salem Ground on 121.9 for taxi to the GA apron.",
    radio: radioLine("contact-ground"),
    motion: "none",
    beat: null,
    grade: null,
  };
}

function respondArrival(input: { text: string; activeMhz: string; phase: Phase }): CallResponse {
  const onGround = input.activeMhz === GROUND_MHZ;
  const onTower = input.activeMhz === TOWER_MHZ;

  if (input.phase === "inbound" || input.phase === "await-landing-readback") {
    if (!onTower) return contactTower(input.phase);
    if (input.phase === "inbound") return inboundCall(input.text);
    return landingReadback(input.text);
  }

  if (input.phase === "clear-of-runway" || input.phase === "await-taxi-in-readback") {
    if (!onGround) return contactGround(input.phase);
    if (input.phase === "clear-of-runway") return taxiInCall(input.text);
    return crossingReadback(input.text);
  }

  return hold(input.phase, "Hold your position.");
}

function inboundCall(text: string): CallResponse {
  const parsed = parseInbound(text);
  if (!parsed.valid) {
    return {
      phase: "inbound",
      chips: parsed.chips,
      coaching: parsed.coaching,
      hud: "Tower did not take that as an inbound call.",
      radio: radioLine(parsed.prompt),
      motion: "none",
      beat: "inbound",
      grade: "miss",
    };
  }
  return {
    phase: "await-landing-readback",
    chips: parsed.chips,
    coaching: parsed.coaching,
    hud: "Tower cleared you to land. Read back runway 31 and your call sign.",
    radio: radioLine("landing-clearance"),
    motion: "none",
    beat: "inbound",
    grade: parsed.chips.some((chip) => chip.status === "coach") ? "coach" : "pass",
  };
}

function landingReadback(text: string): CallResponse {
  const parsed = parseLanding(text);
  if (!parsed.valid) {
    return {
      phase: "await-landing-readback",
      chips: parsed.chips,
      coaching: [],
      hud: parsed.critical
        ? "Cleared for takeoff is not a landing clearance. The airplane stays on the approach."
        : "Read back cleared to land, runway 31, and your call sign. The airplane stays on the approach.",
      radio: radioLine("landing-clearance"),
      motion: "none",
      beat: "landing",
      grade: parsed.critical ? "critical" : "miss",
    };
  }
  return {
    phase: "landing",
    chips: parsed.chips,
    coaching: [],
    hud: "Readback complete. Runway 31, cleared to land.",
    radio: null,
    motion: "land",
    beat: "landing",
    grade: "pass",
  };
}

function taxiInCall(text: string): CallResponse {
  const parsed = parseTaxiIn(text);
  if (!parsed.valid) {
    return {
      phase: "clear-of-runway",
      chips: parsed.chips,
      coaching: parsed.coaching,
      hud: "Ground did not take that as a taxi request.",
      radio: radioLine(parsed.prompt),
      motion: "none",
      beat: "taxi-in",
      grade: "miss",
    };
  }
  return {
    phase: "await-taxi-in-readback",
    chips: parsed.chips,
    coaching: [],
    hud: "Ground issued the taxi to the apron. Read back the crossing of Runway 34.",
    radio: radioLine("taxi-in"),
    motion: "none",
    beat: "taxi-in",
    grade: "pass",
  };
}

function crossingReadback(text: string): CallResponse {
  const parsed = parseCrossing(text);
  if (!parsed.valid) {
    return {
      phase: "await-taxi-in-readback",
      chips: parsed.chips,
      coaching: [],
      hud: "Ground did not hear the runway crossing.",
      radio: radioLine("read-back-crossing"),
      motion: "none",
      beat: "crossing",
      grade: "miss",
    };
  }
  return {
    phase: "taxiing-in",
    chips: parsed.chips,
    coaching: [],
    hud: "Readback complete. Taxi via Foxtrot, cross Runway 34, via Charlie, to the GA apron.",
    radio: null,
    motion: "taxi-in",
    beat: "crossing",
    grade: "pass",
  };
}

function contactGround(phase: Phase): CallResponse {
  return {
    phase,
    chips: [],
    coaching: [],
    hud: "Tower heard you. Ground is on 121.9.",
    radio: radioLine("contact-ground"),
    motion: "none",
    beat: null,
    grade: null,
  };
}

function hold(phase: Phase, hud: string): CallResponse {
  return { phase, chips: [], coaching: [], hud, radio: null, motion: "none", beat: null, grade: null };
}
