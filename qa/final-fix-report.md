# Consolidated final findings fix

Base: `22dabbc26f015ecdd8852daf838062aeb06aae63`. Scope: audit F1/F2 and independent QA F3 only. Canonical `app.js`, `index.html`, and meaningful reliability regressions changed. No generated standalone HTML, service worker, package rebuild, publishing, or actual external transmission.

## F1 — honest prospective Save disclosure

Added centralized `renderSaveDisclosure()`. `updateEditUI()` and each calculation render the upcoming action from the current edit context and effective Google setting. Edit save remains local-only. Cancel, successful edit-return, reset/new calculation, restored draft and preference changes display the new-receipt setting correctly. Enabled Google retains the original default and is explicitly an unconfirmed attempt when a network is available; disabled Google is labeled disabled.

Completed-operation messages now use a separate `#save-result`, explicitly prefixed `Последнее сохранение:`. They no longer overwrite `#save-status` beside the next Save action. Existing offline result assertion now checks this completed-operation status.

Regression covers both empty/default and populated suspended drafts, cancel, successful edit-return, new/reset, enabled/disabled preference transitions and actual mock-send count. Corrections still do not send. No authorized default was changed.

## F2 — truthful update confirmation

Confirmation now explains that the app reloads, locally saved history/draft remain, and changes that could not be saved may be lost. It retains the explicit confirmation and existing draft-write warning; it neither claims unfinished calculations are always discarded nor promises recovery after a failed save. A regression combines failed draft persistence with the confirmation and checks that the honest warning survives.

## F3 — template save retains active result and draft

`saveTemplate()` recomputes the current result after `persistConfig()` invalidates it, preserves the selected-template context across template-option refresh, and persists the unchanged calculation draft. Saving a template retains client, quantities, manual actual price and raw calculation, leaves the result visible/Save enabled, and supports the first subsequent receipt Save. Stored recipe still strips manual override; applying templates still resets it.

Regression checks complete draft equality (including selected template), exact raw/manual price, visible valid result, enabled Save, recipe exclusion of override, and successful next receipt save. The independent P01–P05 browser recipe flow remains passing.

## Evidence and commands

Before implementation:

`node --test tests/reliability.test.cjs > .superpowers/sdd/ux-v21/qa/final-fix-red.log 2>&1`

Output: **97 tests, 94 pass, 3 fail**. Exactly the newly added F1/F3/F2 regressions failed on the existing source; F1 retained the local-only edit promise and F3 had null currentCalc after saving the template.

After implementation:

`node --test tests/*.test.cjs > .superpowers/sdd/ux-v21/qa/final-fix-green.log 2>&1`

Output: **108 tests, 108 pass, 0 fail**.

Focused actual Chromium verification:

`QA_PLAYWRIGHT=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright QA_CASE='^(F1|F3|P01-P05)' QA_REPORT_NAME=final-fix-browser-report.json QA_BUILD_ID=final-fix-canonical node .superpowers/sdd/ux-v21/qa/final-browser-check.cjs`

Output: **P01-P05-price PASS; F1-cancel-status PASS; F3-template-results PASS**. Zero page errors and zero external requests/attempts. Existing supplied runtime used Chromium 153.0.8010.0 with normal args (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`), service workers blocked for these canonical-source cases, and all non-local requests aborted. Relevant save flows disable Google; Node sends are mocks. Evidence: `qa/final-fix-browser-report.json`, `qa/final-fix-browser.log`.

`git diff --check`: clean. Generated HTML/worker remain for the builder's authorized rebuild. Physical mobile keyboard remains outside this scoped fix verification.
