import { formatNumber } from "./unitConverter.js";

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().toUpperCase();
  }
  return "00000000-0000-4000-8000-000000000000";
}

function line(...parts) {
  return parts.join("");
}

function chordLength(seg) {
  return Math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y);
}

function arcPointAndSagitta(seg) {
  const chordMid = {
    x: (seg.start.x + seg.end.x) / 2,
    y: (seg.start.y + seg.end.y) / 2
  };
  const startAngle = Math.atan2(seg.start.y - seg.center.y, seg.start.x - seg.center.x);
  const dir = seg.clockwise ? -1 : 1;
  const halfDelta = (dir * Math.abs(seg.sweepDeg) * Math.PI) / 360;
  const midAngle = startAngle + halfDelta;
  const arcPoint = {
    x: seg.center.x + seg.radius * Math.cos(midAngle),
    y: seg.center.y + seg.radius * Math.sin(midAngle)
  };
  const vx = seg.end.x - seg.start.x;
  const vy = seg.end.y - seg.start.y;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len;
  const ny = vx / len;
  const sagitta = (arcPoint.x - chordMid.x) * nx + (arcPoint.y - chordMid.y) * ny;
  return { arcPoint, sagitta };
}

function sampleAreaSigned(segments) {
  const pts = [];
  segments.forEach((seg, idx) => {
    if (seg.type === "line") {
      if (idx === 0) {
        pts.push(seg.start);
      }
      pts.push(seg.end);
      return;
    }
    const startAngle = Math.atan2(seg.start.y - seg.center.y, seg.start.x - seg.center.x);
    const dir = seg.clockwise ? -1 : 1;
    const delta = (dir * Math.abs(seg.sweepDeg) * Math.PI) / 180;
    const div = 24;
    for (let i = idx === 0 ? 0 : 1; i <= div; i += 1) {
      const a = startAngle + (delta * i) / div;
      pts.push({
        x: seg.center.x + seg.radius * Math.cos(a),
        y: seg.center.y + seg.radius * Math.sin(a)
      });
    }
  });
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

function measureAreaAbs(segments) {
  return Math.abs(sampleAreaSigned(segments));
}

function bbox(segments) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  segments.forEach((seg) => {
    [seg.start, seg.end].forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });
  return { minX, minY, maxX, maxY };
}

function segmentPerimeter(seg) {
  if (seg.type === "line") {
    return chordLength(seg);
  }
  return (Math.PI * seg.radius * Math.abs(seg.sweepDeg)) / 180;
}

function mirrorYPoint(point, bounds) {
  return {
    x: point.x,
    y: bounds.minY + bounds.maxY - point.y
  };
}

function toArkulatorSegments(segments) {
  const bounds = bbox(segments);
  // DXF is treated as Y-up in parser/preview; Arkulator geometry display is Y-down.
  // For export keep X unchanged and mirror only Y to preserve visual orientation.
  return segments.map((seg) => {
    if (seg.type === "line") {
      return {
        ...seg,
        start: mirrorYPoint(seg.start, bounds),
        end: mirrorYPoint(seg.end, bounds)
      };
    }
    return {
      ...seg,
      start: mirrorYPoint(seg.start, bounds),
      end: mirrorYPoint(seg.end, bounds),
      center: mirrorYPoint(seg.center, bounds),
      clockwise: !seg.clockwise
    };
  });
}

function buildRoom(contour, roomIndex) {
  const segments = toArkulatorSegments(contour.segments);
  const points = segments.map((s) => s.start);
  const roomUid = uuid();
  const zoneUid = uuid();
  const perimeterMm = segments.reduce((sum, seg) => sum + segmentPerimeter(seg), 0);
  const curvedLengthMm = segments
    .filter((s) => s.type === "arc")
    .reduce((sum, seg) => sum + segmentPerimeter(seg), 0);
  const areaMm2 = measureAreaAbs(segments);
  const bounds = bbox(segments);
  const lines = [];

  lines.push("ROOMBEGIN");
  lines.push(line("RoomName Ceiling_", String(roomIndex + 1)));
  lines.push(line("UID1 ", roomUid));
  lines.push(line("Doc1CID ", String(roomIndex + 1)));
  lines.push("WITHOUT_POLOTNO False");
  lines.push("WITHOUT_HARPOON False");

  lines.push("POINTS");
  points.forEach((p) => lines.push(line("AnglePoint ", formatNumber(p.x), ", ", formatNumber(p.y))));
  lines.push("POINTSEND");

  lines.push("OTRARCS");
  segments.forEach((seg, idx) => {
    lines.push(line("WallWid3 ", String(idx), ", 0"));
    if (seg.type === "arc") {
      const { sagitta } = arcPointAndSagitta(seg);
      lines.push(line("OtrArcHei ", String(idx), ", ", formatNumber(sagitta)));
    }
  });
  lines.push("OTRARCSEND");

  lines.push("BLUEPOINTS");
  lines.push("BLUEPOINTSEND");

  lines.push("otrlist_");
  segments.forEach((seg, idx) => {
    const po1 = idx + 1;
    const po2 = idx === segments.length - 1 ? 1 : idx + 2;
    lines.push("NPLine");
    lines.push(line("PoBeg ", formatNumber(seg.start.x), ", ", formatNumber(seg.start.y)));
    lines.push(line("PoEnd ", formatNumber(seg.end.x), ", ", formatNumber(seg.end.y)));
    if (seg.type === "arc") {
      const { arcPoint, sagitta } = arcPointAndSagitta(seg);
      lines.push(line("ArcPoint ", formatNumber(arcPoint.x), ", ", formatNumber(arcPoint.y)));
      lines.push(line("ArcHei ", formatNumber(sagitta)));
    }
    lines.push("Wid1 100");
    lines.push(line("PoNumber1 ", String(po1)));
    lines.push(line("PoNumber2 ", String(po2)));
    lines.push(line("JValue ", formatNumber(chordLength(seg))));
    lines.push(line("IdntBeg P", String(po1)));
    lines.push(line("IdntEnd P", String(po2)));
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
  lines.push(line("ZoneGUI1 ", zoneUid));
  segments.forEach((seg) => {
    lines.push("ZoneLine");
    lines.push(line("PoBeg ", formatNumber(seg.start.x), ", ", formatNumber(seg.start.y)));
    lines.push(line("PoEnd ", formatNumber(seg.end.x), ", ", formatNumber(seg.end.y)));
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
  lines.push(line("A ", formatNumber(areaMm2 / 1000000, 6)));
  lines.push(line("B ", formatNumber(areaMm2 / 1000000, 6)));
  lines.push(line("C ", formatNumber(areaMm2 / 1000000, 6)));
  lines.push(line("D ", formatNumber(perimeterMm / 1000, 6)));
  lines.push("E 0");
  lines.push("F 0");
  lines.push(line("G ", formatNumber(perimeterMm / 1000, 6)));
  lines.push(line("I ", String(segments.filter((s) => s.type === "arc").length)));
  lines.push(line("J ", formatNumber(curvedLengthMm / 1000, 6)));
  lines.push("L 0");
  lines.push("M 0");
  lines.push("O 0");
  lines.push("P 0");
  lines.push("Q 0");
  lines.push("R 0");
  lines.push(line("CWid1 ", formatNumber(Math.abs(bounds.maxX - bounds.minX))));
  lines.push(line("CHei1 ", formatNumber(Math.abs(bounds.maxY - bounds.minY))));
  lines.push(line("CWid2 ", formatNumber(Math.abs(bounds.maxX - bounds.minX))));
  lines.push(line("CHei2 ", formatNumber(Math.abs(bounds.maxY - bounds.minY))));
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

  return lines;
}

export function buildGlc(contours) {
  const lines = [];
  contours.forEach((contour, idx) => {
    lines.push(...buildRoom(contour, idx));
  });
  return lines.join("\r\n") + "\r\n";
}
