import { describe, expect, it } from "vitest";
import { normalizeTransmission } from "../src/phraseology/normalize";
import { parseTaxiCall } from "../src/phraseology/taxi-call";
import { emptyLesson, lessonRows, recordMark, type LessonCard } from "../src/scenario/lesson";
import { clearanceAfterLineup, respondToCall, type CallResponse } from "../src/scenario/ksle";

const CANONICAL =
  "Salem Ground, Skyhawk three six niner four sierra, GA apron, with information Bravo, taxi VFR to the northwest.";

describe("normalizeTransmission", () => {
  it("maps aviation digits, including niner", () => {
    expect(normalizeTransmission("niner")).toBe("9");
    expect(normalizeTransmission("tree")).toBe("3");
    expect(normalizeTransmission("fife")).toBe("5");
    expect(normalizeTransmission("wun")).toBe("1");
    expect(normalizeTransmission("three six niner four")).toBe("3694");
  });

  it("joins a split niner and snaps a one-edit digit spelling", () => {
    expect(normalizeTransmission("three six nine er four")).toBe("3694");
    expect(normalizeTransmission("tree six niner four")).toBe("3694");
    expect(normalizeTransmission("runway tree one")).toBe("runway 31");
    expect(normalizeTransmission("for")).toBe("for");
  });

  it("collapses a spoken runway and hold-short slip", () => {
    expect(normalizeTransmission("hole shot of runway three one")).toBe("hold short of runway 31");
  });

  it("joins a call sign split by a filler and leaves the runways alone", () => {
    expect(normalizeTransmission("Skyhawk 369 or 4 Sierra")).toBe("skyhawk 3694 sierra");
    expect(normalizeTransmission("runway 31 or runway 34")).toBe("runway 31 or runway 34");
  });

  it("joins a grouped call sign and leaves runway 31 alone", () => {
    expect(normalizeTransmission("sky hawk thirty six ninety four sierra")).toBe("skyhawk 3694 sierra");
    expect(normalizeTransmission("three six ninety four")).toBe("3694");
    expect(normalizeTransmission("36 94")).toBe("3694");
    expect(normalizeTransmission("three sixty nine four")).toBe("3694");
    expect(normalizeTransmission("runway thirty one")).toBe("runway 31");
  });

  it("repairs facility, takeoff, and line-up hearings", () => {
    expect(normalizeTransmission("selim ground")).toBe("salem ground");
    expect(normalizeTransmission("cleared for take off")).toBe("cleared for takeoff");
    expect(normalizeTransmission("lineup and wait")).toBe("line up and wait");
    expect(normalizeTransmission("line up in wait")).toBe("line up and wait");
    expect(normalizeTransmission("line up and weight")).toBe("line up and wait");
    expect(normalizeTransmission("whole short")).toBe("hold short");
    expect(normalizeTransmission("info bravo")).toBe("information bravo");
    expect(normalizeTransmission("with bravo")).toBe("information bravo");
  });
});

describe("parseTaxiCall", () => {
  it("accepts the canonical taxi call", () => {
    const result = parseTaxiCall(CANONICAL);
    expect(result.valid).toBe(true);
    expect(result.prompt).toBe("clearance");
    expect(result.normalized).toContain("skyhawk 3694 sierra");
    expect(result.chips.map((chip) => chip.status)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
  });

  it("accepts Cessna with digits already recognized", () => {
    const result = parseTaxiCall("Salem Ground, Cessna 3694S, GA apron, information Bravo, taxi.");
    expect(result.valid).toBe(true);
    expect(result.chips.find((chip) => chip.id === "callsign")?.detail).toBe("Cessna 3694S");
  });

  it("fails a missing call sign and asks for it", () => {
    const result = parseTaxiCall("Salem Ground, GA apron, with information Bravo, taxi VFR to the northwest.");
    expect(result.valid).toBe(false);
    expect(result.chips.find((chip) => chip.id === "callsign")?.status).toBe("fail");
    expect(result.prompt).toBe("say-again-call-sign");
  });

  it("fails a missing position", () => {
    const result = parseTaxiCall("Salem Ground, Skyhawk 3694S, with information Bravo, taxi to the northwest.");
    expect(result.valid).toBe(false);
    expect(result.chips.find((chip) => chip.id === "position")?.status).toBe("fail");
    expect(result.prompt).toBe("say-again-request");
  });

  it("fails a call addressed to Tower", () => {
    const result = parseTaxiCall(CANONICAL.replace("Ground", "Tower"));
    expect(result.valid).toBe(false);
    expect(result.chips.find((chip) => chip.id === "facility")?.status).toBe("fail");
    expect(result.prompt).toBe("say-again-request");
  });

  it("coaches a missing ATIS code without blocking the clearance", () => {
    const result = parseTaxiCall(
      "Salem Ground, Skyhawk three six niner four sierra, GA apron, taxi VFR to the northwest.",
    );
    expect(result.valid).toBe(true);
    expect(result.chips.find((chip) => chip.id === "atis")?.status).toBe("coach");
  });

  it("coaches cleared-to-taxi wording when the request is otherwise complete", () => {
    const result = parseTaxiCall(
      "Salem Ground, Skyhawk 3694S, GA apron, with information Bravo, request cleared to taxi northwest.",
    );
    expect(result.valid).toBe(true);
    expect(result.coaching[0]).toMatch(/do not clear/i);
  });
});

describe("respondToCall", () => {
  it("issues the scripted clearance on Ground", () => {
    const outcome = respondToCall({
      text: CANONICAL,
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-taxi-readback");
    expect(outcome.radio?.id).toBe("clearance");
    expect(outcome.radio?.display).toContain("hold short of Runway 31");
    expect(outcome.radio?.display).toContain("cross Runway 34");
    expect(outcome.radio?.display).toContain("Charlie");
  });

  it("stays silent on Tower", () => {
    const outcome = respondToCall({
      text: CANONICAL,
      activeMhz: "119.1",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.radio).toBeNull();
    expect(outcome.phase).toBe("at-ramp");
    expect(outcome.hud).toMatch(/did not answer/);
  });

  it("does not reissue the taxi clearance while a hold-short readback is due", () => {
    const outcome = respondToCall({
      text: CANONICAL,
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.radio?.id).toBe("read-back-hold");
    expect(outcome.phase).toBe("await-taxi-readback");
    expect(outcome.motion).toBe("none");
  });
});

const HOLD_SHORT =
  "Cross runway three four, hold short of runway three one, Skyhawk three six niner four sierra.";
const READY = "Salem Tower, Skyhawk 3694S, holding short Runway 31, ready for departure.";
const TAKEOFF = "Cleared for takeoff Runway 31, Skyhawk 3694S.";

describe("departure readbacks", () => {
  it("accepts a hold-short readback with the call sign at the end", () => {
    const outcome = respondToCall({
      text: HOLD_SHORT,
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.motion).toBe("taxi");
    expect(outcome.phase).toBe("taxiing");
    expect(outcome.radio).toBeNull();
  });

  it("accepts hole shot and a call sign at the start", () => {
    const outcome = respondToCall({
      text: "Skyhawk 3694S, cross runway 34, hole shot of runway 31.",
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.motion).toBe("taxi");
  });

  it("asks for the hold-short readback when the runway is missing", () => {
    const outcome = respondToCall({
      text: "Hold short, Skyhawk 3694S.",
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.motion).toBe("none");
    expect(outcome.phase).toBe("await-taxi-readback");
    expect(outcome.radio?.display).toMatch(/read back hold instructions/i);
    expect(outcome.chips.find((chip) => chip.id === "runway")?.status).toBe("fail");
  });

  it("stays silent if the hold-short readback is on Tower", () => {
    const outcome = respondToCall({
      text: HOLD_SHORT,
      activeMhz: "119.1",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.radio).toBeNull();
    expect(outcome.motion).toBe("none");
    expect(outcome.phase).toBe("await-taxi-readback");
  });

  it("issues takeoff clearance only on Tower", () => {
    const onTower = respondToCall({
      text: READY,
      activeMhz: "119.1",
      phase: "holding-short",
      radioBusy: false,
    });
    expect(onTower.phase).toBe("await-takeoff-readback");
    expect(onTower.radio?.id).toBe("takeoff-clearance");
    expect(onTower.motion).toBe("none");

    const onGround = respondToCall({
      text: READY,
      activeMhz: "121.9",
      phase: "holding-short",
      radioBusy: false,
    });
    expect(onGround.phase).toBe("holding-short");
    expect(onGround.radio?.id).toBe("contact-tower");
    expect(onGround.motion).toBe("none");
  });

  it("rolls only after a takeoff readback that includes the runway and call sign", () => {
    const good = respondToCall({
      text: TAKEOFF,
      activeMhz: "119.1",
      phase: "await-takeoff-readback",
      radioBusy: false,
    });
    expect(good.phase).toBe("rolling");
    expect(good.motion).toBe("depart");
    expect(good.radio).toBeNull();

    const missingRunway = respondToCall({
      text: "Cleared for takeoff, Skyhawk 3694S.",
      activeMhz: "119.1",
      phase: "await-takeoff-readback",
      radioBusy: false,
    });
    expect(missingRunway.phase).toBe("await-takeoff-readback");
    expect(missingRunway.motion).toBe("none");
    expect(missingRunway.radio?.id).toBe("say-again");
  });
});

const LINE_UP = "Runway 31, line up and wait, Skyhawk 3694S.";

describe("line up and wait", () => {
  it("keeps a direct takeoff clearance when the flag is off", () => {
    const outcome = respondToCall({
      text: READY,
      activeMhz: "119.1",
      phase: "holding-short",
      radioBusy: false,
      lineUpAndWait: false,
    });
    expect(outcome.radio?.id).toBe("takeoff-clearance");
    expect(outcome.phase).toBe("await-takeoff-readback");
    expect(outcome.motion).toBe("none");
  });

  it("issues line up and wait instead of a takeoff clearance when the flag is on", () => {
    const outcome = respondToCall({
      text: READY,
      activeMhz: "119.1",
      phase: "holding-short",
      radioBusy: false,
      lineUpAndWait: true,
    });
    expect(outcome.radio?.id).toBe("line-up-and-wait");
    expect(outcome.phase).toBe("await-luaw-readback");
    expect(outcome.motion).toBe("none");
  });

  it("lines up only after a line-up-and-wait readback", () => {
    const outcome = respondToCall({
      text: LINE_UP,
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("lining-up");
    expect(outcome.motion).toBe("lineup");
    expect(outcome.radio).toBeNull();
  });

  it("treats a takeoff readback as a critical miss and leaves the airplane short", () => {
    const outcome = respondToCall({
      text: TAKEOFF,
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-luaw-readback");
    expect(outcome.motion).toBe("none");
    expect(outcome.radio?.id).toBe("line-up-and-wait");
    expect(outcome.chips.find((chip) => chip.id === "clearance")?.status).toBe("fail");
  });

  it("does not roll a takeoff readback spoken while holding on the runway", () => {
    const outcome = respondToCall({
      text: TAKEOFF,
      activeMhz: "119.1",
      phase: "lined-up",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("lined-up");
    expect(outcome.motion).toBe("none");
    expect(outcome.radio?.display).toMatch(/line up and wait/i);
  });

  it("issues the takeoff clearance only after the airplane is lined up", () => {
    const issued = clearanceAfterLineup();
    expect(issued.phase).toBe("await-takeoff-readback");
    expect(issued.radio?.id).toBe("takeoff-clearance");
    expect(issued.motion).toBe("none");
  });
});

describe("heard calls", () => {
  it("issues the taxi clearance for a grouped, misheard call", () => {
    const outcome = respondToCall({
      text: "Selim ground, sky hawk thirty six ninety four sierra, GA apron, info bravo, like to taxi.",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-taxi-readback");
    expect(outcome.radio?.id).toBe("clearance");
    expect(outcome.chips.find((chip) => chip.id === "callsign")?.detail).toBe("Skyhawk 3694S");
    expect(outcome.chips.find((chip) => chip.id === "atis")?.status).toBe("pass");
  });

  it("accepts a hold-short readback with a split runway and call sign", () => {
    const outcome = respondToCall({
      text: "Cross runway three four, whole short runway three one, skyhawk three six ninety four sierra.",
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.motion).toBe("taxi");
    expect(outcome.radio).toBeNull();
  });

  it("accepts a ready call that says ready for takeoff", () => {
    const outcome = respondToCall({
      text: "Salem Tower, Skyhawk 36 94 Sierra, holding short runway 31, ready for takeoff.",
      activeMhz: "119.1",
      phase: "holding-short",
      radioBusy: false,
    });
    expect(outcome.radio?.id).toBe("takeoff-clearance");
    expect(outcome.motion).toBe("none");
  });

  it("rolls on a split takeoff readback", () => {
    const outcome = respondToCall({
      text: "Cleared for take off runway thirty one, sky hawk 3694 sierra.",
      activeMhz: "119.1",
      phase: "await-takeoff-readback",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("rolling");
    expect(outcome.motion).toBe("depart");
  });

  it("accepts a tree and niner taxi call", () => {
    const outcome = respondToCall({
      text: "Salem Ground, Skyhawk tree six nine er four sierra, GA apron, taxi",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-taxi-readback");
    expect(outcome.radio?.id).toBe("clearance");
    expect(outcome.chips.find((chip) => chip.id === "callsign")?.detail).toBe("Skyhawk 3694S");
  });

  it("keeps a tree-one takeoff readback off the line-up path", () => {
    const outcome = respondToCall({
      text: "Cleared for takeoff runway tree one, Skyhawk tree six niner four sierra.",
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-luaw-readback");
    expect(outcome.motion).toBe("none");
    expect(outcome.radio?.id).toBe("line-up-and-wait");
    expect(outcome.chips.find((chip) => chip.id === "clearance")?.status).toBe("fail");
  });

  it("does not treat a messy takeoff readback as line up and wait", () => {
    const outcome = respondToCall({
      text: "Cleared for take off runway 31, Skyhawk thirty six ninety four sierra.",
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-luaw-readback");
    expect(outcome.motion).toBe("none");
    expect(outcome.radio?.id).toBe("line-up-and-wait");
    expect(outcome.chips.find((chip) => chip.id === "clearance")?.status).toBe("fail");
  });

  it("lines up when the line-up phrase arrives split", () => {
    const outcome = respondToCall({
      text: "Lineup and wait, runway 31, Cessna 36 94 Sierra.",
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("lining-up");
    expect(outcome.motion).toBe("lineup");
    expect(outcome.radio).toBeNull();
  });
});

describe("one-letter hearings", () => {
  it("accepts a call sign transcribed as sierr", () => {
    const outcome = respondToCall({
      text: "Selim ground, skyhawk 3694 sierr, GA apron, taxi.",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-taxi-readback");
    expect(outcome.radio?.id).toBe("clearance");
    expect(outcome.chips.find((chip) => chip.id === "callsign")?.detail).toBe("Skyhawk 3694S");
  });

  it("accepts a one-letter facility miss", () => {
    expect(normalizeTransmission("salen groun")).toBe("salem ground");
    const outcome = respondToCall({
      text: "Salen groun, Skyhawk 3694S, GA apron, taxi.",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.chips.find((chip) => chip.id === "facility")?.status).toBe("pass");
    expect(outcome.radio?.id).toBe("clearance");
  });

  it("keeps a one-letter takeoff readback from lining the airplane up", () => {
    const outcome = respondToCall({
      text: "Cleard for takeoff runway 31, Skyhawk 3694 sierra.",
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    expect(outcome.phase).toBe("await-luaw-readback");
    expect(outcome.motion).toBe("none");
    expect(outcome.radio?.id).toBe("line-up-and-wait");
    expect(outcome.chips.find((chip) => chip.id === "clearance")?.status).toBe("fail");
  });
});

function keep(card: LessonCard, outcome: CallResponse): LessonCard {
  if (!outcome.beat || !outcome.grade) return card;
  return recordMark(card, {
    beat: outcome.beat,
    grade: outcome.grade,
    detail: [outcome.hud, ...outcome.coaching, ...outcome.chips.filter((chip) => chip.status === "coach").map((chip) => chip.detail)]
      .filter(Boolean)
      .join(" "),
  });
}

describe("lesson card", () => {
  it("records a pass for each call on a clean departure", () => {
    let card = emptyLesson();
    const taxi = respondToCall({ text: CANONICAL, activeMhz: "121.9", phase: "at-ramp", radioBusy: false });
    const hold = respondToCall({ text: HOLD_SHORT, activeMhz: "121.9", phase: "await-taxi-readback", radioBusy: false });
    const ready = respondToCall({ text: READY, activeMhz: "119.1", phase: "holding-short", radioBusy: false });
    const takeoff = respondToCall({ text: TAKEOFF, activeMhz: "119.1", phase: "await-takeoff-readback", radioBusy: false });
    card = keep(card, taxi);
    card = keep(card, hold);
    card = keep(card, ready);
    card = keep(card, takeoff);
    expect(lessonRows(card).map((row) => [row.label, row.grade])).toEqual([
      ["Taxi call", "pass"],
      ["Hold-short readback", "pass"],
      ["Ready call", "pass"],
      ["Takeoff readback", "pass"],
    ]);
  });

  it("coaches a taxi call that omits the ATIS code", () => {
    const outcome = respondToCall({
      text: "Salem Ground, Skyhawk 3694S, GA apron, taxi.",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.beat).toBe("taxi");
    expect(outcome.grade).toBe("coach");
    const rows = lessonRows(keep(emptyLesson(), outcome));
    expect(rows[0]?.grade).toBe("coach");
    expect(rows[0]?.detail).toMatch(/information Bravo/i);
  });

  it("keeps a critical line-up miss after the correct readback", () => {
    const missed = respondToCall({
      text: "Cleared for takeoff runway 31, Skyhawk 3694S.",
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    const fixed = respondToCall({
      text: "Runway 31, line up and wait, Skyhawk 3694S.",
      activeMhz: "119.1",
      phase: "await-luaw-readback",
      radioBusy: false,
    });
    expect(missed.grade).toBe("critical");
    expect(fixed.grade).toBe("pass");
    const rows = lessonRows(keep(keep(emptyLesson(), missed), fixed));
    expect(rows.map((row) => row.grade)).toEqual(["pass", "critical"]);
  });

  it("is empty after reset", () => {
    const outcome = respondToCall({ text: CANONICAL, activeMhz: "121.9", phase: "at-ramp", radioBusy: false });
    const flown = keep(emptyLesson(), outcome);
    expect(lessonRows(flown).length).toBe(1);
    expect(lessonRows(emptyLesson())).toEqual([]);
  });
});

describe("heard call sign and ramp", () => {
  it("accepts a glued call sign whose suffix is one letter off", () => {
    const outcome = respondToCall({
      text: "Salem Ground, Skyhawk3694C, currently on the GA apron with information bravo requesting taxi to runway 31 for Northwest Apart",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.radio?.id).toBe("clearance");
    expect(outcome.chips.find((chip) => chip.id === "callsign")?.detail).toBe("Skyhawk 3694S");
  });

  it("accepts the apron when GA is left off", () => {
    const outcome = respondToCall({
      text: "Salem Ground, Skyhawk 3694 Sierra, currently on the apron with information bravo. Request taxi to runway 31 for Northwest departure.",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.radio?.id).toBe("clearance");
    expect(outcome.chips.find((chip) => chip.id === "position")?.detail).toBe("GA apron");
  });

  it("still asks for the request when only the call sign arrives", () => {
    const outcome = respondToCall({
      text: "Skyhawk 3694 Sierra",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.radio?.id).toBe("say-again-request");
  });

  it("still misses a call sign heard as 4th year", () => {
    const outcome = respondToCall({
      text: "Salem Ground, Skyhawk 369 4th year. Currently on GA apron with information Bravo requesting taxi to runway 31.",
      activeMhz: "121.9",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.radio?.id).toBe("say-again-call-sign");
  });
});

describe("heard call sign in a readback", () => {
  it("taxis on the readback whose call sign arrived as 369 or 4", () => {
    const outcome = respondToCall({
      text: "Runway 31 via Charlie, cross runway 34 via Foxtrot, hold short runway 31, Skyhawk 369 or 4 Sierra.",
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.motion).toBe("taxi");
    expect(outcome.phase).toBe("taxiing");
    expect(outcome.radio).toBeNull();
    expect(outcome.chips.find((chip) => chip.id === "callsign")?.detail).toBe("Skyhawk 3694S");
  });

  it("asks for the call sign when the hold short and the crossing were heard", () => {
    const outcome = respondToCall({
      text: "Runway 31 via Charlie, cross runway 34 via Foxtrot, hold short runway 31.",
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.motion).toBe("none");
    expect(outcome.radio?.id).toBe("say-again-call-sign");
    expect(outcome.chips.find((chip) => chip.id === "hold-short")?.status).toBe("pass");
    expect(outcome.chips.find((chip) => chip.id === "clearance")?.status).toBe("pass");
  });
});

describe("runway crossing", () => {
  it("asks for the crossing when the hold short is otherwise complete", () => {
    const outcome = respondToCall({
      text: "Hold short of runway three one, Skyhawk three six niner four sierra.",
      activeMhz: "121.9",
      phase: "await-taxi-readback",
      radioBusy: false,
    });
    expect(outcome.motion).toBe("none");
    expect(outcome.phase).toBe("await-taxi-readback");
    expect(outcome.radio?.id).toBe("read-back-crossing");
    expect(outcome.grade).toBe("miss");
  });
});

const INBOUND = "Salem Tower, Skyhawk 3694S, straight in Runway 31, information Bravo, landing.";
const LANDING = "Cleared to land Runway 31, Skyhawk 3694S.";
const TAXI_IN = "Salem Ground, Skyhawk 3694S, clear of Runway 31 at Foxtrot, taxi to the apron.";
const CROSS_BACK = "Cross runway three four, Skyhawk three six niner four sierra.";

describe("arrival", () => {
  it("clears a straight-in call to land and coaches a missing ATIS code", () => {
    const withAtis = respondToCall({
      text: INBOUND,
      activeMhz: "119.1",
      phase: "inbound",
      radioBusy: false,
      lesson: "arrive",
    });
    expect(withAtis.phase).toBe("await-landing-readback");
    expect(withAtis.radio?.id).toBe("landing-clearance");
    expect(withAtis.grade).toBe("pass");

    const without = respondToCall({
      text: "Salem Tower, Skyhawk 3694S, straight in, landing.",
      activeMhz: "119.1",
      phase: "inbound",
      radioBusy: false,
      lesson: "arrive",
    });
    expect(without.phase).toBe("await-landing-readback");
    expect(without.grade).toBe("coach");
  });

  it("lands only after a landing readback", () => {
    const outcome = respondToCall({
      text: LANDING,
      activeMhz: "119.1",
      phase: "await-landing-readback",
      radioBusy: false,
      lesson: "arrive",
    });
    expect(outcome.phase).toBe("landing");
    expect(outcome.motion).toBe("land");
    expect(outcome.radio).toBeNull();
  });

  it("treats a takeoff readback as a critical miss and stays on the approach", () => {
    const outcome = respondToCall({
      text: TAKEOFF,
      activeMhz: "119.1",
      phase: "await-landing-readback",
      radioBusy: false,
      lesson: "arrive",
    });
    expect(outcome.phase).toBe("await-landing-readback");
    expect(outcome.motion).toBe("none");
    expect(outcome.grade).toBe("critical");
    expect(outcome.radio?.id).toBe("landing-clearance");
  });

  it("taxis back only after the crossing is read back", () => {
    const asked = respondToCall({
      text: TAXI_IN,
      activeMhz: "121.9",
      phase: "clear-of-runway",
      radioBusy: false,
      lesson: "arrive",
    });
    expect(asked.phase).toBe("await-taxi-in-readback");
    expect(asked.radio?.id).toBe("taxi-in");
    expect(asked.motion).toBe("none");

    const missing = respondToCall({
      text: "Skyhawk 3694S.",
      activeMhz: "121.9",
      phase: "await-taxi-in-readback",
      radioBusy: false,
      lesson: "arrive",
    });
    expect(missing.motion).toBe("none");
    expect(missing.radio?.id).toBe("read-back-crossing");

    const crossed = respondToCall({
      text: CROSS_BACK,
      activeMhz: "121.9",
      phase: "await-taxi-in-readback",
      radioBusy: false,
      lesson: "arrive",
    });
    expect(crossed.phase).toBe("taxiing-in");
    expect(crossed.motion).toBe("taxi-in");
  });

  it("records the arrival beats and leaves the departure beats off the card", () => {
    let card = emptyLesson();
    card = keep(card, respondToCall({ text: INBOUND, activeMhz: "119.1", phase: "inbound", radioBusy: false, lesson: "arrive" }));
    card = keep(card, respondToCall({ text: LANDING, activeMhz: "119.1", phase: "await-landing-readback", radioBusy: false, lesson: "arrive" }));
    card = keep(card, respondToCall({ text: TAXI_IN, activeMhz: "121.9", phase: "clear-of-runway", radioBusy: false, lesson: "arrive" }));
    card = keep(card, respondToCall({ text: CROSS_BACK, activeMhz: "121.9", phase: "await-taxi-in-readback", radioBusy: false, lesson: "arrive" }));
    expect(lessonRows(card).map((row) => [row.label, row.grade])).toEqual([
      ["Inbound call", "pass"],
      ["Landing readback", "pass"],
      ["Taxi-in call", "pass"],
      ["Crossing readback", "pass"],
    ]);
  });
});

describe("ATIS", () => {
  it("stays silent when the pilot transmits on 124.55", () => {
    const outcome = respondToCall({
      text: CANONICAL,
      activeMhz: "124.55",
      phase: "at-ramp",
      radioBusy: false,
    });
    expect(outcome.radio).toBeNull();
    expect(outcome.motion).toBe("none");
    expect(outcome.phase).toBe("at-ramp");
    expect(outcome.hud).toMatch(/nobody answered/i);
  });
});
