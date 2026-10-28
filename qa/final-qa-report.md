# Final independent QA — release gate complete

**No unresolved product defect in the tested desktop/offline scope. Final matrix: 42 PASS, 0 FAIL, 1 BLOCKED.** Final assembled HEAD `606d41b588e98465f16d2225147a6e96d0eef249`; source overlay fix `8dd6ccf`. T04 remains BLOCKED because no physical Android/iOS browser and on-screen keyboard are available. This does not block the verified desktop/source/standalone scope, and it is not a claim of phone keyboard or OS installation validation.

The broad 43-row baseline was independently exercised on assembled22dabbc; affected F1/F2/F3/F4 flows, generated standalone and artifact parity were independently retested after the scoped fixes. **The full 43 rows were not rerun on final606d.** Unchanged baseline behavior and scoped final regression evidence are combined explicitly in `final-acceptance-matrix.md`.

## Final scoped native verification

`browser-final-overlay-native-report.json` independently passes both canonical source and actual generated `file:` HTML at 320×900 with native mouse actions:

- **Original F3 fixed:** one SaveTemplate action stores exactly one template; valid results/Save stay visible and enabled; client, quantity, manual kopeck price and complete draft stay unchanged. Stored recipe omits the manual override.
- **Separate F4 fixed:** original focused-template-name first-click reproduction now keeps pointerdown/up/click on the intended SaveTemplate button. Native event trace shows compact summary stays hidden during activation, and then returns. No second-click workaround.
- First actual clipboard Copy and first receipt Save from focused price field succeed; exactly one receipt stores the manual amount. Prospective save status and separate `Последнее сохранение:` result display correctly at 320px; page has no horizontal overflow and Save is reachable.
- Summary returns after activation and after drag-away release without a stuck latch or duplicate template. QuickDetails expands details, navigation hides summary in History and restores it in Calculation. Both source and standalone pass these checks.

`browser-final-overlay-independent-report.json` independently passes final606d **F1 source/file** (cancel and successful edit-return show honest new-receipt Google disclosure) and **F2 real-worker update** (correct prompt, cancel preserves exact draft, accepted reload restores it). Its earlier F3 tail entries reflect a QA locator attempting to fill the template field after form reset had closed that panel; QA corrected the missing panel-opening step and reran only those affected source/file cases successfully in `browser-final-overlay-native-report.json`. No product change was needed for that harness correction.

Runtime: Playwright1.62.1 / Chromium153.0.8010.0, only `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`. No origin/security/isolation disabling flags. All nonlocal requests aborted; **zero external attempts and page errors** in final scoped runs. Synthetic data only. Google disabled for new saves; edits/undo were independently observed with Google enabled and no sends. No actual external transmission or publication occurred.

## Broad independent baseline retained

Evidence: `browser-final-existing-report.json`, `browser-final-stage4-report.json`, `browser-final-targeted-report.json`; exact per-row mapping in `final-acceptance-matrix.md`. The later targeted reports supersede specific corrected harness assertions, without converting untested cases to PASS.

Observed baseline covers actual native material/minute badInput recovery; corrupt draft preservation; rich raw draft/extras/context/selected quantities; untouched draft behavior; storage fault recovery and single durable save; reset/no client resurrection; stable favorites and keyboard visual order; exact old-schema durations/fallback and explicit rent linking; four widths/tabs/dialogs without page overflow; accessible names; original app storage/cache sentinels.

Local same-name dated visits remain separate and name selection preserves pending composition. Guarded template/repeat cancellation and explicit replacement pass. Original historical rates/material names/units/prices/ID/date survive edits; immutable prior revisions and backup roundtrip/undo pass. Invalid/manual prior draft restores on cancel/commit. Two real tabs reject stale edits and stale undo. Missing snapshots prohibit edit while view/current-rate repeat work.

Manual revenue1000.01 minus direct costs1085 minus deductions60 yields income−144.99. Manual amount stays pinned, quote/difference/reset work, negative-income receipt−609.99 saves, non-positive totals reject, recipes/repeat omit discounts. Backup preview cancellation and malformed/unsupported/invalid config/record/revision inputs preserve exact storage; accepted schema2/schema3, delete/restore, export timestamp/nonblocking reminders and safe clipboard summary pass.

Real SW offline reload/save/persistence and explicit update retain receipts/draft/original cache. Actual standalone file offline passes native invalid input/reload recovery, durable first-click save, historical edit/revisions/undo. Original first-click Save/Copy defect was independently retested as fixed on assembled22dabbc and the newly affected first-click paths pass final606d.

## Exact regenerated artifacts

Independent verification: `final-artifact-verification.json`. Reconstructed standalone exactly equals current canonical HTML/CSS/core/app inlining.

- Standalone SHA-256: `239620525f859072529a435ec235b1d1398aee999828df27624cedfc5cdd2c3e`.
- Verified ZIP `/workspace/scratch/9e43d68a63ef/Master_Calc_v2.1.0_Palette.zip` SHA-256: `d8fac39ca835787b195b01f9023cae6e2494043f5952e26fcde5c183826417d1`.
- CRC, unique entry names and every ZIP entry byte-for-byte against current source pass. Intentionally included textual review/log files are distinct from excluded internal screenshots. No runtime, `.superpowers`, git data, user backup or QA screenshot appears in the ZIP.

Final source/file320 save-layout screenshots are internal: `final-fixed-save-layout-source-320.png`, `final-fixed-save-layout-file-320.png`. Fresh default screenshot and four-width/a11y evidence remain baseline internal artifacts shared with auditor.

## Boundaries

Physical iOS/Android on-screen keyboard, OS installation, Contact Picker and real Google receipt acceptance are unverified. No claim of mobile installation or cloud sync. All QA writes are in the session QA directory; production files and git state were untouched. Implementer/builder tests were supporting context only, never substituted for independent evidence. Earlier findings and their failing traces remain in `final-qa-checkpoint-history.md` and checkpoint reports. Optional testing stopped after the affected native flows and exact regenerated parity passed.
