# Task 4 implementation report

Implemented on approved Task 3 base `c34b5e8`. No standalone generation, service-worker rebuild, deployment, external data send, or unrelated refactor.

## Changes and concrete policies

- `MasterCalcCore.calculateQuote` accepts optional `actualPrice` (roubles); exposes `quotedTotal` and integer `cents.quotedTotal` separately. Actual revenue is rounded to kopecks, then tax and fee are each rounded once from that revenue. Cover-deductions affects the quote only when actual price is pinned. Acceptance: 4,600 ₽ revenue, 620 ₽ direct costs, 6% tax, 2% fee => tax 276 ₽, fee 92 ₽, aggregate expenses 988 ₽, income 3,612 ₽, with either cover setting.
- Manual price is optional, remains pinned after composition changes, displays quote/difference and an explicit pinned-price note, and has a reset action. Negative income is visibly marked and remains saveable; non-positive totals remain invalid. Saved receipt viewer and copied client text disclose quote/difference for manual prices; copied text still omits private income/costs/materials.
- NEW receipts capture full `catalogSnapshot: [{id,name,unit,unitPrice}]`, including currently unused/archived catalog entries. Edit uses saved `rates` and this snapshot exclusively. Old receipts with authoritative full rates and `materialLines` expose only those stored material IDs/prices. Their restricted snapshot stays restricted on subsequent edits; no current price is fabricated. Missing or incomplete authority makes edit explicitly unavailable, while view/repeat remain available.
- `startReceiptEdit(id)` stores an edit session with original receipt, exact JSON concurrency token, and prior raw draft. Additive schema-1 draft fields `actualPrice` and `edit` preserve mode, historical context, and prior draft across reload; legacy drafts without them remain valid. Historical sessions never reload as new/current-price calculations.
- Save retains ID/date/dateKey/createdAt/timezone and cloud status, appends a flat prior-version snapshot to `revisions`, increments `revision`, and performs one history `localStorage.setItem`. Neither save-edit nor restore-version calls Google. Existing original version is never trimmed. There is no arbitrary edit-count cap; quota failure preserves receipt and editing session.
- Receipt view offers all saved versions, including the original. `undoReceipt(id, token, revisionIndex = null)` restores selected/previous content, appends the outgoing current snapshot, and keeps identity. `checkedReceipt` rejects changed/deleted current receipts before edit/undo write. `revisions` validation rejects recursive histories and identity changes. Existing v2/v3 raw backups remain compatible; v3 backups retain snapshots/revisions.
- Cancel restores the prior raw draft exactly, including invalid/blank input and manual-price context. Successful edit also returns the suspended prior draft. Failed restore keeps its session source. `lastEditDraftId` lets reload recover a committed edit whose draft cleanup failed without committing twice.
- New/repeat/template/import operations ask the user to finish save/cancel while editing, protecting the suspended draft. Repeat and template apply/save strip manual override; an imported template with an override is also reset. Settings may change during edit without changing its prices.
- Receipt/history/CSV aggregate expense label is now `Расходы и удержания`, because stored `exp` includes deductions. Negative history income also uses danger color.
- `refreshBackupStatus` runs after correction/restore mutations.

## Added integration fix

Independent QA on frozen Task 3 found first Save/copy clicks lost on number/text blur (`qa/first-click-findings.md`). The delegated `change` handler re-invalidated and hid the valid result before pointerup. The handler now ignores duplicate text/number `change` events; native `input` handles these fields, while select/checkbox changes remain supported. This is an event-routing fix, with no artificial delay or second-click workaround.

## Red/green and verification

1. Added core and reliability tests before implementation. `node --test tests/core.test.cjs tests/reliability.test.cjs` was red: 90 cases, 83 pass, 7 expected new failures for manual accounting and missing historical-edit APIs/validation. Captured in `qa/task4-node-red.log`.
2. Final `node --test tests/*.test.cjs`: **103/103 pass**, zero failures (`qa/task4-node-green.log`). Includes original-price reload/cancel, exact identity/flat immutable revisions, selected original restore after multiple edits, stale edit/undo rejection, actual-price cents, negative-income save, old raw receipt acceptance, v3 revision backup roundtrip, no edit/undo sends, atomic history write and failed cleanup recovery, write/cancel failures, old additive drafts, imported-template reset, and first-click event regression.
3. `node .superpowers/sdd/ux-v21/qa/task4-browser.cjs`: **7 focused browser scenarios pass**, zero page errors, zero external requests. Normal Chromium executable/args from `qa/runtime-config.json`; no origin/security disabling flags. Test blocks all non-localhost requests and intercepts form submit. Results `qa/task4-browser-report.json`, screenshot `qa/task4-mobile.png`.
4. Actual pointer first Save and first copy after material entry pass. Browser exercised original-price edit/reload/cancel, 4,600/6%/2% accounting with cover enabled, two normal tabs changing the receipt before edit/undo, fresh original restoration, negative-income save and 320px no horizontal page overflow. Cross-tab checks wait for the other tab's storage propagation before capturing the expected concurrent state.
5. `git diff --check` clean. Inspected 320px screenshot; widened actual-price field to prevent clipping its numeric value.

## APIs and compatibility

- Core: additive `calculateQuote(input.actualPrice?)`, `quotedTotal`, `cents.quotedTotal`; existing totals/profit/exp names unchanged.
- App: `calculationConfig`, `historicalCatalog`, `editableReceipt`, `validCatalogSnapshot`, `startReceiptEdit`, `cancelReceiptEdit`, `commitReceiptEdit`, `receiptVersion`, `checkedReceipt`, `undoReceipt`, `undoViewedReceipt`, `recipeRaw`, `resetActualPrice`, `syncActualPrice`, `updateEditUI`.
- Additive receipt fields: `catalogSnapshot`, `quotedTotal`, `revision`, flat `revisions`, `lastEditDraftId`; raw `actualPrice`. Existing storage keys and backup versions unchanged.

## Limits / handoff

- LocalStorage quota and existing 20MB import limit bound storage; no silent deletion/trimming. Flat snapshots grow linearly with corrections. No cloud revision synchronization or resend was introduced.
- Concurrency protection is a full-current-receipt comparison immediately before a single local history write. This detects tested stale-tab edits/deletions; localStorage offers no multi-operation compare-and-swap or distributed lock.
- Browser evidence is focused desktop Chromium with 320px emulation, not a physical mobile keyboard test. Independent review/final assembly remain parent gates. Parent-owned plan wording change is excluded from this commit.

## Review round 1 — I1 fixed

Review confirmed that legacy `rates + materialLines` editing omitted `catalogSnapshot`; removing a line then discarded that material's authority from the current version. Corrections now always snapshot `calculationConfig().catalog`, which is already the full saved catalog or the restricted original authoritative lines. The snapshot remains independent of active positive quantities and never reads a missing price from today's catalog. Subsequent edits retain this same restricted list. The edit banner describes the restriction consistently for both forms of saved snapshots.

`applyRaw` now removes custom quantity placeholders whose IDs are absent from the authoritative catalog only after its existing positive-quantity missing-ID guard. Thus unknown zeros do not create phantom DOM fields or fake storage errors; unknown positive quantities remain unavailable. No authority is reconstructed from revision copies or current catalog prices.

Regression evidence:

- Before the fix, the two new reliability cases failed as expected (`qa/task4-fix1-red.log`: 94 tests, 92 pass, 2 fail).
- After the fix, `node --test tests/*.test.cjs`: **105/105 pass**, zero failures (`qa/task4-fix1-green.log`). Both built-in and custom legacy lines exercise zero and explicit remove, save, reload/reopen, re-add at original price, and v3 backup roundtrip. Original immutable revision remains identical; unknown zero placeholders are normalized without adding materials.
- Extended existing `qa/task4-browser.cjs`: **9/9 scenarios pass**, including legacy built-in/custom zero → Save → reload/reopen → edit reload → re-add at 1.25 ₽ → Save → v3 import → reopen. Snapshots contain exactly the one authoritative material, not today's catalog. Normal Chromium/runtime settings, service workers blocked to test current source, all non-local requests aborted and form submission mocked; zero page errors or external attempts (`qa/task4-fix1-browser.log`, updated `qa/task4-browser-report.json`).
- `git diff --check` clean. No standalone/service-worker build; parent-owned plan modification remains excluded.
