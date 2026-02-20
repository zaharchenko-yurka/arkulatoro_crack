# GLC Multi-Ceiling File Logic

## 1) Multi-object container pattern

### Confirmed
- `033273_1.glc` contains:
  - one global preamble (`:1..19`)
  - then `GgoCount 3` (`:8`)
  - then 3 independent room objects (`ROOMBEGIN...ROOMEND` repeated 3 times)
- `GgoAllSqw 59.43` equals sum of room `GVals A`:
  - `22.57 + 19.48 + 17.38 = 59.43` (`033273_1.glc:9`, `200`, `414`, `1032`)

## 2) Global vs per-room data

### Global (container-level) fields (confirmed in sample)
- Customer/order/company-like metadata:
  - `OBJ_ZAKNO_**_...` (`:1`)
  - `OBJ_ADDR_**_...` (`:2`)
  - `OBJ_DOC1C_**_...` (`:4`)
  - `ORG_NAME_**_...` (`:10`) and related
  - `DilerID_**_0`, `ManagerID_**_1` (`:13`, `:15`)

### Per-room fields
- Full geometry, zones, estimates, params, derived GVals, etc., identical to single-room schema.

## 3) Separator logic

### Confirmed
- Room separation is explicit via `ROOMEND` followed by next `ROOMBEGIN` (`033273_1.glc:240..241`, `454..455`).
- No extra room delimiter beyond those tags.

## 4) Shared metadata behavior

### Highly probable
- Global preamble applies to all following rooms for one customer/order package.
- `Doc1CID` remains per-room (different IDs per room: `033271`, `033272`, `033273` suffixes at `:23`, `:244`, `:458`).

## 5) Per-room block variants in multi file

### Confirmed
- Room3 includes additional `ALL_LINESLIST` block (`:760..772`) not present in rooms1/2.
- Room3 includes two zones (`OneZone` at `:774` and `:867`), while rooms1/2 each have one zone.

## 6) Recommended parser handling

### Confirmed-safe strategy
1. Parse optional preamble lines until first `ROOMBEGIN`.
2. Parse each room as independent object.
3. Preserve unknown global keys and unknown intra-room keys as opaque extensions.

See also: `GLC_FORMAL_SPECIFICATION.md` and `GLC_IMPLEMENTATION_GUIDE.md`.
