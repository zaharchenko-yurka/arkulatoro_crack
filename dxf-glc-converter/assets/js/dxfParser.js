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

function parseTextEntity(entity) {
  const data = {};
  for (const row of entity) {
    data[row.code] = row.value;
  }
  const position = {
    x: Number.parseFloat((data[10] ?? "").trim()),
    y: Number.parseFloat((data[20] ?? "").trim())
  };
  if (![position.x, position.y].every(Number.isFinite)) {
    return null;
  }
  const height = Number.parseFloat((data[40] ?? "2.5").trim());
  const rotationDeg = Number.parseFloat((data[50] ?? "0").trim());
  return {
    type: "text",
    position,
    text: String(data[1] ?? "").trim(),
    height: Number.isFinite(height) && height > 0 ? height : 2.5,
    rotationDeg: Number.isFinite(rotationDeg) ? rotationDeg : 0
  };
}

function parseMTextEntity(entity) {
  const data = {};
  const chunks = [];
  for (const row of entity) {
    data[row.code] = row.value;
    if (row.code === 1 || row.code === 3) {
      chunks.push(row.value);
    }
  }
  const position = {
    x: Number.parseFloat((data[10] ?? "").trim()),
    y: Number.parseFloat((data[20] ?? "").trim())
  };
  if (![position.x, position.y].every(Number.isFinite)) {
    return null;
  }
  const height = Number.parseFloat((data[40] ?? "2.5").trim());
  const rotationDeg = Number.parseFloat((data[50] ?? "0").trim());
  return {
    type: "text",
    position,
    text: chunks.join("").trim(),
    height: Number.isFinite(height) && height > 0 ? height : 2.5,
    rotationDeg: Number.isFinite(rotationDeg) ? rotationDeg : 0
  };
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

function scaleSegment(seg, scale) {
  if (seg.type === "line") {
    return {
      ...seg,
      start: scalePoint(seg.start, scale),
      end: scalePoint(seg.end, scale)
    };
  }
  return {
    ...seg,
    center: scalePoint(seg.center, scale),
    radius: seg.radius * scale,
    start: scalePoint(seg.start, scale),
    end: scalePoint(seg.end, scale)
  };
}

function transformAndScaleSegment(seg, insert, scale) {
  if (seg.type === "line") {
    const transformedStart = transformPoint(seg.start, insert);
    const transformedEnd = transformPoint(seg.end, insert);
    return {
      ...seg,
      start: scalePoint(transformedStart, scale),
      end: scalePoint(transformedEnd, scale)
    };
  }
  const transformedCenter = transformPoint(seg.center, insert);
  const transformedStart = transformPoint(seg.start, insert);
  const transformedEnd = transformPoint(seg.end, insert);
  return {
    ...seg,
    center: scalePoint(transformedCenter, scale),
    radius: seg.radius * insert.scaleX * scale,
    start: scalePoint(transformedStart, scale),
    end: scalePoint(transformedEnd, scale)
  };
}

function scaleTextEntity(textEntity, scale) {
  return {
    ...textEntity,
    position: scalePoint(textEntity.position, scale),
    height: textEntity.height * scale
  };
}

function transformAndScaleTextEntity(textEntity, insert, scale) {
  return {
    ...textEntity,
    position: scalePoint(transformPoint(textEntity.position, insert), scale),
    height: textEntity.height * insert.scaleX * scale,
    rotationDeg: textEntity.rotationDeg + insert.rotationDeg
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
  const rawEntities = [];
  const segments = [];
  let skippedNonGeometry = 0;
  let skippedMalformed = 0;
  let skippedMixedBlocks = 0;
  let expandedBlockSegments = 0;
  const allowedEntityTypes = new Set(["LINE", "ARC"]);
  const rawRenderableTypes = new Set(["LINE", "ARC", "TEXT", "MTEXT"]);
  const blockCache = new Map();

  function resolveBlockGeometry(name) {
    if (blockCache.has(name)) {
      return blockCache.get(name);
    }
    const blockEntities = blocks.get(name) || [];
    const out = { valid: true, segments: [] };
    let hasUnsupported = false;
    for (const be of blockEntities) {
      if (!allowedEntityTypes.has(be.type)) {
        hasUnsupported = true;
        continue;
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
    out.valid = !hasUnsupported;
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
      const isUniformScale = Math.abs(insert.scaleX - insert.scaleY) <= 1e-9;
      if (isUniformScale && insert.scaleX > 0 && insert.scaleY > 0) {
        const blockEntities = blocks.get(insert.name) || [];
        blockEntities.forEach((be) => {
          if (!rawRenderableTypes.has(be.type)) {
            return;
          }
          if (be.type === "LINE") {
            const line = parseLineEntity(be.rows);
            if (line) {
              rawEntities.push(transformAndScaleSegment(line, insert, scale));
            }
            return;
          }
          if (be.type === "ARC") {
            const arc = parseArcEntity(be.rows);
            if (arc) {
              rawEntities.push(transformAndScaleSegment(arc, insert, scale));
            }
            return;
          }
          if (be.type === "TEXT") {
            const textEntity = parseTextEntity(be.rows);
            if (textEntity) {
              rawEntities.push(transformAndScaleTextEntity(textEntity, insert, scale));
            }
            return;
          }
          if (be.type === "MTEXT") {
            const textEntity = parseMTextEntity(be.rows);
            if (textEntity) {
              rawEntities.push(transformAndScaleTextEntity(textEntity, insert, scale));
            }
          }
        });
      } else {
        skippedNonGeometry += 1;
      }

      if (!block.valid) {
        skippedMixedBlocks += 1;
        continue;
      }
      if (!isUniformScale || insert.scaleX <= 0 || insert.scaleY <= 0) {
        continue;
      }
      block.segments.forEach((seg) => {
        segments.push(transformAndScaleSegment(seg, insert, scale));
        expandedBlockSegments += 1;
      });
      continue;
    }

    if (!allowedEntityTypes.has(e.type)) {
      if (e.type === "TEXT") {
        const textEntity = parseTextEntity(e.rows);
        if (textEntity) {
          rawEntities.push(scaleTextEntity(textEntity, scale));
          continue;
        }
      } else if (e.type === "MTEXT") {
        const textEntity = parseMTextEntity(e.rows);
        if (textEntity) {
          rawEntities.push(scaleTextEntity(textEntity, scale));
          continue;
        }
      }
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
      const scaledLine = scaleSegment(line, scale);
      rawEntities.push(scaledLine);
      segments.push(scaledLine);
    } else if (e.type === "ARC") {
      const arc = parseArcEntity(e.rows);
      if (!arc) {
        warnings.push("Skipped malformed ARC entity.");
        skippedMalformed += 1;
        continue;
      }
      const scaledArc = scaleSegment(arc, scale);
      rawEntities.push(scaledArc);
      segments.push(scaledArc);
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
    rawEntities,
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
