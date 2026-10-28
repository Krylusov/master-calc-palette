# Scoped F4 overlay correction review

Reviewed `6f7f817..8dd6ccf`, `final-overlay-fix-report.md` and `final-overlay-diff.txt`. Scope is only the confirmed 320px pointer-activation interception: summary reappeared after the template-name input blurred and captured pointerup before Save Template activated. No general audit/refactor review, production edits, git mutations or subagents.

**Verdict: ACCEPTED / F4 ADDRESSED in canonical source. No material issue found in this bounded change.** Rebuilt source/standalone parity and affected first-click artifact acceptance remain the independent QA gate; this review does not substitute for that gate.

## Lifecycle review

- `app.js:1008–1013`: capture-phase primary-button pointerdown observes the focused calculation input before default blur. It latches suppression through the activation, so the existing focus-only CSS cannot reveal the summary between pointerdown and pointerup. The summary itself is explicitly excluded from initiating suppression; Quick Details does not hide its own target.
- `styles.css:135`: the latch only affects the existing narrow-screen summary media query. It neither hides the result/Save action nor changes desktop layout, navigation visibility, form values or draft persistence.
- `app.js:1025–1027`: pointerdown/up use capture; ordinary click cleanup bubbles after the target action handler. No `preventDefault`, propagation cancellation, pointer capture or focus redirection is introduced. The real action can finish without its hit target being replaced by the overlay.
- `app.js:1015–1019`: matching pointerup schedules next-render cleanup if activation produces no click; it does not leave an unconditional latched state after a drag-away release. `releaseSummaryActivation` cancels any pending cleanup frame and clears both pointer/frame state (`1003–1006`). A later primary pointerdown also begins from clean state.
- `app.js:1028–1029`: pointercancel and window blur release immediately. Keyboard Tab navigation does not start a latch. Navigation remains controlled by the existing tab logic; returning to Calculation can display the summary normally. Mouse/pen/touch share the Pointer Events path; a primary contact's button 0 is accepted and secondary contacts do not start a new latch. This source review is not physical touchscreen or OS-blur verification.

## Fresh focused verification

Ran only:

```text
node tests/overlay.browser.cjs
```

Exit 0, normal supplied Chromium runtime, 320×900:

```json
{"entry":"index.html","viewport":"320x900","templateFirstClick":"PASS","receiptFirstClick":"PASS","copyFirstClick":"PASS","quickDetails":"PASS","dragRelease":"PASS","blurReturn":"PASS","navigation":"PASS","pageErrors":[],"externalRequests":[],"mockSubmissions":0}
```

The template scenario keeps the input focused and places its intended action in the summary's future overlay region, then sends a native pointer press across a rendering opportunity. It asserts exactly one saved template plus retained manual price/valid result; it does not succeed through a second click. Receipt and copy first activations, summary restoration, drag-away/no-duplicate, Quick Details and tab navigation also pass. Form transmission is mocked and external requests blocked.

The blur-return check dispatches the window blur event because headless tab switching does not generate OS blur. That limitation is explicitly documented in the fixture/report. Physical Android/iOS keyboards and real OS focus loss remain untested capabilities, not claimed passes. Reviewed supplied pre-fix evidence shows the deterministic template scenario failed with 0 saved templates versus expected 1; supplied post-fix unit evidence is 108 passes. I did not repeat the complete suite.
