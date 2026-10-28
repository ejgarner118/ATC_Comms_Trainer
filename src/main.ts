import { bindPtt } from "./audio/ptt";
import { armRadio, playRadio, playSquelch, stopRadio } from "./audio/radio";
import {
  armMicrophone,
  beginClip,
  endClip,
  MicrophoneBlocked,
  lastClipHadSamples,
  microphoneReady,
  preloadRecognizer,
  transcribeHeard,
  type RecognizerStatus,
} from "./audio/stt";
import { loadDiagram, paintDiagram } from "./map/diagram";
import { APPROACH, drawSchematic, PARKED, type MapPose } from "./map/schematic";
import { emptyLesson, lessonRows, recordMark, type LessonCard } from "./scenario/lesson";
import {
  clearanceAfterLineup,
  clearOfRunway,
  phaseLabel,
  radioLine,
  respondToCall,
  scenario,
  type LessonMode,
  type Phase,
} from "./scenario/ksle";
import { appendTranscript, renderChips, renderLesson } from "./ui/hud";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Trainer markup is missing ${selector}.`);
  return element;
}

const activeFreq = required<HTMLElement>("#active-freq");
const activeName = required<HTMLElement>("#active-name");
const standbyFreq = required<HTMLElement>("#standby-freq");
const standbyName = required<HTMLElement>("#standby-name");
const swapButton = required<HTMLButtonElement>("#swap");
const stepButton = required<HTMLButtonElement>("#step");
const luawBox = required<HTMLInputElement>("#luaw");
const txLight = required<HTMLElement>("#tx-light");
const rxLight = required<HTMLElement>("#rx-light");
const stbyLight = required<HTMLElement>("#stby-light");
const pttButton = required<HTMLButtonElement>("#ptt");
const form = required<HTMLFormElement>("#composer");
const transmission = required<HTMLTextAreaElement>("#transmission");
const sendButton = required<HTMLButtonElement>("#send");
const chips = required<HTMLElement>("#chips");
const lessonList = required<HTMLOListElement>("#lesson");
const hud = required<HTMLElement>("#hud");
const transcript = required<HTMLOListElement>("#transcript");
const phase = required<HTMLElement>("#phase-label");
const canvas = required<HTMLCanvasElement>("#airport");
const diagramCanvas = required<HTMLCanvasElement>("#faa-diagram");
const schematicButton = required<HTMLButtonElement>("#show-schematic");
const diagramButton = required<HTMLButtonElement>("#show-diagram");
const disclaimer = required<HTMLElement>("#disclaimer");
const resetButton = required<HTMLButtonElement>("#reset");
const departButton = required<HTMLButtonElement>("#show-depart");
const arriveButton = required<HTMLButtonElement>("#show-arrive");
const luawFlag = required<HTMLElement>("#luaw-flag");
const micNote = required<HTMLElement>("#mic-note");
const briefing = required<HTMLElement>("#briefing");

const atis = scenario.frequencies.find((item) => item.service === "ATIS");
const ground = scenario.frequencies.find((item) => item.service === "Ground");
const tower = scenario.frequencies.find((item) => item.service === "Tower");
if (!atis || !ground || !tower) throw new Error("KSLE ATIS, Ground, and Tower frequencies are required.");
const knob = [atis, ground, tower];

let active = ground;
let standby = tower;
let lessonMode: LessonMode = "depart";
let currentPhase: Phase = "at-ramp";
let radioBusy = false;
let stuckTimer = 0;
let motionToken = 0;
let speakToken = 0;
let pose: MapPose = PARKED;
let lesson: LessonCard = emptyLesson();
let recognizerStatus: RecognizerStatus = "loading";
let capturing = false;
let diagramOn = false;
const SCHEMATIC_NOTE = "Training aid based on a simplified Salem diagram. Not for navigation.";
const DIAGRAM_NOTE = "FAA airport diagram, cycle 2610. Not for navigation.";

micNote.textContent = "Loading the recognizer…";
preloadRecognizer((next) => {
  recognizerStatus = next;
  if (micNote.textContent === "Loading the recognizer…" || micNote.textContent === "Hearing the call…") {
    micNote.textContent = micPrompt();
  }
});

const ptt = bindPtt(
  pttButton,
  () => {
    if (radioBusy) {
      hud.textContent = "The frequency is busy. Wait until it is quiet.";
      return;
    }
    armRadio();
    armMicrophone();
    beginClip();
    playSquelch();
    setTx(true);
    capturing = true;
    micNote.textContent = "Transmitting.";
    void microphoneReady().catch(() => {
      setTx(false);
      micNote.textContent = "Microphone permission was blocked. Type the call instead.";
    });
    window.clearTimeout(stuckTimer);
    stuckTimer = window.setTimeout(() => {
      hud.textContent = "Stuck mike. Release the push-to-talk.";
    }, 12000);
  },
  () => {
    window.clearTimeout(stuckTimer);
    const heard = capturing ? endClip() : null;
    playSquelch();
    setTx(false);
    if (!heard) return;
    capturing = false;
    micNote.textContent = "Hearing the call…";
    void hearClip(heard);
  },
);

swapButton.addEventListener("click", () => {
  armRadio();
  const previous = active;
  active = standby;
  standby = previous;
  renderRadio();
  if (previous.service === "ATIS" || active.service === "ATIS") silenceRadio();
  if (active.service === "ATIS") void playAtis();
});

stepButton.addEventListener("click", () => {
  const index = knob.findIndex((item) => item.mhz === standby.mhz);
  for (let offset = 1; offset <= knob.length; offset += 1) {
    const next = knob[(index + offset) % knob.length];
    if (next.mhz !== active.mhz) {
      standby = next;
      break;
    }
  }
  renderRadio();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = transmission.value.trim();
  if (!text) return;
  submit(text);
  transmission.value = "";
});

resetButton.addEventListener("click", () => beginLesson(lessonMode));
departButton.addEventListener("click", () => beginLesson("depart"));
arriveButton.addEventListener("click", () => beginLesson("arrive"));

schematicButton.addEventListener("click", () => {
  diagramOn = false;
  schematicButton.setAttribute("aria-pressed", "true");
  diagramButton.setAttribute("aria-pressed", "false");
  disclaimer.textContent = SCHEMATIC_NOTE;
  paintMap();
});

diagramButton.addEventListener("click", () => {
  diagramOn = true;
  schematicButton.setAttribute("aria-pressed", "false");
  diagramButton.setAttribute("aria-pressed", "true");
  disclaimer.textContent = "Loading the FAA airport diagram…";
  void loadDiagram()
    .then(() => {
      if (!diagramOn) return;
      disclaimer.textContent = DIAGRAM_NOTE;
      paintMap();
    })
    .catch(() => {
      diagramOn = false;
      schematicButton.setAttribute("aria-pressed", "true");
      diagramButton.setAttribute("aria-pressed", "false");
      disclaimer.textContent = SCHEMATIC_NOTE;
      paintMap();
    });
});

window.addEventListener("resize", () => paintMap());
beginLesson("depart");

function submit(text: string): void {
  armRadio();
  const outcome = respondToCall({
    text,
    activeMhz: active.mhz,
    phase: currentPhase,
    radioBusy,
    lineUpAndWait: luawBox.checked,
    lesson: lessonMode,
  });
  appendTranscript(transcript, "You", text, "pilot");
  renderChips(chips, outcome.chips);
  const notes = [outcome.hud, ...outcome.coaching].filter(Boolean);
  hud.textContent = notes.join(" ");
  if (outcome.beat && outcome.grade) {
    lesson = recordMark(lesson, {
      beat: outcome.beat,
      grade: outcome.grade,
      detail: [outcome.hud, ...outcome.coaching, ...outcome.chips.filter((chip) => chip.status === "coach").map((chip) => chip.detail)]
        .filter(Boolean)
        .join(" "),
    });
  }
  currentPhase = outcome.phase;
  renderPhase();
  paintLesson();
  if (outcome.motion === "taxi") startMotion("taxi");
  if (outcome.motion === "lineup") startMotion("lineup");
  if (outcome.motion === "depart") startMotion("depart");
  if (outcome.motion === "land") startMotion("land");
  if (outcome.motion === "taxi-in") startMotion("taxi-in");
  if (outcome.radio) {
    void speak(outcome.radio.speaker, outcome.radio.display, outcome.radio.id);
  }
}

function startMotion(kind: "taxi" | "lineup" | "depart" | "land" | "taxi-in"): void {
  const fromHold = kind === "depart" && pose.leg !== "lineup";
  const token = ++motionToken;
  const started = performance.now();
  const duration =
    kind === "taxi" || kind === "taxi-in" ? 8000 : kind === "land" ? 7000 : kind === "lineup" ? 1800 : fromHold ? 5600 : 3800;
  const tick = (now: number) => {
    if (token !== motionToken) return;
    const u = Math.min(1, (now - started) / duration);
    if (kind === "taxi") pose = { leg: "taxi", t: u };
    else if (kind === "taxi-in") pose = { leg: "taxi-in", t: u };
    else if (kind === "land") pose = { leg: "land", t: u };
    else if (kind === "lineup") pose = { leg: "lineup", t: u };
    else if (fromHold && u < 0.32) pose = { leg: "lineup", t: u / 0.32 };
    else if (fromHold) pose = { leg: "roll", t: (u - 0.32) / 0.68 };
    else pose = { leg: "roll", t: u };
    paintMap();
    if (u < 1) {
      requestAnimationFrame(tick);
      return;
    }
    if (kind === "taxi") {
      currentPhase = "holding-short";
      renderPhase();
      hud.textContent = "Holding short of Runway 31. Swap to Salem Tower, 119.1, and call ready for departure.";
      return;
    }
    if (kind === "taxi-in") {
      pose = { leg: "taxi-in", t: 1 };
      currentPhase = "parked";
      renderPhase();
      hud.textContent = "Parked on the GA apron. The hop is done. Reset to fly it again.";
      paintLesson();
      return;
    }
    if (kind === "land") {
      pose = { leg: "land", t: 1 };
      const cleared = clearOfRunway();
      currentPhase = cleared.phase;
      renderPhase();
      hud.textContent = cleared.hud;
      if (cleared.radio) void speak(cleared.radio.speaker, cleared.radio.display, cleared.radio.id);
      return;
    }
    if (kind === "lineup") {
      pose = { leg: "lineup", t: 1 };
      currentPhase = "lined-up";
      renderPhase();
      hud.textContent = "Holding on Runway 31. Wait for the takeoff clearance.";
      window.setTimeout(() => issueTakeoffWhenQuiet(token), 1000);
      return;
    }
    currentPhase = "complete";
    renderPhase();
    hud.textContent = "Frequency change approved. The hop is done. Reset to fly it again.";
    paintLesson();
    const line = radioLine("frequency-change");
    void speak(line.speaker, line.display, line.id);
  };
  requestAnimationFrame(tick);
}

function beginLesson(mode: LessonMode): void {
  lessonMode = mode;
  const arriving = mode === "arrive";
  currentPhase = arriving ? "inbound" : "at-ramp";
  if (!atis || !ground || !tower) return;
  if (arriving) {
    active = tower;
    standby = atis;
  } else {
    active = ground;
    standby = tower;
  }
  pose = arriving ? APPROACH : PARKED;
  luawBox.checked = false;
  luawFlag.hidden = arriving;
  departButton.setAttribute("aria-pressed", arriving ? "false" : "true");
  arriveButton.setAttribute("aria-pressed", arriving ? "true" : "false");
  briefing.textContent = arriving
    ? `${scenario.aircraft.type}, call sign ${scenario.aircraft.callSign}. You are straight in for Runway ${scenario.atis.runwayInUse}, southeast of the field. ATIS Information ${scenario.atis.code}, wind ${scenario.atis.wind}, altimeter ${scenario.atis.altimeter}. Listen to ATIS on 124.55, then call Salem Tower to land.`
    : `${scenario.aircraft.type}, call sign ${scenario.aircraft.callSign}. You are on the GA apron. ATIS Information ${scenario.atis.code}, wind ${scenario.atis.wind}, altimeter ${scenario.atis.altimeter}, runway ${scenario.atis.runwayInUse}. You want to taxi VFR to the northwest. Listen to ATIS on 124.55 before you call. Step moves the standby frequency. Swap tunes it.`;
  radioBusy = false;
  motionToken += 1;
  speakToken += 1;
  stopRadio();
  setTx(false);
  setRx(false);
  chips.replaceChildren();
  lesson = emptyLesson();
  renderLesson(lessonList, []);
  transcript.replaceChildren();
  hud.textContent = arriving
    ? "Call Salem Tower on 119.1. Say who you are calling, who you are, where you are, and that you are landing."
    : "Call Salem Ground on 121.9. Say who you are calling, who you are, where you are, and what you want.";
  micNote.textContent = micPrompt();
  renderRadio();
  renderPhase();
  paintMap();
  ptt.setEnabled(true);
  sendButton.disabled = false;
}

async function playAtis(): Promise<void> {
  const token = ++speakToken;
  radioBusy = true;
  ptt.setEnabled(false);
  sendButton.disabled = true;
  setRx(true);
  const line = radioLine("atis");
  appendTranscript(transcript, line.speaker, line.display, "atc");
  let failed = false;
  try {
    playSquelch();
    while (token === speakToken && active.service === "ATIS") {
      await playRadio("atis");
    }
  } catch {
    failed = true;
    if (token === speakToken) {
      hud.textContent = "The speech server is not running. Start it with npm run speak, then transmit again.";
    }
  } finally {
    if (token !== speakToken) return;
    radioBusy = false;
    setRx(false);
    ptt.setEnabled(true);
    sendButton.disabled = false;
    if (!failed) playSquelch();
  }
}

function issueTakeoffWhenQuiet(token: number): void {
  if (token !== motionToken || currentPhase !== "lined-up") return;
  if (radioBusy) {
    window.setTimeout(() => issueTakeoffWhenQuiet(token), 300);
    return;
  }
  const issued = clearanceAfterLineup();
  currentPhase = issued.phase;
  renderPhase();
  hud.textContent = issued.hud;
  if (issued.radio) void speak(issued.radio.speaker, issued.radio.display, issued.radio.id);
}

async function speak(speaker: string, display: string, id: string): Promise<void> {
  const token = ++speakToken;
  radioBusy = true;
  ptt.setEnabled(false);
  sendButton.disabled = true;
  setRx(true);
  appendTranscript(transcript, speaker, display, "atc");
  try {
    playSquelch();
    await playRadio(id);
    if (token === speakToken) playSquelch();
  } catch {
    if (token === speakToken) {
      hud.textContent = "The speech server is not running. Start it with npm run speak, then transmit again.";
    }
  } finally {
    if (token !== speakToken) return;
    radioBusy = false;
    setRx(false);
    ptt.setEnabled(true);
    sendButton.disabled = false;
  }
}

function silenceRadio(): void {
  speakToken += 1;
  stopRadio();
  radioBusy = false;
  setRx(false);
  ptt.setEnabled(true);
  sendButton.disabled = false;
}

function micPrompt(): string {
  if (recognizerStatus === "failed") return "The recognizer did not load. Type the call and transmit.";
  if (recognizerStatus === "loading") return "Loading the recognizer…";
  return "Hold Spacebar or the button to talk.";
}

async function hearClip(heard: Promise<Float32Array>): Promise<void> {
  try {
    const audio = await heard;
    if (audio.length === 0) {
      micNote.textContent = lastClipHadSamples()
        ? "The microphone did not catch that. Type the call instead."
        : "Press and hold again. The microphone is ready now.";
      return;
    }
    const text = (await transcribeHeard(audio)).trim();
    if (!text) {
      micNote.textContent = "The microphone did not catch that. Type the call instead.";
      return;
    }
    submit(text);
    if (!radioBusy) micNote.textContent = micPrompt();
  } catch (error) {
    if (error instanceof MicrophoneBlocked) {
      micNote.textContent = "Microphone permission was blocked. Type the call instead.";
      return;
    }
    recognizerStatus = "failed";
    micNote.textContent = "The recognizer did not load. Type the call and transmit.";
  }
}

function paintMap(): void {
  canvas.hidden = diagramOn;
  diagramCanvas.hidden = !diagramOn;
  drawSchematic(canvas, pose);
  paintDiagram(diagramCanvas, pose);
}

function renderRadio(): void {
  activeFreq.textContent = active.mhz;
  activeName.textContent = active.callSign;
  standbyFreq.textContent = standby.mhz;
  standbyName.textContent = standby.callSign;
}

function renderPhase(): void {
  phase.textContent = phaseLabel(currentPhase);
}

function paintLesson(): void {
  const done = currentPhase === "complete" || currentPhase === "parked";
  renderLesson(lessonList, done ? lessonRows(lesson) : []);
}

function setTx(on: boolean): void {
  txLight.classList.toggle("is-on", on);
  paintStandby();
}

function setRx(on: boolean): void {
  rxLight.classList.toggle("is-on", on);
  paintStandby();
}

function paintStandby(): void {
  const hot = txLight.classList.contains("is-on") || rxLight.classList.contains("is-on");
  stbyLight.classList.toggle("is-on", !hot);
}
