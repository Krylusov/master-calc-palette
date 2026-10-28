# Task 4 fix 1 independent review

Spec compliant: **Yes** (assigned Task 4 scope).

Task quality: **Approved**.

Original I1: **ADDRESSED**. Remaining/new findings: **0 Critical, 0 Important, 0 Minor**.

Reviewed `task-4-fix1-diff.txt` (`2190039..01a4ef8`), the appended Task 4 report, changed production code, added regression cases and supplied browser evidence. No production/git mutations; no broad suite rerun.

## I1 verification

- `app.js:772` now captures `catalogSnapshot` from `calculationConfig().catalog` for both new and edited receipts. During legacy editing this is exactly the restricted original authoritative material-line catalog, independent of newly positive quantities. Zeroing or removing a line no longer discards its saved name, unit or unit price. Subsequent edits retain the resulting restricted snapshot, without admitting current-catalog materials/prices.
- `app.js:141-142` still rejects unknown positive quantities before form mutation. `app.js:150` removes absent zero placeholders from custom input state, preventing phantom quantity fields and misleading storage errors. Raw validation already rejects negative/nonfinite quantities; this filter does not bypass that validation.
- The original immutable revision is unchanged; the fix only adds the authoritative snapshot to the corrected version. Existing full-snapshot receipts follow the same historical catalog mapping, with their original prices retained.
- `app.js:427` now explains historical-price restrictions consistently for legacy-derived and full saved catalogs.

Independently executed only the two new focused Node cases:

`node --test --test-name-pattern='legacy built-in and custom historical prices survive|unpriced zero legacy placeholders' tests/reliability.test.cjs`

**2/2 pass, 0 failures.** The first covers built-in/custom materials, zero/explicit removal, save, reload/reopen, original-price re-add, restricted snapshot, unchanged original revision and v3 backup roundtrip; the second covers unknown zero placeholders. The supplied updated browser code/evidence additionally exercises actual DOM fields through both legacy paths, edit reload and backup import. It records nine scenarios with no page errors or external requests; form submission remains mocked. The supplied full Node log records 105/105 passing.

No fix-only regressions found. Final standalone/service-worker/ZIP assembly and whole-branch audit remain separate gates.
