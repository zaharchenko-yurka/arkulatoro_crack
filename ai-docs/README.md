# GLC Reverse Engineering Documentation

## Document index

- Raw structure: `GLC_RAW_STRUCTURE.md`
- Geometry model: `GLC_GEOMETRY_SPEC.md`
- Manufacturing/materials: `GLC_MANUFACTURING_SPEC.md`
- Cost model: `GLC_COST_MODEL.md`
- Multi-ceiling container logic: `GLC_MULTI_OBJECT_SPEC.md`
- 1C integration mapping: `GLC_1C_INTEGRATION.md`
- Formal format specification: `GLC_FORMAL_SPECIFICATION.md`
- Implementation blueprint: `GLC_IMPLEMENTATION_GUIDE.md`
- Field matrix: `GLC_FIELD_MATRIX.md`
- Uncertainty report: `GLC_UNCERTAINTY_REPORT.md`

## Format overview

`.glc` is a line-based textual format (mostly `cp1251`) with explicit begin/end tags and repeated record blocks.  
Single-room and multi-room variants are both supported. Multi-room files prepend a global metadata header and then repeat `ROOMBEGIN...ROOMEND`.

## Geometry model summary

- Outer contour: `POINTS` + `NPLine` edge list.
- Curves: chord endpoints + `ArcHei` sagitta + `ArcPoint`; arc length reconstruction is numerically confirmed.
- Cutouts: `VIREZS` / `ONEVIREZ`.
- Zones: `ZONESLIST` with one or more `OneZone` contours.

## Cost model summary

- Estimate rows are in `ESTIME_BEGIN`.
- Quantities are driven by geometric/manufacturing metrics in `GVals`.
- Confirmed mappings include:
  - fabric quantity <- `A`
  - curvilinear surcharge <- `J`
  - harpoon in 1C export <- `G`

## Integration model summary

- `033273_нп20.txt` (UTF-8 BOM) is tab-separated 1C-ready sectioned data.
- `033273.txt` is a simpler metric export (comma decimals).
- Multi-room global fields (`OBJ_*`, `ORG_*`) appear intended for order/customer-level integration.

## Confidence level

- Core structure and geometry encoding: **High confidence**.
- Manufacturing and pricing linkage: **Medium-to-high confidence**.
- Some operational/legacy fields and export-profile behavior: **Medium/low confidence** (see uncertainty report).

## Known limitations

- No explicit format version key found.
- PNG contains no embedded text chunks; no OCR evidence was used.
- Some fields are present but not semantically provable from available samples alone.
