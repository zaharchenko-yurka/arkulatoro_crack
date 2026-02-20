# GLC Field Matrix

`Appears in file` uses sample set: `033271.glc`, `033273.glc`, `033273_1.glc`, `033273.txt`, `033273_нп20.txt`.

| Field | Appears in file | Meaning | Data type | Required | Notes | Confidence level |
|---|---|---|---|---|---|---|
| `ROOMBEGIN` / `ROOMEND` | all `.glc` | room object delimiters | tag | Yes (per room) | multi file repeats | Confirmed |
| `RoomName` | all `.glc` | room display name | text | Yes | Ukrainian text | Confirmed |
| `UID1` | all `.glc` | room GUID | GUID | Yes | stable across exports for same room | Confirmed |
| `Doc1CID` | all `.glc` | room/order ID | text/numeric | Yes | maps to room-level identifier | Highly probable |
| `WITHOUT_POLOTNO` | all `.glc` | no-cloth flag | bool | Yes | business flag | Highly probable |
| `WITHOUT_HARPOON` | all `.glc` | no-harpoon flag | bool | Yes | business flag | Highly probable |
| `POINTS`/`POINTSEND` | all `.glc` | point list delimiters | tag | Yes |  | Confirmed |
| `AnglePoint` | all `.glc` | vertex coordinate | coord | Yes | mm coordinates | Confirmed |
| `OTRARCS`/`OTRARCSEND` | all `.glc` | arc table delimiters | tag | Yes | may contain only zeros | Confirmed |
| `WallWid3` | all `.glc` | edge index + width flag | pair | Yes | mostly `idx, 0` | Hypothesis |
| `OtrArcHei` | `033273*.glc` | per-edge arc sagitta | pair | No | mm; only curved edges | Confirmed |
| `BLUEPOINTS`/`BLUEPOINTSEND` | all `.glc` | blue-point section | tag | Yes | may be empty | Confirmed |
| `BluePoR` | `033273*.glc` | blue-point records | pair | No | unknown semantics | Hypothesis |
| `otrlist_`/`otrlist_end` | all `.glc` | edge list delimiters | tag | Yes |  | Confirmed |
| `NPLine` | all `.glc` | one boundary edge record | tag | Yes | ends by `END` | Confirmed |
| `PoBeg` / `PoEnd` | all `.glc` | segment endpoints | coord | Yes (in segment records) | used in multiple blocks | Confirmed |
| `ArcPoint` | `033273*.glc` | arc midpoint/control point | coord | No | with `ArcHei` | Confirmed |
| `ArcHei` | `033273*.glc` | arc sagitta | float | No | sign encodes bend side | Confirmed |
| `Wid1` | all `.glc` | width/style attribute | int | Yes (segment/zone) | `100`, `50`, `-10` observed | Highly probable |
| `PoNumber1` / `PoNumber2` | all `.glc` | point index refs | int | No | sometimes omitted | Confirmed |
| `JValue` | all `.glc` | segment chord length | float | No | mm | Confirmed |
| `IdntBeg` / `IdntEnd` | all `.glc` | vertex labels (A,B,...) | token | Yes | used in dims | Confirmed |
| `FixedBeg` | all `.glc` | fixed-start flag | bool | Yes | | Highly probable |
| `dim_lines_`/`dim_lines_end` | all `.glc` | diagonals section | tag | Yes | may be empty | Confirmed |
| `dim_otr`/`end` | all `.glc` | one dimension record | tag | No | | Confirmed |
| `d_geom1` / `d_geom2` | all `.glc` | diagonal endpoints by label | token | No | | Confirmed |
| `jvalue` (lowercase) | all `.glc` | dimension length | float | No | often `0` | Highly probable |
| `StartPointA` | all `.glc` | start vertex index/flag | int | Yes | `-1` or `9` | Hypothesis |
| `VIREZS`/`VIREZSEND` | all `.glc` | cutout section | tag | Yes | may be empty | Confirmed |
| `ONEVIREZ`/`ONEVIREZEND` | `033273*.glc` | one internal cut contour | tag | No | | Confirmed |
| `VirezLine` | `033273*.glc` | one cutout edge | tag | No | | Confirmed |
| `GlobPlanX` / `GlobPlanY` | all `.glc` | global plan offset | int | Yes | always 0 here | Hypothesis |
| `ALL_LINESLIST_BEGIN/END` | `033273_1.glc` | extra line objects section | tag | No | extended variant | Confirmed |
| `ListLine` | `033273_1.glc` | generic line object | tag | No | with lamp/style fields | Highly probable |
| `ZONESLIST`/`ZONESLISTEND` | all `.glc` | zone collection | tag | Yes | multiple zones possible | Confirmed |
| `OneZone`/`OneZoneEND` | all `.glc` | zone record | tag | Yes | | Confirmed |
| `ZoneGUI1` | all `.glc` | zone GUID | GUID | Yes | | Confirmed |
| `ZoneLine` | all `.glc` | zone boundary edge | tag | Yes | `TipeOtr` optional in some lines | Confirmed |
| `TipeOtr` | all `.glc` | zone edge type | int | No | `1`, `9` observed | Highly probable |
| `ZoneDepth`, `ZoneDepth2` | all `.glc` | depth params | float/int | Yes | always 0 | Hypothesis |
| `Dep_X1`, `Dep_Y1`, `Dep_Alp` | all `.glc` | depth axis params | float | Yes | mostly -1/0 | Hypothesis |
| `PPGrpID`, `PPLevlNum` | all `.glc` | level/group IDs | int | Yes | always 0 here | Hypothesis |
| `HandMade` | all `.glc` | manual flag | bool | Yes | always False | Highly probable |
| `ALLDIMLINES`/`ALLDIMLINESEND` | all `.glc` | reserved dimension layer | tag | Yes | empty in samples | Confirmed |
| `ESTIME_BEGIN/END` | all `.glc` | estimate section | tag | Yes | | Confirmed |
| `RecordBegin/End` | all `.glc` | one estimate line | tag | Yes | | Confirmed |
| `ART_NO` | all `.glc` | article ID | text | Yes | `MR...` | Confirmed |
| `Name` | all `.glc` | item name | text | Yes | material/service name | Confirmed |
| `Units` | all `.glc` | measurement unit | text | Yes | `м.кв.`, `шт.`, `м.п` | Confirmed |
| `Kol` | all `.glc` | quantity | float | Yes | linked to GVals in many rows | Confirmed |
| `Cena` | all `.glc` | price per unit | float | Yes | currency not embedded | Highly probable |
| `GrpID` | all `.glc` | estimate group | int | Yes | `1`, `3` seen | Highly probable |
| `UseEstim` / `UseSclad` | all `.glc` | include flags | bool | Yes | in record and room level | Confirmed |
| `GValsBegin/End` | all `.glc` | derived metrics section | tag | Yes | | Confirmed |
| `A` | all `.glc` | area m² | float | Yes | matches geometry | Confirmed |
| `B` | all `.glc` | cloth area m² | float | Yes | shrink-adjusted | Highly probable |
| `C` | all `.glc` | consumption area m² | float | Yes | layout-dependent | Highly probable |
| `D` | all `.glc` | perimeter m | float | Yes | includes arcs | Confirmed |
| `E`, `F` | all `.glc` | corner counts | int | Yes | inner/outer per comment | Highly probable |
| `I` | all `.glc` | curved segment count | int | Yes | | Confirmed |
| `J` | all `.glc` | curved length m | float | Yes | arc-length sum | Confirmed |
| `G` | all `.glc` | harpoon length m | float | Yes | | Confirmed |
| `L`, `P` | all `.glc` | seam lengths m | float | Yes | auto/manual | Confirmed |
| `M`, `O` | all `.glc` | inner cut area/perimeter | float | Yes | | Confirmed |
| `CWid1`,`CHei1`,`CWid2`,`CHei2` | all `.glc` | bounding/layout dimensions | float | Yes | mm-scale values | Highly probable |
| `PARAMS2_BEGIN/END` | all `.glc` | material/layout params | tag | Yes | | Confirmed |
| `FullLineWidth`, `FirstLineWidth` | all `.glc` | roll/strip width params | int | Yes | mm | Confirmed |
| `StretchParamPer`, `StretchParamPer_2` | all `.glc` | stretch/shrink % | float | Yes | | Confirmed |
| `LineLineName`, `ColorLineName`, `ArtNoName` | all `.glc` | material identity | text/int | Yes | | Confirmed |
| `OBJ_*`, `ORG_*`, `GgoCount`, `GgoAllSqw` | `033273_1.glc` | container metadata | mixed | No (single-room) | multi-object variant | Confirmed |
| `doc_rows_start_` | `033273_нп20.txt` | 1C section delimiter | token | Yes (in that txt) | UTF-8 BOM file | Confirmed |
| tab-separated row payload | `033273_нп20.txt` | 1C export rows | TSV | Yes | product/resources/operations | Confirmed |
