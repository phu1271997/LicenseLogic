# Deployment Log

## 2026-08-16 Fifth Resubmission Deployment (steward: anchor-bound scan + canonical evidence)

- Network: `studionet`
- Contract address: `0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035`
- Deployment tx hash: `PENDING_FILL`
- Deployer wallet: `PENDING_FILL`
- Contract file: `contracts/license_logic.py`
- Status: deployed by operator on 2026-08-16; frontend fallback + Vercel updated
- Live frontend URL: https://license-logic.vercel.app

Steward feedback addressed:

1. **Scans bound to anchored original.** `scan_for_infringement` reverts
   with `"call anchor_work(work_id) first"` when the work has no anchored
   snapshot; the analysis prompt includes the anchor summary as a
   trusted second source alongside the owner description.
2. **Canonical evidence identity.** New `canonical_url(url)` collapses
   `http↔https`, host case, `www.`, default ports (:80, :443), trailing
   slash, fragment, and tracking params (`utm_*`, `fbclid`, `gclid`,
   `mc_*`, `ref`, `spm`, `share`, etc.). Every scan_credited key and
   verdict lookup keys off the canonical hash.
3. **Alias-replay tests.** `tests/test_alias_replay.py` (9 scenarios):
   canonical view collapses 9 variants to 1; every non-baseline alias
   returns `already_credited=true`; iterating all variants never
   double-pays; registered-URL alias variants skip payout; scan reverts
   before anchor; `get_last_verdict_by_url` / `is_scan_credited` are
   canonical. Suite: 66 passed, 1 skipped.
4. **Reproducible lint.** `ruff.toml` + pinned `ruff==0.16.2` in
   `requirements-dev.txt`. Documented command:
   `pip install -r requirements-dev.txt && ruff check contracts/ tests/`
   → `All checks passed!`

Verification checklist:

- [ ] `scan_for_infringement(work, url)` before `anchor_work(work)` reverts
- [ ] `anchor_work(work)` → subsequent scan succeeds
- [ ] Scan `https://EXAMPLE.com/foo?utm_source=x` and `https://example.com/foo/` → same canonical, `already_credited=true` on 2nd
- [ ] `get_canonical_url("http://www.example.com:443/Foo/?utm_source=x#top")` → `https://example.com/Foo`
- [ ] Verdict record includes `canonical_url` field

## 2026-08-13 Fourth Resubmission Deployment (steward feedback)

- Network: `studionet`
- Contract address: `0x8372967d074C066EC2006782171d39E18eB5a46f`
- Deployment tx hash: `PENDING_FILL`
- Deployer wallet: `PENDING_FILL`
- Contract file: `contracts/license_logic.py`
- Status: deployed by operator on 2026-08-13; frontend fallback + Vercel updated
- Live frontend URL: https://license-logic.vercel.app

Steward feedback addressed:

1. **Idempotent bounty per (work_id, suspect_url).** New `scan_credited` TreeMap;
   `scan_for_infringement` gates counter increment + bounty payout on
   `not scan_credited[key]`. Replay never re-pays.
2. **Registered-URL shortcut is non-payable.** Shortcut still records the
   verdict (evidence trail) but the payout branch is guarded by
   `if not is_registered_url_shortcut` — owners cannot drain their own pool.
3. **Fetch + anchor the original work.** New owner-only `anchor_work(work_id)`
   method runs `gl.nondet.web.render` + `gl.nondet.exec_prompt` inside
   `gl.eq_principle.prompt_comparative` with a dedicated `ANCHOR_PRINCIPLE`.
   Stores summary in `work_content_anchor` TreeMap.
4. **Adversarial replay tests.** New `tests/test_adversarial_replay.py` and
   `tests/test_anchor.py` — 52 passed, 1 skipped (was 40/1).
5. **Ruff-clean.** All 7 previous lint findings resolved. `ruff check` passes.

Verification checklist:

- [ ] Scan same suspect URL 3× → bounty paid once, counter=1, `already_credited=true` on replays
- [ ] `scan_for_infringement(work, registered_url)` → verdict INFRINGEMENT, bounty pool unchanged
- [ ] `anchor_work(work)` → returns anchor JSON with `anchored=true`, `get_work` reflects it
- [ ] `anchor_work(work)` twice → 2nd call reverts "already anchored"
- [ ] Non-owner anchor call reverts
- [ ] `is_scan_credited(work, url)` returns true after credited INFRINGEMENT

## 2026-07-15 Third Resubmission Deployment

- Network: `studionet`
- Contract address: `0xee3bA410d441aF48a8B4AaFC822b5C145facA8D7`
- Deployment tx hash: `PENDING_FILL`
- Deployer wallet: `PENDING_FILL`
- Contract file: `contracts/license_logic.py`
- Status: deployed by operator on 2026-07-15; explorer verification pending
- Live frontend URL: https://license-logic.vercel.app

Verification checklist:

- [ ] `register_work` with the Photosynthesis sample from `reproducible_steps.md`
- [ ] `purchase_license` at exact price + overpayment
- [ ] `scan_for_infringement` self-scan → `INFRINGEMENT`
- [ ] `scan_for_infringement` unrelated URL → `CLEAR` / `UNCERTAIN`
- [ ] `scan_for_infringement` unreachable URL → `UNCERTAIN` with `fetch_failed=true`
- [ ] `list_works()` returns the seeded set
- [ ] `get_last_verdict_by_url(...)` returns the JSON verdict without client-side hashing
- [ ] Bare native transfer → `__receive__` credits sender balance
- [ ] `withdraw()` zeroes the balance and returns the native tokens

## 2026-07-15 Second Resubmission (post reviewer feedback)

Reviewer feedback:

1. `Gen. Dave` (2026-07-03): live app link 404s.
2. `Joaquin` (2026-06-11): fix explorer-observable contract errors and add stronger validator fallback.

Changes shipped in this build:

- `_Recipient` EVM interface removed. Native transfers now go through `gl.get_contract_at(addr).emit_transfer(value=amount)` — the canonical GenVM path for value transfers that also targets EOAs correctly on the ZKsync-backed testnet.
- `evaluate_scan` now returns a JSON **string** (not a `dict`). This gives `gl.eq_principle.prompt_comparative` a human-readable payload to compare across validators, so the principle text can reason about the verdict bucket and similarity score in plain language.
- `gl.nondet.exec_prompt` is now wrapped in `try/except` so an LLM failure degrades to `UNCERTAIN` instead of aborting the transaction.
- Added `__receive__` so unexpected native transfers to the contract are credited to the sender's withdrawable balance instead of trapping funds.
- Added `list_works` view so the frontend and reviewers can enumerate the entire on-chain state without knowing work IDs.
- Added `get_last_verdict_by_url` view so callers can look up the last verdict by suspect URL without recomputing the sha256 keccak on the client.
- Updated `CONSENSUS_PRINCIPLE` to explicitly instruct the validator that the payload is JSON and to enforce `fetch_failed=true` → `UNCERTAIN` on either side.

Frontend fixes:

- `NEXT_PUBLIC_CONTRACT_ADDRESS` now falls back to the deployed studionet address when missing, so a fresh Vercel project without env vars still renders and reads chain state instead of 404-ing.
- Header shows an explorer link + network label sourced from env.
- Added Browse tab that calls the new `list_works` view.
- Added `frontend/.env.example` and `frontend/README.md` with Vercel deploy steps.

Redeploy required: bump `contracts/license_logic.py` to the studionet, update the address below, and re-run the manual explorer checks in `reproducible_steps.md`.

## 2026-06-18 Resubmission Deployment

- Network: `studionet`
- Contract address: `0x70B0CBB3A9A199f01aD2E1382ECE1b99B989a5CF`
- Deployment tx hash: `0xc9cc2f0da882bc35297910a67d05776fc3d19a92d7101704e58d63b3947541f3`
- Deployer wallet: `0x3ceAaaBDdF16d1E05d51fB5E93C86e11d4E5F5Bd`
- Contract file: `contracts/license_logic.py`
- Status: deployed successfully by operator; post-deploy verification in progress

## Purpose Of This Redeploy

This deployment is the resubmission build that addresses the feedback from the GenLayer Builder Program review:

- added contract tests under `tests/`
- replaced unsafe validator fallback behavior with `gl.eq_principle.prompt_comparative`
- added reproducible deployment artifacts under `deployment/`
- fixed runtime issues discovered through contract review and explorer-oriented testing

## Runtime Fixes Included In This Build

1. Declared persistent scalars at class level: `admin`, `work_counter`, `total_received`
2. Replaced non-deterministic Python `hash()` usage with deterministic `sha256`
3. Replaced unsafe TreeMap index reads with guarded `.get(..., default)` access
4. Switched all user-facing reverts to `gl.vm.UserError`
5. Added withdrawable accounting and `withdraw()` so license fees and bounty rewards are not trapped

## Verification Checklist

- [ ] `storage_test.py` deployed successfully first
- [ ] `license_logic.py` deployed successfully
- [ ] `register_work` executed successfully
- [ ] `purchase_license` executed successfully
- [ ] `scan_for_infringement` executed successfully
- [ ] `get_work` confirmed updated storage state
- [ ] explorer screenshots saved under `deployment/verification/`

## Captured Transactions

- Deploy tx hash: `0xc9cc2f0da882bc35297910a67d05776fc3d19a92d7101704e58d63b3947541f3`
- Register tx hash: `0xb1f16c0f7abcc700ebffcfc416a5ae8d24c338c71565e0567e7a127bb980930f`
- Purchase tx hash: `0x3b8255498d9ec1e5c81638c7934df3450759e032382394c1b6b65c7a5db7879d`
- Scan tx hash: `0x1dea4b43892711c625a45b2eaba421d9d391e1c5f1d8e60dbb5a794b92013f5c`

## Verification Notes To Fill In

- Register result: `PENDING_FILL`
- Purchase result: `PENDING_FILL`
- Scan verdict: `PENDING_FILL`
- Scan similarity: `PENDING_FILL`
- Storage verification note: `PENDING_FILL`
