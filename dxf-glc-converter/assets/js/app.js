import { parseDxf } from "./dxfParser.js";
import { buildContours } from "./contourBuilder.js";
import { renderRawEntities } from "./svgRenderer.js";
import { buildGlc } from "./glcBuilder.js";

const dxfFile = document.getElementById("dxfFile");
const dropZone = document.getElementById("dxfDropZone");
const unitOverride = document.getElementById("unitOverride");
const convertBtn = document.getElementById("convertBtn");
const downloadBtn = document.getElementById("downloadBtn");
const previewSvg = document.getElementById("previewSvg");
const stats = document.getElementById("stats");
const statusText = document.getElementById("statusText");
const errorPanel = document.getElementById("errorPanel");
const debugLog = document.getElementById("debugLog");
const config = window.dxfGlcConfig || {};
const maxUploadSize = Number(config.maxUploadSize || 0);

let fileText = "";
let glcContent = "";
let selectedFileName = "";
let downloadBaseName = "";
let isProcessing = false;
const state = {
  rawEntities: [],
  cleanedContours: []
};

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
  if (debugLog) {
    const lines = Object.entries(payload).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    debugLog.textContent = lines.join("\n");
  }
}

function setStatus(message, type = "info") {
  if (!statusText) {
    return;
  }
  statusText.textContent = message;
  statusText.className = `status ${type}`;
}

function setProcessingState(nextState) {
  isProcessing = nextState;
  if (dxfFile) {
    dxfFile.disabled = nextState;
  }
  if (unitOverride) {
    unitOverride.disabled = nextState;
  }
  if (convertBtn) {
    convertBtn.disabled = nextState || !fileText;
  }
  if (downloadBtn) {
    downloadBtn.disabled = nextState || !glcContent;
  }
}

function getFileBaseName(fileName) {
  if (!fileName) {
    return "converted";
  }
  return fileName.replace(/\.[^.]+$/, "");
}

function formatBytes(size) {
  if (!size || size <= 0) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function resetLoadedData() {
  fileText = "";
  glcContent = "";
  selectedFileName = "";
  downloadBaseName = "";
  state.rawEntities = [];
  state.cleanedContours = [];
  if (previewSvg) {
    previewSvg.innerHTML = "";
  }
  if (downloadBtn) {
    downloadBtn.disabled = true;
  }
  if (convertBtn) {
    convertBtn.disabled = true;
  }
}

function validateDxfOnFrontend(file) {
  if (!file) {
    return "Select a DXF file first.";
  }

  if (!/\.dxf$/i.test(file.name)) {
    return "Only .dxf files are allowed.";
  }

  if (maxUploadSize > 0 && file.size > maxUploadSize) {
    return `File is too large. Max size: ${formatBytes(maxUploadSize)}.`;
  }

  return "";
}

async function validateFileOnServer(file) {
  if (!config.ajaxUrl || !config.nonce) {
    return {
      baseName: getFileBaseName(file.name)
    };
  }

  const formData = new FormData();
  formData.append("action", "dxf_glc_validate_file_upload");
  formData.append("_ajax_nonce", config.nonce);
  formData.append("dxf_file", file, file.name);

  const response = await fetch(config.ajaxUrl, {
    method: "POST",
    credentials: "same-origin",
    body: formData
  });

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload?.data?.message || "Server validation failed.");
  }

  return {
    baseName: payload?.data?.base_name || getFileBaseName(file.name)
  };
}

async function processSelectedFile(file) {
  const validationError = validateDxfOnFrontend(file);
  if (validationError) {
    resetLoadedData();
    setMessages([validationError], []);
    setStatus("Помилка", "error");
    stats.textContent = "No file loaded.";
    return;
  }

  setProcessingState(true);
  setMessages([], []);

  try {
    const serverMeta = await validateFileOnServer(file);
    fileText = await file.text();
    selectedFileName = file.name;
    downloadBaseName = serverMeta.baseName || getFileBaseName(file.name);
    glcContent = "";

    stats.textContent = `Loaded: ${file.name} (${formatBytes(file.size)})`;
    setStatus("Файл завантажено", "success");
  } catch (error) {
    resetLoadedData();
    setMessages([error.message || "Unable to load DXF file."], []);
    setStatus("Помилка", "error");
    stats.textContent = "No file loaded.";
  } finally {
    setProcessingState(false);
  }
}

async function loadFileFromInput() {
  const file = dxfFile?.files?.[0];
  if (!file) {
    return;
  }
  await processSelectedFile(file);
}

function convert() {
  if (isProcessing) {
    return;
  }

  if (!fileText) {
    setMessages(["Select a DXF file first."], []);
    setStatus("Помилка", "error");
    return;
  }

  setProcessingState(true);
  setStatus("Йде конвертація", "info");

  try {
    const parsed = parseDxf(fileText, unitOverride.value);
    state.rawEntities = parsed.rawEntities;
    renderRawEntities(previewSvg, state.rawEntities);

    const contourData = buildContours(parsed.segments, 0.5);
    state.cleanedContours = contourData.contours;

    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings, ...contourData.warnings];
    if (contourData.contours.length === 0) {
      errors.push("No valid closed ceiling contours detected.");
    }

    const contourCount = contourData.contours.length;
    const perimeterM = formatPerimeter(contourData.contours);
    stats.textContent = `Final closed contours: ${contourCount} | Total perimeter: ${perimeterM} m`;

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
      setStatus("Помилка", "error");
      return;
    }

    glcContent = buildGlc(state.cleanedContours);
    setStatus("Файл готовий", "success");
  } catch (error) {
    glcContent = "";
    state.cleanedContours = [];
    setMessages([error.message || "Conversion failed."], []);
    setStatus("Помилка", "error");
  } finally {
    setProcessingState(false);
  }
}

function downloadGlc() {
  if (!glcContent) {
    return;
  }

  const blob = new Blob([glcContent], { type: "text/plain;charset=windows-1251" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = downloadBaseName || getFileBaseName(selectedFileName);
  a.download = `${base}.glc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setupDropZone() {
  if (!dropZone || !dxfFile) {
    return;
  }

  const stopDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      stopDefaults(event);
      dropZone.classList.add("is-hover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      stopDefaults(event);
      dropZone.classList.remove("is-hover");
    });
  });

  dropZone.addEventListener("drop", async (event) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }
    await processSelectedFile(files[0]);
  });

  dropZone.addEventListener("click", () => {
    if (!isProcessing) {
      dxfFile.click();
    }
  });

  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isProcessing) {
        dxfFile.click();
      }
    }
  });
}

if (dxfFile && convertBtn && downloadBtn) {
  setStatus("No file selected.", "info");
  setupDropZone();
  dxfFile.addEventListener("change", loadFileFromInput);
  convertBtn.addEventListener("click", convert);
  downloadBtn.addEventListener("click", downloadGlc);
}
