import { resolveUnitScale, scalePoint } from "./unitConverter.js";

function splitPairs(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) {
      continue;
    }
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }
  return pairs;
}

function parseInsUnits(pairs) {
  let inHeader = false;
  for (let i = 0; i < pairs.length; i += 1) {
    const p = pairs[i];
    if (p.code === 0 && p.value.trim() === "SECTION") {
      const p2 = pairs[i + 1];
      if (p2 && p2.code === 2 && p2.value.trim() === "HEADER") {
        inHeader = true;
      }
      continue;
    }
    if (inHeader && p.code === 0 && p.value.trim() === "ENDSEC") {
      break;
    }
    if (!inHeader) {
      continue;
    }
    if (p.code === 9 && p.value.trim() === "$INSUNITS") {
      const p2 = pairs[i + 1];
      if (p2 && p2.code === 70) {
        return Number.parseInt(p2.value.trim(), 10);
      }
    }
  }
  return 0;
}

function parseLineEntity(entity) {
  const data = {};
  for (const row of entity) {
    data[row.code] = row.value.trim();
  }
  const start = {
    x: Number.parseFloat(data[10]),
    y: Number.parseFloat(data[20])
  };
  const end = {
    x: Number.parseFloat(data[11]),
    y: Number.parseFloat(data[21])
  };
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
    return null;
  }
  return { type: "line", start, end };
}

function normalizeAngleDeg(angle) {
  let a = angle % 360;
  if (a < 0) {
    a += 360;
  }
  return a;
}

function parseArcEntity(entity) {
  const data = {};
  for (const row of entity) {
    data[row.code] = row.value.trim();
  }
  const center = {
    x: Number.parseFloat(data[10]),
    y: Number.parseFloat(data[20])
  };
  const radius = Number.parseFloat(data[40]);
  const startDeg = normalizeAngleDeg(Number.parseFloat(data[50]));
  const endDeg = normalizeAngleDeg(Number.parseFloat(data[51]));
  if (![center.x, center.y, radius, startDeg, endDeg].every(Number.isFinite) || radius <= 0) {
    return null;
  }

  let sweepDeg = endDeg - startDeg;
  if (sweepDeg <= 0) {
    sweepDeg += 360;
  }
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const start = {
    x: center.x + radius * Math.cos(startRad),
    y: center.y + radius * Math.sin(startRad)
  };
  const end = {
    x: center.x + radius * Math.cos(endRad),
    y: center.y + radius * Math.sin(endRad)
  };

  return {
    type: "arc",
    center,
    radius,
    start,
    end,
    startAngleDeg: startDeg,
    endAngleDeg: endDeg,
    sweepDeg,
    clockwise: false
  };
}

function parseEntities(pairs) {
  const entities = [];
  let inEntities = false;
  let current = null;
  for (const p of pairs) {
    const value = p.value.trim();
    if (p.code === 0 && value === "SECTION") {
      current = null;
      continue;
    }
    if (p.code === 2 && value === "ENTITIES") {
      inEntities = true;
      continue;
    }
    if (inEntities && p.code === 0 && value === "ENDSEC") {
      break;
    }
    if (!inEntities) {
      continue;
    }
    if (p.code === 0) {
      if (current) {
        entities.push(current);
      }
      current = { type: value, rows: [] };
    } else if (current) {
      current.rows.push(p);
    }
  }
  if (current) {
    entities.push(current);
  }
  return entities;
}

export function parseDxf(text, unitOverride = "auto") {
  const warnings = [];
  const errors = [];
  const isAscii = !/[^\x00-\x7F\r\n\t]/.test(text);
  if (!isAscii) {
    warnings.push("DXF is not pure ASCII; parser continues with plain text mode.");
  }
  const pairs = splitPairs(text);
  const insunits = parseInsUnits(pairs);
  const scale = resolveUnitScale(unitOverride, insunits);
  const entities = parseEntities(pairs);
  const segments = [];

  for (const e of entities) {
    if (e.type === "LINE") {
      const line = parseLineEntity(e.rows);
      if (!line) {
        warnings.push("Skipped malformed LINE entity.");
        continue;
      }
      segments.push({
        ...line,
        start: scalePoint(line.start, scale),
        end: scalePoint(line.end, scale)
      });
    } else if (e.type === "ARC") {
      const arc = parseArcEntity(e.rows);
      if (!arc) {
        warnings.push("Skipped malformed ARC entity.");
        continue;
      }
      segments.push({
        ...arc,
        center: scalePoint(arc.center, scale),
        radius: arc.radius * scale,
        start: scalePoint(arc.start, scale),
        end: scalePoint(arc.end, scale)
      });
    }
  }

  if (segments.length === 0) {
    errors.push("No supported entities found in ENTITIES. Supported: LINE, ARC.");
  }

  return {
    insunits,
    unitScaleToMm: scale,
    segments,
    warnings,
    errors,
    debug: {
      pairCount: pairs.length,
      entityCount: entities.length
    }
  };
}
