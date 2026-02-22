# GLC Implementation Guide

## 1) Target capabilities

This guide supports:
- `.glc` parser library,
- `.glc` validator,
- `.dxf -> .glc` converter,
- new CAD writer with `.glc` export.

## 2) Parser strategy

### Recommended (confirmed-safe on samples)
1. Detect encoding:
   - BOM `EF BB BF` => UTF-8
   - otherwise default `cp1251`
2. Normalize line endings.
3. Strip trailing `//` comments.
4. State-machine parse blocks:
   - top-level preamble vs room mode
   - nested record blocks (`NPLine`, `RecordBegin`, `OneZone`, etc.)
5. Preserve unknown lines per block.

## 3) Data model abstraction

```text
GlcDocument
  globalMeta: map<string,string>
  rooms: Room[]

Room
  header: RoomHeader
  points: Point[]
  edgeArcs: map<int, float>         ; from OtrArcHei index->sagitta
  edges: Edge[]                     ; NPLine records
  dimensions: DimLine[]
  cutouts: Contour[]
  zones: Zone[]
  estItems: EstimateItem[]
  gvals: map<char, float>
  params2: Params2
  extras: map<string,any>           ; unknown/optional blocks
```

## 4) Geometry reconstruction pipeline

1. Build outer contour from `edges` in listed order.
2. For each edge with `ArcHei`, reconstruct arc geometry:
   - chord from `PoBeg` to `PoEnd`
   - `ArcPoint` validation via midpoint-normal relation
3. Compute metrics:
   - area (polygon + circular-segment correction)
   - perimeter (straight + arc lengths)
4. Parse cutouts (`VIREZS`) as inner contours.
5. Parse zones independently (do not assume they equal outer contour).

## 5) Validator rules

### Structural
- `ROOMBEGIN/ROOMEND` balanced.
- Required block tags balanced.
- Repeated blocks end with `END`/`end` as expected.

### Geometric
- `PoBeg`/`PoEnd` continuity should close contour (tolerance needed).
- Arc consistency check:
  - if `ArcHei` exists, `ArcPoint` should satisfy midpoint-normal within tolerance.

### Metric coherence checks (recommended)
- `GVals J` approximately equals sum of arc lengths (m).
- `GVals A` approximately equals computed outer area (m²), tolerance export-dependent.

## 6) `.dxf -> .glc` conversion blueprint

1. Extract closed polylines/splines/arcs from DXF.
2. Convert to ordered contour:
   - vertices -> `AnglePoint`
   - edges -> `NPLine`
3. Apply coordinate-system adaptation for Arkulator import:
   - When DXF geometry is represented in `Y-up`, mirror only Y before writing GLC coordinates.
   - Use room-bounds transform: `y' = minY + maxY - y`.
   - Do not mirror X.
   - For arcs, mirror `start/end/center` and invert direction flag (`clockwise`).
4. For each arc:
   - compute sagitta (`ArcHei`) and midpoint (`ArcPoint`)
   - fill matching `OtrArcHei` index in `OTRARCS`
5. Generate default auxiliary blocks:
   - `BLUEPOINTS`, `dim_lines_`, `ALLDIMLINES`, etc.
6. Populate `GVals` from computed geometry.
7. Fill `PARAMS2` and estimate lines from business rules/catalog.

## 7) Multi-object handling

### Confirmed-safe
- Parse container preamble until first `ROOMBEGIN`.
- Treat each room as independent model.
- Recompute/validate `GgoCount` and `GgoAllSqw` if writing multi files.

## 8) Edge cases

- Missing optional fields in repeated records (`PoNumber1`, `TipeOtr`, `JValue`).
- Decimal precision varies (integers, 2 decimals, long doubles).
- Same room exported differently across files (parameter drift).
- TXT exports may use comma decimal separators and different encoding.

## 9) Cross refs
- Formal grammar: `GLC_FORMAL_SPECIFICATION.md`
- Ambiguities and experiments: `GLC_UNCERTAINTY_REPORT.md`
