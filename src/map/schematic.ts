/** Training schematic of KSLE. Not a chart, and not to scale. */
export interface MapPose {
  leg: "parked" | "taxi" | "lineup" | "roll" | "land" | "taxi-in";
  t: number;
}

export const PARKED: MapPose = { leg: "parked", t: 0 };
export const APPROACH: MapPose = { leg: "land", t: 0 };

const WELL = "#0A0C10";
const PAVEMENT = "#1A1F2B";
const TAXI = "#6B5840";
const PHOSPHOR = "#33EE99";
const AMBER = "#FFB020";
const CYAN = "#38BDF8";
const INK = "#E1E7F0";
const MUTED = "#8C9AB0";

export function drawSchematic(canvas: HTMLCanvasElement, pose: MapPose = PARKED): void {
  const parent = canvas.parentElement;
  if (!parent) return;
  const width = Math.max(parent.clientWidth, 320);
  const height = Math.max(parent.clientHeight, 280);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(ctx, width, height, pose);
}

type Pt = [number, number];

interface Field {
  rwy13: Pt;
  rwy31: Pt;
  rwy16: Pt;
  rwy34: Pt;
  apron: Pt;
  apronSouth: Pt;
  charlie: Pt;
  crossWest: Pt;
  cross: Pt;
  crossEast: Pt;
  foxtrot: Pt;
  hold: Pt;
  lineup: Pt;
  farEnd: Pt;
  depart: Pt;
  approach: Pt;
  threshold: Pt;
  wide: number;
  narrow: number;
  taxiWidth: number;
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, pose: MapPose): void {
  const field = layoutField(w, h);
  ctx.fillStyle = WELL;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  drawStrip(ctx, field.rwy16, field.rwy34, field.narrow, "#141820");
  drawCenterline(ctx, field.rwy16, field.rwy34, MUTED);
  drawStrip(ctx, field.rwy13, field.rwy31, field.wide, PAVEMENT);
  drawCenterline(ctx, field.rwy13, field.rwy31, PHOSPHOR);
  drawStrip(ctx, field.apron, field.crossWest, field.taxiWidth, TAXI);
  drawStrip(ctx, field.crossWest, field.crossEast, field.taxiWidth, TAXI);
  drawStrip(ctx, field.crossEast, field.hold, field.taxiWidth, TAXI);
  drawRamp(ctx, field.apron, Math.max(64, w * 0.1));
  drawHoldShort(ctx, field.hold, field.hold[0] - field.foxtrot[0], field.hold[1] - field.foxtrot[1], field.taxiWidth);

  const aircraft = placeAircraft(field, pose);
  drawAircraft(ctx, aircraft.at, aircraft.angle);
  paintRunwayId(ctx, field.rwy31, field.rwy13, "31", 32);
  paintRunwayId(ctx, field.rwy13, field.rwy31, "13");
  paintRunwayId(ctx, field.rwy34, field.rwy16, "34");
  paintRunwayId(ctx, field.rwy16, field.rwy34, "16");

  label(ctx, field.charlie, "C");
  label(ctx, field.foxtrot, "F");
  label(ctx, [field.apron[0], field.apron[1] - Math.max(40, w * 0.05)], "GA APRON");
  label(ctx, [field.hold[0] - 8, field.hold[1] - 18], "HOLD SHORT");
  northArrow(ctx, w);

  ctx.fillStyle = MUTED;
  ctx.font = "12px Segoe UI, Bahnschrift, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Training diagram — not for navigation", 16, h - 16);
}

function layoutField(w: number, h: number): Field {
  const at = (x: number, y: number): Pt => [x * w, y * h];
  const rwy16 = at(0.4, 0.14);
  const rwy34 = at(0.46, 0.86);
  const rwy13 = at(0.16, 0.2);
  const rwy31 = at(0.9, 0.8);
  const cross = mix(rwy16, rwy34, 0.78);
  const dx = rwy34[0] - rwy16[0];
  const dy = rwy34[1] - rwy16[1];
  const len = Math.hypot(dx, dy) || 1;
  let wx = -dy / len;
  let wy = dx / len;
  if (wx > 0) {
    wx = -wx;
    wy = -wy;
  }
  const wide = Math.max(26, w * 0.04);
  const narrow = Math.max(16, wide * 0.67);
  const taxiWidth = Math.max(9, w * 0.013);
  const crossWest = add(cross, wx, wy, narrow / 2 + 8);
  const crossEast = add(cross, -wx, -wy, narrow / 2 + 8);
  const apron = add(cross, wx, wy, narrow / 2 + 120);
  apron[1] -= Math.max(28, h * 0.06);
  const apronSouth = mix(apron, crossWest, 0.62);
  const charlie = mix(apronSouth, crossWest, 0.5);
  const span = Math.hypot(rwy31[0] - crossEast[0], rwy31[1] - crossEast[1]) || 1;
  const ux = (rwy31[0] - crossEast[0]) / span;
  const uy = (rwy31[1] - crossEast[1]) / span;
  const hold: Pt = [rwy31[0] - ux * (wide / 2 + 72), rwy31[1] - uy * (wide / 2 + 72)];
  const foxtrot = mix(crossEast, hold, 0.48);
  return {
    rwy13,
    rwy31,
    rwy16,
    rwy34,
    apron,
    apronSouth,
    charlie,
    crossWest,
    cross,
    crossEast,
    foxtrot,
    hold,
    lineup: insetFrom(rwy31, rwy13, 90),
    farEnd: rwy13,
    depart: insetFrom(rwy13, rwy31, -70),
    approach: insetFrom(rwy31, rwy13, -72),
    threshold: insetFrom(rwy31, rwy13, 36),
    wide,
    narrow,
    taxiWidth,
  };
}

export interface AircraftRoute {
  apron: Pt;
  apronSouth: Pt;
  charlie: Pt;
  crossWest: Pt;
  cross: Pt;
  crossEast: Pt;
  foxtrot: Pt;
  hold: Pt;
  lineup: Pt;
  farEnd: Pt;
  depart: Pt;
  approach: Pt;
  threshold: Pt;
}

/** Apron, Charlie, the runway 34 crossing, Foxtrot, then the runway. Shared by both maps. */
export function placeOnRoute(route: AircraftRoute, pose: MapPose): { at: Pt; angle: number } {
  const stop = before(route.foxtrot, route.hold, 26);
  const outbound = [route.apron, route.apronSouth, route.charlie, route.crossWest, route.cross, route.crossEast, route.foxtrot, stop];
  if (pose.leg === "parked") return walk([route.apron, route.apronSouth], 0);
  if (pose.leg === "taxi") return walk(outbound, pose.t);
  if (pose.leg === "lineup") return walk([stop, route.lineup], pose.t);
  if (pose.leg === "land") return walk([route.approach, route.threshold, route.hold, route.foxtrot], pose.t);
  if (pose.leg === "taxi-in") {
    return walk([route.foxtrot, route.crossEast, route.cross, route.crossWest, route.charlie, route.apronSouth, route.apron], pose.t);
  }
  return walk([route.lineup, route.farEnd, route.depart], pose.t);
}

function placeAircraft(field: Field, pose: MapPose): { at: Pt; angle: number } {
  return placeOnRoute(field, pose);
}

function mix(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function add(point: Pt, x: number, y: number, distance: number): Pt {
  return [point[0] + x * distance, point[1] + y * distance];
}

function walk(points: Pt[], t: number): { at: Pt; angle: number } {
  const clamped = Math.min(1, Math.max(0, t));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const span = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(span);
    total += span;
  }
  let remain = clamped * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remain <= lengths[i] || i === lengths.length - 1) {
      const span = lengths[i] || 1;
      const u = Math.min(1, remain / span);
      const a = points[i];
      const b = points[i + 1];
      return {
        at: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u],
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    }
    remain -= lengths[i];
  }
  return { at: points[0], angle: 0 };
}

function insetFrom(end: Pt, other: Pt, distance: number): Pt {
  const dx = other[0] - end[0];
  const dy = other[1] - end[1];
  const len = Math.hypot(dx, dy) || 1;
  return [end[0] + (dx / len) * distance, end[1] + (dy / len) * distance];
}

function before(from: Pt, to: Pt, distance: number): Pt {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  return [to[0] - (dx / len) * distance, to[1] - (dy / len) * distance];
}

function drawStrip(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, fill: string): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a[0] + nx, a[1] + ny);
  ctx.lineTo(b[0] + nx, b[1] + ny);
  ctx.lineTo(b[0] - nx, b[1] - ny);
  ctx.lineTo(a[0] - nx, a[1] - ny);
  ctx.closePath();
  ctx.fill();
}

function drawCenterline(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

function paintRunwayId(ctx: CanvasRenderingContext2D, end: Pt, other: Pt, text: string, inset = 56): void {
  const angle = Math.atan2(other[1] - end[1], other[0] - end[0]);
  const x = end[0] + Math.cos(angle) * inset;
  const y = end[1] + Math.sin(angle) * inset;
  ctx.save();
  ctx.font = "700 20px Segoe UI, Bahnschrift, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(10, 12, 16, 0.9)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = INK;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawRamp(ctx: CanvasRenderingContext2D, center: Pt, size: number): void {
  ctx.fillStyle = TAXI;
  ctx.fillRect(center[0] - size / 2, center[1] - size * 0.35, size, size * 0.7);
  ctx.strokeStyle = "#8A7355";
  ctx.strokeRect(center[0] - size / 2, center[1] - size * 0.35, size, size * 0.7);
}

function drawHoldShort(ctx: CanvasRenderingContext2D, at: Pt, dx: number, dy: number, width: number): void {
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width * 0.75);
  const ny = (dx / len) * (width * 0.75);
  const tx = (dx / len) * 5;
  const ty = (dy / len) * 5;
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  for (const step of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(at[0] + nx + tx * step, at[1] + ny + ty * step);
    ctx.lineTo(at[0] - nx + tx * step, at[1] - ny + ty * step);
    ctx.stroke();
  }
}

export function drawAircraft(ctx: CanvasRenderingContext2D, at: Pt, angle: number): void {
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(angle);
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-12, 9);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-12, -9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, at: Pt, text: string): void {
  ctx.font = "600 13px Segoe UI, Bahnschrift, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(10, 12, 16, 0.9)";
  ctx.strokeText(text, at[0], at[1]);
  ctx.fillStyle = INK;
  ctx.fillText(text, at[0], at[1]);
}

function northArrow(ctx: CanvasRenderingContext2D, w: number): void {
  const x = w - 36;
  const y = 36;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = MUTED;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(7, 12);
  ctx.lineTo(0, 6);
  ctx.lineTo(-7, 12);
  ctx.closePath();
  ctx.fill();
  ctx.font = "600 12px Segoe UI, Bahnschrift, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, 28);
  ctx.restore();
}
