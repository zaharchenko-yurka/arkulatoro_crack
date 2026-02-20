function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function collectBounds(segments) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  segments.forEach((seg) => {
    const pts = [seg.start, seg.end];
    if (seg.type === "arc") {
      pts.push({ x: seg.center.x + seg.radius, y: seg.center.y });
      pts.push({ x: seg.center.x - seg.radius, y: seg.center.y });
      pts.push({ x: seg.center.x, y: seg.center.y + seg.radius });
      pts.push({ x: seg.center.x, y: seg.center.y - seg.radius });
    }
    pts.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }
  return { minX, minY, maxX, maxY };
}

function arcPath(seg) {
  const largeArc = Math.abs(seg.sweepDeg) > 180 ? 1 : 0;
  const displayClockwise = !seg.clockwise;
  const sweepFlag = displayClockwise ? 1 : 0;
  return `M ${seg.start.x} ${seg.start.y} A ${seg.radius} ${seg.radius} 0 ${largeArc} ${sweepFlag} ${seg.end.x} ${seg.end.y}`;
}

function renderSegment(svg, seg, color, width) {
  if (seg.type === "line") {
    svg.appendChild(
      createSvgElement("line", {
        x1: seg.start.x,
        y1: seg.start.y,
        x2: seg.end.x,
        y2: seg.end.y,
        stroke: color,
        "stroke-width": width,
        "vector-effect": "non-scaling-stroke"
      })
    );
    return;
  }
  svg.appendChild(
    createSvgElement("path", {
      d: arcPath(seg),
      fill: "none",
      stroke: color,
      "stroke-width": width,
      "vector-effect": "non-scaling-stroke"
    })
  );
}

export function renderPreview(svgEl, contourData) {
  svgEl.innerHTML = "";
  const allSegments = [
    ...contourData.contours.flatMap((c) => c.segments),
    ...contourData.openChains.flatMap((c) => c.segments)
  ];

  if (allSegments.length === 0) {
    const text = createSvgElement("text", {
      x: 10,
      y: 20,
      fill: "#666"
    });
    text.textContent = "No geometry to display.";
    svgEl.appendChild(text);
    return;
  }

  const bounds = collectBounds(allSegments);
  const pad = 40;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  svgEl.setAttribute("viewBox", `${bounds.minX - pad} ${bounds.minY - pad} ${width + pad * 2} ${height + pad * 2}`);

  const grid = createSvgElement("rect", {
    x: bounds.minX - pad,
    y: bounds.minY - pad,
    width: width + pad * 2,
    height: height + pad * 2,
    fill: "#ffffff"
  });
  svgEl.appendChild(grid);

  contourData.contours.forEach((contour) => {
    contour.segments.forEach((seg) => renderSegment(svgEl, seg, "#1f2a24", 1.4));
  });
  contourData.openChains.forEach((chain) => {
    chain.segments.forEach((seg) => renderSegment(svgEl, seg, "#b42318", 2.2));
  });
}
