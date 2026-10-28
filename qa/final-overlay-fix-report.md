# F4 pointer activation overlay correction

Base: assembled `6f7f81735ccef97b5155a10e40d8db53c4c3e93e`. Scoped fix only; no rebuild, publish, external send, or unrelated changes.

## Correction

The existing input-focus CSS still hides the compact summary while typing. A primary pointerdown beginning with a calculation input focused now latches that hidden state through the activation. The ordinary bubbling click releases the latch after the action's own handler. Pointerup also schedules cleanup at the next rendering opportunity for releases producing no click; this runs after pointer hit-testing rather than inserting a fixed time delay. Pointercancel and window blur release immediately. Quick-details itself is excluded from starting the latch. No default action is prevented, no pointer capture or focus trap is introduced, and tab navigation continues normally.

Changed source: `app.js` (pointer lifecycle handlers/window registration), `styles.css` (one scoped hiding selector). Added `tests/overlay.browser.cjs` only. Session reports/evidence and untracked builder QA documents are not part of this commit.

## Focused red/green

`node tests/overlay.browser.cjs`

Before source changes, the native 320×900 regression failed: **First pointer activation must save exactly one template; actual0, expected1** (`qa/final-overlay-red.log`). The fixture scrolls a genuinely visible action into the fixed summary's future area while template-name stays focused, then performs one native mouse-down/up across a rendering opportunity. This makes the reported overlay activation boundary deterministic without a second click, fabricated click event, or fixed sleep.

After changes: **templateFirstClick PASS; receiptFirstClick PASS; copyFirstClick PASS; quickDetails PASS; dragRelease PASS; blurReturn PASS; navigation PASS**. Exactly one template and one receipt saved, valid/manual result retained, summary hidden while input is focused and restored after activation, no duplicate template on drag-away, zero page errors/external requests/mock submissions (`qa/final-overlay-green.log`). Native drag moves outside the viewport and releases. Headless tab switching did not produce an OS window-blur event, so the blur cleanup assertion dispatches the window blur event directly and then completes the pointer release; it is not a claim of physical OS/mobile keyboard coverage.

The test uses the supplied normal Chromium runtime, service workers blocked, all non-localhost requests aborted and form submission mocked. It supports the builder's subsequent generated-artifact run without changing the test:

`QA_ENTRY=Master_Calc_v2_Palette.html node tests/overlay.browser.cjs`

Generated HTML has intentionally not been rebuilt or tested against this new source here.

`node --test tests/*.test.cjs`: **108 tests,108 pass,0 fail** (`qa/final-overlay-node.log`). `git diff --check`: clean. Logs/report remain in the session for the builder to archive; commit contains only source and regression test.
