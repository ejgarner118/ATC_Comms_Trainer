import type { SlotChip } from "../phraseology/taxi-call";
import type { LessonRow } from "../scenario/lesson";

export function renderChips(list: HTMLElement, chips: SlotChip[]): void {
  list.replaceChildren();
  for (const chip of chips) {
    const item = document.createElement("li");
    item.className = `chip chip-${chip.status}`;
    item.dataset.slot = chip.id;

    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = chip.label;

    const state = document.createElement("span");
    state.className = "chip-state";
    state.textContent = chip.status === "pass" ? "Pass" : chip.status === "coach" ? "Check" : "Miss";

    const detail = document.createElement("p");
    detail.textContent = chip.detail;

    item.append(label, state, detail);
    list.append(item);
  }
}

const GRADE_LABEL = { pass: "Pass", coach: "Check", miss: "Miss", critical: "Critical" };

export function renderLesson(list: HTMLElement, rows: LessonRow[]): void {
  list.replaceChildren();
  list.hidden = rows.length === 0;
  for (const row of rows) {
    const item = document.createElement("li");
    const tone = row.grade === "critical" || row.grade === "miss" ? "fail" : row.grade;
    item.className = `chip chip-${tone}`;

    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = row.label;

    const state = document.createElement("span");
    state.className = "chip-state";
    state.textContent = GRADE_LABEL[row.grade];

    const detail = document.createElement("p");
    detail.textContent = row.detail;

    item.append(label, state, detail);
    list.append(item);
  }
}

export function appendTranscript(list: HTMLOListElement, speaker: string, text: string, kind: "pilot" | "atc"): void {
  const item = document.createElement("li");
  item.className = kind;
  const who = document.createElement("span");
  who.textContent = speaker;
  const line = document.createElement("p");
  line.textContent = text;
  item.append(who, line);
  list.append(item);
  list.scrollTop = list.scrollHeight;
}
