# GLC Cost Calculation Model (Reconstructed)

## 1) Pricing data location

### Confirmed
- Cost items are stored in `ESTIME_BEGIN...ESTIME_END` as repeated `RecordBegin...RecordEnd` blocks (`033273.glc:406..473`).
- Record fields include:
  - `ART_NO`, `Name`, `Units`, `Kol`, `Cena`, `GrpID`, plus flags (`UseEstim`, `UseSclad`).
- Geometric/production metrics used for quantity derivation are in `GVals`.

## 2) Direct mappings confirmed by evidence

| Mapping | Confidence | Evidence |
|---|---|---|
| Fabric line quantity (`Kol`) = `GVals A` | Confirmed | room3: `Kol 17.38` and `A 17.38` (`033273.glc:414`, `477`) |
| Curvilinear surcharge quantity (`Kol` for `MR2`) = `GVals J` | Confirmed | room3: `8.775` (`033273.glc:458`, `484`) |
| Corner processing quantity (`MR1`) ≈ `GVals E` in single-room exports | Confirmed (single-room samples) | room1: `4` (`033271.glc:166`, `189`), room3: `7` (`033273.glc:436`, `481`) |

## 3) Reconstructed formulas

### Confirmed
- Per-record monetary amount is computable as:
  - `LineAmount = Kol * Cena`
  - (No explicit stored total field in sample GLC)

### Highly probable
- `TotalEstimate = Σ(Kol_i * Cena_i)` for records with `UseEstim=True`.

### Confirmed geometric derivations used by cost lines
- Curvilinear length:
  - `J = Σ arc_len(segment)` over arc segments (see geometry spec), validated by `033273.glc`.
- Perimeter:
  - `D = straight_edges + arc_lengths` in meters (`033273.glc:480`).

## 4) Nontrivial model behavior

### Confirmed
- Room3 in multi export changes layout width (`FullLineWidth 3200`) and changes `C`/`D`/`E`, while keeping base area `A=17.38` and price lines for fabric/curvilinear/corners consistent (`033273_1.glc:1032..1036`, `1059`, `966..1014`).

### Highly probable
- `C` (cloth consumption) is layout-optimization output, not a simple geometric area.
- Seams (`L`,`P`) and zone partitioning can affect `C` and `D`.

## 5) Differences across files

| Field | `033273.glc` | `033273_1.glc` room3 | Note |
|---|---:|---:|---|
| `C` | 22.205 | 24.646 | consumption changed |
| `D` | 19.565 | 21.565 | perimeter metric changed with zoned contouring |
| `E` | 7 | 11 | corner count metric changed in multi zoning |
| `P` | 4.25 | 0 | manual seam present only in single-room file |
| `FullLineWidth` | 5000 | 3200 | manufacturing layout change |

## 6) 1C export relation (cost side)

### Confirmed
- `033273_нп20.txt` exports rows with article-like codes and quantities:
  - area (`Площадь`) = `17.38` (`033273_нп20.txt:4`)
  - curvilinearity row `8.775` (`033273_нп20.txt:7`)
  - harpoon `18` (`033273_нп20.txt:10`)
  - harpoon welding operation `19.565` (`033273_нп20.txt:12`)

See detailed mapping: `GLC_1C_INTEGRATION.md`.
