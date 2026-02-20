# GLC Material and Manufacturing Parameters

## 1) Parameter locations

### Confirmed blocks/fields
- Room-level toggles:
  - `WITHOUT_POLOTNO`, `WITHOUT_HARPOON` (`033273.glc:10..11`)
- Material/layout block:
  - `PARAMS2_BEGIN...END` (`033273.glc:502..516`)
- Derived production metrics:
  - `GValsBegin...End` (`033273.glc:476..492`)
- Bounding/layout dimensions:
  - `CWid1`, `CHei1`, `CWid2`, `CHei2` (`033273.glc:498..501`)

## 2) Field semantics with confidence

| Field | Meaning | Confidence | Evidence |
|---|---|---|---|
| `ArtNoName` | material article/code | Confirmed | `MR016` aligns with estimate record `ART_NO-/-MR016` (`033273.glc:455`, `509`) |
| `LineLineName` | material descriptive name | Confirmed | text match with estimate name family (`033273.glc:412`, `508`) |
| `ColorLineName` | color or palette code | Highly probable | numeric style (`307`, `519`), appears with material fields |
| `FullLineWidth` | nominal roll width (mm) | Confirmed | values 4500/5000/3200; directly affects consumption metric C across samples |
| `FirstLineWidth` | first strip width (mm) | Highly probable | differs in room3 multi (`3200`) with changed consumption (`C 24.646`) |
| `StretchParamPer` | X shrink/stretch percent | Confirmed | comments in `033273.glc:505` |
| `StretchParamPer_2` | Y shrink/stretch percent | Confirmed | comments in `033273.glc:506` |
| `CWid1`,`CHei1` | pre-shrink extents (mm) | Highly probable | paired with `CWid2`,`CHei2` and stretch values |
| `CWid2`,`CHei2` | post-shrink extents (mm) | Highly probable | numerically consistent with shrink percentages |
| `G` in `GVals` | harpoon length (m) | Confirmed | comment in `033273.glc:485`; also exported in TXT |
| `L` in `GVals` | automatic seam length (m) | Confirmed | comment `033273.glc:486` |
| `P` in `GVals` | manual seam length (m) | Confirmed | comment `033273.glc:489` |
| `M` in `GVals` | internal cut area (m²) | Confirmed | comment `033273.glc:487` |
| `O` in `GVals` | internal cut perimeter (m) | Confirmed | comment `033273.glc:488` |
| `I` in `GVals` | curved segment count | Confirmed | comment `033273.glc:483` |
| `J` in `GVals` | total curved length (m) | Confirmed | comment `033273.glc:484`, geometric reconstruction match |

## 3) Dependencies

### Confirmed
- `B` (cloth area) depends on `A` and stretch parameters in at least rooms 2 and 3:
  - room2: `19.48 * 0.92 * 0.92 = 16.49` (`033273_1.glc:414`, `415`, `442`, `443`)
  - room3: `17.38 * 0.92 * 0.92 = 14.71` (`033273.glc:477`, `478`, `505`, `506`)

### Highly probable
- `C` (consumption area) depends on strip layout (`FullLineWidth`/`FirstLineWidth`) and post-shrink extents.
- Curvilinear metrics (`I`,`J`) are derived from arc-bearing segments (`ArcHei` present).

### Hypothesis
- `ParLevel15`, `AlgnButton_1..3`, `FotoScale` influence layout orientation/optimization and can change `C`/seam metrics.

## 4) Field variants observed

| Variant | Evidence |
|---|---|
| `StretchParamPer_2` differs for same room across files | room1: `0` in `033271.glc:214`, but `8` in `033273_1.glc:229` |
| `FotoScale` differs for same room across files | room1: `0` in `033271.glc:223`, `1` in `033273_1.glc:238` |
| `FullLineWidth` changed for room3 between single/multi exports | `5000` (`033273.glc:504`) vs `3200` (`033273_1.glc:1059`) |

## 5) Cross references
- Geometry derivations: `GLC_GEOMETRY_SPEC.md`
- Cost and estimation records: `GLC_COST_MODEL.md`
- Full field matrix: `GLC_FIELD_MATRIX.md`
