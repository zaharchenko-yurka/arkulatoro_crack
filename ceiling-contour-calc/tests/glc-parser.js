/*
 * Minimal GLC validator/parser used by the automated tests.
 * It intentionally implements only the subset written by the calculator
 * (plus the delimiters needed to validate balance and geometry).
 */
"use strict";

const core = require("../assets/ccc-core.js");

function stripComments(text) {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line.length > 0);
}

function parsePair(value) {
  const parts = String(value).split(",");
  if (parts.length !== 2) return null;
  const x = core.parseNumber(parts[0]);
  const y = core.parseNumber(parts[1]);
  if (x === null || y === null) return null;
  return { x, y };
}

function parseGlc(input) {
  const text = typeof input === "string" ? input : core.decodeBytes(input);
  const lines = stripComments(text);
  const errors = [];

  const balancePairs = [
    ["ROOMBEGIN", "ROOMEND"],
    ["POINTS", "POINTSEND"],
    ["OTRARCS", "OTRARCSEND"],
    ["BLUEPOINTS", "BLUEPOINTSEND"],
    ["otrlist_", "otrlist_end"],
    ["dim_lines_", "dim_lines_end"],
    ["VIREZS", "VIREZSEND"],
    ["ZONESLIST", "ZONESLISTEND"],
    ["ESTIME_BEGIN", "ESTIME_END"],
    ["GValsBegin", "GValsEnd"],
    ["PARAMS2_BEGIN", "PARAMS2_END"],
    ["OneZone", "OneZoneEND"]
  ];
  const balance = {};
  for (const [open, close] of balancePairs) {
    const opens = lines.filter((l) => l === open).length;
    const closes = lines.filter((l) => l === close).length;
    balance[open + "/" + close] = { opens, closes, ok: opens === closes };
    if (opens !== closes) {
      errors.push(`Unbalanced ${open}/${close}: ${opens}/${closes}`);
    }
  }
  const recordEnds =
    lines.filter((l) => l === "NPLine").length +
    lines.filter((l) => l === "ZoneLine").length +
    lines.filter((l) => l === "VirezLine").length +
    lines.filter((l) => l === "dim_otr").length;
  const plainEnds = lines.filter((l) => l === "END").length;
  balance["records/END"] = { opens: recordEnds, closes: plainEnds, ok: recordEnds === plainEnds };
  if (recordEnds !== plainEnds) {
    errors.push(`Unbalanced records/END: ${recordEnds}/${plainEnds}`);
  }

  const rooms = lines.filter((l) => l === "ROOMBEGIN").length;
  const points = [];
  const edges = [];
  const gvals = {};
  const arcChecks = [];
  const zoneLineCount = lines.filter((l) => l === "ZoneLine").length;
  const npLineCount = lines.filter((l) => l === "NPLine").length;

  let current = null;
  let inGvals = false;
  let inEstime = false;
  let inOtrArcs = false;
  const otrArcHei = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === "OTRARCS") {
      inOtrArcs = true;
      continue;
    }
    if (line === "OTRARCSEND") {
      inOtrArcs = false;
      continue;
    }
    if (inOtrArcs) {
      const arcMatch = /^OtrArcHei\s+(\d+)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(line);
      if (arcMatch) otrArcHei[Number(arcMatch[1])] = Number(arcMatch[2]);
      continue;
    }

    if (line === "GValsBegin") {
      inGvals = true;
      continue;
    }
    if (line === "GValsEnd") {
      inGvals = false;
      continue;
    }
    if (line === "ESTIME_BEGIN") {
      inEstime = true;
      continue;
    }
    if (line === "ESTIME_END") {
      inEstime = false;
      continue;
    }
    if (inEstime) continue;

    if (inGvals) {
      const m = /^([A-Za-z])\s+(-?\d+(?:\.\d+)?)$/.exec(line);
      if (m) gvals[m[1]] = Number(m[2]);
      continue;
    }

    if (line.startsWith("AnglePoint ")) {
      const p = parsePair(line.slice("AnglePoint ".length));
      if (p) points.push(p);
      continue;
    }
    if (line === "NPLine") {
      current = { arcHei: null, arcPoint: null, poBeg: null, poEnd: null, jvalue: null };
      edges.push(current);
      continue;
    }
    if (current) {
      if (line === "END") {
        current = null;
        continue;
      }
      if (line.startsWith("PoBeg ")) current.poBeg = parsePair(line.slice(6));
      else if (line.startsWith("PoEnd ")) current.poEnd = parsePair(line.slice(6));
      else if (line.startsWith("ArcPoint ")) current.arcPoint = parsePair(line.slice(9));
      else if (line.startsWith("ArcHei ")) current.arcHei = core.parseNumber(line.slice(7));
      else if (line.startsWith("JValue ")) current.jvalue = core.parseNumber(line.slice(7));
    }
  }

  const builtEdges = [];
  let curved = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    if (!e.poBeg || !e.poEnd) {
      errors.push(`NPLine ${i + 1} has no PoBeg/PoEnd`);
      continue;
    }
    if (i > 0) {
      const prev = edges[i - 1];
      if (prev.poEnd && Math.hypot(prev.poEnd.x - e.poBeg.x, prev.poEnd.y - e.poBeg.y) > 1e-3) {
        errors.push(`Contour gap before NPLine ${i + 1}`);
      }
    }
    let edge;
    if (e.arcHei !== null) {
      const chord = Math.hypot(e.poEnd.x - e.poBeg.x, e.poEnd.y - e.poBeg.y);
      const bulge = chord > 0 ? (-2 * e.arcHei) / chord : 0;
      edge = core.makeArcFromBulge(e.poBeg, e.poEnd, bulge);
      curved += edge.length;
      if (otrArcHei[i] !== undefined) {
        const otrErr = Math.abs(otrArcHei[i] - e.arcHei);
        if (otrErr > 0.01) {
          errors.push(`OTRARCS OtrArcHei ${i} (${otrArcHei[i]}) != NPLine ArcHei (${e.arcHei})`);
        }
      } else {
        errors.push(`OTRARCS is missing OtrArcHei for arc edge ${i}`);
      }
      if (e.arcPoint) {
        const expected = edge.arcPoint;
        const err = Math.hypot(expected.x - e.arcPoint.x, expected.y - e.arcPoint.y);
        arcChecks.push({ index: i + 1, error: err, arcPoint: e.arcPoint, expected });
        if (err > 0.02) errors.push(`ArcPoint ${i + 1} mismatch: ${err.toFixed(5)} mm`);
      } else {
        errors.push(`NPLine ${i + 1} has ArcHei but no ArcPoint`);
      }
    } else {
      edge = core.makeLine(e.poBeg, e.poEnd);
      if (e.arcPoint) errors.push(`NPLine ${i + 1} has ArcPoint but no ArcHei`);
      if (otrArcHei[i] !== undefined) {
        errors.push(`OTRARCS has OtrArcHei ${i} but NPLine ${i + 1} is a straight line`);
      }
    }
    if (e.jvalue !== null) {
      const diff = Math.abs(e.jvalue - edge.chord);
      if (diff > 0.01) errors.push(`JValue ${i + 1} mismatch: ${diff.toFixed(4)} mm`);
    }
    builtEdges.push(edge);
  }

  if (builtEdges.length > 0) {
    const last = builtEdges[builtEdges.length - 1];
    const first = builtEdges[0];
    const gap = Math.hypot(last.end.x - first.start.x, last.end.y - first.start.y);
    if (gap > 1e-3) errors.push(`Contour is not closed: gap ${gap.toFixed(5)} mm`);
  }

  const area = builtEdges.length ? Math.abs(core.edgesSignedArea(builtEdges)) : 0;
  const perimeter = core.edgesPerimeter(builtEdges);
  const curvedLength = core.edgesCurvedLength(builtEdges);

  function checkGval(key, actual, tolerance, label) {
    if (gvals[key] === undefined) {
      errors.push(`GVals ${key} is missing`);
      return null;
    }
    const diff = Math.abs(gvals[key] - actual);
    if (diff > tolerance) {
      errors.push(`${label || key} mismatch: GLC ${gvals[key]} vs geometry ${actual.toFixed(6)}`);
    }
    return diff;
  }

  const diffJ = checkGval("J", curvedLength / 1000, 0.0001, "GVals J (curved length)");
  const diffA = checkGval("A", area / 1000000, 0.02, "GVals A (area)");
  const diffD = checkGval("D", perimeter / 1000, 0.0001, "GVals D (perimeter)");

  return {
    ok: errors.length === 0,
    errors,
    balance,
    rooms,
    points,
    edges: builtEdges,
    gvals,
    arcChecks,
    zoneLineCount,
    npLineCount,
    areaMm2: area,
    perimeterMm: perimeter,
    curvedMm: curvedLength,
    diffs: { J: diffJ, A: diffA, D: diffD }
  };
}

module.exports = { parseGlc, stripComments };
