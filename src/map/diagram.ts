import diagramUrl from "../../docs/sources/faa/KSLE-airport-diagram-2610.pdf?url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { drawAircraft, placeOnRoute, type AircraftRoute, type MapPose } from "./schematic";

GlobalWorkerOptions.workerSrc = workerUrl;

let pageImage: HTMLCanvasElement | null = null;
let loading: Promise<void> | null = null;

/** Render the archived FAA airport diagram once. */
export function loadDiagram(): Promise<void> {
  if (pageImage) return Promise.resolve();
  if (!loading) loading = renderPage();
  return loading;
}

async function renderPage(): Promise<void> {
  const pdf = await getDocument({ url: diagramUrl }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const buffer = document.createElement("canvas");
  buffer.width = Math.floor(viewport.width);
  buffer.height = Math.floor(viewport.height);
  await page.render({ canvas: buffer, viewport }).promise;
  pageImage = buffer;
}

type Fr = [number, number];

/**
 * Fractions of the cycle 2610 page, measured on the rendered chart.
 * The GA apron is west of runway 16/34. Charlie crosses the south end of runway 34
 * onto Foxtrot, which holds short of the runway 31 threshold. Departure rolls northwest.
 */
const APRON: Fr = [0.277, 0.606];
const APRON_SOUTH: Fr = [0.277, 0.656];
const CHARLIE: Fr = [0.312, 0.679];
const CROSS_WEST: Fr = [0.357, 0.715];
const CROSS: Fr = [0.394, 0.721];
const CROSS_EAST: Fr = [0.446, 0.718];
const FOXTROT: Fr = [0.541, 0.707];
const HOLD: Fr = [0.628, 0.696];
const LINEUP: Fr = [0.649, 0.662];
const FAR_END: Fr = [0.277, 0.225];
const DEPART: Fr = [0.195, 0.155];
const APPROACH_POINT: Fr = [0.758, 0.782];
const THRESHOLD: Fr = [0.662, 0.679];

function chartRoute(drawnWidth: number, drawnHeight: number): AircraftRoute {
  const at = (point: Fr): [number, number] => [point[0] * drawnWidth, point[1] * drawnHeight];
  return {
    apron: at(APRON),
    apronSouth: at(APRON_SOUTH),
    charlie: at(CHARLIE),
    crossWest: at(CROSS_WEST),
    cross: at(CROSS),
    crossEast: at(CROSS_EAST),
    foxtrot: at(FOXTROT),
    hold: at(HOLD),
    lineup: at(LINEUP),
    farEnd: at(FAR_END),
    depart: at(DEPART),
    approach: at(APPROACH_POINT),
    threshold: at(THRESHOLD),
  };
}

/** Draw the chart, letterboxed, with the cyan airplane on the same leg as the schematic. */
export function paintDiagram(canvas: HTMLCanvasElement, pose: MapPose): void {
  const parent = canvas.parentElement;
  if (!parent || !pageImage) return;
  const width = Math.max(parent.clientWidth, 1);
  const height = Math.max(parent.clientHeight, 1);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0A0C10";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / pageImage.width, height / pageImage.height);
  const drawnWidth = pageImage.width * scale;
  const drawnHeight = pageImage.height * scale;
  const originX = (width - drawnWidth) / 2;
  const originY = (height - drawnHeight) / 2;
  ctx.drawImage(pageImage, originX, originY, drawnWidth, drawnHeight);
  const aircraft = placeOnRoute(chartRoute(drawnWidth, drawnHeight), pose);
  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, drawnWidth, drawnHeight);
  ctx.clip();
  drawAircraft(ctx, [aircraft.at[0] + originX, aircraft.at[1] + originY], aircraft.angle);
  ctx.restore();
}
