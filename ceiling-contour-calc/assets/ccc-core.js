/*
 * Ceiling contour calculator - core module.
 *
 * Pure geometry / parsing / export code. No DOM, no network.
 * Works in Node (module.exports) and in the browser (window.CCCCore).
 *
 * Coordinate convention inside the core:
 *   - millimeters everywhere;
 *   - A = (0, 0), B = (AB, 0), the measured contour is on the negative Y side
 *     (mathematical Y-up, top view of a room with the AB wall at the top).
 *   - the optional mirror state flips Y only.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CCCCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PI = Math.PI;
  var DEG = PI / 180;
  var UNIT_TO_MM = { mm: 1, cm: 10, m: 1000 };
  var EPS = 1e-9;

  /* ------------------------------------------------------------------ */
  /* Small utilities                                                     */
  /* ------------------------------------------------------------------ */

  function isFiniteNumber(v) {
    return typeof v === "number" && isFinite(v);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function wrapPi(a) {
    while (a <= -PI) a += 2 * PI;
    while (a > PI) a -= 2 * PI;
    return a;
  }

  function normalizeAngle(a) {
    while (a < 0) a += 2 * PI;
    while (a >= 2 * PI) a -= 2 * PI;
    return a;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function angleOf(v) {
    return Math.atan2(v.y, v.x);
  }

  function parseNumber(value) {
    if (typeof value === "number") {
      return isFinite(value) ? value : null;
    }
    if (value === null || value === undefined) {
      return null;
    }
    var s = String(value).trim().replace(/\s+/g, "");
    if (!s) {
      return null;
    }
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
      return null;
    }
    s = s.replace(",", ".");
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) {
      return null;
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function toMm(value, unit) {
    var n = parseNumber(value);
    var scale = UNIT_TO_MM[unit] || 1;
    return n === null ? null : n * scale;
  }

  function fromMm(value, unit) {
    var scale = UNIT_TO_MM[unit] || 1;
    return value / scale;
  }

  function formatNumber(value, digits) {
    var d = typeof digits === "number" ? digits : 4;
    var n = Number(value);
    if (!isFinite(n)) {
      return "0";
    }
    var s = n.toFixed(d);
    if (s.indexOf(".") >= 0) {
      s = s.replace(/0+$/, "").replace(/\.$/, "");
    }
    if (s === "-0") {
      return "0";
    }
    return s;
  }

  function formatFixed(value, digits) {
    var n = Number(value);
    if (!isFinite(n)) {
      return (0).toFixed(digits);
    }
    return n.toFixed(digits);
  }

  /* ------------------------------------------------------------------ */
  /* Measurement solver                                                  */
  /* ------------------------------------------------------------------ */

  function circleIntersection(ab, dA, dB) {
    var x = (dA * dA - dB * dB + ab * ab) / (2 * ab);
    var rad = dA * dA - x * x;
    var nearLine = false;
    if (rad < 0) {
      // A tiny negative value is a normal consequence of measurement noise
      // for points close to the AB line. Anything bigger is a broken triangle.
      if (rad > -Math.max(1, dA * 0.002)) {
        rad = 0;
        nearLine = true;
      } else {
        return { ok: false, reason: "triangle" };
      }
    }
    return { ok: true, x: x, y: -Math.sqrt(Math.max(0, rad)), nearLine: nearLine };
  }

  function trianglePossible(ab, d1, d2) {
    if (!(ab > 0) || !(d1 >= 0) || !(d2 >= 0)) {
      return false;
    }
    var tol = 0.5;
    if (d1 + d2 < ab - tol) return false;
    if (Math.abs(d1 - d2) > ab + tol) return false;
    return true;
  }

  function measurementResiduals(point, refs) {
    var sum = 0;
    var n = 0;
    var maxAbs = 0;
    var residuals = [];
    for (var i = 0; i < refs.length; i += 1) {
      var ref = refs[i];
      if (ref.d === null || ref.d === undefined) continue;
      var r = Math.hypot(point.x - ref.x, point.y - ref.y) - ref.d;
      residuals.push(r);
      sum += r * r;
      maxAbs = Math.max(maxAbs, Math.abs(r));
      n += 1;
    }
    return {
      rms: n > 0 ? Math.sqrt(sum / n) : Infinity,
      maxAbs: maxAbs,
      residuals: residuals
    };
  }

  function gaussNewton(start, refs) {
    var p = { x: start.x, y: start.y };
    var iterations = 10;
    for (var it = 0; it < iterations; it += 1) {
      var a = 0;
      var b = 0;
      var c = 0;
      var g1 = 0;
      var g2 = 0;
      for (var i = 0; i < refs.length; i += 1) {
        var ref = refs[i];
        var dx = p.x - ref.x;
        var dy = p.y - ref.y;
        var r = Math.hypot(dx, dy);
        if (r < 1e-9) continue;
        var ux = dx / r;
        var uy = dy / r;
        var res = r - ref.d;
        a += ux * ux;
        b += ux * uy;
        c += uy * uy;
        g1 += ux * res;
        g2 += uy * res;
      }
      var det = a * c - b * b;
      if (!isFinite(det) || Math.abs(det) < 1e-12) {
        return { ok: false, reason: "singular", point: p };
      }
      var dxStep = -(c * g1 - b * g2) / det;
      var dyStep = -(-b * g1 + a * g2) / det;
      var step = Math.hypot(dxStep, dyStep);
      p.x += dxStep;
      p.y += dyStep;
      if (step < 1e-7) {
        return { ok: true, point: p };
      }
    }
    return { ok: true, point: p };
  }

  function covarianceSigma(p, refs, sigma) {
    var a = 0;
    var b = 0;
    var c = 0;
    for (var i = 0; i < refs.length; i += 1) {
      var ref = refs[i];
      var dx = p.x - ref.x;
      var dy = p.y - ref.y;
      var r = Math.hypot(dx, dy);
      if (r < 1e-9) continue;
      var ux = dx / r;
      var uy = dy / r;
      a += ux * ux;
      b += ux * uy;
      c += uy * uy;
    }
    var det = a * c - b * b;
    if (!isFinite(det) || Math.abs(det) < 1e-12) {
      return { sigmaPos: Infinity, trace: Infinity, det: det };
    }
    var trace = (c + a) / det;
    return { sigmaPos: sigma * Math.sqrt(Math.max(0, trace)), trace: trace, det: det };
  }

  function solvePoint(options) {
    var ab = options.ab;
    var sigma = isFiniteNumber(options.sigma) ? Math.max(0.01, options.sigma) : 3;
    var dA = options.dA;
    var dB = options.dB;
    var dC = options.dC;
    var cPoint = options.cPoint || null;

    if (!(ab > 0)) {
      return { ok: false, reason: "ab", message: "Не задано довжину AB." };
    }
    if (!isFiniteNumber(dA) || !isFiniteNumber(dB) || dA < 0 || dB < 0) {
      return { ok: false, reason: "missing", message: "Не заповнені відстані від A і B." };
    }
    if (!trianglePossible(ab, dA, dB)) {
      return {
        ok: false,
        reason: "triangle",
        message: "Заміри не сходяться — перевірте точку."
      };
    }

    var seed = circleIntersection(ab, dA, dB);
    if (!seed.ok) {
      return {
        ok: false,
        reason: "triangle",
        message: "Заміри не сходяться — перевірте точку."
      };
    }

    var useC = false;
    if (cPoint && isFiniteNumber(dC) && dC >= 0) {
      if (trianglePossible(ab, options.ac, options.bc)) {
        useC = true;
      }
    }

    var refs = [
      { x: 0, y: 0, d: dA },
      { x: ab, y: 0, d: dB }
    ];
    if (useC) {
      refs.push({ x: cPoint.x, y: cPoint.y, d: dC });
    }

    var point = { x: seed.x, y: seed.y };
    if (useC) {
      var gn = gaussNewton(seed, refs);
      if (gn.ok) {
        point = gn.point;
      }
      if (!isFinite(point.x) || !isFinite(point.y)) {
        point = { x: seed.x, y: seed.y };
        useC = false;
        refs = refs.slice(0, 2);
      }
      if (point.y > 0) {
        // Reference C is on the same side as the measured contour; a positive
        // Y would mean the point jumped over the AB wall. Keep the AP/BP seed side.
        point = { x: seed.x, y: seed.y };
        useC = false;
        refs = refs.slice(0, 2);
      }
    }

    var res = measurementResiduals(point, refs);
    var cov = covarianceSigma(point, refs, sigma);
    var sigmaPos = cov.sigmaPos;
    var thresholdResidual = Math.max(4 * sigma, 5);
    var thresholdSigma = Math.max(10, 3 * sigma);

    var status = "ok";
    var messages = [];
    if (res.rms > thresholdResidual) {
      status = "error";
      messages.push("Заміри не сходяться — перевірте точку.");
    } else if (sigmaPos > thresholdSigma) {
      status = "warn";
      if (!useC) {
        messages.push("Точка майже на лінії AB — додайте відстань від C.");
      } else {
        messages.push("Низька точність положення точки — перевірте заміри.");
      }
    } else if (seed.nearLine && !useC) {
      status = "warn";
      messages.push("Точка майже на лінії AB — додайте відстань від C.");
    }

    return {
      ok: true,
      bad: status === "error",
      x: point.x,
      y: point.y,
      dA: dA,
      dB: dB,
      dC: useC ? dC : null,
      usedC: useC,
      rms: res.rms,
      maxResidual: res.maxAbs,
      sigmaPos: sigmaPos,
      status: status,
      messages: messages,
      nearLine: seed.nearLine
    };
  }

  /* ------------------------------------------------------------------ */
  /* Primitive geometry                                                  */
  /* ------------------------------------------------------------------ */

  function makeLine(start, end) {
    var chord = dist(start, end);
    return {
      type: "line",
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      bulge: 0,
      chord: chord,
      center: null,
      radius: null,
      sweep: 0,
      sagitta: 0,
      arcPoint: null,
      length: chord
    };
  }

  function makeArcFromBulge(start, end, bulge) {
    var chord = dist(start, end);
    if (!(chord > 1e-9) || !isFiniteNumber(bulge) || Math.abs(bulge) < 1e-12) {
      return makeLine(start, end);
    }
    var mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    var ux = (end.x - start.x) / chord;
    var uy = (end.y - start.y) / chord;
    var nx = -uy;
    var ny = ux;
    var sagitta = (-bulge * chord) / 2;
    var h = sagitta / 2 - (chord * chord) / (8 * sagitta);
    var center = { x: mid.x + nx * h, y: mid.y + ny * h };
    var radius = Math.hypot(start.x - center.x, start.y - center.y);
    var theta = 4 * Math.atan(bulge);
    var arcPoint = { x: mid.x + nx * sagitta, y: mid.y + ny * sagitta };
    var length = radius * Math.abs(theta);
    return {
      type: "arc",
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      bulge: bulge,
      chord: chord,
      center: center,
      radius: radius,
      sweep: theta,
      sagitta: sagitta,
      arcPoint: arcPoint,
      length: length
    };
  }

  function makeArcFromSweep(start, end, sweep) {
    if (Math.abs(sweep) < 1e-12) {
      return makeLine(start, end);
    }
    return makeArcFromBulge(start, end, Math.tan(sweep / 4));
  }

  function edgeMidpointAngle(edge) {
    if (edge.type !== "arc") return null;
    var a = angleOf({ x: edge.start.x - edge.center.x, y: edge.start.y - edge.center.y });
    return a + edge.sweep / 2;
  }

  function sampleEdge(edge, maxStepDeg) {
    if (edge.type === "line") {
      return [edge.start, edge.end];
    }
    var step = (maxStepDeg || 4) * DEG;
    var count = Math.max(2, Math.ceil(Math.abs(edge.sweep) / step));
    var startAngle = angleOf({
      x: edge.start.x - edge.center.x,
      y: edge.start.y - edge.center.y
    });
    var out = [];
    for (var i = 0; i <= count; i += 1) {
      var a = startAngle + (edge.sweep * i) / count;
      out.push({
        x: edge.center.x + edge.radius * Math.cos(a),
        y: edge.center.y + edge.radius * Math.sin(a)
      });
    }
    return out;
  }

  function polygonSignedArea(points) {
    var area = 0;
    for (var i = 0; i < points.length; i += 1) {
      var p = points[i];
      var q = points[(i + 1) % points.length];
      area += p.x * q.y - q.x * p.y;
    }
    return area / 2;
  }

  // Exact port of the converter's sampleAreaSigned (24 divisions per arc).
  // Used only for GLC GVals A/B/C so the file matches the existing converter.
  function converterAreaAbs(edges) {
    var pts = [];
    for (var idx = 0; idx < edges.length; idx += 1) {
      var edge = edges[idx];
      if (edge.type === "line") {
        if (idx === 0) pts.push(edge.start);
        pts.push(edge.end);
        continue;
      }
      var startAngle = angleOf({
        x: edge.start.x - edge.center.x,
        y: edge.start.y - edge.center.y
      });
      var delta = edge.sweep;
      var div = 24;
      for (var i = idx === 0 ? 0 : 1; i <= div; i += 1) {
        var a = startAngle + (delta * i) / div;
        pts.push({
          x: edge.center.x + edge.radius * Math.cos(a),
          y: edge.center.y + edge.radius * Math.sin(a)
        });
      }
    }
    return Math.abs(polygonSignedArea(pts));
  }

  function edgesSignedArea(edges) {    var points = [];
    for (var i = 0; i < edges.length; i += 1) {
      points.push(edges[i].start);
    }
    var area = polygonSignedArea(points);
    for (var j = 0; j < edges.length; j += 1) {
      var edge = edges[j];
      if (edge.type === "arc") {
        var theta = edge.sweep;
        area += (edge.radius * edge.radius * (theta - Math.sin(theta))) / 2;
      }
    }
    return area;
  }

  function edgesPerimeter(edges) {
    var sum = 0;
    for (var i = 0; i < edges.length; i += 1) sum += edges[i].length;
    return sum;
  }

  function edgesCurvedLength(edges) {
    var sum = 0;
    for (var i = 0; i < edges.length; i += 1) {
      if (edges[i].type === "arc") sum += edges[i].length;
    }
    return sum;
  }

  function edgesBounds(edges) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < edges.length; i += 1) {
      var pts = sampleEdge(edges[i], 3);
      for (var j = 0; j < pts.length; j += 1) {
        var p = pts[j];
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function boundsFromPoints(points) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < points.length; i += 1) {
      var p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  /* ------------------------------------------------------------------ */
  /* Tangents / initial curved edges                                     */
  /* ------------------------------------------------------------------ */

  function circumcircleTangent(prev, point, next) {
    var a = { x: point.x - prev.x, y: point.y - prev.y };
    var b = { x: next.x - point.x, y: next.y - point.y };
    var la = Math.hypot(a.x, a.y);
    var lb = Math.hypot(b.x, b.y);
    if (la < EPS || lb < EPS) return null;
    var d = wrapPi(angleOf(b) - angleOf(a));
    var alpha = Math.atan2(la * Math.sin(d), lb + la * Math.cos(d));
    return angleOf(a) + alpha;
  }

  function buildInitialEdges(points, straightFlags, cornerFlags) {
    var n = points.length;
    var edges = [];
    for (var i = 0; i < n; i += 1) {
      var j = (i + 1) % n;
      var start = points[i];
      var end = points[j];

      if (straightFlags[i]) {
        edges.push(makeLine(start, end));
        continue;
      }

      var prevI = (i - 1 + n) % n;
      var nextJ = (j + 1) % n;

      var startTangent = null;
      if (!cornerFlags[i]) {
        if (straightFlags[prevI]) {
          startTangent = angleOf({ x: start.x - points[prevI].x, y: start.y - points[prevI].y });
        } else if (straightFlags[i]) {
          startTangent = angleOf({ x: end.x - start.x, y: end.y - start.y });
        } else {
          startTangent = circumcircleTangent(points[prevI], start, end);
        }
      }

      var endTangent = null;
      if (!cornerFlags[j]) {
        if (straightFlags[j]) {
          endTangent = angleOf({ x: points[nextJ].x - end.x, y: points[nextJ].y - end.y });
        } else if (straightFlags[i]) {
          endTangent = angleOf({ x: start.x - end.x, y: start.y - end.y });
        } else {
          endTangent = circumcircleTangent(start, end, points[nextJ]);
        }
      }

      if (startTangent === null && endTangent === null) {
        edges.push(makeLine(start, end));
        continue;
      }

      var chordAngle = angleOf({ x: end.x - start.x, y: end.y - start.y });
      if (startTangent === null) {
        startTangent = wrapPi(2 * chordAngle - endTangent);
      }
      if (endTangent === null) {
        endTangent = wrapPi(2 * chordAngle - startTangent);
      }

      var alphaStart = wrapPi(chordAngle - startTangent);
      var alphaEnd = wrapPi(endTangent - chordAngle);
      var alpha = (alphaStart + alphaEnd) / 2;
      var limit = 170 * DEG;
      if (alpha > limit) alpha = limit;
      if (alpha < -limit) alpha = -limit;
      if (Math.abs(alpha) < 0.02 * DEG) {
        edges.push(makeLine(start, end));
      } else {
        edges.push(makeArcFromBulge(start, end, Math.tan(alpha / 2)));
      }
    }
    return edges;
  }

  /* ------------------------------------------------------------------ */
  /* Simplification                                                      */
  /* ------------------------------------------------------------------ */

  function lineDeviation(points, s, e) {
    var ps = points[s % points.length];
    var pe = points[e % points.length];
    var dx = pe.x - ps.x;
    var dy = pe.y - ps.y;
    var len = Math.hypot(dx, dy);
    if (len < EPS) return Infinity;
    var maxDev = 0;
    for (var i = s + 1; i < e; i += 1) {
      var p = points[i % points.length];
      var dev = Math.abs((p.x - ps.x) * dy - (p.y - ps.y) * dx) / len;
      if (dev > maxDev) maxDev = dev;
    }
    return maxDev;
  }

  function circumcenter(a, b, c) {
    var d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-9) return null;
    var a2 = a.x * a.x + a.y * a.y;
    var b2 = b.x * b.x + b.y * b.y;
    var c2 = c.x * c.x + c.y * c.y;
    var ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    var uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return { x: ux, y: uy };
  }

  function evaluateArc(points, s, e, center, radius) {
    var ps = points[s % points.length];
    var pe = points[e % points.length];
    var maxDev = Math.abs(dist(center, pe) - radius);
    for (var i = s + 1; i < e; i += 1) {
      var p = points[i % points.length];
      var dev = Math.abs(dist(center, p) - radius);
      if (dev > maxDev) maxDev = dev;
    }
    if (!isFinite(maxDev)) return null;

    var startAngle = angleOf({ x: ps.x - center.x, y: ps.y - center.y });
    var prevAngle = startAngle;
    var total = 0;
    var sign = 0;
    var monotonic = true;
    for (var k = s + 1; k <= e; k += 1) {
      var q = points[k % points.length];
      var ang = angleOf({ x: q.x - center.x, y: q.y - center.y });
      var delta = wrapPi(ang - prevAngle);
      if (Math.abs(delta) > 1e-7) {
        var sgn = delta > 0 ? 1 : -1;
        if (sign === 0) sign = sgn;
        else if (sgn !== sign) monotonic = false;
      }
      total += delta;
      prevAngle = ang;
    }
    if (!monotonic) return null;
    if (Math.abs(total) > 200 * DEG + 1e-9) return null;
    if (Math.abs(total) < 0.05 * DEG) return null;

    return { center: center, radius: radius, total: total, maxDev: maxDev };
  }

  function circleCandidate(points, s, e, m, endForFit) {
    var ps = points[s % points.length];
    var pm = points[m % points.length];
    var peFit = points[endForFit % points.length];
    if (dist(ps, pm) < EPS || dist(pm, peFit) < EPS || dist(ps, peFit) < EPS) {
      return null;
    }
    var center = circumcenter(ps, pm, peFit);
    if (!center) return null;
    var radius = dist(center, ps);
    if (!isFinite(radius) || radius <= 0 || radius > 1e9) return null;
    return evaluateArc(points, s, e, center, radius);
  }

  function solve3x3(a, b) {
    var m = [
      [a[0][0], a[0][1], a[0][2], b[0]],
      [a[1][0], a[1][1], a[1][2], b[1]],
      [a[2][0], a[2][1], a[2][2], b[2]]
    ];
    for (var col = 0; col < 3; col += 1) {
      var pivot = col;
      for (var r = col + 1; r < 3; r += 1) {
        if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      }
      if (Math.abs(m[pivot][col]) < 1e-12) return null;
      if (pivot !== col) {
        var tmp = m[col];
        m[col] = m[pivot];
        m[pivot] = tmp;
      }
      var pv = m[col][col];
      for (var c = col; c < 4; c += 1) m[col][c] /= pv;
      for (var rr = 0; rr < 3; rr += 1) {
        if (rr === col) continue;
        var factor = m[rr][col];
        if (Math.abs(factor) < 1e-18) continue;
        for (var cc = col; cc < 4; cc += 1) {
          m[rr][cc] -= factor * m[col][cc];
        }
      }
    }
    return [m[0][3], m[1][3], m[2][3]];
  }

  // Algebraic (Kasa) least-squares circle, used to stay robust to measurement
  // noise when points are dense. Still validated against the same tolerance.
  function circleCandidateLSQ(points, s, e) {
    var n = points.length;
    var idx = [];
    for (var i = s; i <= e; i += 1) {
      var k = i % n;
      if (i > s && k === s % n) continue;
      idx.push(k);
    }
    if (idx.length < 4) return null;
    var mx = 0;
    var my = 0;
    for (var j = 0; j < idx.length; j += 1) {
      mx += points[idx[j]].x;
      my += points[idx[j]].y;
    }
    mx /= idx.length;
    my /= idx.length;
    var Suu = 0;
    var Suv = 0;
    var Svv = 0;
    var Su = 0;
    var Sv = 0;
    var Sz = 0;
    var Suz = 0;
    var Svz = 0;
    for (var q = 0; q < idx.length; q += 1) {
      var u = points[idx[q]].x - mx;
      var v = points[idx[q]].y - my;
      var z = u * u + v * v;
      Suu += u * u;
      Suv += u * v;
      Svv += v * v;
      Su += u;
      Sv += v;
      Sz += z;
      Suz += u * z;
      Svz += v * z;
    }
    var sol = solve3x3(
      [
        [Suu, Suv, Su],
        [Suv, Svv, Sv],
        [Su, Sv, idx.length]
      ],
      [-Suz, -Svz, -Sz]
    );
    if (!sol) return null;
    var cu = -sol[0] / 2;
    var cv = -sol[1] / 2;
    var r2 = cu * cu + cv * cv - sol[2];
    if (!(r2 > 0)) return null;
    var center = { x: mx + cu, y: my + cv };
    var radius = Math.sqrt(r2);
    if (!isFinite(radius) || radius <= 0 || radius > 1e9) return null;
    return evaluateArc(points, s, e, center, radius);
  }

  function pointToSegmentDistance(p, a, b) {
    var vx = b.x - a.x;
    var vy = b.y - a.y;
    var wx = p.x - a.x;
    var wy = p.y - a.y;
    var c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
    var c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
    var t = c1 / c2;
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  }

  function pointToArcDistance(p, center, radius, startAngle, sweep) {
    var r = Math.hypot(p.x - center.x, p.y - center.y);
    var da = angleOf({ x: p.x - center.x, y: p.y - center.y }) - startAngle;
    if (sweep >= 0) {
      da = ((da % (2 * PI)) + 2 * PI) % (2 * PI);
      if (da <= sweep) return Math.abs(r - radius);
    } else {
      da = ((da % (2 * PI)) - 2 * PI) % (2 * PI);
      if (da >= sweep) return Math.abs(r - radius);
    }
    var endAngle = startAngle + sweep;
    var start = {
      x: center.x + radius * Math.cos(startAngle),
      y: center.y + radius * Math.sin(startAngle)
    };
    var end = {
      x: center.x + radius * Math.cos(endAngle),
      y: center.y + radius * Math.sin(endAngle)
    };
    return Math.min(Math.hypot(p.x - start.x, p.y - start.y), Math.hypot(p.x - end.x, p.y - end.y));
  }

  // Check a merged primitive against the local initial edges (the measured
  // micro-path). This rejects arcs that pass through the measured points but
  // bulge far away between them (for example at a curvature inflection).
  function primitivePathDeviation(points, s, e, primitive, initialEdges) {
    var n = points.length;
    var maxDev = 0;
    var startAngle = 0;
    if (primitive.type === "arc") {
      startAngle = angleOf({
        x: primitive.start.x - primitive.center.x,
        y: primitive.start.y - primitive.center.y
      });
    }
    for (var i = s; i < e; i += 1) {
      var init = initialEdges[i % n];
      var fractions = init.type === "arc" ? [0.25, 0.5, 0.75] : [0.5];
      for (var f = 0; f < fractions.length; f += 1) {
        var t = fractions[f];
        var p;
        if (init.type === "line") {
          p = {
            x: init.start.x + (init.end.x - init.start.x) * t,
            y: init.start.y + (init.end.y - init.start.y) * t
          };
        } else {
          var a0 = angleOf({ x: init.start.x - init.center.x, y: init.start.y - init.center.y });
          var a = a0 + init.sweep * t;
          p = {
            x: init.center.x + init.radius * Math.cos(a),
            y: init.center.y + init.radius * Math.sin(a)
          };
        }
        var d;
        if (primitive.type === "line") {
          d = pointToSegmentDistance(p, primitive.start, primitive.end);
        } else {
          d = pointToArcDistance(p, primitive.center, primitive.radius, startAngle, primitive.sweep);
        }
        if (d > maxDev) maxDev = d;
      }
    }
    return maxDev;
  }

  function bestPrimitive(points, s, e, tol, initialEdges, sigma, forceStraight) {
    if (e <= s + 1) {
      return initialEdges[s % initialEdges.length];
    }
    var lineDev = lineDeviation(points, s, e);
    var lineValid = lineDev <= tol + 1e-7;
    // Each measured point has a position uncertainty of roughly sigma_pos,
    // which for two references is ~1.4*sigma. A merged primitive has to hold
    // all intermediate points, so the acceptance band scales with sigma.
    var arcTol = tol + (isFiniteNumber(sigma) && sigma > 0 ? 3 * sigma : 0);

    if (forceStraight) {
      var straightEdge = makeLine(points[s % points.length], points[e % points.length]);
      if (lineValid && primitivePathDeviation(points, s, e, straightEdge, initialEdges) <= arcTol * 1.8) {
        return { type: "line", edge: straightEdge };
      }
      return null;
    }

    var endForFit = e;
    if (e - s >= points.length) endForFit = e - 1;
    var mids = [];
    var span = e - s;
    mids.push(s + Math.max(1, Math.floor(span / 2)));
    mids.push(s + Math.max(1, Math.floor(span / 3)));
    mids.push(s + Math.max(1, Math.floor((2 * span) / 3)));
    if (mids.some(function (m) { return m === endForFit || m === s; })) {
      // fall back to a point just before the endpoint
      mids.push(Math.max(s + 1, endForFit - 1));
    }

    var bestArc = null;
    var seen = {};
    // Three points always fit some circle; with measurement noise that circle
    // can be a meaningless wiggle. Require a stronger sagitta for the shortest
    // span so only a real bend becomes an arc. Longer spans are redundant
    // enough for the least-squares fit to be stable.
    var minSag = tol + (e - s <= 2 && isFiniteNumber(sigma) && sigma > 0 ? sigma : 0);
    for (var i = 0; i < mids.length; i += 1) {
      var m = mids[i];
      if (m <= s || m >= e || m === endForFit) continue;
      var key = String(m);
      if (seen[key]) continue;
      seen[key] = true;
      var cand = circleCandidate(points, s, e, m, endForFit);
      if (!cand) continue;
      if (cand.maxDev > arcTol + 1e-7) continue;
      var sag = cand.radius * (1 - Math.cos(Math.abs(cand.total) / 2));
      if (tol > 0 && sag <= minSag) continue;
      if (!bestArc || cand.maxDev < bestArc.maxDev) {
        bestArc = cand;
      }
    }
    var lsq = circleCandidateLSQ(points, s, e);
    if (lsq && lsq.maxDev <= arcTol + 1e-7) {
      var lsqSag = lsq.radius * (1 - Math.cos(Math.abs(lsq.total) / 2));
      if (!(tol > 0 && lsqSag <= minSag)) {
        if (!bestArc || lsq.maxDev < bestArc.maxDev) bestArc = lsq;
      }
    }

    if (lineValid && bestArc) {
      var lineEdgeBoth = makeLine(points[s % points.length], points[e % points.length]);
      var pathTol = arcTol * 1.8;
      if (primitivePathDeviation(points, s, e, lineEdgeBoth, initialEdges) <= pathTol) {
        return { type: "line", edge: lineEdgeBoth };
      }
      lineValid = false;
    }
    if (lineValid) {
      var lineEdge = makeLine(points[s % points.length], points[e % points.length]);
      var linePathTol = arcTol * 1.8;
      if (primitivePathDeviation(points, s, e, lineEdge, initialEdges) <= linePathTol) {
        return { type: "line", edge: lineEdge };
      }
    }
    if (bestArc) {
      var arcEdge = makeArcFromSweep(
        points[s % points.length],
        points[e % points.length],
        bestArc.total
      );
      if (primitivePathDeviation(points, s, e, arcEdge, initialEdges) <= arcTol * 1.8) {
        return { type: "arc", edge: arcEdge };
      }
    }
    return null;
  }

  function simplifyContour(points, straightFlags, cornerFlags, initialEdges, tol, sigma) {
    var n = points.length;
    var breakpoints = [];
    for (var i = 0; i < n; i += 1) {
      var prev = (i - 1 + n) % n;
      if (cornerFlags[i] || straightFlags[i] !== straightFlags[prev]) {
        breakpoints.push(i);
      }
    }
    breakpoints.sort(function (a, b) { return a - b; });

    var stretches = [];
    if (breakpoints.length === 0) {
      stretches.push({ start: 0, end: n });
    } else {
      for (var b = 0; b < breakpoints.length; b += 1) {
        var start = breakpoints[b];
        var end = b + 1 < breakpoints.length ? breakpoints[b + 1] : breakpoints[0] + n;
        if (end > start) stretches.push({ start: start, end: end });
      }
    }

    var result = [];
    var tolerance = Math.max(0, isFiniteNumber(tol) ? tol : 3);

    for (var sIdx = 0; sIdx < stretches.length; sIdx += 1) {
      var stretch = stretches[sIdx];
      // Inside an explicitly marked straight run only line primitives are allowed.
      var forceStraight = !!straightFlags[stretch.start % n];
      var s = stretch.start;
      while (s < stretch.end) {
        var bestEnd = s + 1;
        var best = null;
        if (tolerance > 0) {
          // Exponential probe + binary search. Primitive validity is monotonic
          // in practice (if a span cannot be represented, a longer one cannot
          // either), and this keeps the greedy pass O(n log n).
          var firstCandidates = [];
          if (s + 2 <= stretch.end) firstCandidates.push(s + 2);
          if (s + 3 <= stretch.end) firstCandidates.push(s + 3);
          for (var fc = 0; fc < firstCandidates.length; fc += 1) {
            var ce = firstCandidates[fc];
            var cc = bestPrimitive(points, s, ce, tolerance, initialEdges, sigma, forceStraight);
            if (cc && (!best || ce > bestEnd)) {
              best = cc;
              bestEnd = ce;
            }
          }
          if (best) {
            var lo = bestEnd;
            var step = Math.max(2, (lo - s) * 2);
            var hi = null;
            var probe = s + step;
            while (probe <= stretch.end) {
              var cand = bestPrimitive(points, s, probe, tolerance, initialEdges, sigma, forceStraight);
              if (cand) {
                lo = probe;
                best = cand;
                bestEnd = probe;
                step *= 2;
                probe = s + step;
              } else {
                hi = probe;
                break;
              }
            }
            if (hi === null && lo < stretch.end) {
              var endCand = bestPrimitive(points, s, stretch.end, tolerance, initialEdges, sigma, forceStraight);
              if (endCand) {
                lo = stretch.end;
                best = endCand;
                bestEnd = stretch.end;
              } else {
                hi = stretch.end;
              }
            }
            if (hi !== null && hi - lo > 1) {
              var a = lo;
              var b = hi;
              while (b - a > 1) {
                var mid = Math.floor((a + b) / 2);
                var midCand = bestPrimitive(points, s, mid, tolerance, initialEdges, sigma, forceStraight);
                if (midCand) {
                  a = mid;
                  best = midCand;
                  bestEnd = mid;
                } else {
                  b = mid;
                }
              }
            }
          }
        }
        if (!best) {
          if (s + 1 < stretch.end) {
            best = { type: "initial", edge: initialEdges[s % n] };
            bestEnd = s + 1;
          } else {
            best = { type: "initial", edge: initialEdges[s % n] };
            bestEnd = s + 1;
          }
        }
        var edge = best.edge;
        if (edge.type === "arc") {
          var sag = Math.abs(edge.sagitta);
          if (sag < tolerance && tolerance > 0) {
            edge = makeLine(edge.start, edge.end);
          }
        }
        result.push(edge);
        s = bestEnd;
        if (s > stretch.end) s = stretch.end;
      }
    }

    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Validation helpers                                                  */
  /* ------------------------------------------------------------------ */

  function segmentsProperlyIntersect(a1, a2, b1, b2, eps) {
    var d1x = a2.x - a1.x;
    var d1y = a2.y - a1.y;
    var d2x = b2.x - b1.x;
    var d2y = b2.y - b1.y;
    var den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return false;
    var t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
    var u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / den;
    var e = eps === undefined ? 1e-7 : eps;
    return t > e && t < 1 - e && u > e && u < 1 - e;
  }

  function findSelfIntersections(points) {
    var hits = [];
    var n = points.length;
    for (var i = 0; i < n; i += 1) {
      var a1 = points[i];
      var a2 = points[(i + 1) % n];
      for (var j = i + 1; j < n; j += 1) {
        if (j === i) continue;
        if ((j + 1) % n === i || (i + 1) % n === j) continue;
        var b1 = points[j];
        var b2 = points[(j + 1) % n];
        if (dist(a1, b1) < 1e-6 || dist(a1, b2) < 1e-6 || dist(a2, b1) < 1e-6 || dist(a2, b2) < 1e-6) {
          continue;
        }
        if (segmentsProperlyIntersect(a1, a2, b1, b2, 1e-6)) {
          hits.push({ a: i, b: j, nextA: (i + 1) % n, nextB: (j + 1) % n });
        }
      }
    }
    return hits;
  }

  /* ------------------------------------------------------------------ */
  /* Main contour build                                                  */
  /* ------------------------------------------------------------------ */

  function buildContour(input) {
    var options = input || {};
    var ab = parseNumber(options.ab);
    var unit = options.unit || "mm";
    var sigma = isFiniteNumber(options.sigma) ? Math.max(0.01, options.sigma) : 3;
    var tol = isFiniteNumber(options.tol) ? Math.max(0, options.tol) : 3;
    var mirror = !!options.mirror;
    var rows = Array.isArray(options.points) ? options.points : [];
    var ac = parseNumber(options.ac);
    var bc = parseNumber(options.bc);

    var errors = [];
    var warnings = [];
    var solved = [];

    if (!(ab > 0)) {
      errors.push({ code: "ab", message: "Вкажіть довжину AB (більше 0)." });
    }
    if (rows.length < 3) {
      errors.push({
        code: "few_points",
        message: "Потрібно щонайменше 3 точки контуру (зараз " + rows.length + ")."
      });
    }

    var cPoint = null;
    if (isFiniteNumber(ac) && isFiniteNumber(bc) && ac > 0 && bc > 0) {
      if (ab > 0 && trianglePossible(ab, ac, bc)) {
        var cSeed = circleIntersection(ab, ac, bc);
        if (cSeed.ok) {
          cPoint = { x: cSeed.x, y: cSeed.y };
        }
      } else {
        warnings.push({
          code: "c_triangle",
          message: "Точка C: відстані AC і BC не утворюють трикутник — відстані від C ігноруються."
        });
      }
    } else if (isFiniteNumber(ac) || isFiniteNumber(bc)) {
      warnings.push({
        code: "c_incomplete",
        message: "Для контролю від C потрібні обидві відстані AC і BC — відстані від C ігноруються."
      });
    }

    var hasC = !!cPoint;

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i] || {};
      var dA = parseNumber(row.dA);
      var dB = parseNumber(row.dB);
      var dC = parseNumber(row.dC);
      var rowNumber = i + 1;

      if (!(ab > 0)) {
        // The AB error is already reported once; do not repeat it for every row.
        solved.push(null);
        continue;
      }

      if (dA === null || dB === null) {
        var missing = [];
        if (dA === null) missing.push("«Від A»");
        if (dB === null) missing.push("«Від B»");
        errors.push({
          code: "row_missing",
          row: rowNumber,
          message: "Рядок " + rowNumber + ": заповніть " + missing.join(" і ") + "."
        });
        solved.push(null);
        continue;
      }

      var solvedPoint = solvePoint({
        ab: ab,
        dA: dA,
        dB: dB,
        dC: dC,
        ac: ac,
        bc: bc,
        cPoint: cPoint,
        sigma: sigma
      });

      if (!solvedPoint.ok) {
        errors.push({
          code: "row_solve",
          row: rowNumber,
          message: "Рядок " + rowNumber + ": " + solvedPoint.message
        });
        solvedPoint.row = rowNumber;
        solved.push(solvedPoint);
        continue;
      }

      solvedPoint.row = rowNumber;
      solvedPoint.corner = !!row.corner;
      solvedPoint.straight = !!row.straight;
      solvedPoint.chord = parseNumber(row.chord);
      solvedPoint.label = row.label || null;

      for (var w = 0; w < solvedPoint.messages.length; w += 1) {
        warnings.push({
          code: solvedPoint.status === "error" ? "point_error" : "point_warn",
          row: rowNumber,
          message: "Рядок " + rowNumber + ": " + solvedPoint.messages[w]
        });
      }
      solved.push(solvedPoint);
    }

    // Duplicate / near-duplicate check on the points that were solved.
    var validSolved = solved.filter(function (p) { return p && p.ok; });
    for (var d = 0; d < validSolved.length; d += 1) {
      var p1 = validSolved[d];
      var p2 = validSolved[(d + 1) % validSolved.length];
      if (!p2) continue;
      var dd = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (dd < 5 && validSolved.length > 1) {
        warnings.push({
          code: "duplicate",
          row: p1.row,
          row2: p2.row,
          message:
            "Точки " + p1.row + " і " + p2.row + " майже збігаються (" +
            formatFixed(dd, 1) + " мм)."
        });
      }
    }

    // Chord check (measured direct distance between adjacent points).
    for (var c = 0; c < solved.length; c += 1) {
      var cur = solved[c];
      var nxt = solved[(c + 1) % solved.length];
      if (!cur || !cur.ok || !nxt || !nxt.ok) continue;
      if (cur.chord === null || cur.chord === undefined) continue;
      var measured = dist(cur, nxt);
      var threshold =
        3 *
        Math.sqrt(
          Math.pow(isFinite(cur.sigmaPos) ? cur.sigmaPos : 9999, 2) +
            Math.pow(isFinite(nxt.sigmaPos) ? nxt.sigmaPos : 9999, 2) +
            sigma * sigma
        );
      var diff = Math.abs(measured - cur.chord);
      if (diff > threshold) {
        warnings.push({
          code: "chord",
          row: cur.row,
          row2: nxt.row,
          message:
            "Хорда " + cur.row + "→" + nxt.row + " не збігається з заміром (" +
            formatFixed(diff, 1) + " мм). Перевірте точки " + cur.row + " і " + nxt.row + "."
        });
      }
    }

    if (errors.length > 0 || validSolved.length < 3) {
      return {
        ok: false,
        errors: errors,
        warnings: warnings,
        rows: solved,
        points: validSolved.map(function (p) { return { x: p.x, y: p.y }; }),
        ab: ab,
        cPoint: cPoint,
        stats: null,
        edges: [],
        initialEdges: [],
        mirror: mirror
      };
    }

    // Apply mirror (Y only) before geometry construction.
    var points = validSolved.map(function (p) {
      return { x: p.x, y: mirror ? -p.y : p.y };
    });

    // The row order is the contour order; rows that failed were an error above.
    var straightFlags = validSolved.map(function (p) { return !!p.straight; });
    var cornerFlags = validSolved.map(function (p) { return !!p.corner; });

    var selfHits = findSelfIntersections(points);
    if (selfHits.length > 0) {
      warnings.push({
        code: "self_intersection",
        message: "Контур перетинає сам себе — перевірте нумерацію точок."
      });
    }

    var initialEdges = buildInitialEdges(points, straightFlags, cornerFlags);
    var simplified = simplifyContour(points, straightFlags, cornerFlags, initialEdges, tol, sigma);

    var signedArea = edgesSignedArea(simplified);
    var area = Math.abs(signedArea);
    var perimeter = edgesPerimeter(simplified);
    var curved = edgesCurvedLength(simplified);
    var bounds = edgesBounds(simplified);
    var pointBounds = boundsFromPoints(points);

    var result = {
      ok: true,
      errors: errors,
      warnings: warnings,
      rows: solved,
      points: points,
      rawPoints: validSolved.map(function (p) { return { x: p.x, y: p.y }; }),
      ab: ab,
      cPoint: cPoint && mirror ? { x: cPoint.x, y: -cPoint.y } : cPoint,
      mirror: mirror,
      edges: simplified,
      initialEdges: initialEdges,
      signedArea: signedArea,
      winding: signedArea >= 0 ? "CCW" : "CW",
      stats: {
        areaMm2: area,
        areaM2: area / 1000000,
        perimeterMm: perimeter,
        perimeterM: perimeter / 1000,
        curvedMm: curved,
        curvedM: curved / 1000,
        edgeCountBefore: points.length,
        edgeCountAfter: simplified.length,
        straightCount: simplified.filter(function (e) { return e.type === "line"; }).length,
        arcCount: simplified.filter(function (e) { return e.type === "arc"; }).length,
        widthMm: bounds.maxX - bounds.minX,
        heightMm: bounds.maxY - bounds.minY,
        pointWidthMm: pointBounds.maxX - pointBounds.minX,
        pointHeightMm: pointBounds.maxY - pointBounds.minY,
        bounds: bounds
      }
    };

    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Windows-1251 encoder                                                */
  /* ------------------------------------------------------------------ */

  var CP1251_HIGH =
    "\u0402\u0403\u201A\u0453\u201E\u2026\u2020\u2021\u20AC\u2030\u0409\u2039\u040A\u040C\u040B\u040F" +
    "\u0452\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u0098\u2122\u0459\u203A\u045A\u045C\u045B\u045F" +
    "\u00A0\u040E\u045E\u0408\u00A4\u0490\u00A6\u00A7\u0401\u00A9\u0404\u00AB\u00AC\u00AD\u00AE\u0407" +
    "\u00B0\u00B1\u0406\u0456\u0491\u00B5\u00B6\u00B7\u0451\u2116\u0454\u00BB\u0458\u0405\u0455\u0457" +
    "\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F" +
    "\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F" +
    "\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F" +
    "\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F";

  var CP1251_MAP = (function () {
    var map = {};
    for (var i = 0; i < CP1251_HIGH.length; i += 1) {
      var ch = CP1251_HIGH.charAt(i);
      if (ch !== "\u0098") map[ch] = 0x80 + i;
    }
    map["\u0401"] = 0xA8;
    map["\u0451"] = 0xB8;
    map["\u0404"] = 0xAA;
    map["\u0454"] = 0xBA;
    map["\u0406"] = 0xB2;
    map["\u0456"] = 0xB3;
    map["\u0407"] = 0xAF;
    map["\u0457"] = 0xBF;
    map["\u0490"] = 0xA5;
    map["\u0491"] = 0xB4;
    return map;
  })();

  function encodeWindows1251(text) {
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes[i] = code;
      } else if (CP1251_MAP[text.charAt(i)] !== undefined) {
        bytes[i] = CP1251_MAP[text.charAt(i)];
      } else {
        bytes[i] = 0x3f; // "?"
      }
    }
    return bytes;
  }

  /* ------------------------------------------------------------------ */
  /* GLC exporter (logic ported from dxf-glc-converter/glcBuilder.js)    */
  /* ------------------------------------------------------------------ */

  function randomUuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().toUpperCase();
    }
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      var arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      arr[6] = (arr[6] & 0x0f) | 0x40;
      arr[8] = (arr[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < arr.length; i += 1) {
        hex.push((arr[i] + 0x100).toString(16).slice(1));
      }
      return (
        hex.slice(0, 4).join("") + "-" + hex.slice(4, 6).join("") + "-" +
        hex.slice(6, 8).join("") + "-" + hex.slice(8, 10).join("") + "-" +
        hex.slice(10, 16).join("")
      ).toUpperCase();
    }
    return "00000000-0000-4000-8000-000000000000";
  }

  // Ported from the working converter: mirror only Y around the source bbox.
  function toArkulatorSegments(segments) {
    var pts = [];
    for (var i = 0; i < segments.length; i += 1) {
      pts.push(segments[i].start, segments[i].end);
    }
    var b = boundsFromPoints(pts);
    function mirrorPoint(p) {
      return { x: p.x, y: b.minY + b.maxY - p.y };
    }
    return segments.map(function (seg) {
      var start = mirrorPoint(seg.start);
      var end = mirrorPoint(seg.end);
      if (seg.type === "arc") {
        // Y mirror reverses the traversal direction; the bulge changes sign.
        return makeArcFromBulge(start, end, -seg.bulge);
      }
      return makeLine(start, end);
    });
  }

  function buildGlc(contour, options) {
    if (!contour || !contour.ok || !contour.edges || contour.edges.length === 0) {
      throw new Error("Немає коректного контуру для експорту GLC.");
    }
    var opts = options || {};
    var roomIndex = isFiniteNumber(opts.roomIndex) ? opts.roomIndex : 0;
    var roomName = opts.roomName || "Ceiling_" + String(roomIndex + 1);
    var roomUid = opts.roomUid || randomUuid();
    var zoneUid = opts.zoneUid || randomUuid();

    var segments = toArkulatorSegments(contour.edges);
    var points = segments.map(function (s) { return s.start; });
    var perimeterMm = edgesPerimeter(segments);
    var curvedMm = edgesCurvedLength(segments);
    var areaMm2 = converterAreaAbs(segments);
    var bounds = boundsFromPoints(
      segments.reduce(function (acc, s) { return acc.concat([s.start, s.end]); }, [])
    );
    var lines = [];

    lines.push("ROOMBEGIN");
    lines.push("RoomName " + roomName);
    lines.push("UID1 " + roomUid);
    lines.push("Doc1CID " + String(roomIndex + 1));
    lines.push("WITHOUT_POLOTNO False");
    lines.push("WITHOUT_HARPOON False");

    lines.push("POINTS");
    points.forEach(function (p) {
      lines.push("AnglePoint " + formatNumber(p.x) + ", " + formatNumber(p.y));
    });
    lines.push("POINTSEND");

    lines.push("OTRARCS");
    segments.forEach(function (seg, idx) {
      lines.push("WallWid3 " + String(idx) + ", 0");
      if (seg.type === "arc") {
        lines.push("OtrArcHei " + String(idx) + ", " + formatNumber(seg.sagitta));
      }
    });
    lines.push("OTRARCSEND");

    lines.push("BLUEPOINTS");
    lines.push("BLUEPOINTSEND");

    lines.push("otrlist_");
    segments.forEach(function (seg, idx) {
      var po1 = idx + 1;
      var po2 = idx === segments.length - 1 ? 1 : idx + 2;
      lines.push("NPLine");
      lines.push("PoBeg " + formatNumber(seg.start.x) + ", " + formatNumber(seg.start.y));
      lines.push("PoEnd " + formatNumber(seg.end.x) + ", " + formatNumber(seg.end.y));
      if (seg.type === "arc") {
        lines.push("ArcPoint " + formatNumber(seg.arcPoint.x) + ", " + formatNumber(seg.arcPoint.y));
        lines.push("ArcHei " + formatNumber(seg.sagitta));
      }
      lines.push("Wid1 100");
      lines.push("PoNumber1 " + String(po1));
      lines.push("PoNumber2 " + String(po2));
      lines.push("JValue " + formatNumber(seg.chord));
      lines.push("IdntBeg P" + String(po1));
      lines.push("IdntEnd P" + String(po2));
      lines.push("IdntBeg2 ");
      lines.push("IdntEnd2 ");
      lines.push("FixedBeg False");
      lines.push("END");
    });
    lines.push("otrlist_end");

    lines.push("dim_lines_");
    lines.push("dim_lines_end");
    lines.push("StartPointA -1");
    lines.push("VIREZS");
    lines.push("VIREZSEND");
    lines.push("GlobPlanX 0");
    lines.push("GlobPlanY 0");

    lines.push("ZONESLIST");
    lines.push("OneZone");
    lines.push("ZoneGUI1 " + zoneUid);
    segments.forEach(function (seg) {
      lines.push("ZoneLine");
      lines.push("PoBeg " + formatNumber(seg.start.x) + ", " + formatNumber(seg.start.y));
      lines.push("PoEnd " + formatNumber(seg.end.x) + ", " + formatNumber(seg.end.y));
      lines.push("Wid1 100");
      lines.push("TipeOtr 1");
      lines.push("END");
    });
    lines.push("ZoneDepth 0");
    lines.push("ZoneDepth2 0");
    lines.push("Dep_X1 -1");
    lines.push("Dep_Y1 -1");
    lines.push("Dep_Alp 0");
    lines.push("PPGrpID 0");
    lines.push("PPLevlNum 0");
    lines.push("HandMade False");
    lines.push("OneZoneEND");
    lines.push("ZONESLISTEND");

    lines.push("ALLDIMLINES");
    lines.push("ALLDIMLINESEND");
    lines.push("ESTIME_BEGIN");
    lines.push("ESTIME_END");

    lines.push("GValsBegin");
    lines.push("A " + formatNumber(areaMm2 / 1000000, 6));
    lines.push("B " + formatNumber(areaMm2 / 1000000, 6));
    lines.push("C " + formatNumber(areaMm2 / 1000000, 6));
    lines.push("D " + formatNumber(perimeterMm / 1000, 6));
    lines.push("E 0");
    lines.push("F 0");
    lines.push("G " + formatNumber(perimeterMm / 1000, 6));
    lines.push("I " + String(segments.filter(function (s) { return s.type === "arc"; }).length));
    lines.push("J " + formatNumber(curvedMm / 1000, 6));
    lines.push("L 0");
    lines.push("M 0");
    lines.push("O 0");
    lines.push("P 0");
    lines.push("Q 0");
    lines.push("R 0");
    lines.push("CWid1 " + formatNumber(bounds.maxX - bounds.minX));
    lines.push("CHei1 " + formatNumber(bounds.maxY - bounds.minY));
    lines.push("CWid2 " + formatNumber(bounds.maxX - bounds.minX));
    lines.push("CHei2 " + formatNumber(bounds.maxY - bounds.minY));
    lines.push("GValsEnd");

    lines.push("UseEstim True");
    lines.push("UseSclad False");
    lines.push("PARAMS2_BEGIN");
    lines.push("FirstLineWidth 0");
    lines.push("FullLineWidth 0");
    lines.push("StretchParamPer 0");
    lines.push("StretchParamPer_2 0");
    lines.push("ColorLineName ");
    lines.push("LineLineName ");
    lines.push("ArtNoName 0");
    lines.push("PARAMS2_END");
    lines.push("ROOMEND");

    return lines.join("\r\n") + "\r\n";
  }

  function buildGlcBytes(contour, options) {
    return encodeWindows1251(buildGlc(contour, options));
  }

  /* ------------------------------------------------------------------ */
  /* DXF exporter (R12 POLYLINE with bulges)                             */
  /* ------------------------------------------------------------------ */

  function buildDxf(contour) {
    if (!contour || !contour.ok || !contour.edges) {
      throw new Error("Немає коректного контуру для експорту DXF.");
    }
    var lines = [];
    lines.push("0", "SECTION", "2", "ENTITIES");
    lines.push("0", "POLYLINE", "8", "0", "66", "1", "70", "1");
    lines.push("10", "0", "20", "0", "30", "0");
    contour.edges.forEach(function (edge) {
      lines.push("0", "VERTEX", "8", "0");
      lines.push("10", formatNumber(edge.start.x, 6));
      lines.push("20", formatNumber(edge.start.y, 6));
      lines.push("30", "0");
      if (edge.type === "arc") {
        lines.push("42", formatNumber(edge.bulge, 10));
      }
    });
    lines.push("0", "SEQEND", "8", "0");
    lines.push("0", "ENDSEC");
    lines.push("0", "EOF");
    return lines.join("\r\n") + "\r\n";
  }

  /* ------------------------------------------------------------------ */
  /* SVG exporter                                                        */
  /* ------------------------------------------------------------------ */

  function escapeXml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function buildSvg(contour, options) {
    if (!contour || !contour.ok || !contour.edges || contour.edges.length === 0) {
      throw new Error("Немає коректного контуру для експорту SVG.");
    }
    var opts = options || {};
    var showPoints = opts.showPoints !== false;
    var showDims = opts.showDims !== false;
    var title = opts.title || "";
    var b = edgesBounds(contour.edges);
    var pad = Math.max(150, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08);
    var minX = Math.min(b.minX, 0) - pad;
    var maxX = Math.max(b.maxX, contour.ab || b.maxX) + pad;
    var minY = Math.min(b.minY, 0) - pad;
    var maxY = Math.max(b.maxY, 0) + pad;
    var w = maxX - minX;
    var h = maxY - minY;

    function sx(x) { return x - minX; }
    function sy(y) { return -y - minY; }

    var parts = [];
    parts.push(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + formatNumber(w, 2) + " " +
        formatNumber(h, 2) + '" width="1200" height="' +
        formatNumber((1200 * h) / Math.max(1, w), 2) + '">'
    );
    parts.push('<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>');
    parts.push('<g font-family="Segoe UI, Tahoma, sans-serif" font-size="18" fill="#5e6c63">');
    if (title) {
      parts.push(
        '<text x="12" y="26" font-size="22" fill="#1f2a24">' + escapeXml(title) + "</text>"
      );
    }
    // AB wall
    parts.push(
      '<line x1="' + formatNumber(sx(0), 2) + '" y1="' + formatNumber(sy(0), 2) +
        '" x2="' + formatNumber(sx(contour.ab), 2) + '" y2="' + formatNumber(sy(0), 2) +
        '" stroke="#b26d00" stroke-width="2" stroke-dasharray="10 6"/>'
    );
    parts.push(
      '<text x="' + formatNumber(sx(0) - 22, 2) + '" y="' + formatNumber(sy(0) + 6, 2) + '">A</text>'
    );
    parts.push(
      '<text x="' + formatNumber(sx(contour.ab) + 8, 2) + '" y="' + formatNumber(sy(0) + 6, 2) + '">B</text>'
    );

    var d = "";
    contour.edges.forEach(function (edge, idx) {
      var pts = sampleEdge(edge, 2);
      pts.forEach(function (p, i) {
        if (idx === 0 && i === 0) {
          d += "M " + formatNumber(sx(p.x), 2) + " " + formatNumber(sy(p.y), 2);
        } else if (i > 0 || idx > 0) {
          d += " L " + formatNumber(sx(p.x), 2) + " " + formatNumber(sy(p.y), 2);
        }
      });
    });
    d += " Z";
    parts.push(
      '<path d="' + d + '" fill="#edf7f1" fill-opacity="0.55" stroke="#2f6d4e" stroke-width="3" stroke-linejoin="round"/>'
    );

    if (contour.cPoint) {
      parts.push(
        '<circle cx="' + formatNumber(sx(contour.cPoint.x), 2) + '" cy="' +
          formatNumber(sy(contour.cPoint.y), 2) + '" r="5" fill="#2f6d4e"/>'
      );
      parts.push(
        '<text x="' + formatNumber(sx(contour.cPoint.x) + 8, 2) + '" y="' +
          formatNumber(sy(contour.cPoint.y) - 8, 2) + '">C</text>'
      );
    }

    if (showPoints) {
      contour.points.forEach(function (p, idx) {
        var color = "#2f6d4e";
        var rowData = contour.rows && contour.rows[idx];
        if (rowData && rowData.status === "warn") color = "#b26d00";
        if (rowData && rowData.status === "error") color = "#b42318";
        parts.push(
          '<circle cx="' + formatNumber(sx(p.x), 2) + '" cy="' + formatNumber(sy(p.y), 2) +
            '" r="5" fill="' + color + '" stroke="#ffffff" stroke-width="1.5"/>'
        );
        parts.push(
          '<text x="' + formatNumber(sx(p.x) + 8, 2) + '" y="' + formatNumber(sy(p.y) + 18, 2) +
            '" font-size="14" fill="' + color + '">' + String(idx + 1) + "</text>"
        );
      });
    }

    if (showDims) {
      contour.edges.forEach(function (edge) {
        var mid = edge.type === "arc" ? edge.arcPoint : {
          x: (edge.start.x + edge.end.x) / 2,
          y: (edge.start.y + edge.end.y) / 2
        };
        var label = edge.type === "arc"
          ? "R" + formatNumber(edge.radius, 0) + " / " + formatNumber(edge.length, 0)
          : formatNumber(edge.chord, 0);
        parts.push(
          '<text x="' + formatNumber(sx(mid.x) + 6, 2) + '" y="' + formatNumber(sy(mid.y) - 6, 2) +
            '" font-size="13" fill="#5e6c63">' + label + "</text>"
        );
      });
    }
    parts.push("</g></svg>");
    return parts.join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* CSV import / export                                                 */
  /* ------------------------------------------------------------------ */

  var TRUE_FLAGS = ["1", "x", "х", "так", "y", "yes", "к", "кут", "k", "п", "пряма", "l", "line", "true", "+"];
  var FALSE_FLAGS = ["", "0", "-", "ні", "no", "n", "false", "f", "х"];

  function parseFlag(value) {
    var s = String(value === null || value === undefined ? "" : value)
      .trim()
      .toLowerCase();
    if (TRUE_FLAGS.indexOf(s) >= 0) return true;
    if (FALSE_FLAGS.indexOf(s) >= 0) return false;
    return null;
  }

  function decodeBytes(input) {
    var bytes;
    if (input instanceof Uint8Array) {
      bytes = input;
    } else if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (Array.isArray(input)) {
      bytes = new Uint8Array(input);
    } else {
      return String(input || "");
    }

    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return decodeWith("utf-8", bytes.subarray(3));
    }
    try {
      var utf8 = decodeWith("utf-8", bytes, true);
      if (utf8 !== null) return utf8;
    } catch (e) {
      // fall through to cp1251
    }
    var cp = decodeWith("windows-1251", bytes, false);
    if (cp !== null) return cp;
    // Last-resort manual cp1251 decode for very small environments.
    var out = "";
    for (var i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function decodeWith(encoding, bytes, fatal) {
    if (typeof TextDecoder === "undefined") return null;
    try {
      return new TextDecoder(encoding, { fatal: !!fatal }).decode(bytes);
    } catch (e) {
      return null;
    }
  }

  function detectDelimiter(lines) {
    var counts = { "\t": 0, ";": 0, ",": 0 };
    for (var i = 0; i < Math.min(lines.length, 12); i += 1) {
      var line = lines[i];
      if (!line || /^\s*(#|\/\/)/.test(line)) continue;
      counts["\t"] += (line.match(/\t/g) || []).length;
      counts[";"] += (line.match(/;/g) || []).length;
      counts[","] += (line.match(/,/g) || []).length;
    }
    if (counts["\t"] > 0 && counts["\t"] >= counts[";"]) return "\t";
    if (counts[";"] > 0) return ";";
    return ",";
  }

  function stripQuotes(value) {
    var s = String(value === null || value === undefined ? "" : value).trim();
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      s = s.slice(1, -1).replace(/""/g, '"');
    }
    return s;
  }

  function splitCommaLine(line) {
    var raw = line.split(",").map(stripQuotes);
    var tokens = raw.slice();
    var index = null;
    if (tokens.length % 2 === 1 && /^\d+$/.test(tokens[0])) {
      index = tokens.shift();
    }
    if (tokens.length >= 2 && tokens.length % 2 === 0) {
      var merged = [];
      var ok = true;
      for (var i = 0; i < tokens.length; i += 2) {
        var a = tokens[i];
        var b = tokens[i + 1];
        if (
          /^\d+$/.test(a) &&
          /^\d{1,2}$/.test(b)
        ) {
          merged.push(a + "." + b);
        } else {
          ok = false;
          break;
        }
      }
      if (ok && merged.length >= 2 && merged.length <= 3) {
        if (index !== null) merged.unshift(index);
        return merged;
      }
    }
    return raw;
  }

  function parseCsvText(input, options) {
    var text = typeof input === "string" ? input : decodeBytes(input);
    text = String(text || "").replace(/^\uFEFF/, "");
    var lines = text.split(/\r\n|\n|\r/);
    var delimiter = options && options.delimiter ? options.delimiter : detectDelimiter(lines);
    var result = {
      unit: null,
      ab: null,
      ac: null,
      bc: null,
      objectName: "",
      rows: [],
      errors: [],
      warnings: [],
      delimiter: delimiter
    };

    var serviceKeys = {
      unit: true,
      ab: true,
      ac: true,
      bc: true,
      name: true,
      object: true,
      "об'єкт": true,
      sigma: true,
      tol: true
    };

    for (var lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      var rawLine = lines[lineIdx].trim();
      var lineNo = lineIdx + 1;
      if (!rawLine) continue;
      if (/^(#|\/\/)/.test(rawLine)) continue;

      var tokens;
      if (delimiter === ",") {
        tokens = splitCommaLine(rawLine);
      } else {
        tokens = rawLine.split(delimiter).map(stripQuotes);
      }
      tokens = tokens.map(function (t) { return String(t).trim(); });
      if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) continue;

      var first = tokens[0].toLowerCase();

      if (serviceKeys[first]) {
        var value = tokens[1] === undefined ? "" : tokens[1];
        if (first === "unit") {
          var u = value.toLowerCase();
          if (u === "mm" || u === "cm" || u === "m") result.unit = u;
          else result.errors.push({ line: lineNo, message: "Рядок " + lineNo + ": невідомі одиниці «" + value + "». Дозволено mm, cm, m." });
        } else if (first === "ab") {
          result.ab = parseNumber(value);
          if (result.ab === null) result.errors.push({ line: lineNo, message: "Рядок " + lineNo + ": некоректне значення AB." });
        } else if (first === "ac") {
          result.ac = parseNumber(value);
        } else if (first === "bc") {
          result.bc = parseNumber(value);
        } else if (first === "name" || first === "object" || first === "об'єкт") {
          result.objectName = value;
        } else if (first === "sigma") {
          result.sigma = parseNumber(value);
        } else if (first === "tol") {
          result.tol = parseNumber(value);
        }
        continue;
      }

      // Header row: first cell is not numeric and is not a known flag.
      if (parseNumber(tokens[0]) === null) {
        if (/^\d+$/.test(tokens[0]) === false && /[a-zа-яіїєґ]/i.test(tokens[0])) {
          continue;
        }
        result.errors.push({
          line: lineNo,
          message: "Рядок " + lineNo + ": очікується номер точки або dA; dB."
        });
        continue;
      }

      var row;
      if (tokens.length === 2) {
        row = { dA: tokens[0], dB: tokens[1], dC: "", corner: false, straight: false, chord: "" };
      } else if (tokens.length === 3) {
        row = { dA: tokens[1], dB: tokens[2], dC: "", corner: false, straight: false, chord: "" };
      } else if (tokens.length >= 4) {
        row = {
          dA: tokens[1],
          dB: tokens[2],
          dC: tokens[3] || "",
          corner: false,
          straight: false,
          chord: ""
        };
        if (tokens.length >= 5) {
          var f1 = parseFlag(tokens[4]);
          if (f1 === null) {
            result.errors.push({ line: lineNo, message: "Рядок " + lineNo + ": некоректний прапорець «Кут»." });
          }
          row.corner = !!f1;
        }
        if (tokens.length >= 6) {
          var f2 = parseFlag(tokens[5]);
          if (f2 === null) {
            result.errors.push({ line: lineNo, message: "Рядок " + lineNo + ": некоректний прапорець «Пряма»." });
          }
          row.straight = !!f2;
        }
        if (tokens.length >= 7) {
          row.chord = tokens[6];
        }
      } else {
        result.errors.push({ line: lineNo, message: "Рядок " + lineNo + ": замало колонок." });
        continue;
      }

      var dA = parseNumber(row.dA);
      var dB = parseNumber(row.dB);
      if (dA === null || dB === null) {
        result.errors.push({
          line: lineNo,
          message: "Рядок " + lineNo + ": некоректні відстані від A або B."
        });
        continue;
      }
      if (row.dC && parseNumber(row.dC) === null) {
        result.errors.push({
          line: lineNo,
          message: "Рядок " + lineNo + ": некоректна відстань від C."
        });
      }
      if (row.chord && parseNumber(row.chord) === null) {
        result.errors.push({
          line: lineNo,
          message: "Рядок " + lineNo + ": некоректна хорда."
        });
      }
      // Normalize decimal separators so callers always get dot-decimal strings.
      row.dA = String(dA);
      row.dB = String(dB);
      var normC = row.dC ? parseNumber(row.dC) : null;
      row.dC = normC === null ? "" : String(normC);
      var normChord = row.chord ? parseNumber(row.chord) : null;
      row.chord = normChord === null ? "" : String(normChord);
      result.rows.push(row);
    }

    if (result.rows.length === 0 && result.errors.length === 0) {
      result.errors.push({ line: 0, message: "Не знайдено жодного рядка з точками." });
    }
    return result;
  }

  function formatCsv(state) {
    var lines = [];
    var unit = state.unit || "cm";
    lines.push("# Контур стелі — дані замірів");
    lines.push("# Одиниці: mm | cm | m. Відстані — у вибраних одиницях.");
    lines.push("unit;" + unit);
    if (state.sigma !== undefined && state.sigma !== null && state.sigma !== "") {
      lines.push("sigma;" + String(state.sigma));
    }
    if (state.tol !== undefined && state.tol !== null && state.tol !== "") {
      lines.push("tol;" + String(state.tol));
    }
    lines.push("AB;" + (state.ab === null || state.ab === undefined ? "" : String(state.ab)));
    lines.push("AC;" + (state.ac === null || state.ac === undefined ? "" : String(state.ac)));
    lines.push("BC;" + (state.bc === null || state.bc === undefined ? "" : String(state.bc)));
    if (state.objectName) lines.push("name;" + String(state.objectName).replace(/[\r\n;]+/g, " "));
    lines.push("n;dA;dB;dC;кут;пряма;хорда");
    (state.rows || []).forEach(function (row, idx) {
      lines.push(
        [
          String(idx + 1),
          row.dA === "" || row.dA === undefined ? "" : String(row.dA),
          row.dB === "" || row.dB === undefined ? "" : String(row.dB),
          row.dC === "" || row.dC === undefined ? "" : String(row.dC),
          row.corner ? "1" : "0",
          row.straight ? "1" : "0",
          row.chord === "" || row.chord === undefined ? "" : String(row.chord)
        ].join(";")
      );
    });
    return lines.join("\r\n") + "\r\n";
  }

  function buildCsvTemplate() {
    return (
      "# Шаблон для калькулятора контуру стелі\r\n" +
      "# Заповніть AB (відстань між кутами A і B на стіні) у вибраних одиницях.\r\n" +
      "# Рядки точок: n;dA;dB;dC;кут;пряма;хорда\r\n" +
      "# dC, кут, пряма, хорда — необов'язкові. Порожні значення залишайте між ;;\r\n" +
      "# Прапорці: 1/так/x/кут — істина, 0/ні/порожньо — хиба.\r\n" +
      "unit;cm\r\n" +
      "AB;450\r\n" +
      "AC;\r\n" +
      "BC;\r\n" +
      "name;Приклад кімнати\r\n" +
      "n;dA;dB;dC;кут;пряма;хорда\r\n" +
      "1;80;400;;1;1;\r\n" +
      "2;210;290;;0;0;\r\n" +
      "3;360;220;;1;0;\r\n" +
      "4;420;90;;0;0;\r\n"
    );
  }

  /* ------------------------------------------------------------------ */
  /* Filename helper                                                     */
  /* ------------------------------------------------------------------ */

  var TRANSLIT = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
    з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
    о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e",
    ъ: "", ё: "e"
  };

  function slugFilename(name, fallback) {
    var s = String(name || "").trim().toLowerCase();
    var out = "";
    for (var i = 0; i < s.length; i += 1) {
      var ch = s.charAt(i);
      out += TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
    }
    out = out
      .replace(/['’`"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
    return out || fallback || "kontur-steli";
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  return {
    VERSION: "1.0.0",
    UNIT_TO_MM: UNIT_TO_MM,
    TRUE_FLAGS: TRUE_FLAGS,
    parseNumber: parseNumber,
    toMm: toMm,
    fromMm: fromMm,
    formatNumber: formatNumber,
    formatFixed: formatFixed,
    wrapPi: wrapPi,
    solvePoint: solvePoint,
    buildContour: buildContour,
    makeLine: makeLine,
    makeArcFromBulge: makeArcFromBulge,
    makeArcFromSweep: makeArcFromSweep,
    sampleEdge: sampleEdge,
    edgesSignedArea: edgesSignedArea,
    edgesPerimeter: edgesPerimeter,
    edgesCurvedLength: edgesCurvedLength,
    edgesBounds: edgesBounds,
    boundsFromPoints: boundsFromPoints,
    buildGlc: buildGlc,
    buildGlcBytes: buildGlcBytes,
    buildDxf: buildDxf,
    buildSvg: buildSvg,
    encodeWindows1251: encodeWindows1251,
    decodeBytes: decodeBytes,
    parseCsvText: parseCsvText,
    formatCsv: formatCsv,
    buildCsvTemplate: buildCsvTemplate,
    slugFilename: slugFilename,
    findSelfIntersections: findSelfIntersections,
    // Internal helpers exposed for diagnostics/tests only.
    _internals: {
      buildInitialEdges: buildInitialEdges,
      simplifyContour: simplifyContour,
      bestPrimitive: bestPrimitive,
      primitivePathDeviation: primitivePathDeviation,
      lineDeviation: lineDeviation,
      circleCandidate: circleCandidate,
      circleCandidateLSQ: circleCandidateLSQ
    }
  };
});
