# Final independent acceptance matrix — approved desktop/offline scope

Final assembled HEAD `606d41b588e98465f16d2225147a6e96d0eef249`. **42 PASS, 0 FAIL, 1 BLOCKED (T04 physical phone).** Broad independent baseline ran on 22dabbc; affected F1/F2/F3/F4 source/file/pointer/update flows were retested on 6f7f817 and final606d. The full 43 rows were not freshly rerun on final606d. Unchanged baseline evidence is carried with scoped regression verification; no unresolved product defect remains in this scope.

`existing`, `stage4`, `targeted` refer to browser-final-existing-report.json, browser-final-stage4-report.json, browser-final-targeted-report.json. Final pointer/template success: browser-final-overlay-native-report.json. Final606d retained F1 source/file and F2 update success: browser-final-overlay-independent-report.json.

| ID | Status | Independent observation / evidence |
|---|---|---|
| G01 | **PASS** | targeted:G01-layout-keyboard-time |
| G02 | **PASS** | targeted:G01-layout-keyboard-time + final-layout-{320,390,768,1280}.png |
| G03 | **PASS** | targeted:G01-layout-keyboard-time + final-accessibility.txt |
| G04 | **PASS** | stage4:G04-B03-O04-storage |
| D01 | **PASS** | stage4:D01-D05-durable + existing:M03-active |
| D02 | **PASS** | existing:D02-browser-e, T01-minute-e; stage4:D01-D05-durable |
| D03 | **PASS** | existing:D03-new |
| D04 | **PASS** | stage4:D01-D05-durable; existing:X-first-save |
| D05 | **PASS** | stage4:D01-D05-durable |
| D06 | **PASS** | existing:D06-corruption |
| M01 | **PASS** | targeted:G01-layout-keyboard-time |
| M02 | **PASS** | targeted:G01-layout-keyboard-time |
| M03 | **PASS** | existing:M03-active |
| T01 | **PASS** | existing:T01-old-schema, T01-minute-e |
| T02 | **PASS** | targeted:G01-layout-keyboard-time |
| T03 | **PASS** | Baseline three-value summary/focus policy plus final source/file320 pointer lifecycle: intended first action, summary return, QuickDetails/nav and drag-away cleanup pass; browser-final-overlay-native-report.json |
| T04 | **BLOCKED** | Physical Android/iOS browser and on-screen keyboard unavailable |
| C01 | **PASS** | existing:C01-same-name |
| C02 | **PASS** | existing:C01-same-name |
| C03 | **PASS** | stage4:E06-C03-legacy |
| C04 | **PASS** | existing:C04-cancel; targeted:P01-P05-price (explicit confirmed replacement) |
| E01 | **PASS** | stage4:E01-E03-E07-original |
| E02 | **PASS** | stage4:E01-E03-E07-original; no external attempts with Google enabled |
| E03 | **PASS** | stage4:E01-E03-E07-original (data restore); F1 UI status tracked separately in B04 |
| E04 | **PASS** | stage4:E04-E05-concurrent |
| E05 | **PASS** | stage4:E04-E05-concurrent |
| E06 | **PASS** | stage4:E06-C03-legacy |
| E07 | **PASS** | stage4:E01-E03-E07-original |
| P01 | **PASS** | targeted:P01-P05-price |
| P02 | **PASS** | targeted:P01-P05-price |
| P03 | **PASS** | targeted:P01-P05-price (1000.01 revenue -1085 direct -60 deductions =-144.99) |
| P04 | **PASS** | targeted:P01-P05-price (saved -609.99 income; zero/negative price rejected) |
| P05 | **PASS** | Baseline recipe/repeat exclude manual price; final source/file320 first SaveTemplate saves once, preserves manual result/draft and supports first Copy/Save; both original F3 and separate F4 fixed. browser-final-overlay-native-report.json |
| B01 | **PASS** | stage4:B01-reminder |
| B02 | **PASS** | existing:B02-import-cancel; stage4:G04-B03-O04-storage, E01-E03-E07-original (accepted imports) |
| B03 | **PASS** | stage4:G04-B03-O04-storage; existing:B02-import-cancel |
| B04 | **PASS** | Existing preference preservation baseline plus final F1 source/file PASS: honest prospective new-save disclosure after cancel and successful edit-return; browser-final-fixed-independent-report.json |
| B05 | **PASS** | existing:B04-old-backup; stage4:E01-E03-E07-original, E04-E05-concurrent (no sends on edit/undo) |
| B06 | **PASS** | existing:B06-copy-privacy, X-first-copy (actual clipboard) |
| O01 | **PASS** | stage4:O01-O03-pwa |
| O02 | **PASS** | stage4:O02-standalone (actual file URL offline, native badInput, durable save, edit/undo) |
| O03 | **PASS** | stage4:O01-O03-pwa; functionality PASS, misleading reset confirmation F2 separately tracked |
| O04 | **PASS** | stage4:G04-B03-O04-storage |
