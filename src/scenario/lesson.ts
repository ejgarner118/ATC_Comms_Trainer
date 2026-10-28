export type LessonGrade = "pass" | "coach" | "miss" | "critical";

export type LessonBeat =
  | "taxi"
  | "hold-short"
  | "ready"
  | "line-up"
  | "takeoff"
  | "inbound"
  | "landing"
  | "taxi-in"
  | "crossing";

export interface LessonMark {
  beat: LessonBeat;
  grade: LessonGrade;
  detail: string;
}

export interface LessonCard {
  marks: LessonMark[];
  criticals: LessonMark[];
}

export interface LessonRow {
  beat: LessonBeat;
  label: string;
  grade: LessonGrade;
  detail: string;
}

const ORDER: LessonBeat[] = [
  "taxi",
  "hold-short",
  "ready",
  "line-up",
  "takeoff",
  "inbound",
  "landing",
  "taxi-in",
  "crossing",
];

const LABELS: Record<LessonBeat, string> = {
  taxi: "Taxi call",
  "hold-short": "Hold-short readback",
  ready: "Ready call",
  "line-up": "Line up and wait",
  takeoff: "Takeoff readback",
  inbound: "Inbound call",
  landing: "Landing readback",
  "taxi-in": "Taxi-in call",
  crossing: "Crossing readback",
};

export function emptyLesson(): LessonCard {
  return { marks: [], criticals: [] };
}

/** A later try replaces the beat. A critical miss stays after a correct readback. */
export function recordMark(card: LessonCard, mark: LessonMark): LessonCard {
  const marks = [...card.marks.filter((item) => item.beat !== mark.beat), mark];
  const criticals =
    mark.grade === "critical"
      ? [...card.criticals.filter((item) => item.beat !== mark.beat), mark]
      : card.criticals;
  return { marks, criticals };
}

export function lessonRows(card: LessonCard): LessonRow[] {
  const rows: LessonRow[] = [];
  for (const beat of ORDER) {
    const latest = card.marks.find((item) => item.beat === beat);
    if (!latest) continue;
    rows.push({ beat, label: LABELS[beat], grade: latest.grade, detail: latest.detail });
    const critical = card.criticals.find((item) => item.beat === beat);
    if (critical && latest.grade !== "critical") {
      rows.push({ beat, label: LABELS[beat], grade: "critical", detail: critical.detail });
    }
  }
  return rows;
}
