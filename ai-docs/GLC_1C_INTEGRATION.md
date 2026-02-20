# GLC to 1C Integration Notes

## 1) Input artifacts used

- Extended multi-room GLC: `033273_1.glc`
- Metric TXT export: `033273.txt`
- 1C rows export: `033273_нп20.txt` (UTF-8 BOM)

## 2) Observed 1C-oriented fields in GLC

| Field | Confidence | Evidence |
|---|---|---|
| `OBJ_DOC1C_**_` | Highly probable 1C document reference slot | `033273_1.glc:4` |
| `CODE_1C_**_` | Highly probable 1C code slot | `033273_1.glc:14` |
| `OBJ_1C_exp_file_**_` | Highly probable exported filename slot | `033273_1.glc:5` |
| `Doc1CID` | Confirmed per-room order/document ID | `033273_1.glc:23`, `244`, `458` |

## 3) `033273.txt` mapping (metric summary export)

### Confirmed
- First 9 rows map directly to `GVals` of room3 in `033273.glc`:
  - `Площа` -> `A` (17.38) (`033273.txt:1`, `033273.glc:477`)
  - `Полотно` -> `B` (14.71) (`:2`, `:478`)
  - `Витрата` -> `C` (22.205) (`:3`, `:479`)
  - `Периметр` -> `D` (19.565) (`:4`, `:480`)
  - corners/curves/harpoon similarly (`:5..9` vs `:481..485`)

### Variant
- Rows for seams and inner cuts are zero in TXT (`033273.txt:10..13`) while same fields are nonzero in `033273.glc` (`L=3.43`, `M=0.25`, `O=2`, `P=4.25` at `:486..489`).
  - Status: Confirmed mismatch.
  - Interpretation: Highly probable export profile omits/zeroes those metrics.

## 4) `033273_нп20.txt` structure

### Confirmed format
- Section marker: `doc_rows_start_` (line `2`, and with section names at `3`, `8`, `11`).
- Tab-separated row records.
- Example sections:
  - `ЗаказПокупателя.Продукция` (`:3`)
  - `ЗаказНаПроизводство.Ресурсы` (`:8`)
  - `ЗаказНаПроизводство.Операции` (`:11`)

### Confirmed quantity links (room3 single export values)
- `Площадь 17.38` (`033273_нп20.txt:4`) matches `GVals A` (`033273.glc:477`)
- `Криволинейность 8.775` (`:7`) matches `GVals J` (`:484`)
- `Гарпун 18` (`:10`) matches `GVals G` (`:485`)
- `Пайка гарпуна 19.565` (`:12`) matches `GVals D` (`:480`)

### Highly probable
- Article-like IDs `ФР-...` are 1C catalog items for operations/resources.

## 5) Proposed mapping table (reconstructed)

| CAD/GLC source | 1C export target | Confidence |
|---|---|---|
| `GVals A` | Product row `Площадь` | Confirmed |
| `GVals J` | Product row `Криволинейность` | Confirmed |
| `GVals G` | Resource row `Гарпун` | Confirmed |
| `GVals D` | Operation row `Пайка гарпуна` | Confirmed |
| Room `Doc1CID` | order identifier linkage | Highly probable |
| Global `OBJ_*`/`CODE_1C_*` | document metadata linkage | Highly probable |

## 6) Integration cautions

### Confirmed
- Decimal separator differs by file:
  - GLC uses `.` (`17.38`)
  - `033273.txt` uses comma (`17,38`)
  - 1C rows TXT uses `.` (`17.38`)

### Highly probable
- Export pipeline has profiles/modes causing field suppression (seam/cut metrics).

Cross refs: `GLC_COST_MODEL.md`, `GLC_MULTI_OBJECT_SPEC.md`.
