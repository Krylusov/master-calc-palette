# Task 1 fix round 1 independent review

Scope: `808d8c8..bf9203c`, prior import-draft finding and new breakage introduced by this fix only. Reviewed `task-1-fix1-diff.txt` and the appended Task 1 implementation report. Production/git were not modified; no suite was rerun.

Prior Important finding: **ADDRESSED**.

Spec compliant: **Yes**.

Task quality: **Approved**.

Outstanding findings: **0 Critical, 0 Important, 0 Minor**.

The successful import path now calls `persistDraft()` after `applyRaw({})`, catalog refresh and template refresh (`app.js:353–355`). This captures the final visible composition immediately, before pagehide. It preserves the established policy of retaining the current client and relevant context. The normal `draftBlocked` guard still prevents overwriting an unrestorable source, so the correction does not weaken source preservation or its persistent warning.

The added production-backed regression covers both backup versions, fresh recovery without pagehide, reset hours/custom selections, v3 catalog removal, retained client/context and imported rates. The second test covers preservation of a blocked corrupt source during a successful import. The assertions directly cover the previously reproduced stale-draft defect, rather than merely checking that a persistence method was called.

The production change is confined to the omitted persistence call; no new defect was found in that change. The implementer reports 24/24 covering tests, syntax validation and diff whitespace validation. These executions were not independently repeated for this scoped re-review. Real-browser and final packaging gates remain as recorded in the original review and are not Task 1 fix omissions.
