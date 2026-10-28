# Task 3 independent review

Spec compliant: **Yes** (Task 3 scope).

Task quality: **Approved** with one nonblocking wording correction.

Findings: **0 Critical, 0 Important, 1 Minor**.

Reviewed the reviewer contract, Task 3 brief/report and supplied `dd40275..c34b5e8` diff. Production and git were not changed. Later receipt editing/revisions and actual-price work were excluded from this gate.

## Strengths and evidence

- Client suggestions preserve separate dated visits and explicit selection writes only the name; calculation scheduling and complete raw-draft persistence follow (`app.js:782–797`). User-entered name/date text is escaped in generated markup.
- Read-only receipt opening derives its contents from the saved record, without applying raw inputs, calculating, writing the draft or sending Google data (`app.js:798–810`). Saved price/material snapshots are used rather than current catalog values.
- Repeat asks the replacement guard before changing tabs or applying any fields; template application uses the same guard, ignoring only the selection of a template itself (`app.js:128`, `305–308`, `830–839`). Cancellation therefore preserves populated raw/invalid draft input. Accepted repeat retains historical receipts and uses the existing current-rate calculation path.
- Import calculates its preview before storage/form mutations and returns immediately on cancellation. The preview states ID-conflict policy and composition/draft effects. Old v3 config without the optional Google flag preserves an existing explicit opt-out; v2 leaves config untouched (`app.js:451–480`).
- Client copy text is restricted to name, date and final price, with a labelled selectable manual-copy dialog fallback (`app.js:812–826`, `index.html:211–219`). It excludes recipes, rates, costs and income and performs no transmission.
- Backup download status accurately says download started, reminder state is nonblocking, and Google Forms is separately labelled as an unconfirmed attempt rather than a backup (`app.js:422–442`; Settings copy in `index.html`). Both dialogs have accessible names, native modal behavior and explicit labelled close buttons.

## Minor finding

1. **Saved receipt labels deductions as direct costs** — `app.js:800`.

   Scenario: save a default calculation with tax 4% and fee 2%, then open it. The new dialog displays **«Прямые расходы: 876,20 ₽»**, although direct costs are 620 ₽ and the remaining 256,20 ₽ are tax/fee. `item.exp` includes both direct costs and deductions (`core.js:33`). This does not corrupt the saved totals or income, but the new read-only presentation conflates the two concepts.

   Remedy: label this saved aggregate «Расходы и удержания» (safe also for legacy receipts), or display a separate direct-cost value only when a reliable saved breakdown is available. Do not derive missing historical data from current rates.

   Evidence: a focused in-memory probe using the existing Node harness produced total 4270, exp 876.2, saved tax 170.8 and fee 85.4, and the dialog HTML assigned 876,20 ₽ to «Прямые расходы».

## Verification and limits

No broad suite was repeated. The supplied report records 88 passing Node tests and scoped 320 px Chromium coverage; the browser script was inspected for the covered paths and external-request aborts. This review independently checked code paths and ran only the focused wording probe above. No important or critical defect was found in the requested name-only/draft, replacement cancellation, import cancellation/old-config opt-out, copy privacy or dialog-accessibility paths.

Actual clipboard permissions, successful retention of a downloaded file, screen-reader announcements and every browser's native dialog behavior were not independently exercised here. The UI correctly avoids claiming confirmed download retention or Google acceptance. Final offline/standalone assembly remains a separate gate.
