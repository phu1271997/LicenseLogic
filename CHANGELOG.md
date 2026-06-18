# CHANGELOG

## Unreleased Resubmission Fixes

### Runtime Bugs Fixed

1. Added class-level persistent scalar declarations for `admin`, `work_counter`, and `total_received` so GenVM persists them correctly.
2. Replaced Python's non-deterministic `hash()` with deterministic `sha256` keys for suspect URL verdict storage.
3. Replaced unsafe TreeMap index reads with `.get(..., default)` across the contract.
4. Switched all contract-facing errors to `gl.vm.UserError`.
5. Added withdrawable accounting and a `withdraw()` path so funds are not trapped inside the contract.

### Consensus and Safety

- Replaced blanket validator fallback behavior with `gl.eq_principle.prompt_comparative`.
- Added `fetch_failed` graceful degradation so failed web fetches become `UNCERTAIN` instead of accidental acceptance.
- Added prompt-injection canary detection and verdict normalization based on similarity bucket.

### Testing

- Added 8 `gltest`-compatible modules in `tests/`
- Verified local direct-mode suite: `35 passed, 1 skipped`

