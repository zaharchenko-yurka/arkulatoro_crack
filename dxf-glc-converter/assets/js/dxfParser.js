import { resolveUnitScale } from "./unitConverter.js";
import { splineEntityToSegments } from "./splineProcessor.js";

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

function normalizeAngleDeg(angle) {
  let a = angle % 360;
  if (a < 0) {
    a += 360;
  }
  return a;
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
      if (current && current.type === "POLYLINE" && (value === "VERTEX" || value === "SEQEND")) {
        current.rows.push({ code: 0, value });
        continue;
      }
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
      currentBlock = { name: "", entities: [], basePoint: { x: 0, y: 0 } };
      currentEntity = null;
      continue;
    }

    if (p.code === 0 && value === "ENDBLK") {
      if (currentEntity && currentBlock) {
        currentBlock.entities.push(currentEntity);
      }
      if (currentBlock && currentBlock.name) {
        blocks.set(currentBlock.name, currentBlock);
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
    if (!currentEntity && p.code === 10) {
      const x = Number.parseFloat(value);
      if (Number.isFinite(x)) {
        currentBlock.basePoint.x = x;
      }
      continue;
    }
    if (!currentEntity && p.code === 20) {
      const y = Number.parseFloat(value);
      if (Number.isFinite(y)) {
        currentBlock.basePoint.y = y;
      }
      continue;
    }

    if (p.code === 0) {
      if (currentEntity && currentEntity.type === "POLYLINE" && (value === "VERTEX" || value === "SEQEND")) {
        currentEntity.rows.push({ code: 0, value });
        continue;
      }
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

function multiplyMatrix(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function applyMatrix(point, matrix) {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]
  };
}

function getMatrixScale(matrix) {
  const sx = Math.hypot(matrix[0], matrix[1]);
  const sy = Math.hypot(matrix[2], matrix[3]);
  return { sx, sy };
}

function getInsertMatrix(insert, blockBasePoint) {
  const a = (insert.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const m = [
    cos * insert.scaleX,
    sin * insert.scaleX,
    -sin * insert.scaleY,
    cos * insert.scaleY,
    insert.insertPoint.x,
    insert.insertPoint.y
  ];
  const bx = Number.isFinite(blockBasePoint?.x) ? blockBasePoint.x : 0;
  const by = Number.isFinite(blockBasePoint?.y) ? blockBasePoint.y : 0;
  m[4] -= m[0] * bx + m[2] * by;
  m[5] -= m[1] * bx + m[3] * by;
  return m;
}

function transformSegment(seg, matrix) {
  if (seg.type === "line") {
    return {
      ...seg,
      start: applyMatrix(seg.start, matrix),
      end: applyMatrix(seg.end, matrix)
    };
  }
  const { sx, sy } = getMatrixScale(matrix);
  const orthogonality = Math.abs(matrix[0] * matrix[2] + matrix[1] * matrix[3]);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) {
    return null;
  }
  if (Math.abs(sx - sy) > 1e-6 * Math.max(1, sx, sy) || orthogonality > 1e-6 * Math.max(1, sx * sy)) {
    return null;
  }
  const det = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  return {
    ...seg,
    center: applyMatrix(seg.center, matrix),
    radius: seg.radius * sx,
    start: applyMatrix(seg.start, matrix),
    end: applyMatrix(seg.end, matrix),
    clockwise: det < 0 ? !seg.clockwise : seg.clockwise
  };
}

function transformTextEntity(textEntity, matrix) {
  const { sx, sy } = getMatrixScale(matrix);
  const rotationFromMatrix = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  const textScale = Number.isFinite((sx + sy) / 2) ? (sx + sy) / 2 : 1;
  return {
    ...textEntity,
    position: applyMatrix(textEntity.position, matrix),
    height: textEntity.height * textScale,
    rotationDeg: textEntity.rotationDeg + rotationFromMatrix
  };
}

function normalizePolylineVertices(vertices, closed, bulges) {
  const out = [];
  if (vertices.length < 2) {
    return out;
  }
  const count = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const bulge = bulges[i] ?? 0;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      continue;
    }
    if (Math.hypot(b.x - a.x, b.y - a.y) <= 1e-9) {
      continue;
    }
    if (Math.abs(bulge) <= 1e-12) {
      out.push({
        type: "line",
        start: { x: a.x, y: a.y },
        end: { x: b.x, y: b.y }
      });
      continue;
    }
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const theta = 4 * Math.atan(bulge);
    const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
    if (!Number.isFinite(radius) || radius <= 1e-9) {
      out.push({
        type: "line",
        start: { x: a.x, y: a.y },
        end: { x: b.x, y: b.y }
      });
      continue;
    }
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ux = (b.x - a.x) / chord;
    const uy = (b.y - a.y) / chord;
    const nx = -uy;
    const ny = ux;
    const h2 = radius * radius - (chord * chord) / 4;
    const h = Math.sqrt(Math.max(0, h2));
    const sign = bulge >= 0 ? 1 : -1;
    const center = { x: mid.x + sign * h * nx, y: mid.y + sign * h * ny };
    out.push({
      type: "arc",
      center,
      radius,
      start: { x: a.x, y: a.y },
      end: { x: b.x, y: b.y },
      startAngleDeg: normalizeAngleDeg((Math.atan2(a.y - center.y, a.x - center.x) * 180) / Math.PI),
      endAngleDeg: normalizeAngleDeg((Math.atan2(b.y - center.y, b.x - center.x) * 180) / Math.PI),
      sweepDeg: (Math.abs(theta) * 180) / Math.PI,
      clockwise: theta < 0
    });
  }
  return out;
}

function parseLwPolylineEntity(entity) {
  const vertices = [];
  const bulges = [];
  let closed = false;
  let currentVertex = -1;
  for (const row of entity) {
    const value = row.value.trim();
    if (row.code === 70) {
      const flag = Number.parseInt(value, 10);
      if (Number.isFinite(flag) && (flag & 1) === 1) {
        closed = true;
      }
      continue;
    }
    if (row.code === 10) {
      const x = Number.parseFloat(value);
      vertices.push({ x, y: Number.NaN });
      bulges.push(0);
      currentVertex = vertices.length - 1;
      continue;
    }
    if (row.code === 20 && currentVertex >= 0) {
      vertices[currentVertex].y = Number.parseFloat(value);
      continue;
    }
    if (row.code === 42 && currentVertex >= 0) {
      bulges[currentVertex] = Number.parseFloat(value);
    }
  }
  const points = vertices.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
  if (points.length < 2) {
    return [];
  }
  return normalizePolylineVertices(points, closed, bulges);
}

function parsePolylineEntity(entity) {
  const header = {};
  const vertices = [];
  const bulges = [];
  let hasFaceRecords = false;
  let sawVertex = false;
  let currentVertex = null;
  for (const row of entity) {
    if (row.code === 0) {
      const marker = row.value.trim();
      if (marker === "VERTEX") {
        if (currentVertex) {
          vertices.push(currentVertex);
        }
        sawVertex = true;
        currentVertex = {};
      } else if (marker === "SEQEND") {
        if (currentVertex) {
          vertices.push(currentVertex);
          currentVertex = null;
        }
        break;
      } else if (currentVertex) {
        vertices.push(currentVertex);
        currentVertex = null;
      }
      continue;
    }
    if (!sawVertex) {
      header[row.code] = row.value.trim();
      continue;
    }
    if (!currentVertex) {
      continue;
    }
    currentVertex[row.code] = row.value.trim();
  }
  if (currentVertex) {
    vertices.push(currentVertex);
  }
  if (vertices.length < 2) {
    return { segments: [], ignoredAs3d: true, usedLegacyMeshFallback: false };
  }

  const polyFlags = Number.parseInt(header[70] ?? "0", 10) || 0;
  const isExplicit3d = (polyFlags & 8) !== 0 || (polyFlags & 16) !== 0 || (polyFlags & 32) !== 0;
  const isMeshOrPolyface = (polyFlags & 64) !== 0;
  const points = [];
  let hasNonZeroZ = false;
  vertices.forEach((v) => {
    const vFlags = Number.parseInt(v[70] ?? "0", 10) || 0;
    const isFaceRecord = (vFlags & 128) !== 0 && (v[71] !== undefined || v[72] !== undefined || v[73] !== undefined || v[74] !== undefined);
    if (isFaceRecord) {
      hasFaceRecords = true;
      return;
    }
    const x = Number.parseFloat(v[10] ?? "");
    const y = Number.parseFloat(v[20] ?? "");
    const z = Number.parseFloat(v[30] ?? "0");
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    if (Number.isFinite(z) && Math.abs(z) > 1e-9) {
      hasNonZeroZ = true;
    }
    points.push({ x, y });
    bulges.push(Number.parseFloat(v[42] ?? "0"));
  });

  if (points.length < 2) {
    return { segments: [], ignoredAs3d: true, usedLegacyMeshFallback: false };
  }

  const strict2d = !isExplicit3d && !isMeshOrPolyface;
  const canUseLegacyMeshFallback = !isExplicit3d && !hasNonZeroZ && isMeshOrPolyface && points.length >= 2;
  if (!strict2d && !canUseLegacyMeshFallback) {
    return { segments: [], ignoredAs3d: true, usedLegacyMeshFallback: false };
  }

  const closedFromFlag = (polyFlags & 1) === 1;
  const closed = closedFromFlag || (canUseLegacyMeshFallback && hasFaceRecords);
  return {
    segments: normalizePolylineVertices(points, closed, bulges),
    ignoredAs3d: false,
    usedLegacyMeshFallback: canUseLegacyMeshFallback
  };
}

function parseSplineEntity(entity, scaleToMm) {
  const unit = Math.max(scaleToMm, 1e-9);
  return splineEntityToSegments(entity, {
    adaptiveError: 3 / unit,
    maxArcDeviation: 5 / unit,
    targetSegmentLength: 400 / unit,
    minSegmentLength: 350 / unit,
    maxSegmentLength: 450 / unit,
    maxArcRadiusForProduction: 30000 / unit
  });
}

function pushTypeCount(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function formatTypeCount(map) {
  if (map.size === 0) {
    return "";
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
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
  const detectedEntityTypes = new Map();
  const unsupportedEntityTypes = new Map();
  const ignored3dEntityTypes = new Map();
  const malformedEntityTypes = new Map();
  const unsupportedArcTransformTypes = new Map();
  const ignoredRenderableTypes = new Set(["DIMENSION", "HATCH"]);
  const maxInsertDepth = 20;
  const maxInsertExpansions = 200000;
  let insertExpansions = 0;
  let skippedNonGeometry = 0;
  let skippedMalformed = 0;
  let skipped3dEntities = 0;
  let expandedBlockSegments = 0;
  let blockReferenceCount = 0;
  let splineApproximationCount = 0;
  let legacyMeshPolylineCount = 0;
  let insertCycleSkips = 0;
  let insertDepthSkips = 0;
  let insertMissingBlockSkips = 0;
  let insertExpansionLimitHits = 0;
  const splineStats = {
    sourcePointCount: 0,
    selectedArcCount: 0,
    selectedLineCount: 0,
    totalOutputSegments: 0,
    maxArcResidualMm: 0,
    maxLineDeviationMm: 0,
    minSegmentLengthMm: Infinity,
    maxSegmentLengthMm: 0,
    avgSegmentLengthMmAcc: 0,
    avgSegmentLengthMmCount: 0
  };

  function pushSegment(segment, matrix, sourceType) {
    const transformed = transformSegment(segment, matrix);
    if (!transformed) {
      pushTypeCount(unsupportedArcTransformTypes, sourceType);
      skippedMalformed += 1;
      return;
    }
    rawEntities.push(transformed);
    segments.push(transformed);
  }

  function processEntity(entity, matrix, depth, insertStack) {
    pushTypeCount(detectedEntityTypes, entity.type);
    if (entity.type === "LINE") {
      const line = parseLineEntity(entity.rows);
      if (!line) {
        pushTypeCount(malformedEntityTypes, "LINE");
        skippedMalformed += 1;
        return;
      }
      pushSegment(line, matrix, "LINE");
      return;
    }
    if (entity.type === "ARC") {
      const arc = parseArcEntity(entity.rows);
      if (!arc) {
        pushTypeCount(malformedEntityTypes, "ARC");
        skippedMalformed += 1;
        return;
      }
      pushSegment(arc, matrix, "ARC");
      return;
    }
    if (entity.type === "LWPOLYLINE") {
      const polySegments = parseLwPolylineEntity(entity.rows);
      if (polySegments.length === 0) {
        pushTypeCount(malformedEntityTypes, "LWPOLYLINE");
        skippedMalformed += 1;
        return;
      }
      polySegments.forEach((seg) => pushSegment(seg, matrix, "LWPOLYLINE"));
      return;
    }
    if (entity.type === "POLYLINE") {
      const parsed = parsePolylineEntity(entity.rows);
      if (parsed.ignoredAs3d) {
        pushTypeCount(ignored3dEntityTypes, "POLYLINE");
        skipped3dEntities += 1;
        return;
      }
      if (parsed.usedLegacyMeshFallback) {
        legacyMeshPolylineCount += 1;
      }
      if (parsed.segments.length === 0) {
        pushTypeCount(malformedEntityTypes, "POLYLINE");
        skippedMalformed += 1;
        return;
      }
      parsed.segments.forEach((seg) => pushSegment(seg, matrix, "POLYLINE"));
      return;
    }
    if (entity.type === "SPLINE") {
      const splineResult = parseSplineEntity(entity.rows, scale);
      const splineSegments = splineResult.segments;
      if (splineSegments.length === 0) {
        pushTypeCount(malformedEntityTypes, "SPLINE");
        skippedMalformed += 1;
        return;
      }
      if (splineResult.debug) {
        splineStats.sourcePointCount += splineResult.debug.sourcePointCount || 0;
        splineStats.selectedArcCount += splineResult.debug.selectedArcCount || 0;
        splineStats.selectedLineCount += splineResult.debug.selectedLineCount || 0;
        splineStats.totalOutputSegments += splineSegments.length;
        splineStats.maxArcResidualMm = Math.max(
          splineStats.maxArcResidualMm,
          (splineResult.debug.maxArcResidual || 0) * scale
        );
        splineStats.maxLineDeviationMm = Math.max(
          splineStats.maxLineDeviationMm,
          (splineResult.debug.maxLineDeviation || 0) * scale
        );
        if (Number.isFinite(splineResult.debug.minSegmentLength) && splineResult.debug.minSegmentLength > 0) {
          splineStats.minSegmentLengthMm = Math.min(
            splineStats.minSegmentLengthMm,
            splineResult.debug.minSegmentLength * scale
          );
        }
        splineStats.maxSegmentLengthMm = Math.max(
          splineStats.maxSegmentLengthMm,
          (splineResult.debug.maxSegmentLength || 0) * scale
        );
        if (Number.isFinite(splineResult.debug.avgSegmentLength) && splineResult.debug.avgSegmentLength > 0) {
          splineStats.avgSegmentLengthMmAcc += splineResult.debug.avgSegmentLength * scale;
          splineStats.avgSegmentLengthMmCount += 1;
        }
      }
      splineApproximationCount += 1;
      splineSegments.forEach((seg) => pushSegment(seg, matrix, "SPLINE"));
      return;
    }
    if (entity.type === "TEXT") {
      const textEntity = parseTextEntity(entity.rows);
      if (textEntity) {
        rawEntities.push(transformTextEntity(textEntity, matrix));
      } else {
        pushTypeCount(malformedEntityTypes, "TEXT");
        skippedMalformed += 1;
      }
      return;
    }
    if (entity.type === "MTEXT") {
      const textEntity = parseMTextEntity(entity.rows);
      if (textEntity) {
        rawEntities.push(transformTextEntity(textEntity, matrix));
      } else {
        pushTypeCount(malformedEntityTypes, "MTEXT");
        skippedMalformed += 1;
      }
      return;
    }
    if (entity.type === "INSERT") {
      const insert = parseInsertEntity(entity.rows);
      if (!insert) {
        pushTypeCount(malformedEntityTypes, "INSERT");
        skippedMalformed += 1;
        return;
      }
      const block = blocks.get(insert.name);
      if (!block) {
        insertMissingBlockSkips += 1;
        pushTypeCount(unsupportedEntityTypes, "INSERT_MISSING_BLOCK");
        skippedNonGeometry += 1;
        return;
      }
      if (depth >= maxInsertDepth) {
        insertDepthSkips += 1;
        pushTypeCount(unsupportedEntityTypes, "INSERT_MAX_DEPTH");
        skippedNonGeometry += 1;
        return;
      }
      if (insertStack.has(insert.name)) {
        insertCycleSkips += 1;
        pushTypeCount(unsupportedEntityTypes, "INSERT_CYCLE");
        skippedNonGeometry += 1;
        return;
      }
      blockReferenceCount += 1;
      const insertMatrix = getInsertMatrix(insert, block.basePoint);
      const nextMatrix = multiplyMatrix(matrix, insertMatrix);
      insertStack.add(insert.name);
      for (const be of block.entities) {
        insertExpansions += 1;
        if (insertExpansions > maxInsertExpansions) {
          insertExpansionLimitHits += 1;
          pushTypeCount(unsupportedEntityTypes, "INSERT_LIMIT");
          break;
        }
        processEntity(be, nextMatrix, depth + 1, insertStack);
      }
      insertStack.delete(insert.name);
      return;
    }

    if (ignoredRenderableTypes.has(entity.type)) {
      skippedNonGeometry += 1;
      return;
    }
    pushTypeCount(unsupportedEntityTypes, entity.type);
    skippedNonGeometry += 1;
  }

  const rootMatrix = [scale, 0, 0, scale, 0, 0];
  entities.forEach((entity) => {
    const before = segments.length;
    processEntity(entity, rootMatrix, 0, new Set());
    if (segments.length > before && entity.type === "INSERT") {
      expandedBlockSegments += segments.length - before;
    }
  });

  const detectedSummary = formatTypeCount(detectedEntityTypes);
  if (detectedSummary) {
    warnings.push(`Detected entity types: ${detectedSummary}`);
  }
  const unsupportedSummary = formatTypeCount(unsupportedEntityTypes);
  if (unsupportedSummary) {
    warnings.push(`Unsupported entities ignored: ${unsupportedSummary}`);
  }
  const ignored3dSummary = formatTypeCount(ignored3dEntityTypes);
  if (ignored3dSummary) {
    warnings.push(`Ignored 3D POLYLINE entities: ${ignored3dSummary}`);
  }
  const malformedSummary = formatTypeCount(malformedEntityTypes);
  if (malformedSummary) {
    warnings.push(`Malformed entities skipped: ${malformedSummary}`);
  }
  const unsupportedArcTransformSummary = formatTypeCount(unsupportedArcTransformTypes);
  if (unsupportedArcTransformSummary) {
    warnings.push(`Arcs skipped after non-uniform INSERT transform: ${unsupportedArcTransformSummary}`);
  }
  warnings.push(`Skipped ${skippedNonGeometry} non-geometry entities`);
  warnings.push(`Extracted ${segments.length} contour segments for contour building.`);
  if (legacyMeshPolylineCount > 0) {
    warnings.push(`Used legacy mesh POLYLINE fallback on ${legacyMeshPolylineCount} entities (flattened to 2D).`);
  }
  if (insertCycleSkips > 0) {
    warnings.push(`Skipped ${insertCycleSkips} INSERT references due to cyclic block links.`);
  }
  if (insertDepthSkips > 0) {
    warnings.push(`Skipped ${insertDepthSkips} INSERT references due to max nesting depth ${maxInsertDepth}.`);
  }
  if (insertExpansionLimitHits > 0) {
    warnings.push(`INSERT expansion limit reached (${maxInsertExpansions}); extra nested entities were skipped.`);
  }
  if (splineApproximationCount > 0) {
    const minSeg = Number.isFinite(splineStats.minSegmentLengthMm) ? splineStats.minSegmentLengthMm.toFixed(1) : "0.0";
    const maxSeg = splineStats.maxSegmentLengthMm.toFixed(1);
    const avgSeg = splineStats.avgSegmentLengthMmCount > 0
      ? (splineStats.avgSegmentLengthMmAcc / splineStats.avgSegmentLengthMmCount).toFixed(1)
      : "0.0";
    warnings.push(
      `SPLINE stats: entities=${splineApproximationCount}, arcs=${splineStats.selectedArcCount}, lines=${splineStats.selectedLineCount}, segmentLen(mm) min/avg/max=${minSeg}/${avgSeg}/${maxSeg}.`
    );
  }

  if (segments.length === 0) {
    errors.push("No supported contour geometry found. Supported: LINE, ARC, LWPOLYLINE, POLYLINE(2D), SPLINE(approximated).");
    const regionCount = detectedEntityTypes.get("REGION") || 0;
    if (regionCount > 0) {
      errors.push("DXF geometry is stored as REGION/ACIS solids. This parser currently requires exploded 2D edges.");
    }
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
      skippedSegments: skippedNonGeometry + skippedMalformed + skipped3dEntities,
      skippedNonGeometry,
      skippedMalformed,
      skipped3dEntities,
      blockCount: blocks.size,
      blockReferenceCount,
      expandedBlockSegments,
      splineApproximationCount,
      legacyMeshPolylineCount,
      insertCycleSkips,
      insertDepthSkips,
      insertMissingBlockSkips,
      insertExpansionLimitHits,
      splineStats: {
        sourcePointCount: splineStats.sourcePointCount,
        outputSegments: splineStats.totalOutputSegments,
        arcs: splineStats.selectedArcCount,
        lines: splineStats.selectedLineCount,
        maxArcResidualMm: Number(splineStats.maxArcResidualMm.toFixed(3)),
        maxLineDeviationMm: Number(splineStats.maxLineDeviationMm.toFixed(3)),
        minSegmentLengthMm: Number((Number.isFinite(splineStats.minSegmentLengthMm) ? splineStats.minSegmentLengthMm : 0).toFixed(3)),
        avgSegmentLengthMm: Number(
          (
            splineStats.avgSegmentLengthMmCount > 0
              ? splineStats.avgSegmentLengthMmAcc / splineStats.avgSegmentLengthMmCount
              : 0
          ).toFixed(3)
        ),
        maxSegmentLengthMm: Number(splineStats.maxSegmentLengthMm.toFixed(3))
      },
      detectedEntityTypes: Object.fromEntries(detectedEntityTypes.entries()),
      unsupportedEntityTypes: Object.fromEntries(unsupportedEntityTypes.entries()),
      malformedEntityTypes: Object.fromEntries(malformedEntityTypes.entries())
    }
  };
}
