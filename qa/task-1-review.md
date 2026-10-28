# Task 1 independent review

Reviewed base `bef6aa7` through head `808d8c8`, scoped to Task 1 and concrete integration risks from its draft lifecycle. Production and git were not modified. No full test suite was rerun.

Spec compliant: **No**

Task quality: **Needs fixes**

Findings: **0 Critical, 1 Important, 0 Minor**.

## Important

1. **The backup-import programmatic reset leaves the persisted draft at the previous composition.** `app.js:353` calls `applyRaw({})` after a successful import but never calls `persistDraft()` after the resulting form/context updates. This is an existing programmatic calculation entry point that the new lifecycle must integrate, rather than a request for a future backup feature. Reproducer with the existing isolated test harness: enter client Анна and work-time `3`, dispatch input, then successfully import a valid v2 backup. The visible work-time is `1` but `master_calc_palette_draft_v1.fields['work-time']` remains `3`. A restart without a delivered pagehide resumes the previous composition against the newly imported rates, contradicting the visible post-import state and the Task 1 caller-persistence contract. If the import replaces the catalog, the stale draft can also reference removed custom materials and become unrestorable. Remedy: explicitly persist the complete final form after successful import, with an explicit policy for any intentional client/context reset; add a focused import→recovery assertion before pagehide. Preserve the blocked-source behavior already implemented.

## Strengths and evidence

- `captureDraft()` reads live control strings independently from validated receipt raw values, including dynamic quantities/expenses and browser bad-input markers (`app.js:130–139`). Input handlers persist synchronously before debounced calculation (`app.js:230–242`).
- Recovery checks shape/catalog availability before assigning form fields, blocks automatic overwrites on failures, and gives a persistent Russian status (`app.js:171–207`).
- New calculation confirms replacement, refuses to clear fields after a storage-removal failure, cancels pending calculation work, and resets client/composition/context (`app.js:213–229`).
- Successful local receipt writes retire a lifecycle through additive `sourceDraftId`; recovery checks both active and deleted receipts, preventing client resurrection after failed draft removal (`app.js:179`, `522`, `555–585`). Failed history writes retain the form and do not reach Google submission.
- The diff leaves storage namespaces and financial formulas intact; tests cover major raw recovery, failed writes, invalid-state retention and receipt retirement scenarios.

## Verification and limitations

A single targeted Node reproducer reused the production-backed reliability harness and mocked external boundaries; it printed `{"visibleHours":"1","persistedHours":"3"}` after the successful import. No external request was sent. Full-suite results are the implementer's evidence, not independently repeated here.

Real-browser bad-input serialization, accessibility interaction, 320 px layout, PWA/offline reload and final standalone packaging remain for the separate final QA gate. Later tasks' unimplemented features were not counted as omissions.
