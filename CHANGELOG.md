# CHANGELOG

## 2026-08-02 — Third Resubmission (frontend polling fix)

### Reviewer Feedback Addressed

> "Add robust polling of data from the contract to avoid this error
> `Registration failed: Timed out waiting for transaction ... to reach status
> "FINALIZED" (current status: 5)`. Every request I made had this error in the
> frontend but the contract executed the request."

Root cause: `writeContract` was hardcoded to wait for `FINALIZED`. Studionet
consensus reaches `ACCEPTED` (status 5) in seconds — chain state is applied and
readable at that point — but `FINALIZED` only lands after the finality window
closes, which can take many minutes. The old client gave up before then and
reported a fake failure even though the tx had already succeeded.

### Frontend Fixes

1. `frontend/src/lib/genlayer.ts`
   - New `waitForTx(hash, opts)` helper. Tier 1 uses
     `client.waitForTransactionReceipt` with `status: ACCEPTED` and a 5-minute
     ceiling (100 retries × 3s). Tier 2 falls back to manual polling of
     `client.getTransaction` and accepts any decided state
     (`ACCEPTED / FINALIZED / UNDETERMINED / CANCELED / *_TIMEOUT`).
   - `writeContract` now returns `{ hash, wait }` so callers can distinguish
     a hard failure from a slow-confirmation warning.
   - New `readWithRetry(fn, predicate, opts)` that polls a view until it
     reflects the expected state — covers the case where the write wait timed
     out but the state has since propagated.
   - New `txExplorerUrl(hash)` for surfacing the tx link in the UI.

2. `frontend/src/app/page.tsx`
   - Every write path (`register_work`, `purchase_license`,
     `scan_for_infringement`) now:
     - shows an intermediate loading step ("Submitting…", "Waiting for
       consensus (Accepted)…", "Reading on-chain state…"),
     - verifies success via a `readWithRetry` on the corresponding view
       (`get_work_counter`, `get_last_verdict_by_url`),
     - shows a yellow "warn" banner (not a red error) when the wait timed out
       but the state confirms the tx landed,
     - renders the tx hash with a link to the explorer regardless of outcome.
   - `register_work` derives the new `work_id` from the counter delta instead
     of the receipt, so it works even if the receipt was slow to arrive.

### Contract

- No contract changes. The bug was purely in the frontend polling strategy;
  the deployed studionet contract at
  `0xee3bA410d441aF48a8B4AaFC822b5C145facA8D7` is still current.

## 2026-07-15 — Second Resubmission (post-reviewer feedback)

### Contract Fixes Surfaced By Explorer Review

1. Removed the `_Recipient` EVM contract interface. Native token transfers in `withdraw()` now go through `gl.get_contract_at(sender).emit_transfer(value=amount)` — the canonical GenVM path that works for EOAs.
2. `evaluate_scan` returns a JSON string, so `gl.eq_principle.prompt_comparative` compares a payload the validator LLM can actually read. The prior `dict` return was serialized to opaque calldata bytes for principle comparison.
3. Wrapped `gl.nondet.exec_prompt` in `try/except` so LLM errors degrade to `UNCERTAIN` instead of reverting the transaction.
4. Added `__receive__` so accidental native transfers to the contract are credited to the sender's withdrawable balance.
5. Refined `CONSENSUS_PRINCIPLE` to describe the JSON payload and to force `UNCERTAIN` when either side reports `fetch_failed=true` or `injection_attempt=true`.

### New Views

- `list_works()` returns the full registry of works for browsing.
- `get_last_verdict_by_url(work_id, suspect_url)` hashes the URL on-chain so clients don't have to.

### Frontend Fixes

- `NEXT_PUBLIC_CONTRACT_ADDRESS` now falls back to the deployed studionet address if unset — a Vercel project with no env vars no longer 404s or crashes on load.
- Header shows a network label and clickable explorer link.
- New "Browse Works" tab uses the on-chain `list_works` view.
- Added `frontend/.env.example` and updated `frontend/README.md` with Vercel deploy instructions.

### Tests

- New `tests/test_views_and_receive.py` covers `list_works`, `get_last_verdict_by_url`, `__receive__`, and JSON-string round-tripping.
- Local run: `40 passed, 1 skipped`.

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

