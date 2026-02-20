# GLC Geometry Specification

## 1) Geometry sources in `.glc`

### Confirmed blocks
- Corner vertices: `POINTS` / `AnglePoint` / `POINTSEND` (e.g., `033273.glc:12..24`)
- Edge list: `otrlist_` with `NPLine` records (`033273.glc:50..202`)
- Arc registry per edge index: `OTRARCS` with `OtrArcHei i, h` (`033273.glc:25..42`)
- Cutouts: `VIREZS` with `ONEVIREZ` and `VirezLine` (`033273.glc:271..303`)
- Zone contours: `ZONESLIST` with `OneZone` and `ZoneLine` (`033273.glc:306..403`)

## 2) Coordinate system and units

### Confirmed
- Cartesian coordinates encoded as floating-point `x, y` in text.
- Units are millimeters for geometric coordinates and distances:
  - `JValue 830` paired with coordinate distance of first segment (`033273.glc:51..57`).
  - `ArcHei` comments explicitly say mm (`033273.glc:67` comment).
  - GVals perimeter `D 19.565` is meters, matching geometry sum in mm / 1000 (`033273.glc:480`).

### Highly probable
- Axis orientation is screen/CAD-like with arbitrary origin; absolute origin not standardized across files.

## 3) Segment model

Each `NPLine` defines one boundary edge:
- Mandatory: `PoBeg`, `PoEnd`, `Wid1`, `IdntBeg`, `IdntEnd`, `FixedBeg`
- Optional: `PoNumber1`, `PoNumber2`, `JValue`, `ArcPoint`, `ArcHei`

Evidence: `033273.glc:51..201`.

### Confirmed
- `JValue` equals chord length (straight distance between `PoBeg` and `PoEnd`) in mm.
- If arc exists, `ArcHei` and `ArcPoint` appear in `NPLine`.

## 4) Arc encoding

### Confirmed
- Arc is represented by:
  - endpoints `PoBeg`, `PoEnd`
  - sagitta-like value `ArcHei`
  - explicit middle/control point `ArcPoint`
- `ArcPoint` can be reconstructed by:
  - midpoint of chord + unit normal * `ArcHei`
  - numerical match error < 0.02 mm across all 5 arc edges of `033273.glc`.

### Confirmed formulae
- Radius from chord `c` and sagitta `s`:
  - `r = c^2/(8*|s|) + |s|/2`
- Arc length:
  - `theta = 2*asin(c/(2r))`
  - `arc_len = r*theta`
- Sum of arc lengths for the 5 curved segments in `033273.glc`:
  - `8774.94 mm = 8.775 m`, matches `GVals J 8.775` (`033273.glc:484`).

## 5) Contours and closure

### Confirmed
- Outer contour is closed by sequence of `NPLine` records; final segment returns to first point (`033273.glc:190..193`).
- `PoNumber*` indexes are present but first/last may omit one side (`033273.glc:55`, `195`), so closure must use geometry, not only indices.
- `VIREZS` contains one or more inner closed contours (`ONEVIREZ`).

### Highly probable
- Vertex winding in samples is clockwise (shoelace signed area negative for tested rooms), but parser should not assume fixed winding.

## 6) Multi-contour logic

### Confirmed
- Room can include:
  - One outer contour (`otrlist_`)
  - Optional cutout contours (`VIREZS`)
  - One or multiple zone contours (`ZONESLIST`, `OneZone`)
- In room 3 of multi file, two zones partition space and interact with cutout edges (`033273_1.glc:773..958`).

### Highly probable
- `TipeOtr` in `ZoneLine` distinguishes edge semantics (e.g., `1` outer/normal, `9` split/interior seam-like border), based on mixed values in `033273_1.glc:791`, `812`, `878`, `928`.

## 7) Simple vs complex examples

### Simple room (rectilinear, no arcs, no cutouts)
- `033271.glc`
- 4 angle points (`:13..16`)
- 4 `NPLine` segments (`:27..74`)
- area from polygon equals `22.57 m²` (`GVals A`, `:185`)

### Complex room (arcs + cutout)
- `033273.glc`
- 11 angle points (`:13..23`)
- 11 `NPLine` segments, 5 curved (`ArcHei` present)
- 1 rectangular cutout (`VIREZS`, `:271..303`)
- curvature metrics in `GVals I/J` (`:483..484`)

## 8) Pseudo-grammar (geometry subset)

```bnf
POINTS_BLOCK := "POINTS" NL { "AnglePoint" SP COORD NL } "POINTSEND" NL
OTRARCS_BLOCK := "OTRARCS" NL { "WallWid3" SP IDX "," SP NUM NL | "OtrArcHei" SP IDX "," SP NUM NL } "OTRARCSEND" NL
EDGE_BLOCK := "otrlist_" NL { NPLINE_BLOCK } "otrlist_end" NL
NPLINE_BLOCK := "NPLine" NL
                "PoBeg" SP COORD NL
                "PoEnd" SP COORD NL
                [ "ArcPoint" SP COORD NL ]
                [ "ArcHei" SP NUM NL ]
                "Wid1" SP NUM NL
                [ "PoNumber1" SP INT NL ]
                [ "PoNumber2" SP INT NL ]
                [ "JValue" SP NUM NL ]
                "IdntBeg" SP TOKEN NL
                "IdntEnd" SP TOKEN NL
                "IdntBeg2" SP TOKEN_OR_EMPTY NL
                "IdntEnd2" SP TOKEN_OR_EMPTY NL
                "FixedBeg" SP BOOL NL
                "END" NL
```

## 9) Cross references
- Raw structure: `GLC_RAW_STRUCTURE.md`
- Manufacturing dependencies using geometry metrics: `GLC_MANUFACTURING_SPEC.md`
- Cost relationships: `GLC_COST_MODEL.md`
