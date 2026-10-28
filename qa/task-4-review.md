# Task 4 independent review

Spec compliant: **No**

Task quality: **Needs fixes**

Findings: **0 Critical, 1 Important, 0 Minor**.

Reviewed the assigned Task 4 brief, report and diff (`c34b5e8..2190039`), with focused inspection of historical material authority, persisted edit sessions, receipt validation/revisions, concurrency tokens, actual-price arithmetic and first-click event routing. No production files or git state changed. No broad test suite rerun; existing 103 Node and seven browser scenarios were inspected as supplied evidence. Final assembly/deployment is outside this gate.

## Important

### I1 — Editing a legacy receipt discards known historical material prices when a line becomes unused

**Locations:** `app.js:413-420`, `app.js:733`, `app.js:771`, `app.js:775` (with failure through `app.js:224` and `app.js:442`).

A receipt with authoritative `rates` and `materialLines`, but no `catalogSnapshot`, is correctly offered historical editing. However, the corrected receipt assigns `catalogSnapshot` only from `editSession.original.catalogSnapshot`, leaving it absent. Its new `materialLines` contains only currently positive quantities. Removing a previously snapshotted material therefore discards that material's historical authority from the active receipt, even though its original price remains known in the previous version.

**Confirmed in a focused real Chromium run** using the existing normal launch configuration, service workers blocked, all non-local requests aborted and form submission mocked:

1. Store a legacy receipt with complete rates, `raw.customQuantities: {"custom-old": 10}` and one authoritative material line (`custom-old`, unit `г`, unit price 1, quantity 10, cost 10); no catalog snapshot.
2. `startReceiptEdit(1)` returns true. Set the material quantity to 0 and save.
3. The corrected receipt contains `raw.customQuantities: {"custom-old": 0}`, `materialLines: []`, and no catalog snapshot.
4. `editableReceipt(corrected)` still returns true, but the next `startReceiptEdit(1)` returns false. `captureDraft()` tries to read the absent `quantity-custom-old` input; the UI reports “Сеанс редактирования не начат: запись черновика недоступна” even though storage works.

For a removed built-in material the next edit can open, but the formerly known material is no longer available to re-add. This violates the historical-context requirement to preserve the authoritative restricted material snapshot across later edits. Existing full-snapshot receipts do not have this problem. The original receipt remains recoverable through revisions, so this is not irreversible data loss, but a normal successful correction can break subsequent editing of a supported legacy receipt.

**Remedy:** On the first legacy edit, persist a restricted `catalogSnapshot` derived from the original authoritative material lines, and retain that same restricted snapshot on later edits. Do not derive it from the newly filtered material lines or current catalog. Add focused coverage for removing/zeroing a legacy custom and built-in material, saving, reloading/reopening, and restoring its quantity at the original price. Treat zero placeholders without a priced snapshot consistently so an edit action never fails as a fake storage error.

## Strengths and verified code evidence

- `core.js:31-39` preserves the calculated quote before replacing revenue with rounded actual cents, recomputes tax/fee from actual revenue, and subtracts rent, consumables, materials, extras and deductions exactly once. Owner labour remains income. The reported 4,600 / 620 / 6% / 2% acceptance arithmetic agrees with the code.
- New receipts snapshot the complete priced catalog (`app.js:771`), and `calculationConfig()` substitutes saved historical prices during editing. Missing rates/snapshot authority explicitly disables editing, while view/repeat remain available.
- Edit-session drafts validate their original receipt, exact token, nonrecursive prior draft and optional actual-price state (`app.js:243-258`). Reload restores historical context rather than starting a current-price receipt (`app.js:273-312`).
- Edit save checks the current receipt token, preserves identity/date metadata, appends a flat prior version and writes history once (`app.js:458-474`). Undo checks the viewed token, appends the outgoing version and retains all prior versions (`app.js:478-488`). Neither path invokes Google sending. Revision validation rejects recursive histories and changed ID/date (`app.js:408`).
- Manual override is stripped from repeat/template recipes, stays explicit in historical edits, and appears with quote/difference in client-facing copied text. Negative income remains saveable with a visible warning.
- The earlier aggregate expense-label finding is fixed in calculation, history, receipt view and CSV. The first-click integration fix has a concrete cause and appropriately ignores duplicate text/number blur `change` events while retaining `input` handling (`app.js:345-358`); supplied pointer browser checks cover save and copy.

## Limits / cannot verify here

- Physical mobile keyboard behaviour and final standalone/service-worker/ZIP assembly remain later gates, as specified.
- LocalStorage has no atomic compare-and-swap; the token check rejects known stale receipts immediately before its single write, consistent with the approved model and reported cross-tab evidence.
- The existing full suite was not independently rerun, per reviewer contract. The focused reproduction above is the additional execution performed for this review.
