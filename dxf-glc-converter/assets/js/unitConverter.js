const DXF_UNIT_TO_MM = {
  0: 1,
  1: 25.4,
  2: 304.8,
  3: 1609344,
  4: 1,
  5: 10,
  6: 1000,
  7: 1000000,
  8: 0.000001,
  9: 0.001,
  10: 100,
  11: 100000,
  12: 1000000000,
  13: 0.0000001,
  14: 0.00001,
  15: 0.01,
  16: 10000,
  17: 1000000000000,
  18: 149597870700000
};

const OVERRIDE_TO_MM = {
  mm: 1,
  cm: 10,
  m: 1000
};

export function resolveUnitScale(override, insunits) {
  if (override && override !== "auto") {
    return OVERRIDE_TO_MM[override] || 1;
  }
  return DXF_UNIT_TO_MM[insunits] || 1;
}

export function scalePoint(point, scale) {
  return { x: point.x * scale, y: point.y * scale };
}

export function formatNumber(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "0";
  }
  const fixed = n.toFixed(digits);
  return fixed.replace(/\.?0+$/, "") || "0";
}
