"use strict";

/*
 * Core tests for ceiling-segment-calc.
 * Run: node tests/run-tests.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const core = require("../assets/csc-core.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (error) {
    failed += 1;
    console.error("FAIL  " + name);
    console.error("      " + (error && error.stack ? error.stack.split("\n")[0] : error));
  }
}

function section(name) {
  console.log("\n" + name);
}

function approx(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    (message || "approx") + ": " + actual + " vs " + expected + " (tol " + tolerance + ")"
  );
}

function pointError(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function maxPointError(points, expected) {
  let max = 0;
  for (let i = 0; i < expected.length; i += 1) {
    max = Math.max(max, pointError(points[i], expected[i]));
  }
  return max;
}

/* ------------------------------------------------------------------ */

section("Utilities");

test("parseNumber handles dot and comma decimals", () => {
  assert.strictEqual(core.parseNumber("12.5"), 12.5);
  assert.strictEqual(core.parseNumber("12,5"), 12.5);
  assert.strictEqual(core.parseNumber(" 1 234 "), 1234);
  assert.strictEqual(core.parseNumber("abc"), null);
  assert.strictEqual(core.parseNumber(""), null);
});

test("units convert both ways", () => {
  assert.strictEqual(core.toMm("12.5", "cm"), 125);
  assert.strictEqual(core.toMm("1.25", "m"), 1250);
  approx(core.fromMm(1250, "m"), 1.25, 1e-9);
});

test("slugFilename transliterates Cyrillic", () => {
  assert.strictEqual(core.slugFilename("Вітальня №3", "x"), "vitalnia-3");
});

/* ------------------------------------------------------------------ */

section("Primitives");

test("circleCircle returns two intersections", () => {
  const res = core.circleCircle({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
  assert.strictEqual(res.points.length, 2);
  assert.strictEqual(res.clamped, false);
  res.points.forEach((p) => approx(core.dist(p, { x: 0, y: 0 }), 5, 1e-9));
});

test("circleCircle clamps when circles do not intersect", () => {
  const res = core.circleCircle({ x: 0, y: 0 }, 5, { x: 20, y: 0 }, 5);
  assert.strictEqual(res.clamped, true);
  assert.strictEqual(res.points.length, 2);
  approx(pointError(res.points[0], res.points[1]), 0, 1e-9);
});

test("makeArcFromThreePoints reconstructs a semicircle", () => {
  const arc = core.makeArcFromThreePoints(
    { x: 0, y: 0 },
    { x: 50, y: 50 },
    { x: 100, y: 0 }
  );
  assert.strictEqual(arc.type, "arc");
  approx(arc.radius, 50, 1e-6);
  approx(Math.abs(arc.sweep), Math.PI, 1e-6);
  approx(arc.length, Math.PI * 50, 1e-6);
});

/* ------------------------------------------------------------------ */

section("Chain solver");

const TRUE_START = { x: 6000, y: 500 };
const TRUE_END = { x: 6000, y: 3500 };
const TRUE_ORIGIN = { x: 0, y: 0 };
const TRUE_COUNT = 8;

function trueChainPoints(count) {
  const out = [TRUE_START];
  for (let k = 1; k <= count; k += 1) {
    const t = k / count;
    out.push({
      x: 6000 - 500 * Math.sin(Math.PI * t),
      y: 500 + 3000 * t
    });
  }
  return out;
}

function rowsFromPoints(points, origin) {
  const rows = [];
  for (let i = 1; i < points.length; i += 1) {
    rows.push({
      d: core.dist(points[i], origin),
      s: core.dist(points[i], points[i - 1])
    });
  }
  return rows;
}

test("noiseless chain is recovered within 0.01 mm", () => {
  const truth = trueChainPoints(TRUE_COUNT);
  const rows = rowsFromPoints(truth, TRUE_ORIGIN);
  const solved = core.solveChain({
    start: TRUE_START,
    end: TRUE_END,
    origin: TRUE_ORIGIN,
    rows,
    sigma: 2
  });
  assert.ok(solved.ok, JSON.stringify(solved.errors));
  assert.strictEqual(solved.chain.length, TRUE_COUNT + 1);
  const maxErr = maxPointError(solved.chain, truth);
  assert.ok(maxErr < 0.01, "max point error " + maxErr);
  assert.ok(solved.residuals.maxAbsD < 0.01);
  assert.ok(solved.residuals.maxAbsS < 0.01);
});

test("noisy chain stays close and keeps fixed endpoints", () => {
  const demo = core.buildDemo();
  const scale = 1;
  const rows = demo.rows.map((row) => ({ d: row.d / scale, s: row.s / scale }));
  const solved = core.solveChain({
    start: { x: demo.corners[2].x, y: demo.corners[2].y },
    end: { x: demo.corners[3].x, y: demo.corners[3].y },
    origin: { x: demo.corners[0].x, y: demo.corners[0].y },
    rows,
    sigma: 3
  });
  assert.ok(solved.ok, JSON.stringify(solved.errors));
  approx(pointError(solved.chain[0], demo.corners[2]), 0, 1e-9, "start fixed");
  approx(pointError(solved.chain[solved.chain.length - 1], demo.corners[3]), 0, 1e-9, "end fixed");
  const truth = trueChainPoints(TRUE_COUNT);
  const maxErr = maxPointError(solved.chain, truth);
  assert.ok(maxErr < 20, "max point error " + maxErr);
  assert.ok(solved.residuals.maxAbsD < 15, "max radial residual " + solved.residuals.maxAbsD);
  assert.ok(solved.residuals.maxAbsS < 15, "max segment residual " + solved.residuals.maxAbsS);
  assert.ok(solved.rows.every((row) => row.status !== "error"), "no error rows");
});

test("solver rejects incomplete input", () => {
  const one = core.solveChain({
    start: TRUE_START,
    end: TRUE_END,
    origin: TRUE_ORIGIN,
    rows: [{ d: 5000, s: 400 }],
    sigma: 3
  });
  assert.strictEqual(one.ok, false);
  const missing = core.solveChain({
    start: TRUE_START,
    end: TRUE_END,
    origin: TRUE_ORIGIN,
    rows: [{ d: 5000, s: "" }, { d: 5000, s: 400 }],
    sigma: 3
  });
  assert.strictEqual(missing.ok, false);
});

test("manual offsets survive and are applied only to intermediate joints", () => {
  const chain = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 }
  ];
  const moved = core.applyOffsets(chain, { 0: { dx: 3, dy: -2 } });
  assert.deepStrictEqual(moved[0], { x: 0, y: 0 });
  assert.deepStrictEqual(moved[1], { x: 13, y: -2 });
  assert.deepStrictEqual(moved[2], { x: 20, y: 0 });
});

/* ------------------------------------------------------------------ */

section("GLC import");

const glcPath = path.resolve(__dirname, "..", "..", "033273.glc");
const glcBytes = fs.readFileSync(glcPath);

test("real .glc imports with corners and arcs", () => {
  const parsed = core.parseGlc(glcBytes);
  assert.ok(parsed.ok, JSON.stringify(parsed.errors));
  assert.strictEqual(parsed.corners.length, 11);
  assert.strictEqual(parsed.edges.length, 11);
  assert.strictEqual(parsed.edges.filter((e) => e.type === "arc").length, 5);
  const maxGap = parsed.edges.reduce((max, edge, idx) => {
    const next = parsed.edges[(idx + 1) % parsed.edges.length];
    return Math.max(max, core.dist(edge.end, next.start));
  }, 0);
  assert.ok(maxGap < 0.01, "contour closed, gap " + maxGap);
});

test("imported ArcPoint matches the file within 0.05 mm", () => {
  const parsed = core.parseGlc(glcBytes);
  const text = core.decodeBytes(glcBytes);
  const rawPoints = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes("ArcPoint ")) {
      const raw = line.replace(/\/\/.*$/, "").trim().slice("ArcPoint ".length);
      rawPoints.push(raw);
    }
  }
  let idx = 0;
  parsed.edges.forEach((edge) => {
    if (edge.type !== "arc") return;
    const coords = rawPoints[idx].split(",");
    const expected = { x: parseFloat(coords[0]), y: parseFloat(coords[1]) };
    approx(pointError(edge.arcPoint, expected), 0, 0.05, "arc " + idx);
    idx += 1;
  });
  assert.strictEqual(idx, 5);
});

test("serialize/deserialize keeps imported geometry", () => {
  const parsed = core.parseGlc(glcBytes);
  parsed.edges.forEach((edge) => {
    const restored = core.deserializeEdge(core.serializeEdge(edge));
    approx(pointError(restored.start, edge.start), 0, 1e-9);
    approx(pointError(restored.end, edge.end), 0, 1e-9);
    if (edge.type === "arc") {
      assert.strictEqual(restored.type, "arc");
      approx(restored.radius, edge.radius, 0.01);
    }
  });
});

/* ------------------------------------------------------------------ */

section("Contour assembly");

function demoContour() {
  const demo = core.buildDemo();
  const edges = demo.edges.map(core.deserializeEdge);
  const rows = demo.rows.map((row) => ({ d: row.d, s: row.s }));
  const solved = core.solveChain({
    start: demo.corners[demo.selection.start],
    end: demo.corners[demo.selection.end],
    origin: demo.corners[demo.origin.corner],
    rows,
    sigma: 3
  });
  assert.ok(solved.ok);
  const contour = core.assembleContour({
    edges,
    startIndex: demo.selection.start,
    endIndex: demo.selection.end,
    chainPoints: solved.chain
  });
  return { demo, edges, solved, contour };
}

test("assembled contour is closed and has statistics", () => {
  const { contour } = demoContour();
  assert.ok(contour.ok, JSON.stringify(contour.errors));
  assert.ok(contour.stats.areaM2 > 20 && contour.stats.areaM2 < 30);
  assert.ok(contour.stats.arcCount >= 1);
  const maxGap = contour.edges.reduce((max, edge, idx) => {
    const next = contour.edges[(idx + 1) % contour.edges.length];
    return Math.max(max, core.dist(edge.end, next.start));
  }, 0);
  assert.ok(maxGap < 0.01, "gap " + maxGap);
});

test("mirror flips Y and keeps statistics", () => {
  const { contour } = demoContour();
  const mirrored = core.mirrorContourY(contour);
  approx(mirrored.stats.areaM2, contour.stats.areaM2, 1e-6);
  approx(mirrored.stats.perimeterM, contour.stats.perimeterM, 1e-9);
  const b = core.edgesBounds(contour.edges);
  const sum = b.minY + b.maxY;
  approx(mirrored.chainPoints[1].y, sum - contour.chainPoints[1].y, 1e-9);
});

test("assembly supports a side that wraps the vertex list", () => {
  const demo = core.buildDemo();
  const edges = demo.edges.map(core.deserializeEdge);
  const n = demo.corners.length;
  const startIndex = 4;
  const endIndex = 1; // wraps: edges 4, 5, 0 are replaced
  const S = demo.corners[startIndex];
  const E = demo.corners[endIndex];
  const chain = [S];
  for (let k = 1; k <= 2; k += 1) {
    chain.push({
      x: S.x + ((E.x - S.x) * k) / 3,
      y: S.y + ((E.y - S.y) * k) / 3
    });
  }
  chain.push(E);
  const contour = core.assembleContour({
    edges,
    startIndex,
    endIndex,
    chainPoints: chain
  });
  assert.ok(contour.ok, JSON.stringify(contour.errors));
  assert.strictEqual(contour.edges.length, n - 3 + 3);
  const maxGap = contour.edges.reduce((max, edge, idx) => {
    const next = contour.edges[(idx + 1) % contour.edges.length];
    return Math.max(max, core.dist(edge.end, next.start));
  }, 0);
  assert.ok(maxGap < 0.01, "gap " + maxGap);
});

/* ------------------------------------------------------------------ */

section("Export");

test("GLC export is parseable and keeps geometry", () => {
  const { contour } = demoContour();
  const bytes = core.buildGlcBytes(contour, { roomName: "Тест кімната" });
  const text = core.decodeBytes(bytes);
  assert.ok(text.startsWith("ROOMBEGIN"));
  assert.ok(text.trim().endsWith("ROOMEND"));
  assert.ok(text.includes("ArcPoint "));
  assert.ok(text.includes("OtrArcHei "));
  assert.ok(text.includes("Тест кімната"));

  // Cyrillic must really be windows-1251: "Т" is 0xD2.
  const tIndex = text.indexOf("Тест");
  assert.ok(bytes[tIndex] === 0xd2, "cp1251 byte for Т");

  const reparsed = core.parseGlc(bytes);
  assert.ok(reparsed.ok, JSON.stringify(reparsed.errors));
  assert.strictEqual(reparsed.edges.length, contour.edges.length);
  const maxGap = reparsed.edges.reduce((max, edge, idx) => {
    const next = reparsed.edges[(idx + 1) % reparsed.edges.length];
    return Math.max(max, core.dist(edge.end, next.start));
  }, 0);
  assert.ok(maxGap < 0.01);
});

test("GLC room name is sanitized to a single line", () => {
  const { contour } = demoContour();
  const text = core.buildGlc(contour, { roomName: "A\nB" });
  assert.ok(text.includes("RoomName A B"));
});

test("GLC GVals match geometry", () => {  const { contour } = demoContour();
  const text = core.buildGlc(contour);
  const gv = {};
  text.split(/\r?\n/).forEach((line) => {
    if (/^[A-Z] /.test(line)) {
      const parts = line.split(" ");
      gv[parts[0]] = parseFloat(parts[1]);
    }
  });
  approx(gv.A, contour.stats.areaM2, 0.001, "area m2");
  approx(gv.D, contour.stats.perimeterM, 0.001, "perimeter m");
  approx(gv.I, contour.stats.arcCount, 0, "arc count");
  approx(gv.J, contour.stats.curvedM, 0.001, "curved m");
});

test("DXF export wraps the polyline", () => {
  const { contour } = demoContour();
  const dxf = core.buildDxf(contour);
  assert.ok(dxf.startsWith("0\r\nSECTION"));
  assert.ok(dxf.includes("POLYLINE"));
  assert.ok(dxf.includes("VERTEX"));
  assert.ok(dxf.trim().endsWith("EOF"));
});

test("SVG export contains a closed path", () => {
  const { contour } = demoContour();
  const svg = core.buildSvg(contour, { title: "Demo" });
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("<path"));
  assert.ok(svg.trim().endsWith("</svg>"));
});

/* ------------------------------------------------------------------ */

section("Performance");

test("solver handles 100 rows quickly", () => {
  const truth = [TRUE_START];
  const count = 100;
  for (let k = 1; k <= count; k += 1) {
    const t = k / count;
    truth.push({
      x: 6000 - 1200 * Math.sin(Math.PI * t),
      y: 500 + 3000 * t
    });
  }
  const rows = rowsFromPoints(truth, TRUE_ORIGIN);
  const started = Date.now();
  const solved = core.solveChain({
    start: TRUE_START,
    end: TRUE_END,
    origin: TRUE_ORIGIN,
    rows,
    sigma: 3
  });
  const elapsed = Date.now() - started;
  assert.ok(solved.ok);
  assert.ok(elapsed < 1500, "elapsed " + elapsed + " ms");
});

/* ------------------------------------------------------------------ */

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
