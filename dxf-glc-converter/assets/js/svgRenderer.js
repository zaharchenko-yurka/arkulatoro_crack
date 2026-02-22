function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 100;
const PAN_SPEED = 1;
const navStateBySvg = new WeakMap();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getNavState(svgEl) {
  let state = navStateBySvg.get(svgEl);
  if (state) {
    return state;
  }

  state = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    defaultScale: 1,
    defaultOffsetX: 0,
    defaultOffsetY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    viewport: null,
    rafId: 0,
    pendingBodyUserSelect: null
  };

  const applyTransformNow = () => {
    state.rafId = 0;
    if (!state.viewport) {
      return;
    }
    state.viewport.setAttribute(
      "transform",
      `translate(${state.offsetX} ${state.offsetY}) scale(${state.scale})`
    );
  };

  const scheduleApplyTransform = () => {
    if (state.rafId) {
      return;
    }
    state.rafId = window.requestAnimationFrame(applyTransformNow);
  };

  const getMouseInSvgCoords = (event) => {
    const ctm = svgEl.getScreenCTM();
    if (!ctm) {
      return null;
    }
    const point = svgEl.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(ctm.inverse());
  };

  const resetView = () => {
    state.scale = state.defaultScale;
    state.offsetX = state.defaultOffsetX;
    state.offsetY = state.defaultOffsetY;
    scheduleApplyTransform();
  };

  const onWheel = (event) => {
    if (!state.viewport) {
      return;
    }
    event.preventDefault();

    const anchor = getMouseInSvgCoords(event);
    if (!anchor) {
      return;
    }

    const factor = Math.pow(1.1, -event.deltaY / 100);
    const nextScale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
    if (nextScale === state.scale) {
      return;
    }

    const worldX = (anchor.x - state.offsetX) / state.scale;
    const worldY = (anchor.y - state.offsetY) / state.scale;
    state.scale = nextScale;
    state.offsetX = anchor.x - worldX * state.scale;
    state.offsetY = anchor.y - worldY * state.scale;
    scheduleApplyTransform();
  };

  const onMouseDown = (event) => {
    if (!state.viewport || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const anchor = getMouseInSvgCoords(event);
    state.isDragging = true;
    state.lastMouseX = anchor ? anchor.x : event.clientX;
    state.lastMouseY = anchor ? anchor.y : event.clientY;
    svgEl.style.cursor = "grabbing";
    state.pendingBodyUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
  };

  const onMouseMove = (event) => {
    if (!state.isDragging || !state.viewport) {
      return;
    }
    event.preventDefault();
    const anchor = getMouseInSvgCoords(event);
    const currentX = anchor ? anchor.x : event.clientX;
    const currentY = anchor ? anchor.y : event.clientY;
    const dx = (currentX - state.lastMouseX) * PAN_SPEED;
    const dy = (currentY - state.lastMouseY) * PAN_SPEED;
    state.lastMouseX = currentX;
    state.lastMouseY = currentY;
    state.offsetX += dx;
    state.offsetY += dy;
    scheduleApplyTransform();
  };

  const endDrag = () => {
    if (!state.isDragging) {
      return;
    }
    state.isDragging = false;
    svgEl.style.cursor = "grab";
    document.body.style.userSelect = state.pendingBodyUserSelect ?? "";
    state.pendingBodyUserSelect = null;
  };

  const onDoubleClick = (event) => {
    if (!state.viewport) {
      return;
    }
    event.preventDefault();
    resetView();
  };

  svgEl.addEventListener("wheel", onWheel, { passive: false });
  svgEl.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("mouseleave", endDrag);
  svgEl.addEventListener("dblclick", onDoubleClick);

  state.setViewport = (viewport) => {
    if (state.isDragging) {
      state.isDragging = false;
      document.body.style.userSelect = state.pendingBodyUserSelect ?? "";
      state.pendingBodyUserSelect = null;
    }
    state.viewport = viewport;
    state.defaultScale = 1;
    state.defaultOffsetX = 0;
    state.defaultOffsetY = 0;
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    svgEl.style.cursor = viewport ? "grab" : "";
    scheduleApplyTransform();
  };

  navStateBySvg.set(svgEl, state);
  return state;
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

function renderText(container, textEntity, bounds) {
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
  container.appendChild(text);
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
  const navState = getNavState(svgEl);
  svgEl.innerHTML = "";
  const allSegments = rawEntities || [];

  if (allSegments.length === 0) {
    navState.setViewport(null);
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

  const viewport = createSvgElement("g", { id: "viewport" });
  svgEl.appendChild(viewport);
  navState.setViewport(viewport);

  // DXF uses Cartesian coordinates (Y up), while SVG's native axis is Y down.
  // Keep original DXF X values unchanged and invert only Y for display.
  const dxfLayer = createSvgElement("g", {
    transform: `translate(0 ${bounds.minY + bounds.maxY}) scale(1 -1)`
  });
  viewport.appendChild(dxfLayer);

  allSegments.forEach((seg) => {
    if (seg.type === "text") {
      renderText(viewport, seg, bounds);
      return;
    }
    renderSegment(dxfLayer, seg, "#1f2a24", 1.4);
  });
}
