# GLC Formal Specification (Current Reconstruction)

## 1) High-level description

`*.glc` is a line-based textual CAD+estimation format for stretch ceiling jobs.
It stores:
- project/container metadata (optional, multi-room files),
- one or more room objects,
- geometry (points, edges, arcs, cutouts, zones),
- manufacturing parameters,
- estimate lines,
- derived metrics.

## 2) Lexical rules

### Confirmed
- Encoding: usually `windows-1251` without BOM.
- Line ending: CRLF.
- Comments: optional trailing `//...` on same line.
- Scalar separator: first space after key, except estimate entries using `-/-`.
- Coordinates: `NUM, NUM` with decimal dot.
- Booleans: `True`, `False`.

## 3) Top-level grammar (pseudo-BNF)

```bnf
FILE := [GLOBAL_PREAMBLE] ROOM_BLOCK { ROOM_BLOCK } [NL]

GLOBAL_PREAMBLE := { GLOBAL_LINE }    ; until first ROOMBEGIN
GLOBAL_LINE := KEY SP VALUE

ROOM_BLOCK := "ROOMBEGIN" NL
              ROOM_HEADER
              POINTS_BLOCK
              OTRARCS_BLOCK
              BLUEPOINTS_BLOCK
              OTRLIST_BLOCK
              DIMLINES_BLOCK
              STARTPOINT_LINE
              VIREZS_BLOCK
              GLOBPLAN_LINES
              [ALL_LINESLIST_BLOCK]
              ZONESLIST_BLOCK
              ALLDIMLINES_BLOCK
              ESTIME_BLOCK
              ROOM_TAIL
              PARAMS2_BLOCK
              "ROOMEND" NL
```

`ROOM_HEADER`, `ROOM_TAIL` are sequences of key-value lines observed in samples.

## 4) Section definitions (confirmed keys in samples)

- Header keys: `RoomName`, `UID1`, `Doc1CID`, `RoomHeight`, `Date1`, `Date2`, `RoomWWidth`, `NumOrCharGgo`, `WITHOUT_POLOTNO`, `WITHOUT_HARPOON`.
- Geometry keys: `AnglePoint`, `NPLine`, `PoBeg`, `PoEnd`, `ArcPoint`, `ArcHei`, `IdntBeg/End`, `JValue`, `PoNumber1/2`.
- Cutout keys: `ONEVIREZ`, `VirezLine`, etc.
- Zone keys: `OneZone`, `ZoneGUI1`, `ZoneLine`, `TipeOtr`, depth/row/col fields.
- Estimate keys: `ART_NO`, `Name`, `Units`, `Kol`, `Cena`, `GrpID`, flags.
- Derived metrics: single-letter `A,B,C,D,E,F,G,I,J,L,M,O,P,Q,R`.
- Params2 keys: `FirstLineWidth`, `FullLineWidth`, `StretchParamPer`, `StretchParamPer_2`, `ColorLineName`, `LineLineName`, `ArtNoName`, alignment and photo fields.

See full matrix: `GLC_FIELD_MATRIX.md`.

## 5) Data types

| Type | Examples |
|---|---|
| `INT` | `0`, `-1`, `5000` |
| `FLOAT` | `17.38`, `100.17`, `4671.82212512005` |
| `BOOL` | `True`, `False` |
| `GUID` | `953C8771-99CA-4D40-A98E-FA85C774D591` |
| `COORD` | `7556.56, 5599.32` |
| `TEXT` | material names, room names, OBJ strings |

## 6) Error tolerance behavior

### Confirmed
- Comments can coexist with data on same line (`033273.glc`).
- Optional fields exist in repeated blocks (`PoNumber1`, `JValue`, `TipeOtr` may be missing in some records).

### Highly probable
- Unknown keys should be skipped/preserved for forward compatibility.
- Section order is mostly stable but may include optional blocks (`ALL_LINESLIST_*`).

## 7) Versioning detection

### Confirmed
- No explicit version token found in samples.

### Highly probable
- Feature-based “version” can be inferred by block presence:
  - preamble `OBJ_*` -> container/multi export variant,
  - `ALL_LINESLIST_*` -> extended drawing variant,
  - comments present -> editor/export mode variation.

## 8) Normative parser recommendations

1. Tokenize line by line; strip inline comments after `//`.
2. Parse explicit begin/end blocks with stack/state machine.
3. Accept optional/missing fields in repeated record blocks.
4. Keep unknown key-value lines in extension map.

Implementation details: `GLC_IMPLEMENTATION_GUIDE.md`.
