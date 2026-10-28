# Important 320px first-click overlay defect

Confirmed on assembled `6f7f81735ccef97b5155a10e40d8db53c4c3e93e`, Chromium 153.0.8010.0, normal origin/security flags. Observed on both canonical source and generated standalone HTML. No production change or second-click workaround.

At 320×900: enter client/material and optional actual price; open service template editor; fill template name (input remains focused). Click **Сохранить состав услуги** once. Expected one template saved with result retained. Actual zero templates saved; result remains valid.

Native event trace proves why (`final-320-overlay-evidence.json`):

1. Pointerdown targets **Сохранить состав услуги**, compact summary display `none` while input focused.
2. Native `change`/`focusout` on template-name causes CSS compact summary display `flex`.
3. Pointerup hits **quick-details / Подробнее** in newly appeared summary at the original pointer location.
4. Click targets parent `calc`; template action never receives click. Template count remains 0.

This is separate from fixed F3's calculation invalidation: `currentCalc` remains valid and results/Save remain visible throughout. The approved hide-summary-while-input-focused policy becomes unsafe when the summary reappears during the same pointer activation and intercepts its completion. This is a real desktop pointer/focus defect reproducible in a narrow viewport; no claim about physical phone keyboard is required.

Evidence: `browser-final-template-320-probe.json`, `final-320-overlay-evidence.json`, `failure-F3-template-results.png`; initial scoped fixed source+file results in `browser-final-fixed-independent-report.json`.
