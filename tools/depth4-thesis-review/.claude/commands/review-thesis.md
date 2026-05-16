---
description: Run the DEPTH4 3-agent thesis review pipeline and summarize results
argument-hint: "[thesis-id]"
allowed-tools:
  - Bash(python tools/depth4-thesis-review/controller.py:*)
  - Read(tools/depth4-thesis-review/reports/*)
  - Read(tools/depth4-thesis-review/config.yaml)
---

# /review-thesis

Run the parallel 3-agent review against the live DEPTH4 signals endpoint and
summarize discrepancies.

## Steps

1. If `$ARGUMENTS` is non-empty, treat it as a thesis id and pass
   `--thesis-id $ARGUMENTS`. Otherwise review all theses.

2. Execute:
   ```bash
   python tools/depth4-thesis-review/controller.py ${ARGUMENTS:+--thesis-id "$ARGUMENTS"} --fail-on high
   ```
   If exit code is non-zero, that is expected when there are high-severity
   flags. Do not retry — proceed to step 3.

3. Read the newest `.md` file in `tools/depth4-thesis-review/reports/`. Reply with:
   - **Headline**: logic-shallow leader and total counts
   - **Discrepancies**: every `solo flag` from the report
   - **Top fix**: the single highest-severity flag with its `suggested_fix`
   - **Action**: ask the user whether to draft a prompt/code patch addressing it

4. Do not modify code in this command. Use the follow-up turn for edits.

## Notes
- The pipeline is offline-safe: if `DEPTH4_BASE_URL` is unreachable, fall back
  to `--fixture tools/depth4-thesis-review/fixtures/sample_payload.json` and tell the
  user the report is based on the captured fixture.
- Never run with `--fail-on never` unless the user asks. The gate is the point.
