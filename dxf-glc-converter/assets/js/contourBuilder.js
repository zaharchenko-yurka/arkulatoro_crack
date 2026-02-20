const DEFAULT_EPSILON = 0.5;

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
  const nodes = [];
  const edges = inputSegments.map((base, idx) => {
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

  const openEdgeIds = new Set();
  edges.forEach((e) => {
    if ((degree.get(e.startNode) || 0) !== 2 || (degree.get(e.endNode) || 0) !== 2) {
      openEdgeIds.add(e.id);
    }
  });

  const unused = new Set(edges.map((e) => e.id));
  const contours = [];
  const openChains = [];

  while (unused.size > 0) {
    const seedId = unused.values().next().value;
    const seed = edges[seedId];
    const chain = [];
    const startNode = seed.startNode;
    let currentNode = seed.startNode;
    let currentEdge = seed;
    let guard = 0;
    let closed = false;

    while (guard < edges.length + 5) {
      guard += 1;
      if (!unused.has(currentEdge.id)) {
        break;
      }
      unused.delete(currentEdge.id);
      const oriented = orientEdge(currentEdge, currentNode);
      chain.push(oriented);
      currentNode = currentEdge.startNode === currentNode ? currentEdge.endNode : currentEdge.startNode;
      if (currentNode === startNode) {
        closed = true;
        break;
      }
      const nextCandidates = (adjacency.get(currentNode) || []).filter((id) => unused.has(id));
      if (nextCandidates.length === 0) {
        break;
      }
      currentEdge = edges[nextCandidates[0]];
    }

    const perimeter = chain.reduce((sum, seg) => sum + segmentLength(seg), 0);
    if (closed && chain.length > 1) {
      const signedArea = signedAreaFromSegments(chain);
      contours.push({
        closed: true,
        segments: chain,
        perimeter,
        signedArea,
        winding: signedArea >= 0 ? "CCW" : "CW"
      });
    } else {
      openChains.push({
        closed: false,
        segments: chain,
        perimeter
      });
    }
  }

  const warnings = [];
  const intersections = detectIntersections(contours, epsilon);
  if (intersections > 0) {
    warnings.push(`Detected ${intersections} potential edge intersections.`);
  }
  if (openChains.length > 0 || openEdgeIds.size > 0) {
    warnings.push("Open contours detected.");
  }

  return {
    contours,
    openChains,
    openEdgeIds: Array.from(openEdgeIds),
    warnings,
    debug: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      openNodeCount: Array.from(degree.values()).filter((d) => d !== 2).length
    }
  };
}
