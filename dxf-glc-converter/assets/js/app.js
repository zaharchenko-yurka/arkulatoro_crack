import { parseDxf } from "./dxfParser.js";
import { buildContours } from "./contourBuilder.js";
import { renderPreview } from "./svgRenderer.js";
import { buildGlc } from "./glcBuilder.js";

const dxfFile = document.getElementById("dxfFile");
const unitOverride = document.getElementById("unitOverride");
const convertBtn = document.getElementById("convertBtn");
const downloadBtn = document.getElementById("downloadBtn");
const previewSvg = document.getElementById("previewSvg");
const stats = document.getElementById("stats");
const errorPanel = document.getElementById("errorPanel");
const debugLog = document.getElementById("debugLog");

let fileText = "";
let glcContent = "";

function setMessages(errors, warnings) {
  errorPanel.innerHTML = "";
  errors.forEach((msg) => {
    const div = document.createElement("div");
    div.className = "error-item error";
    div.textContent = `Error: ${msg}`;
    errorPanel.appendChild(div);
  });
  warnings.forEach((msg) => {
    const div = document.createElement("div");
    div.className = "error-item warn";
    div.textContent = `Warning: ${msg}`;
    errorPanel.appendChild(div);
  });
}

function formatPerimeter(contours) {
  const perimeter = contours.reduce((sum, c) => sum + c.perimeter, 0);
  return (perimeter / 1000).toFixed(3);
}

function writeDebug(payload) {
  const lines = Object.entries(payload).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  debugLog.textContent = lines.join("\n");
  console.debug("DXF->GLC debug", payload);
}

async function loadFile() {
  const file = dxfFile.files?.[0];
  if (!file) {
    return;
  }
  fileText = await file.text();
  stats.textContent = `Loaded: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  downloadBtn.disabled = true;
}

function convert() {
  if (!fileText) {
    setMessages(["Select a DXF file first."], []);
    return;
  }
  const parsed = parseDxf(fileText, unitOverride.value);
  const contourData = buildContours(parsed.segments, 0.5);
  renderPreview(previewSvg, contourData);

  const errors = [...parsed.errors];
  const warnings = [...parsed.warnings, ...contourData.warnings];
  if (contourData.contours.length === 0) {
    errors.push("No valid closed ceiling contours detected.");
  }

  const contourCount = contourData.contours.length;
  const perimeterM = formatPerimeter(contourData.contours);
  stats.textContent =
    `Total segments parsed: ${parsed.debug.parsedSegments} | ` +
    `Segments skipped: ${parsed.debug.skippedSegments} | ` +
    `Snapped vertices: ${contourData.debug.snappedVertexPairs} | ` +
    `Discarded open groups: ${contourData.debug.discardedOpenGroups} | ` +
    `Final closed contours: ${contourCount} | ` +
    `Total perimeter: ${perimeterM} m`;

  setMessages(errors, warnings);

  writeDebug({
    insunits: parsed.insunits,
    unitScaleToMm: parsed.unitScaleToMm,
    parser: parsed.debug,
    contour: contourData.debug,
    contourCount,
    openChains: contourData.openChains.length,
    warnings
  });

  if (errors.length > 0) {
    glcContent = "";
    downloadBtn.disabled = true;
    return;
  }

  glcContent = buildGlc(contourData.contours);
  downloadBtn.disabled = false;
}

function downloadGlc() {
  if (!glcContent) {
    return;
  }
  const blob = new Blob([glcContent], { type: "text/plain;charset=windows-1251" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "converted.glc";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

dxfFile.addEventListener("change", loadFile);
convertBtn.addEventListener("click", convert);
downloadBtn.addEventListener("click", downloadGlc);
