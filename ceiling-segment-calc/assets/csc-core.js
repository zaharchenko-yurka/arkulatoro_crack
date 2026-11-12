/*
 * Ceiling segment calculator - core module.
 *
 * Pure geometry / parsing / export code. No DOM, no network.
 * Works in Node (module.exports) and in the browser (window.CSCore).
 *
 * Coordinate convention: millimeters everywhere, planar (Y-up) coordinates
 * exactly as they are stored in the imported .glc file. No automatic Y mirror
 * is applied: the .glc coordinates already belong to Arkulator's display
 * convention. The optional user mirror flips Y around the contour bbox.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CSCore = factory();
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

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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

  function numOr(value, fallback) {
    var n = parseNumber(value);
    return n === null ? fallback : n;
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
    return out || fallback || "segment-steli";
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
    var mid = midpoint(start, end);
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

  // Arc through three points (start, arcPoint, end). Works for arcs > 180 deg
  // too because the direction is derived from the middle point, not the chord.
  function makeArcFromThreePoints(start, mid, end) {
    if (dist(start, end) < 1e-9) return makeLine(start, end);
    var center = circumcenter(start, mid, end);
    if (!center) return makeLine(start, end);
    var radius = dist(center, start);
    if (!isFinite(radius) || radius <= 0) return makeLine(start, end);
    var a0 = angleOf({ x: start.x - center.x, y: start.y - center.y });
    var am = angleOf({ x: mid.x - center.x, y: mid.y - center.y });
    var a1 = angleOf({ x: end.x - center.x, y: end.y - center.y });
    var d0m = normalizeAngle(am - a0);
    var d01 = normalizeAngle(a1 - a0);
    var sweep = d0m < d01 ? d01 : d01 - 2 * PI;
    if (Math.abs(sweep) < 1e-9) return makeLine(start, end);
    var bulge = Math.tan(sweep / 4);
    return makeArcFromBulge(start, end, bulge);
  }

  function arcPointFromSagitta(start, end, sagitta) {
    var chord = dist(start, end);
    if (!(chord > 1e-9)) return midpoint(start, end);
    var ux = (end.x - start.x) / chord;
    var uy = (end.y - start.y) / chord;
    var mid = midpoint(start, end);
    return { x: mid.x + -uy * sagitta, y: mid.y + ux * sagitta };
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

  function arcPointAndSagitta(edge) {
    if (edge.type !== "arc") {
      return { arcPoint: null, sagitta: 0 };
    }
    var startAngle = angleOf({
      x: edge.start.x - edge.center.x,
      y: edge.start.y - edge.center.y
    });
    var midAngle = startAngle + edge.sweep / 2;
    var arcPoint = {
      x: edge.center.x + edge.radius * Math.cos(midAngle),
      y: edge.center.y + edge.radius * Math.sin(midAngle)
    };
    var mid = midpoint(edge.start, edge.end);
    var chord = dist(edge.start, edge.end) || 1;
    var ux = (edge.end.x - edge.start.x) / chord;
    var uy = (edge.end.y - edge.start.y) / chord;
    var sagitta = (arcPoint.x - mid.x) * -uy + (arcPoint.y - mid.y) * ux;
    return { arcPoint: arcPoint, sagitta: sagitta };
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

  function edgesSignedArea(edges) {
    var points = [];
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

  function contourStats(edges) {
    var bounds = edgesBounds(edges);
    var signed = edgesSignedArea(edges);
    var area = Math.abs(signed);
    var perimeter = edgesPerimeter(edges);
    var curved = edgesCurvedLength(edges);
    return {
      areaMm2: area,
      areaM2: area / 1000000,
      perimeterMm: perimeter,
      perimeterM: perimeter / 1000,
      curvedMm: curved,
      curvedM: curved / 1000,
      edgeCount: edges.length,
      arcCount: edges.filter(function (e) { return e.type === "arc"; }).length,
      widthMm: bounds.maxX - bounds.minX,
      heightMm: bounds.maxY - bounds.minY,
      bounds: bounds,
      winding: signed >= 0 ? "CCW" : "CW"
    };
  }

  /* ------------------------------------------------------------------ */
  /* Chain seed / refinement                                             */
  /* ------------------------------------------------------------------ */

  // Intersection of two circles. Returns 0..2 points and a clamped fallback
  // (the closest point on the line between centers) when the circles do not
  // actually intersect because of measurement noise.
  function circleCircle(c1, r1, c2, r2) {
    var dx = c2.x - c1.x;
    var dy = c2.y - c1.y;
    var L = Math.hypot(dx, dy);
    if (L < 1e-9) {
      return { points: [], clamped: true, closest: null, distance: 0 };
    }
    var x = (r1 * r1 - r2 * r2 + L * L) / (2 * L);
    var h2 = r1 * r1 - x * x;
    var clamped = false;
    if (h2 < 0) {
      h2 = 0;
      clamped = true;
    }
    var ux = dx / L;
    var uy = dy / L;
    var bx = c1.x + x * ux;
    var by = c1.y + x * uy;
    var h = Math.sqrt(h2);
    var p1 = { x: bx - uy * h, y: by + ux * h };
    var p2 = { x: bx + uy * h, y: by - ux * h };
    return { points: [p1, p2], clamped: clamped, closest: { x: bx, y: by }, distance: L };
  }

  function zeros(n) {
    var out = [];
    for (var i = 0; i < n; i += 1) {
      var row = new Array(n);
      for (var j = 0; j < n; j += 1) row[j] = 0;
      out.push(row);
    }
    return out;
  }

  function solveLinearSystem(a, b) {
    var n = b.length;
    var m = [];
    for (var i = 0; i < n; i += 1) {
      m.push(a[i].slice().concat([b[i]]));
    }
    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      for (var r = col + 1; r < n; r += 1) {
        if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      }
      if (Math.abs(m[pivot][col]) < 1e-14) return null;
      if (pivot !== col) {
        var tmp = m[col];
        m[col] = m[pivot];
        m[pivot] = tmp;
      }
      var pv = m[col][col];
      for (var c = col; c <= n; c += 1) m[col][c] /= pv;
      for (var rr = 0; rr < n; rr += 1) {
        if (rr === col) continue;
        var f = m[rr][col];
        if (Math.abs(f) < 1e-18) continue;
        for (var cc = col; cc <= n; cc += 1) {
          m[rr][cc] -= f * m[col][cc];
        }
      }
    }
    return m.map(function (row) { return row[n]; });
  }

  function invertMatrix(a) {
    var n = a.length;
    var m = [];
    for (var i = 0; i < n; i += 1) {
      var row = a[i].slice();
      for (var j = 0; j < n; j += 1) row.push(i === j ? 1 : 0);
      m.push(row);
    }
    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      for (var r = col + 1; r < n; r += 1) {
        if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      }
      if (Math.abs(m[pivot][col]) < 1e-14) return null;
      if (pivot !== col) {
        var tmp = m[col];
        m[col] = m[pivot];
        m[pivot] = tmp;
      }
      var pv = m[col][col];
      for (var c = 0; c < 2 * n; c += 1) m[col][c] /= pv;
      for (var rr = 0; rr < n; rr += 1) {
        if (rr === col) continue;
        var f = m[rr][col];
        if (Math.abs(f) < 1e-18) continue;
        for (var cc = 0; cc < 2 * n; cc += 1) {
          m[rr][cc] -= f * m[col][cc];
        }
      }
    }
    return m.map(function (row) { return row.slice(n); });
  }

  /*
   * Reconstruct the bent side.
   *
   * start  - fixed first corner of the side (S)
   * end    - fixed last corner of the side (E)
   * origin - point O the radii were measured from
   * rows   - [{d, s}, ...] measured joints in order; the LAST row is the
   *          corner E itself, so its d/s only validate the result.
   * sigma  - measurement error, mm
   */
  function solveChain(options) {
    var opts = options || {};
    var S = opts.start;
    var E = opts.end;
    var O = opts.origin;
    var sigma = Math.max(0.01, numOr(opts.sigma, 3));
    var errors = [];
    var warnings = [];

    function fail(message) {
      errors.push(message);
      return { ok: false, errors: errors, warnings: warnings, chain: [], rows: [] };
    }

    if (!S || !E || !O || !isFiniteNumber(S.x) || !isFiniteNumber(E.x) || !isFiniteNumber(O.x)) {
      return fail("Не задано початковий/кінцевий кут або точку O.");
    }
    if (!(dist(S, E) > 1)) {
      return fail("Початковий і кінцевий кути збігаються — виберіть іншу сторону.");
    }

    var rawRows = Array.isArray(opts.rows) ? opts.rows : [];
    if (rawRows.length < 2) {
      return fail("Потрібно щонайменше два рядки: проміжна точка і кінець E.");
    }

    var rows = [];
    for (var i = 0; i < rawRows.length; i += 1) {
      var d = parseNumber(rawRows[i].d);
      var s = parseNumber(rawRows[i].s);
      rows.push({ index: i, d: d, s: s, label: rawRows[i].label || null });
      if (d === null || !(d > 0)) {
        errors.push("Рядок " + (i + 1) + ": вкажіть додатний радіус від O.");
      }
      if (s === null || !(s > 0)) {
        errors.push("Рядок " + (i + 1) + ": вкажіть додатну довжину сегмента.");
      }
    }
    if (errors.length > 0) {
      return { ok: false, errors: errors, warnings: warnings, chain: [], rows: rows };
    }

    var m = rows.length;
    var unknownCount = m - 1; // last row is the fixed corner E

    // Seed: beam search over the two circle intersections for every joint.
    var beams = [{ chain: [{ x: S.x, y: S.y }], score: 0, dir: angleOf({ x: E.x - S.x, y: E.y - S.y }), clamped: false }];
    var anyClamped = false;

    for (var step = 0; step < unknownCount; step += 1) {
      var remaining = 0;
      for (var rj = step + 1; rj < m; rj += 1) remaining += rows[rj].s;
      var next = [];
      for (var bi = 0; bi < beams.length; bi += 1) {
        var beam = beams[bi];
        var prev = beam.chain[beam.chain.length - 1];
        var cc = circleCircle(prev, rows[step].s, O, rows[step].d);
        if (cc.clamped) anyClamped = true;
        if (!cc.points.length) {
          continue;
        }
        for (var ci = 0; ci < cc.points.length; ci += 1) {
          var cand = cc.points[ci];
          var dir = angleOf({ x: cand.x - prev.x, y: cand.y - prev.y });
          var turn = Math.abs(wrapPi(dir - beam.dir));
          var endDiff = Math.abs(dist(cand, E) - remaining);
          next.push({
            chain: beam.chain.concat([{ x: cand.x, y: cand.y }]),
            score: beam.score + turn * 1000 + endDiff * 0.35,
            dir: dir,
            clamped: beam.clamped || cc.clamped
          });
        }
      }
      if (!next.length) {
        return fail("Не вдалося побудувати ланцюг: перевірте радіуси та довжини сегментів.");
      }
      next.sort(function (a, b) { return a.score - b.score; });
      beams = next.slice(0, 6);
    }

    beams.sort(function (a, b) {
      var la = a.chain[a.chain.length - 1];
      var lb = b.chain[b.chain.length - 1];
      return a.score + 5 * dist(la, E) - (b.score + 5 * dist(lb, E));
    });
    var seedChain = beams[0].chain.concat([{ x: E.x, y: E.y }]);
    if (anyClamped) {
      warnings.push(
        "Деякі кола не перетиналися точно — точки скориговано методом найменших квадратів."
      );
    }

    // Gauss-Newton over the unknown joints; S and E stay fixed.
    var x = [];
    for (var xi = 0; xi < unknownCount; xi += 1) {
      x.push(seedChain[xi + 1].x, seedChain[xi + 1].y);
    }

    function chainFromX(values) {
      var chain = [{ x: S.x, y: S.y }];
      for (var k = 0; k < unknownCount; k += 1) {
        chain.push({ x: values[2 * k], y: values[2 * k + 1] });
      }
      chain.push({ x: E.x, y: E.y });
      return chain;
    }

    function evaluate(withJacobian) {
      var chain = chainFromX(x);
      var items = [];
      for (var ri = 0; ri < m; ri += 1) {
        var p = chain[ri + 1];
        var prevP = chain[ri];

        var radial = dist(p, O) - rows[ri].d;
        var radialEntries = [];
        if (withJacobian && ri < unknownCount) {
          var lr = dist(p, O) || 1;
          radialEntries.push({
            v: ri,
            dx: (p.x - O.x) / lr / sigma,
            dy: (p.y - O.y) / lr / sigma
          });
        }
        items.push({ value: radial / sigma, entries: radialEntries });

        var seg = dist(p, prevP) - rows[ri].s;
        var segEntries = [];
        if (withJacobian) {
          var ls = dist(p, prevP) || 1;
          var ux = (p.x - prevP.x) / ls;
          var uy = (p.y - prevP.y) / ls;
          if (ri < unknownCount) {
            segEntries.push({ v: ri, dx: ux / sigma, dy: uy / sigma });
          }
          if (ri - 1 >= 0 && ri - 1 < unknownCount) {
            segEntries.push({ v: ri - 1, dx: -ux / sigma, dy: -uy / sigma });
          }
        }
        items.push({ value: seg / sigma, entries: segEntries });
      }
      var cost = 0;
      for (var q = 0; q < items.length; q += 1) cost += items[q].value * items[q].value;
      return { items: items, cost: cost, chain: chain };
    }

    var ev = evaluate(true);
    var iterations = 60;
    for (var it = 0; it < iterations; it += 1) {
      var n = 2 * unknownCount;
      var a = zeros(n);
      var g = new Array(n);
      for (var gi = 0; gi < n; gi += 1) g[gi] = 0;
      for (var ei = 0; ei < ev.items.length; ei += 1) {
        var item = ev.items[ei];
        for (var ea = 0; ea < item.entries.length; ea += 1) {
          var eaEntry = item.entries[ea];
          var ia = 2 * eaEntry.v;
          g[ia] += eaEntry.dx * item.value;
          g[ia + 1] += eaEntry.dy * item.value;
          for (var eb = 0; eb < item.entries.length; eb += 1) {
            var ebEntry = item.entries[eb];
            var ib = 2 * ebEntry.v;
            a[ia][ib] += eaEntry.dx * ebEntry.dx;
            a[ia][ib + 1] += eaEntry.dx * ebEntry.dy;
            a[ia + 1][ib] += eaEntry.dy * ebEntry.dx;
            a[ia + 1][ib + 1] += eaEntry.dy * ebEntry.dy;
          }
        }
      }
      var trace = 0;
      for (var ti = 0; ti < n; ti += 1) trace += a[ti][ti];
      var lambda = Math.max(1e-12, trace * 1e-10);
      for (var li = 0; li < n; li += 1) a[li][li] += lambda;

      var rhs = [];
      for (var ri2 = 0; ri2 < n; ri2 += 1) rhs.push(-g[ri2]);
      var dxv = solveLinearSystem(a, rhs);
      if (!dxv) break;
      var stepNorm = 0;
      for (var si = 0; si < n; si += 1) stepNorm += dxv[si] * dxv[si];
      stepNorm = Math.sqrt(stepNorm);
      if (stepNorm < 1e-7) break;

      var oldX = x.slice();
      var oldCost = ev.cost;
      var scale = 1;
      var accepted = false;
      for (var ls = 0; ls < 14; ls += 1) {
        for (var vi = 0; vi < n; vi += 1) {
          x[vi] = oldX[vi] + dxv[vi] * scale;
        }
        var trial = evaluate(true);
        if (trial.cost <= oldCost) {
          ev = trial;
          accepted = true;
          break;
        }
        scale /= 2;
      }
      if (!accepted) {
        x = oldX;
        break;
      }
    }

    var finalEval = evaluate(false);
    var chain = finalEval.chain;

    // Position uncertainty from (J^T J)^-1 * sigma^2.
    var nn = 2 * unknownCount;
    var normal = zeros(nn);
    var jacEval = evaluate(true);
    for (var ni = 0; ni < jacEval.items.length; ni += 1) {
      var jitem = jacEval.items[ni];
      for (var na = 0; na < jitem.entries.length; na += 1) {
        var naE = jitem.entries[na];
        for (var nb = 0; nb < jitem.entries.length; nb += 1) {
          var nbE = jitem.entries[nb];
          normal[2 * naE.v][2 * nbE.v] += naE.dx * nbE.dx;
          normal[2 * naE.v][2 * nbE.v + 1] += naE.dx * nbE.dy;
          normal[2 * naE.v + 1][2 * nbE.v] += naE.dy * nbE.dx;
          normal[2 * naE.v + 1][2 * nbE.v + 1] += naE.dy * nbE.dy;
        }
      }
    }
    var cov = nn > 0 ? invertMatrix(normal) : null;

    var outRows = [];
    var maxAbsD = 0;
    var maxAbsS = 0;
    var sumSq = 0;
    var thrWarn = Math.max(3 * sigma, 5);
    var thrError = Math.max(6 * sigma, 10);

    for (var oi = 0; oi < m; oi += 1) {
      var pRow = chain[oi + 1];
      var prevRow = chain[oi];
      var resD = dist(pRow, O) - rows[oi].d;
      var resS = dist(pRow, prevRow) - rows[oi].s;
      maxAbsD = Math.max(maxAbsD, Math.abs(resD));
      maxAbsS = Math.max(maxAbsS, Math.abs(resS));
      sumSq += resD * resD + resS * resS;

      var sigmaPos = 0;
      if (cov && oi < unknownCount) {
        var block = 2 * oi;
        sigmaPos = sigma * Math.sqrt(Math.max(0, cov[block][block] + cov[block + 1][block + 1]));
      }

      var worst = Math.max(Math.abs(resD), Math.abs(resS));
      var status = "ok";
      var messages = [];
      if (worst > thrError) {
        status = "error";
      } else if (worst > thrWarn) {
        status = "warn";
      }
      if (Math.abs(resD) > thrWarn) {
        messages.push("радіус відхиляється на " + formatFixed(resD, 1) + " мм");
      }
      if (Math.abs(resS) > thrWarn) {
        messages.push("сегмент відхиляється на " + formatFixed(resS, 1) + " мм");
      }
      if (sigmaPos > Math.max(50, 12 * sigma)) {
        if (status === "ok") status = "warn";
        messages.push("низька точність положення ±" + Math.round(sigmaPos) + " мм");
      }
      if (messages.length > 0) {
        warnings.push("Рядок " + (oi + 1) + ": " + messages.join("; ") + ".");
      }

      outRows.push({
        d: rows[oi].d,
        s: rows[oi].s,
        residualD: resD,
        residualS: resS,
        sigmaPos: sigmaPos,
        status: status,
        messages: messages,
        fixed: oi === m - 1
      });
    }

    return {
      ok: true,
      errors: [],
      warnings: warnings,
      chain: chain,
      rows: outRows,
      start: { x: S.x, y: S.y },
      end: { x: E.x, y: E.y },
      origin: { x: O.x, y: O.y },
      sigma: sigma,
      residuals: {
        maxAbsD: maxAbsD,
        maxAbsS: maxAbsS,
        rms: Math.sqrt(sumSq / (2 * m))
      }
    };
  }

  function applyOffsets(chain, offsets) {
    var offs = offsets || {};
    return chain.map(function (p, idx) {
      if (idx === 0 || idx === chain.length - 1) {
        return { x: p.x, y: p.y };
      }
      var off = offs[idx - 1];
      if (!off) return { x: p.x, y: p.y };
      return {
        x: p.x + (isFiniteNumber(off.dx) ? off.dx : 0),
        y: p.y + (isFiniteNumber(off.dy) ? off.dy : 0)
      };
    });
  }

  function chainResiduals(chain, rows, origin, sigma) {
    var s = Math.max(0.01, numOr(sigma, 3));
    var thrWarn = Math.max(3 * s, 5);
    var thrError = Math.max(6 * s, 10);
    var out = [];
    var maxAbsD = 0;
    var maxAbsS = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var p = chain[i + 1];
      var prev = chain[i];
      var d = numOr(rows[i].d, 0);
      var seg = numOr(rows[i].s, 0);
      var resD = dist(p, origin) - d;
      var resS = dist(p, prev) - seg;
      maxAbsD = Math.max(maxAbsD, Math.abs(resD));
      maxAbsS = Math.max(maxAbsS, Math.abs(resS));
      var worst = Math.max(Math.abs(resD), Math.abs(resS));
      var status = worst > thrError ? "error" : worst > thrWarn ? "warn" : "ok";
      out.push({
        residualD: resD,
        residualS: resS,
        status: status,
        fixed: i === rows.length - 1
      });
    }
    return { rows: out, maxAbsD: maxAbsD, maxAbsS: maxAbsS };
  }

  /* ------------------------------------------------------------------ */
  /* Chain edges + contour assembly                                      */
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

  function buildChainEdges(points, options) {
    var opts = options || {};
    var startCorner = opts.startCorner !== false;
    var endCorner = opts.endCorner !== false;
    var n = points.length;
    var edges = [];
    if (n < 2) return edges;

    var tangents = new Array(n);
    for (var i = 0; i < n; i += 1) tangents[i] = null;
    for (var t = 1; t < n - 1; t += 1) {
      tangents[t] = circumcircleTangent(points[t - 1], points[t], points[t + 1]);
    }

    var limit = 120 * DEG;
    for (var e = 0; e < n - 1; e += 1) {
      var start = points[e];
      var end = points[e + 1];
      var st = e === 0 && startCorner ? null : tangents[e];
      var et = e === n - 2 && endCorner ? null : tangents[e + 1];

      if (st === null && et === null) {
        edges.push(makeLine(start, end));
        continue;
      }
      var chordAngle = angleOf({ x: end.x - start.x, y: end.y - start.y });
      if (st === null) st = wrapPi(2 * chordAngle - et);
      if (et === null) et = wrapPi(2 * chordAngle - st);

      var alphaStart = wrapPi(chordAngle - st);
      var alphaEnd = wrapPi(et - chordAngle);
      var alpha = (alphaStart + alphaEnd) / 2;
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

  function assembleContour(options) {
    var opts = options || {};
    var baseEdges = Array.isArray(opts.edges) ? opts.edges : [];
    var iS = opts.startIndex;
    var iE = opts.endIndex;
    var chainPoints = (opts.chainPoints || []).map(function (p) {
      return { x: p.x, y: p.y };
    });
    var warnings = [];
    var errors = [];
    var n = baseEdges.length;

    if (n < 3) {
      errors.push("Імпортований контур містить менше трьох сегментів.");
    }
    if (!(iS >= 0 && iS < n) || !(iE >= 0 && iE < n) || iS === iE) {
      errors.push("Некоректно вибрано початок і кінець согнутой сторони.");
    }
    if (chainPoints.length < 2) {
      errors.push("Ланцюг точок кривої порожній.");
    }
    if (errors.length > 0) {
      return { ok: false, errors: errors, warnings: warnings, edges: [], stats: null };
    }

    var iEfull = iE > iS ? iE : iE + n;
    var replacedCount = iEfull - iS;
    var E = baseEdges[(iEfull - 1) % n].end;

    if (dist(chainPoints[0], baseEdges[iS].start) > 0.5) {
      warnings.push("Початок ланцюга не збігається з кутом S — використано кут S.");
      chainPoints[0] = { x: baseEdges[iS].start.x, y: baseEdges[iS].start.y };
    }
    if (dist(chainPoints[chainPoints.length - 1], E) > 0.5) {
      warnings.push("Кінець ланцюга не збігається з кутом E — додано пряму ділянку.");
      chainPoints.push({ x: E.x, y: E.y });
    } else {
      chainPoints[chainPoints.length - 1] = { x: E.x, y: E.y };
    }

    var chainEdges = buildChainEdges(chainPoints, {
      startCorner: opts.startCorner !== false,
      endCorner: opts.endCorner !== false
    });

    var remaining = [];
    for (var k = iEfull; k < iS + n; k += 1) {
      remaining.push(baseEdges[k % n]);
    }

    var allEdges = chainEdges.concat(remaining);
    var maxGap = 0;
    for (var g = 0; g < allEdges.length; g += 1) {
      var nxt = allEdges[(g + 1) % allEdges.length];
      var gap = dist(allEdges[g].end, nxt.start);
      if (gap > maxGap) maxGap = gap;
    }
    if (maxGap > 1) {
      warnings.push("У контурі є розрив " + formatFixed(maxGap, 1) + " мм — перевірте імпортований .glc.");
    }

    return {
      ok: true,
      errors: [],
      warnings: warnings,
      edges: allEdges,
      chainEdges: chainEdges,
      chainPoints: chainPoints,
      replacedEdges: baseEdges.slice(iS, iS + replacedCount),
      startIndex: iS,
      endIndex: iEfull,
      startCorner: { x: baseEdges[iS].start.x, y: baseEdges[iS].start.y },
      endCorner: { x: E.x, y: E.y },
      stats: contourStats(allEdges)
    };
  }

  function mirrorContourY(contour) {
    var edges = contour.edges || [];
    if (!edges.length) return contour;
    var b = edgesBounds(edges);
    var sum = b.minY + b.maxY;
    function flip(p) {
      return { x: p.x, y: sum - p.y };
    }
    var mirrored = edges.map(function (edge) {
      var start = flip(edge.start);
      var end = flip(edge.end);
      if (edge.type === "arc") {
        return makeArcFromBulge(start, end, -edge.bulge);
      }
      return makeLine(start, end);
    });
    return {
      ok: contour.ok,
      errors: contour.errors || [],
      warnings: contour.warnings || [],
      edges: mirrored,
      chainEdges: (contour.chainEdges || []).map(function (edge, idx) {
        return mirrored[idx];
      }),
      chainPoints: (contour.chainPoints || []).map(function (p) {
        return { x: p.x, y: sum - p.y };
      }),
      startCorner: contour.startCorner ? flip(contour.startCorner) : null,
      endCorner: contour.endCorner ? flip(contour.endCorner) : null,
      stats: contourStats(mirrored),
      mirrored: true
    };
  }

  /* ------------------------------------------------------------------ */
  /* GLC import                                                          */
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
        bytes[i] = 0x3f;
      }
    }
    return bytes;
  }

  function decodeWindows1251Manual(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 1) {
      var b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
      } else if (b >= 0xC0) {
        out += String.fromCharCode(0x0410 + (b - 0xC0));
      } else {
        var ch = CP1251_HIGH.charAt(b - 0x80);
        out += ch === "\u0098" ? "?" : ch || "?";
      }
    }
    return out;
  }

  function decodeBytes(input) {
    if (typeof input === "string") return input;
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
      bytes = bytes.subarray(3);
    }
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder("windows-1251").decode(bytes);
      } catch (e) {
        // Fall through to the manual table.
      }
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch (e2) {
        // Not UTF-8 either; use cp1251.
      }
    }
    return decodeWindows1251Manual(bytes);
  }

  function parseCoord(text) {
    var parts = String(text).split(",");
    if (parts.length < 2) return null;
    var x = parseFloat(parts[0]);
    var y = parseFloat(parts[1]);
    if (!isFinite(x) || !isFinite(y)) return null;
    return { x: x, y: y };
  }

  function makeImportedEdge(raw, sagittaFallback) {
    if (!raw || !raw.start || !raw.end) return null;
    var sagitta = raw.sagitta !== null && raw.sagitta !== undefined
      ? raw.sagitta
      : sagittaFallback;
    var hasArc = !!raw.arcPoint || (isFiniteNumber(sagitta) && Math.abs(sagitta) > 1e-6);
    if (!hasArc) return makeLine(raw.start, raw.end);
    var mid = raw.arcPoint || arcPointFromSagitta(raw.start, raw.end, sagitta || 0);
    return makeArcFromThreePoints(raw.start, mid, raw.end);
  }

  function serializeEdge(edge) {
    var info = arcPointAndSagitta(edge);
    return {
      type: edge.type,
      start: { x: edge.start.x, y: edge.start.y },
      end: { x: edge.end.x, y: edge.end.y },
      arcPoint: info.arcPoint ? { x: info.arcPoint.x, y: info.arcPoint.y } : null,
      sagitta: info.sagitta || 0
    };
  }

  function deserializeEdge(obj) {
    if (!obj || !obj.start || !obj.end) return null;
    if (obj.type === "arc") {
      return makeImportedEdge({
        start: obj.start,
        end: obj.end,
        arcPoint: obj.arcPoint,
        sagitta: obj.sagitta
      });
    }
    return makeLine(obj.start, obj.end);
  }

  function parseGlc(input) {
    var text = decodeBytes(input);
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    var result = {
      ok: false,
      errors: [],
      warnings: [],
      roomName: "",
      corners: [],
      edges: [],
      sourceCorners: []
    };
    var block = null;
    var roomCount = 0;
    var arcs = {};
    var current = null;
    var edgeIndex = 0;

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].replace(/\/\/.*$/, "").trim();
      if (!line) continue;

      if (line === "ROOMBEGIN") {
        roomCount += 1;
        if (roomCount > 1) {
          result.warnings.push("У файлі кілька кімнат — використано першу.");
          break;
        }
        block = "room";
        result.corners = [];
        result.edges = [];
        arcs = {};
        current = null;
        edgeIndex = 0;
        continue;
      }
      if (roomCount !== 1) continue;

      if (line === "POINTS") {
        block = "points";
        continue;
      }
      if (line === "POINTSEND") {
        block = null;
        continue;
      }
      if (line === "OTRARCS") {
        block = "otrarcs";
        continue;
      }
      if (line === "OTRARCSEND") {
        block = null;
        continue;
      }
      if (line === "otrlist_") {
        block = "edges";
        continue;
      }
      if (line === "otrlist_end") {
        block = null;
        continue;
      }

      if (line.indexOf("RoomName ") === 0) {
        result.roomName = line.slice("RoomName ".length).trim();
        continue;
      }

      if (block === "points" && line.indexOf("AnglePoint ") === 0) {
        var corner = parseCoord(line.slice("AnglePoint ".length));
        if (corner) result.sourceCorners.push(corner);
        continue;
      }

      if (block === "otrarcs") {
        if (line.indexOf("WallWid3 ") === 0) {
          var ww = line.slice("WallWid3 ".length).split(",");
          var widx = parseInt(ww[0], 10);
          var wval = parseFloat(ww[1]);
          if (isFinite(widx) && isFinite(wval)) arcs[widx] = wval;
        } else if (line.indexOf("OtrArcHei ") === 0) {
          var oh = line.slice("OtrArcHei ".length).split(",");
          var hidx = parseInt(oh[0], 10);
          var hval = parseFloat(oh[1]);
          if (isFinite(hidx) && isFinite(hval)) arcs[hidx] = hval;
        }
        continue;
      }

      if (block === "edges") {
        if (line === "NPLine") {
          current = { start: null, end: null, arcPoint: null, sagitta: null };
          continue;
        }
        if (line === "END") {
          if (current) {
            var edge = makeImportedEdge(current, arcs[edgeIndex]);
            if (edge) result.edges.push(edge);
          }
          current = null;
          edgeIndex += 1;
          continue;
        }
        if (!current) continue;
        if (line.indexOf("PoBeg ") === 0) {
          current.start = parseCoord(line.slice("PoBeg ".length));
        } else if (line.indexOf("PoEnd ") === 0) {
          current.end = parseCoord(line.slice("PoEnd ".length));
        } else if (line.indexOf("ArcPoint ") === 0) {
          current.arcPoint = parseCoord(line.slice("ArcPoint ".length));
        } else if (line.indexOf("ArcHei ") === 0) {
          current.sagitta = parseFloat(line.slice("ArcHei ".length));
        }
        continue;
      }
    }

    if (result.edges.length < 3) {
      result.errors.push("У файлі не знайдено замкнений контур (POINTS/otrlist_).");
      return result;
    }

    var corners = result.edges.map(function (edge) {
      return { x: edge.start.x, y: edge.start.y };
    });
    var maxGap = 0;
    for (var g = 0; g < result.edges.length; g += 1) {
      var nxt = result.edges[(g + 1) % result.edges.length];
      var gap = dist(result.edges[g].end, nxt.start);
      if (gap > maxGap) maxGap = gap;
    }
    if (maxGap > 1) {
      result.warnings.push(
        "Контур у файлі має розрив " + formatFixed(maxGap, 1) + " мм — перевірте геометрію."
      );
    }
    if (result.sourceCorners.length && result.sourceCorners.length !== corners.length) {
      result.warnings.push(
        "Кількість AnglePoint (" + result.sourceCorners.length +
          ") не збігається з кількістю сегментів (" + corners.length + ")."
      );
    }
    if (!result.roomName) result.roomName = "Ceiling_1";

    result.corners = corners;
    result.ok = result.errors.length === 0;
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* GLC / DXF / SVG export                                              */
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

  function buildGlc(contour, options) {
    if (!contour || !contour.edges || contour.edges.length === 0) {
      throw new Error("Немає коректного контуру для експорту GLC.");
    }
    var opts = options || {};
    var roomName = String(opts.roomName || "Ceiling_1").replace(/[\r\n]+/g, " ").trim() || "Ceiling_1";
    var roomUid = opts.roomUid || randomUuid();
    var zoneUid = opts.zoneUid || randomUuid();
    var segments = contour.edges;
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
    lines.push("Doc1CID 1");
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
        var info = arcPointAndSagitta(seg);
        lines.push("OtrArcHei " + String(idx) + ", " + formatNumber(info.sagitta));
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
        var info = arcPointAndSagitta(seg);
        lines.push("ArcPoint " + formatNumber(info.arcPoint.x) + ", " + formatNumber(info.arcPoint.y));
        lines.push("ArcHei " + formatNumber(info.sagitta));
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

  function buildDxf(contour) {
    if (!contour || !contour.edges) {
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

  function escapeXml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function buildSvg(contour, options) {
    if (!contour || !contour.edges || contour.edges.length === 0) {
      throw new Error("Немає коректного контуру для експорту SVG.");
    }
    var opts = options || {};
    var showPoints = opts.showPoints !== false;
    var showDims = opts.showDims !== false;
    var title = opts.title || "";
    var b = edgesBounds(contour.edges);
    var pad = Math.max(150, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08);
    var minX = b.minX - pad;
    var maxX = b.maxX + pad;
    var minY = b.minY - pad;
    var maxY = b.maxY + pad;
    var w = Math.max(1, maxX - minX);
    var h = Math.max(1, maxY - minY);

    function sx(x) { return x - minX; }
    function sy(y) { return -y + maxY; }

    var parts = [];
    parts.push(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + formatNumber(w, 2) + " " +
        formatNumber(h, 2) + '" width="1200" height="' +
        formatNumber((1200 * h) / Math.max(1, w), 2) + '">'
    );
    parts.push('<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>');
    parts.push('<g font-family="Segoe UI, Tahoma, sans-serif" font-size="18" fill="#5e6c63">');
    if (title) {
      parts.push('<text x="12" y="26" font-size="22" fill="#1f2a24">' + escapeXml(title) + "</text>");
    }

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

    if (showPoints && contour.chainPoints) {
      contour.chainPoints.forEach(function (p, idx) {
        if (idx === 0 || idx === contour.chainPoints.length - 1) return;
        parts.push(
          '<circle cx="' + formatNumber(sx(p.x), 2) + '" cy="' + formatNumber(sy(p.y), 2) +
            '" r="5" fill="#2f6d4e" stroke="#ffffff" stroke-width="1.5"/>'
        );
        parts.push(
          '<text x="' + formatNumber(sx(p.x) + 8, 2) + '" y="' + formatNumber(sy(p.y) + 18, 2) +
            '" font-size="14" fill="#5e6c63">' + String(idx) + "</text>"
        );
      });
    }

    if (showDims) {
      contour.edges.forEach(function (edge) {
        var mid = edge.type === "arc" ? edge.arcPoint : midpoint(edge.start, edge.end);
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
  /* Demo data                                                           */
  /* ------------------------------------------------------------------ */

  function makeSeedRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussianFrom(rng) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function buildDemo() {
    var pts = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 500 },
      { x: 6000, y: 3500 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 }
    ];
    var edges = [];
    for (var i = 0; i < pts.length; i += 1) {
      edges.push(serializeEdge(makeLine(pts[i], pts[(i + 1) % pts.length])));
    }
    var startIndex = 2;
    var endIndex = 3;
    var origin = { x: 0, y: 0 };
    var rng = makeSeedRandom(20261112);
    var rows = [];
    var prev = pts[startIndex];
    var count = 8;
    for (var k = 1; k <= count; k += 1) {
      var t = k / count;
      var x = 6000 - 500 * Math.sin(Math.PI * t);
      var y = 500 + 3000 * t;
      var point = { x: x, y: y };
      var d = dist(origin, point) + gaussianFrom(rng) * 1.2;
      var s = dist(prev, point) + gaussianFrom(rng) * 1.2;
      rows.push({ d: d, s: s });
      prev = point;
    }
    return {
      roomName: "Демо: вітальня",
      objectName: "Демо: вітальня",
      corners: pts,
      edges: edges,
      selection: { start: startIndex, end: endIndex },
      origin: { mode: "corner", corner: 0, x: "", y: "" },
      rows: rows
    };
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  return {
    VERSION: "1.0.0",
    UNIT_TO_MM: UNIT_TO_MM,
    parseNumber: parseNumber,
    toMm: toMm,
    fromMm: fromMm,
    formatNumber: formatNumber,
    formatFixed: formatFixed,
    slugFilename: slugFilename,
    dist: dist,
    makeLine: makeLine,
    makeArcFromBulge: makeArcFromBulge,
    makeArcFromThreePoints: makeArcFromThreePoints,
    arcPointFromSagitta: arcPointFromSagitta,
    arcPointAndSagitta: arcPointAndSagitta,
    sampleEdge: sampleEdge,
    edgesSignedArea: edgesSignedArea,
    edgesPerimeter: edgesPerimeter,
    edgesCurvedLength: edgesCurvedLength,
    edgesBounds: edgesBounds,
    boundsFromPoints: boundsFromPoints,
    contourStats: contourStats,
    converterAreaAbs: converterAreaAbs,
    circleCircle: circleCircle,
    solveChain: solveChain,
    applyOffsets: applyOffsets,
    chainResiduals: chainResiduals,
    buildChainEdges: buildChainEdges,
    assembleContour: assembleContour,
    mirrorContourY: mirrorContourY,
    parseGlc: parseGlc,
    serializeEdge: serializeEdge,
    deserializeEdge: deserializeEdge,
    encodeWindows1251: encodeWindows1251,
    decodeBytes: decodeBytes,
    buildGlc: buildGlc,
    buildGlcBytes: buildGlcBytes,
    buildDxf: buildDxf,
    buildSvg: buildSvg,
    buildDemo: buildDemo,
    _internals: {
      circumcenter: circumcenter,
      circumcircleTangent: circumcircleTangent,
      solveLinearSystem: solveLinearSystem,
      invertMatrix: invertMatrix,
      makeSeedRandom: makeSeedRandom
    }
  };
});
