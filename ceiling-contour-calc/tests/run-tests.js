/*
 * Dependency-free test runner for the ceiling contour calculator core.
 * Run: node tests/run-tests.js
 */
"use strict";

const path = require("path");
const core = require("../assets/ccc-core.js");
const { parseGlc } = require("./glc-parser.js");

let passed = 0;
let failed = 0;
const failures = [];
const reportRows = [];

function assert(condition, message) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  failures.push(message);
}

function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  assert(
    diff <= tolerance,
    `${label}: expected ${expected}, got ${actual}, diff ${diff} > ${tolerance}`
  );
  return diff;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function line(a, b) {
  return core.makeLine({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
}

function arc(a, b, bulge) {
  return core.makeArcFromBulge({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, bulge);
}

function sampleEdges(edges, stepDeg, lineStepMm) {
  const pts = [];
  for (const edge of edges) {
    if (edge.type === "line") {
      const n = Math.max(1, Math.ceil(edge.length / (lineStepMm || 30)));
      for (let i = 0; i <= n; i += 1) {
        pts.push({
          x: edge.start.x + ((edge.end.x - edge.start.x) * i) / n,
          y: edge.start.y + ((edge.end.y - edge.start.y) * i) / n
        });
      }
    } else {
      pts.push(...core.sampleEdge(edge, stepDeg || 2));
    }
  }
  return pts;
}

function pointToSegmentDistance(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function pointToEdgeDistance(p, edge) {
  if (edge.type === "line") return pointToSegmentDistance(p, edge.start, edge.end);
  const r = Math.hypot(p.x - edge.center.x, p.y - edge.center.y);
  const a0 = Math.atan2(edge.start.y - edge.center.y, edge.start.x - edge.center.x);
  let da = Math.atan2(p.y - edge.center.y, p.x - edge.center.x) - a0;
  if (edge.sweep >= 0) {
    while (da < 0) da += 2 * Math.PI;
    while (da >= 2 * Math.PI) da -= 2 * Math.PI;
    if (da <= edge.sweep) return Math.abs(r - edge.radius);
  } else {
    while (da > 0) da -= 2 * Math.PI;
    while (da <= -2 * Math.PI) da += 2 * Math.PI;
    if (da >= edge.sweep) return Math.abs(r - edge.radius);
  }
  return Math.min(
    Math.hypot(p.x - edge.start.x, p.y - edge.start.y),
    Math.hypot(p.x - edge.end.x, p.y - edge.end.y)
  );
}

function maxDeviation(edgesA, edgesB) {
  const a = sampleEdges(edgesA, 1.5, 20);
  const b = sampleEdges(edgesB, 1.5, 20);
  let max = 0;
  for (const p of a) {
    let min = Infinity;
    for (const edge of edgesB) {
      const d = pointToEdgeDistance(p, edge);
      if (d < min) min = d;
    }
    if (min > max) max = min;
  }
  for (const p of b) {
    let min = Infinity;
    for (const edge of edgesA) {
      const d = pointToEdgeDistance(p, edge);
      if (d < min) min = d;
    }
    if (min > max) max = min;
  }
  return max;
}

/*
 * Build measurement rows from an exact closed edge list.
 * corners: set of vertex indices that are sharp (edge index).
 */
function measurementFromEdges(edges, corners, options) {
  const opts = options || {};
  const ab = opts.ab;
  const cPoint = opts.cPoint || null;
  const rows = [];
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    rows.push({
      x: edge.start.x,
      y: edge.start.y,
      straight: edge.type === "line",
      corner: !!corners[i]
    });
    if (edge.type === "arc") {
      const s1 = core.sampleEdge(edge, 4);
      // sampleEdge uses a variable count; take points at 1/3 and 2/3 of the arc.
      const count = s1.length - 1;
      rows.push({
        x: s1[Math.round(count / 3)].x,
        y: s1[Math.round(count / 3)].y,
        straight: false,
        corner: false
      });
      rows.push({
        x: s1[Math.round((2 * count) / 3)].x,
        y: s1[Math.round((2 * count) / 3)].y,
        straight: false,
        corner: false
      });
    }
  }
  return rows;
}

function rowsWithNoise(points, ab, cPoint, sigma, seed, chordNoise) {
  const rng = mulberry32(seed);
  return points.map((p) => {
    const dA = Math.hypot(p.x, p.y);
    const dB = Math.hypot(p.x - ab, p.y);
    const dC = cPoint ? Math.hypot(p.x - cPoint.x, p.y - cPoint.y) : null;
    return {
      dA: dA + (sigma ? gaussian(rng) * sigma : 0),
      dB: dB + (sigma ? gaussian(rng) * sigma : 0),
      dC: dC === null ? "" : dC + (sigma && chordNoise ? gaussian(rng) * sigma : 0),
      corner: p.corner,
      straight: p.straight,
      chord: ""
    };
  });
}

function maxSigmaPos(result) {
  let m = 0;
  for (const row of result.rows) {
    if (row && isFinite(row.sigmaPos)) m = Math.max(m, row.sigmaPos);
  }
  return m;
}

/* ---------------------------------------------------------------------- */
/* Reference cases                                                        */
/* ---------------------------------------------------------------------- */

function rectangleCase() {
  const pts = [
    [600, -700],
    [3800, -700],
    [3800, -3400],
    [600, -3400]
  ];
  const edges = pts.map((p, i) => line(p, pts[(i + 1) % pts.length]));
  return {
    name: "rectangle",
    ab: 4500,
    cPoint: { x: 4500, y: -3900 },
    edges,
    corners: { 0: true, 1: true, 2: true, 3: true },
    cleanPrimitives: true,
    referenceEdgeCount: 4
  };
}

function pentagonCase() {
  const pts = [
    [700, -600],
    [3600, -800],
    [4200, -2200],
    [2600, -3600],
    [800, -3000]
  ];
  const edges = pts.map((p, i) => line(p, pts[(i + 1) % pts.length]));
  return {
    name: "convex_pentagon",
    ab: 4800,
    cPoint: { x: 4800, y: -4100 },
    edges,
    corners: { 0: true, 1: true, 2: true, 3: true, 4: true },
    cleanPrimitives: true,
    referenceEdgeCount: 5
  };
}

function lShapeCase() {
  const pts = [
    [600, -600],
    [3000, -600],
    [3000, -1800],
    [1800, -1800],
    [1800, -3000],
    [600, -3000]
  ];
  const edges = pts.map((p, i) => line(p, pts[(i + 1) % pts.length]));
  return {
    name: "l_shape",
    ab: 4000,
    cPoint: { x: 4000, y: -3600 },
    edges,
    corners: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true },
    cleanPrimitives: true,
    referenceEdgeCount: 6
  };
}

function roundedRectangleCase() {
  const x0 = 600;
  const x1 = 3600;
  const yTop = -700;
  const yBot = -2700;
  const r = 500;
  const edges = [
    line([x0, yBot + r], [x0, yTop - r]),
    core.makeArcFromSweep({ x: x0, y: yTop - r }, { x: x0 + r, y: yTop }, -Math.PI / 2),
    line([x0 + r, yTop], [x1 - r, yTop]),
    core.makeArcFromSweep({ x: x1 - r, y: yTop }, { x: x1, y: yTop - r }, -Math.PI / 2),
    line([x1, yTop - r], [x1, yBot + r]),
    core.makeArcFromSweep({ x: x1, y: yBot + r }, { x: x1 - r, y: yBot }, -Math.PI / 2),
    line([x1 - r, yBot], [x0 + r, yBot]),
    core.makeArcFromSweep({ x: x0 + r, y: yBot }, { x: x0, y: yBot + r }, -Math.PI / 2)
  ];
  return {
    name: "rounded_rectangle",
    ab: 4500,
    cPoint: { x: 4500, y: -3600 },
    edges,
    corners: {},
    cleanPrimitives: true,
    referenceEdgeCount: 8
  };
}

function lunkaCase() {
  const center = { x: 2000, y: -500 };
  const r = 1400;
  const p0 = { x: center.x - r, y: center.y };
  const p2 = { x: center.x + r, y: center.y };
  const arcEdge = arc([p0.x, p0.y], [p2.x, p2.y], 1); // semicircle below
  const lineEdge = line([p2.x, p2.y], [p0.x, p0.y]);
  return {
    name: "lunka_arc_between_corners",
    ab: 4500,
    cPoint: { x: 4500, y: -3000 },
    edges: [arcEdge, lineEdge],
    corners: { 0: true, 1: true },
    cleanPrimitives: true,
    referenceEdgeCount: 2
  };
}

function beanCase() {
  const edges = [
    line([600, -700], [1800, -450]),
    arc([1800, -450], [3200, -500], 0.18),
    arc([3200, -500], [4100, -1500], -0.25),
    line([4100, -1500], [3600, -2900]),
    arc([3600, -2900], [2200, -3300], 0.3),
    arc([2200, -3300], [1000, -2600], 0.25),
    line([1000, -2600], [600, -700])
  ];
  return {
    name: "bean_with_corners",
    ab: 5000,
    cPoint: { x: 5000, y: -4000 },
    edges,
    corners: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
    cleanPrimitives: true,
    referenceEdgeCount: 7
  };
}

function circleCase() {
  const cx = 2600;
  const cy = -1900;
  const r = 1050;
  const n = 24;
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const a = (2 * Math.PI * i) / n;
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), corner: false, straight: false });
  }
  const right = { x: cx + r, y: cy };
  const left = { x: cx - r, y: cy };
  const edges = [
    core.makeArcFromBulge(right, left, 1),
    core.makeArcFromBulge(left, right, 1)
  ];
  return {
    name: "full_circle",
    ab: 5200,
    cPoint: { x: 5200, y: -4200 },
    points,
    edges,
    cleanPrimitives: true,
    referenceEdgeCount: 2,
    referenceArea: Math.PI * r * r,
    referencePerimeter: 2 * Math.PI * r
  };
}

function ellipseCase() {
  const cx = 2600;
  const cy = -2000;
  const a = 1500;
  const b = 850;
  const n = 36;
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const t = (2 * Math.PI * i) / n;
    points.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t), corner: false, straight: false });
  }
  const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
  const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  return {
    name: "ellipse",
    ab: 5500,
    cPoint: { x: 5500, y: -4200 },
    points,
    edges: null,
    cleanPrimitives: false,
    referenceEdgeCount: null,
    referenceArea: Math.PI * a * b,
    referencePerimeter: perimeter,
    areaTolerance: 0.01
  };
}

function referenceMetrics(testCase, rows) {
  if (testCase.referenceArea !== undefined) {
    return { area: testCase.referenceArea, perimeter: testCase.referencePerimeter };
  }
  const edges = testCase.edges;
  return {
    area: Math.abs(core.edgesSignedArea(edges)),
    perimeter: core.edgesPerimeter(edges)
  };
}

function measurementPointsFor(testCase) {
  if (testCase.points) return testCase.points;
  return measurementFromEdges(testCase.edges, testCase.corners, { ab: testCase.ab });
}

function runGeometryCase(testCase, sigma, seed) {
  const points = measurementPointsFor(testCase);
  const rows = rowsWithNoise(points, testCase.ab, testCase.cPoint, sigma, seed, true);
  const result = core.buildContour({
    ab: testCase.ab,
    ac: testCase.cPoint ? Math.hypot(testCase.cPoint.x, testCase.cPoint.y) : null,
    bc: testCase.cPoint ? Math.hypot(testCase.cPoint.x - testCase.ab, testCase.cPoint.y) : null,
    points: rows,
    sigma,
    tol: 3,
    mirror: false
  });

  assert(result.ok, `${testCase.name} sigma=${sigma}: build failed: ${JSON.stringify(result.errors)}`);
  if (!result.ok) return null;

  const ref = referenceMetrics(testCase, rows);
  const areaRel = Math.abs(result.stats.areaMm2 - ref.area) / ref.area;
  const perimeterRel = Math.abs(result.stats.perimeterMm - ref.perimeter) / ref.perimeter;
  const areaTol = testCase.areaTolerance || 0.005;
  assert(
    areaRel <= areaTol,
    `${testCase.name} sigma=${sigma}: area relative error ${(areaRel * 100).toFixed(3)}% > ${(areaTol * 100).toFixed(1)}%`
  );
  assert(
    perimeterRel <= 0.005,
    `${testCase.name} sigma=${sigma}: perimeter relative error ${(perimeterRel * 100).toFixed(3)}% > 0.5%`
  );

  if (testCase.cleanPrimitives) {
    assert(
      result.stats.edgeCountAfter <= testCase.referenceEdgeCount + 2,
      `${testCase.name} sigma=${sigma}: ${result.stats.edgeCountAfter} edges, reference ${testCase.referenceEdgeCount} + 2`
    );
  }

  let maxDev = null;
  let devLimit = null;
  if (testCase.edges) {
    maxDev = maxDeviation(result.edges, testCase.edges);
    devLimit = Math.max(3 * maxSigmaPos(result), 1);
    assert(
      maxDev <= devLimit,
      `${testCase.name} sigma=${sigma}: max contour deviation ${maxDev.toFixed(2)} mm > ${devLimit.toFixed(2)} mm`
    );
  }

  return {
    name: testCase.name,
    sigma,
    areaRel,
    perimeterRel,
    edgesBefore: result.stats.edgeCountBefore,
    edgesAfter: result.stats.edgeCountAfter,
    arcs: result.stats.arcCount,
    maxDev,
    devLimit,
    result,
    ref
  };
}

/* ---------------------------------------------------------------------- */
/* Tests                                                                  */
/* ---------------------------------------------------------------------- */

function testGeometry() {
  console.log("\n== Geometry cases ==");
  const cases = [
    rectangleCase(),
    pentagonCase(),
    lShapeCase(),
    roundedRectangleCase(),
    lunkaCase(),
    beanCase(),
    circleCase(),
    ellipseCase()
  ];
  const sigmas = [0, 2, 3];
  let seed = 1000;
  for (const testCase of cases) {
    for (const sigma of sigmas) {
      seed += 17;
      const row = runGeometryCase(testCase, sigma, seed);
      if (!row) continue;
      reportRows.push(row);
      console.log(
        [
          row.name.padEnd(24),
          ("σ=" + sigma + "мм").padEnd(7),
          "S err " + (row.areaRel * 100).toFixed(3) + "%",
          "P err " + (row.perimeterRel * 100).toFixed(3) + "%",
          "edges " + row.edgesBefore + "→" + row.edgesAfter,
          "arcs " + row.arcs,
          row.maxDev === null ? "" : "dev " + row.maxDev.toFixed(2) + "/" + row.devLimit.toFixed(2) + "мм"
        ].join("  ")
      );
    }
  }
}

function testBadCases() {
  console.log("\n== Bad / warning cases ==");
  const ab = 4500;

  // Points close to AB should produce a warning about adding C.
  const nearRows = [
    { dA: 1000, dB: 3500, corner: true },
    { dA: 2000, dB: 2500, corner: true },
    { dA: 3000, dB: 1500, corner: true }
  ].map((r) => ({ ...r, dA: Math.hypot(r.dA, -3), dB: Math.hypot(r.dB, -3) }));
  const nearResult = core.buildContour({ ab, points: nearRows, sigma: 3, tol: 3 });
  assert(nearResult.ok, "near-line case should still build");
  const nearWarn = nearResult.warnings.some((w) => /AB/.test(w.message));
  assert(nearWarn, "near-line case should warn about AB / C");
  console.log("near-line warnings:", nearResult.warnings.map((w) => w.message).join(" | "));

  // Deliberately wrong measurement must be highlighted on the affected row.
  const base = rectangleCase();
  const points = measurementPointsFor(base);
  const rows = rowsWithNoise(points, base.ab, base.cPoint, 0, 0, false);
  rows[2].dA = rows[2].dA + 350;
  const badResult = core.buildContour({
    ab: base.ab,
    ac: Math.hypot(base.cPoint.x, base.cPoint.y),
    bc: Math.hypot(base.cPoint.x - base.ab, base.cPoint.y),
    points: rows,
    sigma: 3,
    tol: 3
  });
  assert(badResult.ok, "wrong measurement should still produce a contour for inspection");
  const badRow = badResult.rows[2];
  assert(badRow && badRow.status === "error", "wrong measurement row should have error status");
  const badWarning = badResult.warnings.some(
    (w) => w.row === 3 || w.row2 === 3 || w.code === "point_error"
  );
  assert(badWarning, "wrong measurement must be reported with row number");
  console.log("wrong-measurement row status:", badRow && badRow.status, "warnings:", badResult.warnings.length);

  // Self-intersecting order.
  const bowtie = [
    [700, -700],
    [3800, -3200],
    [3800, -700],
    [700, -3200]
  ].map(([x, y]) => ({ dA: Math.hypot(x, y), dB: Math.hypot(x - ab, y), corner: true }));
  const bowResult = core.buildContour({ ab, points: bowtie, sigma: 3, tol: 3 });
  assert(bowResult.ok, "self-intersecting contour should still build");
  assert(
    bowResult.warnings.some((w) => w.code === "self_intersection"),
    "self-intersecting contour should warn"
  );
  console.log("self-intersection warning:", bowResult.warnings.some((w) => w.code === "self_intersection"));

  // Impossible triangle.
  const impossible = core.buildContour({
    ab,
    points: [
      { dA: 10, dB: 10 },
      { dA: 20, dB: 20 },
      { dA: 30, dB: 30 }
    ],
    sigma: 3,
    tol: 3
  });
  assert(!impossible.ok, "impossible triangle must block construction");
  assert(impossible.errors.length >= 3, "impossible triangle should report each bad row");
  console.log("impossible triangle errors:", impossible.errors.length);

  // Fewer than three points.
  const few = core.buildContour({
    ab,
    points: [
      { dA: 1000, dB: 3800 },
      { dA: 2000, dB: 2800 }
    ],
    sigma: 3,
    tol: 3
  });
  assert(!few.ok, "fewer than 3 points must block construction");
  assert(few.errors.some((e) => e.code === "few_points"), "few points error code");

  // Missing mandatory distance in a row.
  const missing = core.buildContour({
    ab,
    points: [
      { dA: 1000, dB: 3800, corner: true },
      { dA: 2000, corner: true },
      { dA: 3000, dB: 1800, corner: true }
    ],
    sigma: 3,
    tol: 3
  });
  assert(!missing.ok, "missing dB must block construction");
  assert(
    missing.errors.some((e) => e.code === "row_missing" && e.row === 2),
    "missing dB must name row 2"
  );

  // AB is missing -> exactly one AB error, not one per row.
  const noAb = core.buildContour({
    ab: 0,
    points: [
      { dA: 1000, dB: 3800 },
      { dA: 2000, dB: 2800 },
      { dA: 3000, dB: 1800 }
    ],
    sigma: 3,
    tol: 3
  });
  assert(!noAb.ok, "missing AB must block construction");
  assert(
    noAb.errors.length === 1 && noAb.errors[0].code === "ab",
    "missing AB should be reported once, got " + JSON.stringify(noAb.errors)
  );

  // Duplicate consecutive points.
  const duplicate = core.buildContour({
    ab,
    points: [
      { dA: 1000, dB: 3800, corner: true },
      { dA: 1000.5, dB: 3799.5, corner: true },
      { dA: 3000, dB: 1800, corner: true }
    ],
    sigma: 3,
    tol: 3
  });
  assert(
    duplicate.warnings.some((w) => w.code === "duplicate"),
    "near-duplicate points should be reported"
  );
  console.log("few points / missing dB / missing AB / duplicate checks: OK");
}

function testMirror() {
  console.log("\n== Mirror ==");
  const ab = 4500;
  const rows = [
    [600, -700],
    [3800, -700],
    [3800, -3400],
    [600, -3400]
  ].map(([x, y]) => ({ dA: Math.hypot(x, y), dB: Math.hypot(x - ab, y), corner: true }));
  const normal = core.buildContour({ ab, points: rows, sigma: 3, tol: 3, mirror: false });
  const mirrored = core.buildContour({ ab, points: rows, sigma: 3, tol: 3, mirror: true });
  assert(normal.ok && mirrored.ok, "mirror build should succeed");
  let allFlipped = true;
  for (let i = 0; i < normal.points.length; i += 1) {
    if (Math.abs(normal.points[i].x - mirrored.points[i].x) > 1e-9) allFlipped = false;
    if (Math.abs(normal.points[i].y + mirrored.points[i].y) > 1e-9) allFlipped = false;
  }
  assert(allFlipped, "mirror must flip Y only and keep X");
  near(normal.stats.areaM2, mirrored.stats.areaM2, 1e-9, "mirror area");
  near(normal.stats.perimeterM, mirrored.stats.perimeterM, 1e-9, "mirror perimeter");
  const normalGlc = core.buildGlc(normal, { roomUid: "X", zoneUid: "Y" });
  const mirroredGlc = core.buildGlc(mirrored, { roomUid: "X", zoneUid: "Y" });
  assert(normalGlc !== mirroredGlc, "mirror must change exported GLC coordinates");
  console.log("mirror Y-only: OK");
}

function testGlc(geometryRows) {
  console.log("\n== GLC export / parser ==");
  for (const row of geometryRows.filter((r) => r.sigma === 3)) {
    const text = core.buildGlc(row.result, { roomUid: "UID-TEST", zoneUid: "ZONE-TEST" });
    assert(text.indexOf("\r\n") >= 0, `${row.name}: GLC must use CRLF`);
    assert(!/[^\r]\n/.test(text.replace(/\r\n/g, "")), `${row.name}: GLC must not contain lone LF`);
    const parsed = parseGlc(text);
    assert(parsed.ok, `${row.name}: GLC parser failed: ${parsed.errors.join("; ")}`);
    assert(parsed.rooms === 1, `${row.name}: exactly one room expected`);
    assert(parsed.edges.length === row.result.edges.length, `${row.name}: edge count`);
    assert(
      parsed.zoneLineCount === parsed.npLineCount,
      `${row.name}: zone lines should mirror NPLine count`
    );
    const maxArcError = parsed.arcChecks.reduce((m, c) => Math.max(m, c.error), 0);
    assert(maxArcError <= 0.02, `${row.name}: ArcPoint max error ${maxArcError} > 0.02 mm`);
    assert(parsed.areaMm2 > 0 && parsed.perimeterMm > 0, `${row.name}: positive metrics`);
    console.log(
      `${row.name.padEnd(24)} GLC blocks OK, edges ${parsed.npLineCount}, ` +
        `ArcPoint≤${maxArcError.toFixed(6)}мм, A=${parsed.gvals.A}, D=${parsed.gvals.D}, J=${parsed.gvals.J}`
    );
  }

  // cp1251 bytes round-trip and byte-level check.
  const bytes = core.encodeWindows1251("Приклад Ґанок Європа Їжак");
  assert(bytes instanceof Uint8Array, "cp1251 encoder must return Uint8Array");
  const decoded = new TextDecoder("windows-1251").decode(bytes);
  assert(decoded === "Приклад Ґанок Європа Їжак", "cp1251 round-trip failed: " + decoded);
  const glcBytes = core.buildGlcBytes(geometryRows[0].result, { roomUid: "U", zoneUid: "Z" });
  assert(glcBytes[0] === 0x52 && glcBytes[1] === 0x4f, "GLC bytes should start with RO");
  console.log("windows-1251 encoding: OK");
}

async function testConverterComparison(geometryRows) {
  console.log("\n== Comparison with dxf-glc-converter ==");
  const converter = await import(
    require("url").pathToFileURL(
      path.resolve(__dirname, "../../dxf-glc-converter/assets/js/glcBuilder.js")
    ).href
  );
  const names = [
    "rectangle",
    "rounded_rectangle",
    "lunka_arc_between_corners",
    "bean_with_corners",
    "full_circle"
  ];
  let compared = 0;
  for (const name of names) {
    const source = geometryRows.find((r) => r.name === name && r.sigma === 0);
    if (!source) {
      console.log(`  ${name}: reference case not found, skipped`);
      continue;
    }
    const converterSegments = source.result.edges.map((edge) => {
      if (edge.type === "line") {
        return { type: "line", start: edge.start, end: edge.end };
      }
      return {
        type: "arc",
        start: edge.start,
        end: edge.end,
        center: edge.center,
        radius: edge.radius,
        sweepDeg: (Math.abs(edge.sweep) * 180) / Math.PI,
        clockwise: edge.sweep < 0
      };
    });
    const converterGlc = converter.buildGlc([{ segments: converterSegments }]);
    const ourGlc = core.buildGlc(source.result, { roomUid: "UID-TEST", zoneUid: "ZONE-TEST" });
    const normalize = (text) =>
      text
        .replace(/^UID1 .*$/m, "UID1 NORMALIZED")
        .replace(/^ZoneGUI1 .*$/m, "ZoneGUI1 NORMALIZED");
    const a = normalize(converterGlc);
    const b = normalize(ourGlc);
    compared++;
    if (a === b) {
      assert(true, `converter comparison: ${name}`);
      console.log(`  ${name.padEnd(24)} byte-identical to dxf-glc-converter (UUIDs normalized)`);
      continue;
    }
    const al = a.split("\r\n");
    const bl = b.split("\r\n");
    const diffs = [];
    const max = Math.max(al.length, bl.length);
    for (let i = 0; i < max; i += 1) {
      if (al[i] !== bl[i]) diffs.push(`line ${i + 1}: converter="${al[i]}" ours="${bl[i]}"`);
    }
    assert(false, `${name}: GLC differs from converter: ` + diffs.slice(0, 8).join(" | "));
    console.log(`  ${name}: differences:`);
    console.log(diffs.slice(0, 12).join("\n"));
  }
  console.log(`Compared ${compared} geometry cases with the converter output.`);
}

function testCsv() {
  console.log("\n== CSV import / export ==");
  const semicolon = [
    "unit;cm",
    "AB;450",
    "AC;500",
    "BC;420",
    "n;dA;dB;dC;кут;пряма;хорда",
    "1;120,5;400,25;300;1;1;280,5",
    "2;210;290;100;0;0;",
    "3;360;220;200;1;0;"
  ].join("\r\n");
  const parsedSemi = core.parseCsvText(semicolon);
  assert(parsedSemi.errors.length === 0, "semicolon CSV errors: " + parsedSemi.errors.map((e) => e.message).join("; "));
  assert(parsedSemi.unit === "cm", "semicolon CSV unit");
  near(parsedSemi.ab, 450, 1e-9, "semicolon CSV AB");
  assert(parsedSemi.rows.length === 3, "semicolon CSV rows");
  near(parsedSemi.rows[0].dA, 120.5, 1e-9, "decimal comma dA");
  assert(parsedSemi.rows[0].corner === true, "corner flag");
  assert(parsedSemi.rows[0].straight === true, "straight flag");
  near(parsedSemi.rows[0].chord, 280.5, 1e-9, "chord decimal comma");

  const comma = [
    "unit,cm",
    "AB,450",
    "n,dA,dB",
    "1,120,5,130,5",
    "2,200,5,180,5",
    "3,100,5,250,5"
  ].join("\n");
  const parsedComma = core.parseCsvText(comma);
  assert(parsedComma.errors.length === 0, "comma CSV errors: " + parsedComma.errors.map((e) => e.message).join("; "));
  assert(parsedComma.delimiter === ",", "comma delimiter detection");
  assert(parsedComma.rows.length === 3, "comma CSV rows");
  near(parsedComma.rows[0].dA, 120.5, 1e-9, "comma CSV dA");
  near(parsedComma.rows[0].dB, 130.5, 1e-9, "comma CSV dB");

  const tsv = "unit\tcm\nAB\t450\n1\t120\t130\n2\t200\t180\n3\t100\t250\n";
  const parsedTsv = core.parseCsvText(tsv);
  assert(parsedTsv.errors.length === 0, "TSV errors");
  assert(parsedTsv.rows.length === 3, "TSV rows");

  // windows-1251 bytes.
  const cpText = "unit;cm\r\nAB;450\r\nname;Кімната Їжак\r\n1;120;130\r\n2;200;180\r\n3;100;250\r\n";
  const cpBytes = core.encodeWindows1251(cpText);
  const cpDecoded = core.decodeBytes(cpBytes);
  assert(cpDecoded === cpText, "windows-1251 CSV bytes decode");
  const parsedCp = core.parseCsvText(cpBytes);
  assert(parsedCp.errors.length === 0, "cp1251 CSV parse errors");
  assert(parsedCp.objectName === "Кімната Їжак", "cp1251 object name: " + parsedCp.objectName);

  // Export -> import round-trip.
  const state = {
    unit: "cm",
    ab: 450,
    ac: "",
    bc: "",
    objectName: "Кімната 1",
    rows: [
      { dA: "120,5", dB: "130,25", dC: "", corner: true, straight: false, chord: "" },
      { dA: "200", dB: "180", dC: "150", corner: false, straight: true, chord: "90,5" },
      { dA: "100", dB: "250", dC: "", corner: false, straight: false, chord: "" }
    ]
  };
  const exported = core.formatCsv(state);
  const parsedBack = core.parseCsvText(exported);
  assert(parsedBack.errors.length === 0, "export/import errors: " + parsedBack.errors.map((e) => e.message).join("; "));
  assert(parsedBack.rows.length === 3, "export/import row count");
  near(parsedBack.rows[0].dA, 120.5, 1e-9, "roundtrip dA");
  assert(parsedBack.rows[0].corner === true && parsedBack.rows[1].straight === true, "roundtrip flags");
  assert(parsedBack.objectName === "Кімната 1", "roundtrip name");

  const template = core.buildCsvTemplate();
  const parsedTemplate = core.parseCsvText(template);
  assert(parsedTemplate.errors.length === 0, "template must parse: " + parsedTemplate.errors.map((e) => e.message).join("; "));
  assert(parsedTemplate.rows.length === 4, "template has 4 example rows");
  console.log("CSV semicolon/comma/TSV/cp1251/roundtrip/template: OK");
}

function testDxf(geometryRows) {
  console.log("\n== DXF export ==");
  const source = geometryRows.find((r) => r.name === "rounded_rectangle" && r.sigma === 0);
  const dxf = core.buildDxf(source.result);
  const lines = dxf.split("\r\n");
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push([lines[i], lines[i + 1]]);
  }
  const vertices = [];
  let current = null;
  for (const [code, value] of pairs) {
    if (code === "0" && value === "VERTEX") {
      current = { x: null, y: null, bulge: 0 };
      vertices.push(current);
    } else if (current && code === "10") current.x = Number(value);
    else if (current && code === "20") current.y = Number(value);
    else if (current && code === "42") current.bulge = Number(value);
    else if (code === "0" && value === "SEQEND") current = null;
  }
  assert(vertices.length === source.result.edges.length, "DXF vertex count");
  let bulgeMatches = true;
  source.result.edges.forEach((edge, i) => {
    const expected = edge.type === "arc" ? edge.bulge : 0;
    if (Math.abs(vertices[i].bulge - expected) > 1e-9) bulgeMatches = false;
  });
  assert(bulgeMatches, "DXF bulge values must match edge bulges");
  assert(dxf.indexOf("ENDSEC") >= 0 && dxf.trim().endsWith("EOF"), "DXF R12 footer");
  console.log(`DXF: ${vertices.length} vertices, bulges OK, R12 structure OK`);
}

function testFilename() {
  console.log("\n== Filename slug ==");
  assert(core.slugFilename("Стельова амёба №1") === "stelova-ameba-1", "slug transliteration: " + core.slugFilename("Стельова амёба №1"));
  assert(core.slugFilename("") === "kontur-steli", "slug fallback");
  assert(!/[^a-z0-9-]/.test(core.slugFilename("A/B:C*D?")), "slug safe chars");
  console.log("filename transliteration: OK");
}

function testPerformance() {
  console.log("\n== Performance ==");
  const ab = 6000;
  const cx = 3000;
  const cy = -2400;
  const r = 1400;
  const n = 300;
  const rng = mulberry32(42);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const a = (2 * Math.PI * i) / n;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    rows.push({
      dA: Math.hypot(x, y) + gaussian(rng) * 3,
      dB: Math.hypot(x - ab, y) + gaussian(rng) * 3,
      corner: false,
      straight: false
    });
  }
  const t0 = process.hrtime.bigint();
  const result = core.buildContour({ ab, points: rows, sigma: 3, tol: 3 });
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  assert(result.ok, "300-point build should succeed");
  assert(ms < 100, `300-point build took ${ms.toFixed(1)} ms > 100 ms`);
  console.log(`300 points: ${ms.toFixed(1)} ms, edges ${result.stats.edgeCountBefore}→${result.stats.edgeCountAfter}`);
}

function testHtmlEscaping() {
  console.log("\n== SVG escaping ==");
  const testCase = rectangleCase();
  const rows = rowsWithNoise(measurementPointsFor(testCase), testCase.ab, testCase.cPoint, 0, 1, false);
  const result = core.buildContour({ ab: testCase.ab, points: rows, sigma: 3, tol: 3 });
  const svg = core.buildSvg(result, { title: '<script>alert("x")</script>' });
  assert(svg.indexOf("<script>") < 0, "SVG title must be escaped");
  assert(svg.indexOf("&lt;script&gt;") >= 0, "SVG title escaped form present");
  console.log("SVG XML escaping: OK");
}

(async function main() {
  console.log("Ceiling contour calculator core tests");
  testGeometry();
  testBadCases();
  testMirror();
  const validRows = reportRows.filter((r) => r.result && r.result.ok);
  testGlc(validRows);
  testCsv();
  testDxf(validRows);
  testFilename();
  testHtmlEscaping();
  testPerformance();
  await testConverterComparison(validRows);

  console.log("\n==================================================");
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(" - " + f));
    process.exitCode = 1;
  } else {
    console.log("All tests passed.");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
