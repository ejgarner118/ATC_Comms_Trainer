const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  wun: "1",
  one: "1",
  two: "2",
  tree: "3",
  three: "3",
  four: "4",
  fife: "5",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  niner: "9",
  ninor: "9",
  nine: "9",
  tri: "3",
  won: "1",
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const CALL_SIGN_DIGITS = "3694";

/** Collapse aviation number words and the hearings Web Speech commonly returns. */
export function normalizeTransmission(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const heard = splitGluedCallSign(applyHearings(cleaned));
  const spelled = snapDigitSpellings(heard.split(" "));
  const mapped = spelled.map((token) => DIGIT_WORDS[token] ?? token);
  return snapLexicon(snapCallSignSuffix(joinCallSign(collapseNumbers(mapped)))).join(" ");
}

/** skyhawk3694c is the call sign with the space and the suffix stuck to the digits. */
function splitGluedCallSign(text: string): string {
  return text
    .replace(/\b(skyhawk|cessna)(\d+)([a-z]+)\b/g, "$1 $2 $3")
    .replace(/\b(skyhawk|cessna)(\d+)\b/g, "$1 $2");
}

/** A one-edit suffix after 3694 is Sierra. Anything farther stays put. */
function snapCallSignSuffix(tokens: string[]): string[] {
  const out = [...tokens];
  for (let i = 0; i < out.length - 1; i += 1) {
    if (!/^(skyhawk|cessna)$/.test(out[i]) || out[i + 1] !== CALL_SIGN_DIGITS) continue;
    const suffix = out[i + 2];
    if (!suffix || suffix === "sierra" || suffix === "s" || !/^[a-z]+$/.test(suffix)) continue;
    if (editDistance(suffix, "s") === 1 || editDistance(suffix, "sierra") === 1) out[i + 2] = "sierra";
  }
  return out;
}

const DIGIT_SPELLINGS = ["niner", "ninor", "tree", "tri", "fife", "wun", "won", "nine", "three", "five", "one"];

/** Snap a one-edit miss onto an aviation digit word, never onto a clearance word. */
function snapDigitSpellings(tokens: string[]): string[] {
  return tokens.map((token) => {
    if (token.length < 3 || !/^[a-z]+$/.test(token) || DIGIT_WORDS[token] || LEXICON.includes(token)) return token;
    let match: string | null = null;
    for (const word of DIGIT_SPELLINGS) {
      if (Math.abs(word.length - token.length) > 1) continue;
      if (editDistance(token, word) !== 1) continue;
      if (match) return token;
      match = word;
    }
    return match ?? token;
  });
}

const LEXICON = [
  "salem",
  "ground",
  "tower",
  "skyhawk",
  "cessna",
  "sierra",
  "runway",
  "hold",
  "short",
  "holding",
  "cleared",
  "takeoff",
  "line",
  "wait",
  "north",
  "ramp",
  "information",
  "bravo",
  "taxi",
  "ready",
  "apron",
  "foxtrot",
  "charlie",
  "cross",
  "landing",
  "inbound",
];

/** Snap a one-letter miss onto the only scenario word that close. Digits stay put. */
function snapLexicon(tokens: string[]): string[] {
  return tokens.map((token) => {
    if (token.length < 4 || !/^[a-z]+$/.test(token) || LEXICON.includes(token)) return token;
    let match: string | null = null;
    for (const word of LEXICON) {
      if (Math.abs(word.length - token.length) > 1) continue;
      if (editDistance(token, word) !== 1) continue;
      if (match) return token;
      match = word;
    }
    return match ?? token;
  });
}

function editDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const costs = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let row = 0; row < rows; row += 1) costs[row][0] = row;
  for (let col = 0; col < cols; col += 1) costs[0][col] = col;
  for (let row = 1; row < rows; row += 1) {
    let rowBest = costs[row][0];
    for (let col = 1; col < cols; col += 1) {
      const swap = left[row - 1] === right[col - 1] ? 0 : 1;
      costs[row][col] = Math.min(
        costs[row - 1][col] + 1,
        costs[row][col - 1] + 1,
        costs[row - 1][col - 1] + swap,
      );
      rowBest = Math.min(rowBest, costs[row][col]);
    }
    if (rowBest > 1) return 2;
  }
  return costs[left.length][right.length];
}

function applyHearings(text: string): string {
  return text
    .replaceAll("nine er", "niner")
    .replaceAll("nin er", "niner")
    .replaceAll("hole shot", "hold short")
    .replaceAll("holdshot", "hold short")
    .replaceAll("whole short", "hold short")
    .replaceAll("hold shot", "hold short")
    .replaceAll("holds short", "hold short")
    .replaceAll("sky hawk", "skyhawk")
    .replace(/\b(?:selim|solemn|saleem|solem)\b/g, "salem")
    .replaceAll("take off", "takeoff")
    .replaceAll("lineup and wait", "line up and wait")
    .replaceAll("line up in wait", "line up and wait")
    .replaceAll("line up and weight", "line up and wait")
    .replaceAll("info bravo", "information bravo")
    .replace(/\bwith bravo\b/g, "information bravo");
}

function collapseNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tens = TENS[tokens[i]];
    if (tens !== undefined) {
      const next = tokens[i + 1];
      if (next && /^[0-9]$/.test(next)) {
        out.push(String(tens + Number(next)));
        i += 1;
      } else {
        out.push(String(tens));
      }
      continue;
    }

    if (/^[0-9]$/.test(tokens[i])) {
      let digits = tokens[i];
      while (i + 1 < tokens.length && /^[0-9]$/.test(tokens[i + 1])) {
        i += 1;
        digits += tokens[i];
      }
      out.push(digits);
      continue;
    }

    out.push(tokens[i]);
  }
  return out;
}

const CALL_SIGN_FILLERS = new Set(["or", "er", "uh", "and", "a"]);

/** Join adjacent number groups that are the call sign. Runway 31 stays separate. */
function joinCallSign(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!/^\d+$/.test(tokens[i])) {
      out.push(tokens[i]);
      i += 1;
      continue;
    }
    const precededByType = /^(skyhawk|cessna)$/.test(out[out.length - 1] ?? "");
    const spanned = precededByType ? takeCallSignSpan(tokens, i) : null;
    if (spanned !== null) {
      out.push(CALL_SIGN_DIGITS);
      i = spanned;
      continue;
    }
    let digits = "";
    let consumed = 0;
    for (let j = i; j < tokens.length && /^\d+$/.test(tokens[j]); j += 1) {
      if ((digits + tokens[j]).length > CALL_SIGN_DIGITS.length) break;
      digits += tokens[j];
      consumed += 1;
      if (digits === CALL_SIGN_DIGITS) break;
    }
    if (digits === CALL_SIGN_DIGITS) {
      out.push(CALL_SIGN_DIGITS);
      i += consumed;
    } else {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out;
}

/** Digit groups after the type, with one filler between groups, only when they are 3694. */
function takeCallSignSpan(tokens: string[], start: number): number | null {
  let digits = "";
  let i = start;
  while (i < tokens.length && /^\d+$/.test(tokens[i])) {
    if ((digits + tokens[i]).length > CALL_SIGN_DIGITS.length) return null;
    digits += tokens[i];
    i += 1;
    if (digits === CALL_SIGN_DIGITS) return i;
    if (i + 1 < tokens.length && CALL_SIGN_FILLERS.has(tokens[i]) && /^\d+$/.test(tokens[i + 1])) {
      i += 1;
      continue;
    }
    break;
  }
  return digits === CALL_SIGN_DIGITS ? i : null;
}
