function normalizeAngleDeg(angle) {
  let a = angle % 360;
  if (a < 0) {
    a += 360;
  }
  return a;
}

function basisFunction(i, k, t, knots, memo) {
  const key = `${i}:${k}:${t.toFixed(12)}`;
  if (memo.has(key)) {
    return memo.get(key);
  }
  let result = 0;
  if (k === 0) {
    const ki = knots[i];
    const ki1 = knots[i + 1];
    const isLastSpan = Math.abs(t - knots[knots.length - 1]) <= 1e-12 && i === knots.length - 2;
    result = (ki <= t && t < ki1) || isLastSpan ? 1 : 0;
  } else {
    const denom1 = knots[i + k] - knots[i];
    const denom2 = knots[i + k + 1] - knots[i + 1];
    const term1 = denom1 === 0 ? 0 : ((t - knots[i]) / denom1) * basisFunction(i, k - 1, t, knots, memo);
    const term2 = denom2 === 0 ? 0 : ((knots[i + k + 1] - t) / denom2) * basisFunction(i + 1, k - 1, t, knots, memo);
    result = term1 + term2;
  }
  memo.set(key, result);
  return result;
}

function evaluateSplinePoint(controlPoints, knots, degree, t) {
  const memo = new Map();
  let x = 0;
  let y = 0;
  for (let i = 0; i < controlPoints.length; i += 1) {
    const b = basisFunction(i, degree, t, knots, memo);
    x += controlPoints[i].x * b;
    y += controlPoints[i].y * b;
  }
  return { x, y };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentLength(seg) {
  if (seg.type === "line") {
    return distance(seg.start, seg.end);
  }
  return (Math.PI * seg.radius * Math.abs(seg.sweepDeg)) / 180;
}

function distancePointToLine(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-12) {
    return distance(point, a);
  }
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(point.x - cx, point.y - cy);
}

function adaptiveSampleSpline(controlPoints, knots, degree, startT, endT, maxError) {
  const points = [];

  function subdivide(t0, p0, t1, p1, depth) {
    const tm = (t0 + t1) / 2;
    const pm = evaluateSplinePoint(controlPoints, knots, degree, tm);
    const deviation = distancePointToLine(pm, p0, p1);
    if (deviation <= maxError || depth >= 22) {
      points.push(p1);
      return;
    }
    subdivide(t0, p0, tm, pm, depth + 1);
    subdivide(tm, pm, t1, p1, depth + 1);
  }

  const pStart = evaluateSplinePoint(controlPoints, knots, degree, startT);
  const pEnd = evaluateSplinePoint(controlPoints, knots, degree, endT - 1e-12);
  points.push(pStart);
  subdivide(startT, pStart, endT, pEnd, 0);
  return points;
}

function parseSplineData(entityRows) {
  const knots = [];
  const controlPoints = [];
  const fitPoints = [];
  let degree = 3;
  let flags = 0;
  let currentControlIdx = -1;
  let currentFitIdx = -1;

  entityRows.forEach((row) => {
    const value = row.value.trim();
    if (row.code === 70) {
      flags = Number.parseInt(value, 10) || 0;
      return;
    }
    if (row.code === 71) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        degree = parsed;
      }
      return;
    }
    if (row.code === 40) {
      const k = Number.parseFloat(value);
      if (Number.isFinite(k)) {
        knots.push(k);
      }
      return;
    }
    if (row.code === 10) {
      const x = Number.parseFloat(value);
      controlPoints.push({ x, y: Number.NaN });
      currentControlIdx = controlPoints.length - 1;
      return;
    }
    if (row.code === 20 && currentControlIdx >= 0) {
      controlPoints[currentControlIdx].y = Number.parseFloat(value);
      return;
    }
    if (row.code === 11) {
      const x = Number.parseFloat(value);
      fitPoints.push({ x, y: Number.NaN });
      currentFitIdx = fitPoints.length - 1;
      return;
    }
    if (row.code === 21 && currentFitIdx >= 0) {
      fitPoints[currentFitIdx].y = Number.parseFloat(value);
    }
  });

  return {
    degree,
    flags,
    knots,
    controlPoints: controlPoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    fitPoints: fitPoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  };
}

function solve3x3(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < 3; i += 1) {
    let maxRow = i;
    for (let r = i + 1; r < 3; r += 1) {
      if (Math.abs(a[r][i]) > Math.abs(a[maxRow][i])) {
        maxRow = r;
      }
    }
    if (Math.abs(a[maxRow][i]) < 1e-12) {
      return null;
    }
    if (maxRow !== i) {
      const tmp = a[i];
      a[i] = a[maxRow];
      a[maxRow] = tmp;
    }
    const pivot = a[i][i];
    for (let c = i; c < 4; c += 1) {
      a[i][c] /= pivot;
    }
    for (let r = 0; r < 3; r += 1) {
      if (r === i) {
        continue;
      }
      const factor = a[r][i];
      for (let c = i; c < 4; c += 1) {
        a[r][c] -= factor * a[i][c];
      }
    }
  }
  return [a[0][3], a[1][3], a[2][3]];
}

function fitCircleLeastSquares(points) {
  if (points.length < 3) {
    return null;
  }
  let sX = 0;
  let sY = 0;
  let sXX = 0;
  let sYY = 0;
  let sXY = 0;
  let sZ = 0;
  let sXZ = 0;
  let sYZ = 0;

  points.forEach((p) => {
    const x = p.x;
    const y = p.y;
    const z = x * x + y * y;
    sX += x;
    sY += y;
    sXX += x * x;
    sYY += y * y;
    sXY += x * y;
    sZ += z;
    sXZ += x * z;
    sYZ += y * z;
  });

  const n = points.length;
  const lhs = [
    [sXX, sXY, sX],
    [sXY, sYY, sY],
    [sX, sY, n]
  ];
  const rhs = [-sXZ, -sYZ, -sZ];
  const solution = solve3x3(lhs, rhs);
  if (!solution) {
    return null;
  }
  const [a, b, c] = solution;
  const cx = -a / 2;
  const cy = -b / 2;
  const r2 = cx * cx + cy * cy - c;
  if (!Number.isFinite(r2) || r2 <= 1e-12) {
    return null;
  }
  return {
    center: { x: cx, y: cy },
    radius: Math.sqrt(r2)
  };
}

function unwrapAngles(points, center) {
  const angles = points.map((p) => Math.atan2(p.y - center.y, p.x - center.x));
  const unwrapped = [angles[0]];
  for (let i = 1; i < angles.length; i += 1) {
    let a = angles[i];
    let prev = unwrapped[i - 1];
    while (a - prev > Math.PI) {
      a -= 2 * Math.PI;
    }
    while (a - prev < -Math.PI) {
      a += 2 * Math.PI;
    }
    unwrapped.push(a);
  }
  return unwrapped;
}

function polylineLength(points, startIdx, endIdx) {
  let total = 0;
  for (let i = startIdx; i < endIdx; i += 1) {
    total += distance(points[i], points[i + 1]);
  }
  return total;
}

function maxLineDeviation(points, startIdx, endIdx) {
  const a = points[startIdx];
  const b = points[endIdx];
  let maxDeviation = 0;
  for (let i = startIdx + 1; i < endIdx; i += 1) {
    maxDeviation = Math.max(maxDeviation, distancePointToLine(points[i], a, b));
  }
  return maxDeviation;
}

function buildArcFromRange(points, startIdx, endIdx, maxDeviation, minRadius) {
  const window = points.slice(startIdx, endIdx + 1);
  const fit = fitCircleLeastSquares(window);
  if (!fit || !Number.isFinite(fit.radius) || fit.radius >= minRadius) {
    return null;
  }
  let maxResidual = 0;
  for (let i = 0; i < window.length; i += 1) {
    const d = distance(window[i], fit.center);
    maxResidual = Math.max(maxResidual, Math.abs(d - fit.radius));
    if (maxResidual > maxDeviation) {
      return null;
    }
  }

  const unwrapped = unwrapAngles(window, fit.center);
  const sweepRad = unwrapped[unwrapped.length - 1] - unwrapped[0];
  const sweepDeg = (Math.abs(sweepRad) * 180) / Math.PI;
  if (!Number.isFinite(sweepDeg) || sweepDeg < 2 || sweepDeg > 359.9) {
    return null;
  }
  const start = points[startIdx];
  const end = points[endIdx];
  return {
    segment: {
      type: "arc",
      center: fit.center,
      radius: fit.radius,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      startAngleDeg: normalizeAngleDeg((Math.atan2(start.y - fit.center.y, start.x - fit.center.x) * 180) / Math.PI),
      endAngleDeg: normalizeAngleDeg((Math.atan2(end.y - fit.center.y, end.x - fit.center.x) * 180) / Math.PI),
      sweepDeg,
      clockwise: sweepRad < 0
    },
    residual: maxResidual
  };
}

function buildLineFromRange(points, startIdx, endIdx) {
  return {
    type: "line",
    start: { x: points[startIdx].x, y: points[startIdx].y },
    end: { x: points[endIdx].x, y: points[endIdx].y }
  };
}

function splitToArcLineSegments(points, options) {
  const out = [];
  const debug = {
    sourcePointCount: points.length,
    selectedArcCount: 0,
    selectedLineCount: 0,
    maxArcResidual: 0,
    maxLineDeviation: 0,
    minSegmentLength: 0,
    maxSegmentLength: 0,
    avgSegmentLength: 0
  };
  if (points.length < 2) {
    return { segments: out, debug };
  }
  const targetLength = options.targetSegmentLength;
  const minLength = options.minSegmentLength;
  const maxLength = options.maxSegmentLength;
  const maxDeviation = options.maxArcDeviation;

  let idx = 0;
  while (idx < points.length - 1) {
    let j = idx + 1;
    let length = 0;
    while (j < points.length - 1 && length < minLength) {
      length += distance(points[j - 1], points[j]);
      j += 1;
    }

    let jMax = j;
    let stretchLength = length;
    while (jMax < points.length - 1) {
      const nextLen = stretchLength + distance(points[jMax - 1], points[jMax]);
      if (nextLen > maxLength) {
        break;
      }
      stretchLength = nextLen;
      jMax += 1;
    }
    if (jMax <= idx + 1) {
      jMax = idx + 1;
    }

    const candidates = [];
    for (let endIdx = idx + 1; endIdx <= jMax; endIdx += 1) {
      const segLen = polylineLength(points, idx, endIdx);
      if (endIdx < points.length - 1 && segLen < minLength) {
        continue;
      }
      const arc = buildArcFromRange(points, idx, endIdx, maxDeviation, options.maxArcRadiusForProduction);
      if (arc) {
        candidates.push({
          segment: arc.segment,
          length: segLen,
          isArc: true,
          metric: arc.residual
        });
      }
      const lineDeviation = maxLineDeviation(points, idx, endIdx);
      if (lineDeviation <= maxDeviation) {
        candidates.push({
          segment: buildLineFromRange(points, idx, endIdx),
          length: segLen,
          isArc: false,
          metric: lineDeviation
        });
      }
    }

    if (candidates.length === 0) {
      const fallbackEnd = idx + 1;
      const fallbackLine = buildLineFromRange(points, idx, fallbackEnd);
      out.push(fallbackLine);
      debug.selectedLineCount += 1;
      debug.maxLineDeviation = Math.max(debug.maxLineDeviation, 0);
      idx = fallbackEnd;
      continue;
    }

    candidates.sort((a, b) => {
      if (a.isArc !== b.isArc) {
        return a.isArc ? -1 : 1;
      }
      const da = Math.abs(a.length - targetLength);
      const db = Math.abs(b.length - targetLength);
      if (da !== db) {
        return da - db;
      }
      return b.length - a.length;
    });

    const best = candidates[0];
    out.push(best.segment);
    if (best.isArc) {
      debug.selectedArcCount += 1;
      debug.maxArcResidual = Math.max(debug.maxArcResidual, best.metric || 0);
    } else {
      debug.selectedLineCount += 1;
      debug.maxLineDeviation = Math.max(debug.maxLineDeviation, best.metric || 0);
    }
    const nextPoint = best.segment.end;
    let nextIdx = idx + 1;
    while (nextIdx < points.length && (points[nextIdx].x !== nextPoint.x || points[nextIdx].y !== nextPoint.y)) {
      nextIdx += 1;
    }
    idx = Math.max(idx + 1, Math.min(nextIdx, points.length - 1));
  }

  if (out.length > 0) {
    const lengths = out.map((seg) => segmentLength(seg));
    const sum = lengths.reduce((acc, value) => acc + value, 0);
    debug.minSegmentLength = Math.min(...lengths);
    debug.maxSegmentLength = Math.max(...lengths);
    debug.avgSegmentLength = sum / lengths.length;
  }
  return {
    segments: out,
    debug
  };
}

function dedupeConsecutivePoints(points) {
  const out = [];
  points.forEach((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return;
    }
    if (out.length === 0 || distance(out[out.length - 1], p) > 1e-9) {
      out.push({ x: p.x, y: p.y });
    }
  });
  return out;
}

export function splineEntityToSegments(entityRows, options = {}) {
  const config = {
    adaptiveError: options.adaptiveError ?? 3,
    maxArcDeviation: options.maxArcDeviation ?? 5,
    targetSegmentLength: options.targetSegmentLength ?? 400,
    minSegmentLength: options.minSegmentLength ?? 350,
    maxSegmentLength: options.maxSegmentLength ?? 450,
    maxArcRadiusForProduction: options.maxArcRadiusForProduction ?? 30000
  };
  const spline = parseSplineData(entityRows);
  const closed = (spline.flags & 1) === 1;

  let points = [];
  if (spline.fitPoints.length >= 2) {
    points = dedupeConsecutivePoints(spline.fitPoints);
  } else if (spline.controlPoints.length >= 2) {
    const neededKnots = spline.controlPoints.length + spline.degree + 1;
    if (spline.knots.length < neededKnots) {
      points = dedupeConsecutivePoints(spline.controlPoints);
    } else {
      const startT = spline.knots[spline.degree];
      const endT = spline.knots[spline.knots.length - spline.degree - 1];
      if (!Number.isFinite(startT) || !Number.isFinite(endT) || endT <= startT) {
        points = dedupeConsecutivePoints(spline.controlPoints);
      } else {
        points = adaptiveSampleSpline(
          spline.controlPoints,
          spline.knots,
          spline.degree,
          startT,
          endT,
          Math.max(0.5, config.adaptiveError)
        );
      }
    }
  }

  points = dedupeConsecutivePoints(points);
  if (points.length < 2) {
    return {
      segments: [],
      debug: {
        sourcePointCount: points.length,
        selectedArcCount: 0,
        selectedLineCount: 0,
        maxArcResidual: 0,
        maxLineDeviation: 0,
        minSegmentLength: 0,
        maxSegmentLength: 0,
        avgSegmentLength: 0
      }
    };
  }

  if (closed && distance(points[0], points[points.length - 1]) > 1e-6) {
    points.push({ ...points[0] });
  }

  return splitToArcLineSegments(points, config);
}
