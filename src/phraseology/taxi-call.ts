import { normalizeTransmission } from "./normalize";

export type SlotId =
  | "facility"
  | "callsign"
  | "position"
  | "atis"
  | "intent"
  | "hold-short"
  | "runway"
  | "clearance";
export type SlotStatus = "pass" | "fail" | "coach";
export type RadioPromptId =
  | "clearance"
  | "say-again-call-sign"
  | "say-again-request"
  | "read-back-hold"
  | "read-back-crossing"
  | "contact-tower"
  | "takeoff-clearance"
  | "line-up-and-wait"
  | "say-again"
  | "frequency-change"
  | "atis"
  | "landing-clearance"
  | "contact-ground"
  | "taxi-in";

export interface SlotChip {
  id: SlotId;
  label: string;
  status: SlotStatus;
  detail: string;
}

export interface TaxiCallResult {
  normalized: string;
  chips: SlotChip[];
  coaching: string[];
  valid: boolean;
  prompt: RadioPromptId;
}

const CALL_SIGN = /\b(skyhawk|cessna)\s+3694(?:\s*sierra|\s*s)\b/;

export function findCallSign(normalized: string): string | null {
  const callSign = CALL_SIGN.exec(normalized);
  if (!callSign) return null;
  return `${titleCase(callSign[1])} 3694S`;
}

/** Score the initial Ground taxi call. AIM 4-2-3, with ATIS coached rather than required. */
export function parseTaxiCall(text: string): TaxiCallResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const facilityOk = /\bsalem\s+ground\b/.test(normalized);
  const positionOk = /\bapron\b/.test(normalized);
  const atisOk = /\binformation\s+bravo\b/.test(normalized);
  const intentOk = /\btaxi\b/.test(normalized);

  const chips: SlotChip[] = [
    {
      id: "facility",
      label: "Facility",
      status: facilityOk ? "pass" : "fail",
      detail: facilityOk ? "Salem Ground" : "Name who you are calling: Salem Ground.",
    },
    {
      id: "callsign",
      label: "Call sign",
      status: callSign ? "pass" : "fail",
      detail: callSign ?? "Use your full call sign: Skyhawk three six niner four sierra.",
    },
    {
      id: "position",
      label: "Position",
      status: positionOk ? "pass" : "fail",
      detail: positionOk ? "GA apron" : "State where you are: GA apron.",
    },
    {
      id: "atis",
      label: "ATIS",
      status: atisOk ? "pass" : "coach",
      detail: atisOk ? "Information Bravo" : "Add the ATIS code: with information Bravo.",
    },
    {
      id: "intent",
      label: "Intent",
      status: intentOk ? "pass" : "fail",
      detail: intentOk ? "Taxi" : "Say what you want: taxi.",
    },
  ];

  const coaching: string[] = [];
  if (intentOk && /\bcleared\b/.test(normalized)) {
    coaching.push("Controllers do not clear an aircraft to taxi. Ask to taxi.");
  }
  if (intentOk && /\bsouth\b/.test(normalized) && !/\bnorthwest\b/.test(normalized)) {
    coaching.push("Runway 31 is in use. A northwest departure matches that runway.");
  }

  const valid = facilityOk && Boolean(callSign) && positionOk && intentOk;
  let prompt: RadioPromptId = "clearance";
  if (!callSign) prompt = "say-again-call-sign";
  else if (!valid) prompt = "say-again-request";

  return { normalized, chips, coaching, valid, prompt };
}

/** Straight-in call on Tower: facility, call sign, position, and landing. ATIS is coached. */
export function parseInbound(text: string): TaxiCallResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const facilityOk = /\bsalem\s+tower\b/.test(normalized);
  const positionOk = /\b(inbound|southeast|final|straight in)\b/.test(normalized);
  const atisOk = /\binformation\s+bravo\b/.test(normalized);
  const intentOk = /\b(land|landing)\b/.test(normalized);
  const chips: SlotChip[] = [
    chip("facility", "Facility", facilityOk, "Salem Tower", "Call Salem Tower."),
    chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "Use your full call sign."),
    chip("position", "Position", positionOk, "Straight in", "Say where you are: straight in, or inbound."),
    chip("atis", "ATIS", atisOk, "Information Bravo", "Add the ATIS code: with information Bravo.", atisOk ? "pass" : "coach"),
    chip("intent", "Intent", intentOk, "Landing", "Say that you are landing."),
  ];
  const valid = facilityOk && Boolean(callSign) && positionOk && intentOk;
  let prompt: RadioPromptId = "landing-clearance";
  if (!valid) prompt = "say-again";
  return { normalized, chips, coaching: [], valid, prompt };
}

/** Taxi-in request on Ground after landing: facility, call sign, clear of the runway, and taxi. */
export function parseTaxiIn(text: string): TaxiCallResult {
  const normalized = normalizeTransmission(text);
  const callSign = findCallSign(normalized);
  const facilityOk = /\bsalem\s+ground\b/.test(normalized);
  const positionOk = /\b(clear|foxtrot)\b/.test(normalized);
  const intentOk = /\btaxi\b/.test(normalized);
  const chips: SlotChip[] = [
    chip("facility", "Facility", facilityOk, "Salem Ground", "Call Salem Ground."),
    chip("callsign", "Call sign", Boolean(callSign), callSign ?? "", "Use your full call sign."),
    chip("position", "Position", positionOk, "Clear of the runway", "Say you are clear, or at Foxtrot."),
    chip("intent", "Intent", intentOk, "Taxi", "Ask to taxi to the apron."),
  ];
  const valid = facilityOk && Boolean(callSign) && positionOk && intentOk;
  let prompt: RadioPromptId = "taxi-in";
  if (!callSign) prompt = "say-again-call-sign";
  else if (!valid) prompt = "say-again-request";
  return { normalized, chips, coaching: [], valid, prompt };
}

function chip(id: SlotId, label: string, ok: boolean, pass: string, fail: string, status?: SlotStatus): SlotChip {
  return { id, label, status: status ?? (ok ? "pass" : "fail"), detail: ok ? pass : fail };
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
