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

function parseBlocks(pairs) {
  const blocks = new Map();
  let inBlocks = false;
  let currentBlock = null;
  let currentEntity = null;

  for (const p of pairs) {
    const value = p.value.trim();
    if (p.code === 0 && value === "SECTION") {
      currentBlock = null;
      currentEntity = null;
      continue;
    }
    if (p.code === 2 && value === "BLOCKS") {
      inBlocks = true;
      continue;
    }
    if (inBlocks && p.code === 0 && value === "ENDSEC") {
      break;
    }
    if (!inBlocks) {
      continue;
    }

    if (p.code === 0 && value === "BLOCK") {
      currentBlock = { name: "", entities: [] };
      currentEntity = null;
      continue;
    }

    if (p.code === 0 && value === "ENDBLK") {
      if (currentEntity && currentBlock) {
        currentBlock.entities.push(currentEntity);
      }
      if (currentBlock && currentBlock.name) {
        blocks.set(currentBlock.name, currentBlock.entities);
      }
      currentBlock = null;
      currentEntity = null;
      continue;
    }

    if (!currentBlock) {
      continue;
    }

    if (!currentEntity && p.code === 2 && !currentBlock.name) {
      currentBlock.name = value;
      continue;
    }

    if (p.code === 0) {
      if (currentEntity) {
        currentBlock.entities.push(currentEntity);
      }
      currentEntity = { type: value, rows: [] };
    } else if (currentEntity) {
      currentEntity.rows.push(p);
    }
  }

  return blocks;
}

function parseInsertEntity(entity) {
  const data = {};
  for (const row of entity) {
    data[row.code] = row.value.trim();
  }
  const name = data[2] || "";
  if (!name) {
    return null;
  }
  const insertPoint = {
    x: Number.parseFloat(data[10] ?? "0"),
    y: Number.parseFloat(data[20] ?? "0")
  };
  const scaleX = Number.parseFloat(data[41] ?? "1");
  const scaleY = Number.parseFloat(data[42] ?? "1");
  const rotationDeg = Number.parseFloat(data[50] ?? "0");
  if (![insertPoint.x, insertPoint.y, scaleX, scaleY, rotationDeg].every(Number.isFinite)) {
    return null;
  }
  return {
    name,
    insertPoint,
    scaleX,
    scaleY,
    rotationDeg
  };
}

function transformPoint(point, insert) {
  const sx = point.x * insert.scaleX;
  const sy = point.y * insert.scaleY;
  const a = (insert.rotationDeg * Math.PI) / 180;
  const xr = sx * Math.cos(a) - sy * Math.sin(a);
  const yr = sx * Math.sin(a) + sy * Math.cos(a);
  return {
    x: xr + insert.insertPoint.x,
    y: yr + insert.insertPoint.y
  };
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
  const blocks = parseBlocks(pairs);
  const segments = [];
  let skippedNonGeometry = 0;
  let skippedMalformed = 0;
  let skippedMixedBlocks = 0;
  let expandedBlockSegments = 0;
  const allowedEntityTypes = new Set(["LINE", "ARC"]);
  const blockCache = new Map();

  function resolveBlockGeometry(name) {
    if (blockCache.has(name)) {
      return blockCache.get(name);
    }
    const blockEntities = blocks.get(name) || [];
    const out = { valid: true, segments: [] };
    for (const be of blockEntities) {
      if (!allowedEntityTypes.has(be.type)) {
        out.valid = false;
        break;
      }
      if (be.type === "LINE") {
        const line = parseLineEntity(be.rows);
        if (!line) {
          continue;
        }
        out.segments.push(line);
      } else if (be.type === "ARC") {
        const arc = parseArcEntity(be.rows);
        if (!arc) {
          continue;
        }
        out.segments.push(arc);
      }
    }
    blockCache.set(name, out);
    return out;
  }

  for (const e of entities) {
    if (e.type === "INSERT") {
      const insert = parseInsertEntity(e.rows);
      if (!insert) {
        skippedNonGeometry += 1;
        continue;
      }
      const block = resolveBlockGeometry(insert.name);
      if (!block.valid) {
        skippedMixedBlocks += 1;
        continue;
      }
      const isUniformScale = Math.abs(insert.scaleX - insert.scaleY) <= 1e-9;
      if (!isUniformScale || insert.scaleX <= 0 || insert.scaleY <= 0) {
        skippedNonGeometry += 1;
        continue;
      }
      block.segments.forEach((seg) => {
        if (seg.type === "line") {
          const transformedStart = transformPoint(seg.start, insert);
          const transformedEnd = transformPoint(seg.end, insert);
          segments.push({
            ...seg,
            start: scalePoint(transformedStart, scale),
            end: scalePoint(transformedEnd, scale)
          });
        } else if (seg.type === "arc") {
          const transformedCenter = transformPoint(seg.center, insert);
          const transformedStart = transformPoint(seg.start, insert);
          const transformedEnd = transformPoint(seg.end, insert);
          segments.push({
            ...seg,
            center: scalePoint(transformedCenter, scale),
            radius: seg.radius * insert.scaleX * scale,
            start: scalePoint(transformedStart, scale),
            end: scalePoint(transformedEnd, scale)
          });
        }
        expandedBlockSegments += 1;
      });
      continue;
    }

    if (!allowedEntityTypes.has(e.type)) {
      skippedNonGeometry += 1;
      continue;
    }
    if (e.type === "LINE") {
      const line = parseLineEntity(e.rows);
      if (!line) {
        warnings.push("Skipped malformed LINE entity.");
        skippedMalformed += 1;
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
        skippedMalformed += 1;
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
  warnings.push(`Skipped ${skippedNonGeometry} non-geometry entities`);
  if (skippedMixedBlocks > 0) {
    warnings.push(`Skipped ${skippedMixedBlocks} mixed-content blocks`);
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
      entityCount: entities.length,
      parsedSegments: segments.length,
      skippedSegments: skippedNonGeometry + skippedMalformed,
      skippedNonGeometry,
      skippedMalformed,
      blockCount: blocks.size,
      skippedMixedBlocks,
      expandedBlockSegments
    }
  };
}
