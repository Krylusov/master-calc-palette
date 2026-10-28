# Task 2 independent review

Spec compliant: **No**

Task quality: **Needs fixes**

Findings: **0 Critical, 1 Important, 0 Minor**.

Reviewed the assigned `bf9203c..1c7b207` diff and Task 2 requirements. Production files and git were read-only. No full suite was repeated; focused Chromium reproductions used localhost, blocked service workers and aborted external requests.

## Important

1. **A valid replacement of an invalid minute field retains its stale validation marker and blocks calculation.** `app.js:167–172` (also the part replacement at `app.js:150`; validation consumes the marker at `app.js:551` and `app.js:391`).

   Scenario, reproduced in Chromium at 320px: select hours/minutes, clear `rent-minutes`, type `e`, then check “Аренда равна времени работы”. Before linking, the browser reports `badInput=true` and `draftInvalidFields` contains `rent-minutes`. Linking replaces the displayed rental duration with **1 hour 0 minutes** and sets canonical `rent-time` to `'1'`; browser `badInput` becomes false, but `draftInvalidFields` still contains `rent-minutes`. Calling `calculate(false,true)` returns false with “Введите целое неотрицательное количество”.

   Consequence: an explicit link action produces valid-looking fields but leaves calculation/save unavailable. Editing the rent minute field to clear the marker also unlinks rent, so the user cannot recover simply by using the intended link operation. The same stale-marker risk exists when `syncDurationPresentation()` fills parts from a corrected decimal value.

   Remedy: when valid canonical duration values intentionally replace hour/minute fields, reconcile their `draftInvalidFields` and accessible error state as well as their values. Preserve invalid work state when copying an invalid work duration; clear obsolete rent-part errors when valid work values replace them. Add focused coverage for bad-input minute → rent link and bad-input minute → corrected decimal → minutes presentation.

## Strengths and evidence

- Favorites and complete order are additive within the existing config key, with normalization for old configs (`app.js:44–63`). Settings exposes labeled pin/up/down controls, and the default seven remain the fallback.
- Active built-in quantities remain visible independent of favorite/archive state (`app.js:330–333`); selected custom quantities continue to render after unpinning/archive (`app.js:81–83`), and calculation still charges catalog quantities without excluding archived entries (`app.js:584–590`).
- Duration presentation preserves canonical historical hour values and uses a strict whole-minute roundtrip test rather than rounding (`app.js:141–151`). Old raws default to decimal/unlinked (`app.js:133–138`), and optional draft extensions preserve schema-1 compatibility (`app.js:224–237`, `app.js:270–274`).
- The Tab implementation was judged against the clarified observable requirement, which permits standard traversal interception. The focused browser check confirmed entry from “Все материалы” to visually first `m-booster` after reordering. The code includes both boundary exits, Shift+Tab and custom remove controls (`app.js:98–108`); no positive tabindex was added. The implementer's scoped test covers those remaining boundary cases.
- Compact summary includes price, income and material subtotal; focused input hiding is implemented in `styles.css:135`. A focused Chromium check confirmed keyboard activation of “Подробнее” opens the details. Focus remains on that button and the following Tab leaves the page content; this scroll-button behavior existed before Task 2, so it is not reported as a new blocking regression.

## Verification limits

- No physical mobile keyboard or screen-reader session was available; focus behavior was inspected in desktop Chromium at a 320px viewport.
- The reported full Node/browser pass was not rerun, per reviewer contract. Review evidence consists of inspected code/tests and the targeted reproductions above.
- Later task features, standalone packaging, service-worker versioning and broad final assembly gates were outside this review and were not treated as omissions.
