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
    if (seg.type === "text") {
      const fontSize = Math.max(1, Number(seg.height) || 2.5);
      const textLen = (seg.text || "").length;
      const textWidth = Math.max(fontSize * 0.6, textLen * fontSize * 0.6);
      minX = Math.min(minX, seg.position.x);
      minY = Math.min(minY, seg.position.y);
      maxX = Math.max(maxX, seg.position.x + textWidth);
      maxY = Math.max(maxY, seg.position.y + fontSize);
      return;
    }
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

function renderText(svg, textEntity, bounds) {
  const mappedY = bounds.minY + bounds.maxY - textEntity.position.y;
  const text = createSvgElement("text", {
    x: textEntity.position.x,
    y: mappedY,
    fill: "#1f2a24",
    "font-size": Math.max(1, Number(textEntity.height) || 2.5),
    "font-family": "Segoe UI, Tahoma, sans-serif",
    "dominant-baseline": "hanging"
  });
  const rotation = Number(textEntity.rotationDeg) || 0;
  if (rotation !== 0) {
    // SVG uses Y-down; mapped DXF text rotation needs opposite sign.
    text.setAttribute("transform", `rotate(${-rotation} ${textEntity.position.x} ${mappedY})`);
  }
  text.textContent = textEntity.text || "";
  svg.appendChild(text);
}

function arcPath(seg) {
  const largeArc = Math.abs(seg.sweepDeg) > 180 ? 1 : 0;
  const displayClockwise = !seg.clockwise;
  const sweepFlag = displayClockwise ? 1 : 0;
  return `M ${seg.start.x} ${seg.start.y} A ${seg.radius} ${seg.radius} 0 ${largeArc} ${sweepFlag} ${seg.end.x} ${seg.end.y}`;
}

function renderSegment(container, seg, color, width) {
  if (seg.type === "line") {
    container.appendChild(
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
  container.appendChild(
    createSvgElement("path", {
      d: arcPath(seg),
      fill: "none",
      stroke: color,
      "stroke-width": width,
      "vector-effect": "non-scaling-stroke"
    })
  );
}

export function renderRawEntities(svgEl, rawEntities) {
  svgEl.innerHTML = "";
  const allSegments = rawEntities || [];

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

  // DXF uses Cartesian coordinates (Y up), while SVG's native axis is Y down.
  // Keep original DXF X values unchanged and invert only Y for display.
  const dxfLayer = createSvgElement("g", {
    transform: `translate(0 ${bounds.minY + bounds.maxY}) scale(1 -1)`
  });
  svgEl.appendChild(dxfLayer);

  allSegments.forEach((seg) => {
    if (seg.type === "text") {
      renderText(svgEl, seg, bounds);
      return;
    }
    renderSegment(dxfLayer, seg, "#1f2a24", 1.4);
  });
}
