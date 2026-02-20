# GLC Raw Structure (Evidence-Based)

## 1) Corpus and encoding

| File | Type | Encoding | Evidence |
|---|---|---|---|
| `033271.glc` | single-room GLC | `windows-1251` (no BOM) | byte head `52-4F-4F` (`ROOM...`), Cyrillic readable in cp1251 |
| `033273.glc` | single-room GLC + inline comments | `windows-1251` (no BOM) | same pattern, comments with `//` visible at `033273.glc:4` |
| `033273_1.glc` | multi-room GLC + 1C-ish header | `windows-1251` (no BOM) | starts with `OBJ_*` metadata at `033273_1.glc:1` |
| `033273.txt` | metric export | `windows-1251` (no BOM) | Ukrainian labels at `033273.txt:1` |
| `033273_нп20.txt` | 1C export rows | `UTF-8 with BOM` | BOM bytes `EF-BB-BF`; decoded text at `033273_нп20.txt:1` |

## 2) Top-level organization

### Confirmed
- GLC is line-oriented plain text with CRLF separators.
- Main object delimiter: `ROOMBEGIN` ... `ROOMEND` (for example `033271.glc:1` and `033271.glc:225`).
- Multi-room file contains multiple room blocks consecutively (`033273_1.glc:20..240`, `241..454`, `455..1072`).
- Multi-room file may include a global preamble before the first room (`033273_1.glc:1..19`).

### Highly probable
- Parser is tolerant of trailing empty line (`033271.glc:226`, `033273.glc:518`, `033273_1.glc:1073`).

## 3) Inline comments

### Confirmed
- `//` begins inline human comments in at least one GLC (`033273.glc:4`, `033273.glc:25`, `033273.glc:406`).
- Data is still parseable if comments are stripped from line tail.

### Highly probable
- Comments are optional and ignored by application parser.

## 4) Section/block signatures

### Confirmed delimiters
- `POINTS` ... `POINTSEND` (vertex list)
- `OTRARCS` ... `OTRARCSEND` (arc-height registry)
- `BLUEPOINTS` ... `BLUEPOINTSEND`
- `otrlist_` ... `otrlist_end` (wall/edge records via `NPLine`)
- `dim_lines_` ... `dim_lines_end` (dimension diagonals via `dim_otr`)
- `VIREZS` ... `VIREZSEND` (cutouts, optional `ONEVIREZ`)
- `ZONESLIST` ... `ZONESLISTEND` (`OneZone` blocks)
- `ALLDIMLINES` ... `ALLDIMLINESEND`
- `ESTIME_BEGIN` ... `ESTIME_END` (`RecordBegin` blocks)
- `GValsBegin` ... `GValsEnd` (single-letter computed metrics)
- `PARAMS2_BEGIN` ... `PARAMS2_END` (material/stretch/layout parameters)
- Variant block only in multi sample: `ALL_LINESLIST_BEGIN` ... `ALL_LINESLIST_END` (`033273_1.glc:760..772`)

## 5) Repeating records

### Confirmed record patterns
- `NPLine` ... `END`: wall segment definition (`033273.glc:51..62` etc.).
- `dim_otr` ... `end`: one diagonal/dimension pair (`033273.glc:204..208`).
- `VirezLine` ... `END`: one cutout edge (`033273.glc:278..283`).
- `ZoneLine` ... `END`: one zone boundary edge (`033273.glc:314..319`).
- `RecordBegin` ... `RecordEnd`: one estimate/cost item (`033273.glc:407..428`).

## 6) Field typing (raw)

### Confirmed
- Key-value lines are usually `Key Value` (`RoomHeight 0`, `UID1 ...`).
- Estimate sub-block uses custom delimiter `Key-/-Value` (`Kol-/-17.38`, `Cena-/-2.7`).
- Coordinate pairs use `x, y` with decimal dot in GLC (`AnglePoint 7556.56, 5599.32`).
- Booleans: `True` / `False`.
- IDs include GUIDs (`UID1`, `ZoneGUI1`) and article codes (`MR016`).

### Highly probable
- Units for coordinates and lengths are millimeters in geometry blocks (validated in geometry spec).

## 7) Structural variants across files

| Variant | Evidence |
|---|---|
| Single room file | `033271.glc`, `033273.glc` |
| Multi-room with global header | `033273_1.glc:1..19` |
| Inline comments present | `033273.glc` only |
| Extra drawing objects block | `ALL_LINESLIST_*` only in `033273_1.glc:760..772` |
| Multiple zones in one room | room 3 in `033273_1.glc:773..958` has 2 `OneZone` blocks |
| Zone lines missing `TipeOtr` on some edges | `033273_1.glc:793..807`, `930..944` |

## 8) Token frequency snapshot (sample-level)

From direct counts in sample corpus:
- `ROOMBEGIN`: 1 in `033271.glc`, 1 in `033273.glc`, 3 in `033273_1.glc`.
- `NPLine`: 4 / 11 / 19 respectively.
- `RecordBegin`: 2 / 3 / 7 respectively.
- `ZoneLine`: 4 / 11 / 31 respectively.

This confirms compositional scaling with geometry complexity and room count.

## 9) Cross references
- Geometry encoding: `GLC_GEOMETRY_SPEC.md`
- Manufacturing/material semantics: `GLC_MANUFACTURING_SPEC.md`
- Cost and formulas: `GLC_COST_MODEL.md`
- Multi-room/preamble rules: `GLC_MULTI_OBJECT_SPEC.md`
