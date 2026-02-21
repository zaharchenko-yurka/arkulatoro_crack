const DEFAULT_EPSILON = 0.5;
const SNAP_TOLERANCE_MM = 0.1;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentLength(seg) {
  if (seg.type === "line") {
    return distance(seg.start, seg.end);
  }
  return (Math.PI * seg.radius * Math.abs(seg.sweepDeg)) / 180;
}

function reverseSegment(seg) {
  if (seg.type === "line") {
    return {
      ...seg,
      start: seg.end,
      end: seg.start
    };
  }
  return {
    ...seg,
    start: seg.end,
    end: seg.start,
    clockwise: !seg.clockwise
  };
}

function sampleSegmentPoints(seg, divisions = 12) {
  if (seg.type === "line") {
    return [seg.start, seg.end];
  }
  const out = [];
  const startAngle = Math.atan2(seg.start.y - seg.center.y, seg.start.x - seg.center.x);
  const dir = seg.clockwise ? -1 : 1;
  const delta = (dir * Math.abs(seg.sweepDeg) * Math.PI) / 180;
  const step = delta / divisions;
  for (let i = 0; i <= divisions; i += 1) {
    const a = startAngle + i * step;
    out.push({
      x: seg.center.x + seg.radius * Math.cos(a),
      y: seg.center.y + seg.radius * Math.sin(a)
    });
  }
  return out;
}

function signedAreaFromSegments(segments) {
  const points = [];
  segments.forEach((seg, idx) => {
    const sampled = sampleSegmentPoints(seg, seg.type === "arc" ? 18 : 1);
    if (idx === 0) {
      points.push(...sampled);
    } else {
      points.push(...sampled.slice(1));
    }
  });
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

function addOrGetNode(nodes, point, epsilon) {
  for (let i = 0; i < nodes.length; i += 1) {
    if (distance(nodes[i].point, point) <= epsilon) {
      return i;
    }
  }
  nodes.push({ point: { ...point } });
  return nodes.length - 1;
}

function roundCoord(v) {
  return Number(v.toFixed(6));
}

function lexicographicPointKey(a, b) {
  if (a.x < b.x) {
    return [a, b];
  }
  if (a.x > b.x) {
    return [b, a];
  }
  if (a.y <= b.y) {
    return [a, b];
  }
  return [b, a];
}

function segmentDuplicateKey(seg) {
  const [p1, p2] = lexicographicPointKey(seg.start, seg.end);
  const header =
    `${seg.type}|${roundCoord(p1.x)},${roundCoord(p1.y)}|${roundCoord(p2.x)},${roundCoord(p2.y)}`;
  if (seg.type === "line") {
    return header;
  }
  return `${header}|${roundCoord(seg.center.x)},${roundCoord(seg.center.y)}|${roundCoord(seg.radius)}|${roundCoord(Math.abs(seg.sweepDeg))}`;
}

function snapSegments(inputSegments, tolerance) {
  const segments = inputSegments.map((seg) => ({
    ...seg,
    start: { ...seg.start },
    end: { ...seg.end },
    center: seg.center ? { ...seg.center } : seg.center
  }));

  const vertices = [];
  segments.forEach((seg, segIdx) => {
    vertices.push({ segIdx, pointKey: "start", point: seg.start });
    vertices.push({ segIdx, pointKey: "end", point: seg.end });
  });
  if (vertices.length <= 1) {
    return { segments, snappedVertexPairs: 0 };
  }

  // Sorted sweep on X keeps pair checks bounded for typical drawing sizes.
  const sorted = vertices
    .map((v, idx) => ({
      ...v,
      idx,
      x: v.point.x,
      y: v.point.y
    }))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));

  const parent = vertices.map((_, i) => i);
  const rank = vertices.map(() => 0);
  const find = (i) => {
    let p = i;
    while (parent[p] !== p) {
      parent[p] = parent[parent[p]];
      p = parent[p];
    }
    return p;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      return false;
    }
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
    } else {
      parent[rb] = ra;
      rank[ra] += 1;
    }
    return true;
  };

  let snappedVertexPairs = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (b.x - a.x > tolerance) {
        break;
      }
      if (Math.abs(b.y - a.y) > tolerance) {
        continue;
      }
      if (Math.hypot(a.x - b.x, a.y - b.y) <= tolerance) {
        if (union(a.idx, b.idx)) {
          snappedVertexPairs += 1;
        }
      }
    }
  }

  const accum = new Map();
  vertices.forEach((v, idx) => {
    const root = find(idx);
    const bucket = accum.get(root) || { sx: 0, sy: 0, n: 0 };
    bucket.sx += v.point.x;
    bucket.sy += v.point.y;
    bucket.n += 1;
    accum.set(root, bucket);
  });
  const centroid = new Map();
  accum.forEach((bucket, root) => {
    centroid.set(root, {
      x: bucket.sx / bucket.n,
      y: bucket.sy / bucket.n
    });
  });

  vertices.forEach((v, idx) => {
    const c = centroid.get(find(idx));
    segments[v.segIdx][v.pointKey] = { x: c.x, y: c.y };
  });

  const deduped = [];
  const seen = new Set();
  segments.forEach((seg) => {
    const key = segmentDuplicateKey(seg);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(seg);
    }
  });

  return {
    segments: deduped,
    snappedVertexPairs
  };
}

function orientEdge(edge, fromNode) {
  if (edge.startNode === fromNode) {
    return edge.base;
  }
  return reverseSegment(edge.base);
}

function lineSegmentsIntersect(a1, a2, b1, b2, epsilon) {
  const cross = (u, v) => u.x * v.y - u.y * v.x;
  const sub = (u, v) => ({ x: u.x - v.x, y: u.y - v.y });
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const rxs = cross(r, s);
  const qmp = sub(b1, a1);
  const qmpxr = cross(qmp, r);
  if (Math.abs(rxs) <= epsilon && Math.abs(qmpxr) <= epsilon) {
    return false;
  }
  if (Math.abs(rxs) <= epsilon) {
    return false;
  }
  const t = cross(qmp, s) / rxs;
  const u = cross(qmp, r) / rxs;
  return t > epsilon && t < 1 - epsilon && u > epsilon && u < 1 - epsilon;
}

function detectIntersections(contours, epsilon) {
  const segments = [];
  contours.forEach((c) => {
    c.segments.forEach((seg) => {
      const pts = sampleSegmentPoints(seg, seg.type === "arc" ? 16 : 1);
      for (let i = 0; i < pts.length - 1; i += 1) {
        segments.push({ p1: pts[i], p2: pts[i + 1] });
      }
    });
  });
  let hits = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      if (
        distance(a.p1, b.p1) <= epsilon ||
        distance(a.p1, b.p2) <= epsilon ||
        distance(a.p2, b.p1) <= epsilon ||
        distance(a.p2, b.p2) <= epsilon
      ) {
        continue;
      }
      if (lineSegmentsIntersect(a.p1, a.p2, b.p1, b.p2, epsilon)) {
        hits += 1;
      }
    }
  }
  return hits;
}

export function reverseContourSegments(segments) {
  return segments.slice().reverse().map((seg) => reverseSegment(seg));
}

export function buildContours(inputSegments, epsilon = DEFAULT_EPSILON) {
  const snapped = snapSegments(inputSegments, SNAP_TOLERANCE_MM);
  const nodes = [];
  const edges = snapped.segments.map((base, idx) => {
    const startNode = addOrGetNode(nodes, base.start, epsilon);
    const endNode = addOrGetNode(nodes, base.end, epsilon);
    return { id: idx, base, startNode, endNode };
  });

  const adjacency = new Map();
  edges.forEach((edge) => {
    const a = adjacency.get(edge.startNode) || [];
    a.push(edge.id);
    adjacency.set(edge.startNode, a);
    const b = adjacency.get(edge.endNode) || [];
    b.push(edge.id);
    adjacency.set(edge.endNode, b);
  });

  const degree = new Map();
  adjacency.forEach((list, nodeId) => degree.set(nodeId, list.length));

  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const edgeComponentSeen = new Set();
  const edgeComponents = [];
  edges.forEach((seed) => {
    if (edgeComponentSeen.has(seed.id)) {
      return;
    }
    const queue = [seed.id];
    const component = [];
    edgeComponentSeen.add(seed.id);
    while (queue.length > 0) {
      const edgeId = queue.shift();
      component.push(edgeId);
      const e = edgeById.get(edgeId);
      [e.startNode, e.endNode].forEach((nodeId) => {
        (adjacency.get(nodeId) || []).forEach((nextId) => {
          if (!edgeComponentSeen.has(nextId)) {
            edgeComponentSeen.add(nextId);
            queue.push(nextId);
          }
        });
      });
    }
    edgeComponents.push(component);
  });

  const contours = [];
  const openChains = [];
  let discardedOpenGroups = 0;
  let autoClosedContours = 0;

  edgeComponents.forEach((componentEdgeIds) => {
    const componentUnused = new Set(componentEdgeIds);
    const componentContours = [];
    const componentOpenChains = [];

    // Build chains only inside a connected geometry group (macro-element candidate).
    while (componentUnused.size > 0) {
      const seedId = componentUnused.values().next().value;
      const seed = edgeById.get(seedId);
      const chain = [];
      const startNode = seed.startNode;
      let currentNode = seed.startNode;
      let currentEdge = seed;
      let guard = 0;
      let closed = false;

      while (guard < edges.length + 5) {
        guard += 1;
        if (!componentUnused.has(currentEdge.id)) {
          break;
        }
        componentUnused.delete(currentEdge.id);
        const oriented = orientEdge(currentEdge, currentNode);
        chain.push(oriented);
        currentNode = currentEdge.startNode === currentNode ? currentEdge.endNode : currentEdge.startNode;
        if (currentNode === startNode) {
          closed = true;
          break;
        }
        const nextCandidates = (adjacency.get(currentNode) || []).filter((id) => componentUnused.has(id));
        if (nextCandidates.length === 0) {
          break;
        }
        currentEdge = edgeById.get(nextCandidates[0]);
      }

      // Gap closure for almost-closed chains after snapping.
      if (!closed && chain.length > 1) {
        const first = chain[0].start;
        const last = chain[chain.length - 1].end;
        if (distance(first, last) <= epsilon) {
          const lastSeg = chain[chain.length - 1];
          chain[chain.length - 1] = {
            ...lastSeg,
            end: { ...first }
          };
          closed = true;
          autoClosedContours += 1;
        }
      }

      const perimeter = chain.reduce((sum, seg) => sum + segmentLength(seg), 0);
      if (closed && chain.length > 1) {
        const signedArea = signedAreaFromSegments(chain);
        componentContours.push({
          closed: true,
          segments: chain,
          perimeter,
          signedArea,
          winding: signedArea >= 0 ? "CCW" : "CW"
        });
      } else {
        componentOpenChains.push({
          closed: false,
          segments: chain,
          perimeter
        });
      }
    }

    if (componentContours.length > 0) {
      contours.push(...componentContours);
      openChains.push(...componentOpenChains);
    } else {
      discardedOpenGroups += 1;
    }
  });

  const warnings = [];
  const intersections = detectIntersections(contours, epsilon);
  if (intersections > 0) {
    warnings.push(`Detected ${intersections} potential edge intersections.`);
  }
  warnings.push(`Snapped ${snapped.snappedVertexPairs} vertex pairs within tolerance`);
  warnings.push(`Auto-closed ${autoClosedContours} contours`);
  warnings.push(`Discarded ${discardedOpenGroups} open geometry groups`);

  return {
    contours,
    openChains,
    openEdgeIds: [],
    warnings,
    debug: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      openNodeCount: Array.from(degree.values()).filter((d) => d !== 2).length,
      snappedVertexPairs: snapped.snappedVertexPairs,
      autoClosedContours,
      discardedOpenGroups
    }
  };
}
