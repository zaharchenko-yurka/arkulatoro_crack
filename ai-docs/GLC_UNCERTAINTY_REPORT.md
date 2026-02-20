# GLC Uncertainty Report

## 1) Ambiguous fields

| Field/Area | Current interpretation | Confidence | Why ambiguous |
|---|---|---|---|
| `WallWid3` | per-edge width/placeholder table | Hypothesis | always `idx,0` in samples |
| `BluePoR` / `BLUEPOINTS` | auxiliary control points | Hypothesis | present only in curved sample, all zeros |
| `StartPointA` | preferred start vertex/index | Hypothesis | values `-1` and `9`, no direct downstream effect proven |
| `TipeOtr` values in zones | edge semantic type (`1` normal, `9` internal split) | Highly probable | inferred from split zones in room3 multi |
| `ParLevel15`, `AlgnButton_*`, `FotoScale` | layout/visualization controls | Hypothesis | affect unknown, not directly provable |
| `CWid*`, `CHei*` exact geometric meaning | bounding/packing dimensions | Highly probable | scale and shrink linkage visible, exact axis conventions unclear |

## 2) Conflicting interpretations / cross-file drift

| Conflict | Evidence | Impact |
|---|---|---|
| Room1 `StretchParamPer_2` differs (`0` vs `8`) while metrics unchanged | `033271.glc:214` vs `033273_1.glc:229` | raises uncertainty whether field is authoritative or stale |
| Room3 seam/cut metrics nonzero in GLC but zeroed in `033273.txt` export | `033273.glc:486..489` vs `033273.txt:10..13` | export profile may suppress fields |
| Room3 `E` changes from `7` to `11` in multi-zoned export while corner cost line remains `7` | `033273.glc:481`, `033273_1.glc:1036`, `033273_1.glc:991` | `E` semantics may depend on zone topology, not always billable corner count |

## 3) Unknown-purpose fields requiring more samples

- `NumOrCharGgo`
- `RoomWWidth`
- `MontageGPrs`, `ReduceGPrs`, `GValSclad`, room-level `UseSclad`
- `UpackID`, `MontID`, `RulonID`
- `MVDate2_**_`, `MailDate_**_`, `FtpDate_**_`, `MVTextW200_**_`

Status for all above: Hypothesis.

## 4) Suggested validation experiments

1. Create a test room with one known arc and vary only `ArcHei` sign/magnitude.
   - Verify `ArcPoint`, `GVals J`, and perimeter updates.
2. Toggle only `StretchParamPer_2`.
   - Check whether `B`, `CWid2`, `CHei2` recompute or remain stale.
3. Add/remove one internal cutout (`ONEVIREZ`).
   - Observe changes in `M`, `O`, `A`, and cost lines.
4. Change `FullLineWidth` while keeping geometry constant.
   - Observe `C`, seam metrics (`L`, `P`), and estimate records.
5. Export to both TXT profiles for identical room.
   - Compare whether seam/cut values are intentionally suppressed.
6. Populate `OBJ_DOC1C_**_` and related global fields.
   - Validate roundtrip mapping into 1C documents.

## 5) Minimum additional sample set requested

- At least 5 more `.glc` files with:
  - no arcs / many arcs / spline-heavy
  - multiple cutouts
  - different roll widths and alignment settings
  - nonzero `MontID/UpackID/RulonID`
  - filled 1C metadata in global preamble

Cross refs: `GLC_FIELD_MATRIX.md`, `GLC_1C_INTEGRATION.md`.
