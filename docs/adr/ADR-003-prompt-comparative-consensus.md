# ADR-003 — Use `prompt_comparative` for validator consensus

**Status:** accepted · **Date:** 2026-07-15

## Context

Non-deterministic blocks in GenLayer settle by validator agreement.
Three legal wrappers exist (see `~GEN_RULES/00-read-me.md §3`):

1. `gl.eq_principle.strict_eq(fn)` — validator votes on exact equality.
2. `gl.eq_principle.prompt_comparative(fn, principle=...)` — validator
   LLM decides whether two outputs are equivalent under a stated
   principle.
3. `gl.vm.run_nondet(leader_fn, validator_fn)` — custom validator that
   runs the leader's return through arbitrary Python logic.

LicenseLogic scan verdicts return **JSON containing both a bucket (verdict)
and free-form text (reasoning, matched_elements)**. `strict_eq` would fail
almost every time because reasoning wording differs run-to-run.
Hand-written `validator_fn` was the alternative.

## Decision

Use `gl.eq_principle.prompt_comparative(fn, principle=CONSENSUS_PRINCIPLE)`
for both `scan_for_infringement` and `anchor_work`.

The principle explicitly declares which JSON fields are load-bearing
(verdict bucket, similarity range, `fetch_failed`, `injection_attempt`)
and which may differ freely (reasoning, matched_elements wording). The
validator LLM enforces the rules on both sides simultaneously.

## Consequences

- Validators with different wording still reach consensus if the
  meaning matches — the exact anti-pattern the rubric warns against
  (Trục 2 in `~GEN_RULES/01-how-to-score.md`).
- The principle text is the load-bearing document; changing wording
  quietly changes behavior. `CONSENSUS_PRINCIPLE` therefore lives at
  the top of `contracts/license_logic.py` as a module constant, and any
  edit needs an ADR + a `test_consensus_principle.py` change.
- Simpler code path than a hand-rolled `validator_fn` — no need to
  re-inspect `gl.vm.Return`.

## Rejected alternatives

- **Hand-written `validator_fn`** — more control but harder for the
  Foundation reviewer to audit. The principle-in-text approach makes
  the consensus rules a reviewable artifact.
- **`strict_eq` on a distilled verdict-only string** — would work but
  forces stripping reasoning + matched_elements out of the on-chain
  record. Those fields are what make the app usable for takedown
  outreach; keeping them is worth the small consensus complexity.
