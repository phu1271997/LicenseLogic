# Phase 2 Milestone Submission — LicenseLogic

Single consolidated submission covering F1 (Appeal / Dispute Flow) and
F2 (Scanner Reputation) as one Phase 2 bundle. Estimated point value:
**~2000 – 3000** (Loại 3b + Loại 3c).

> ⚠️ **Contract redeploy required.** Phase 2 code is on `main` (SHA
> `d03e1f5`) and the fast test suite is green at **87 passed, 1 skip**,
> but v7 storage adds seven new TreeMaps (`appeal_stake`,
> `appeal_appellant`, `appeal_scanner`, `appeal_state`,
> `appeal_outcome_reason`, `scanner_honest`, `scanner_overturned`). The
> v6 contract on `0x19DaA769…5CE9E2` does not have those views, so
> `file_appeal` / `resolve_appeal` / `get_scanner_reputation` / etc.
> are dead until a fresh Studio deploy.

### Redeploy checklist

1. Studio → paste `contracts/license_logic.py` → Deploy → verify `Result: SUCCESS`.
2. Dán địa chỉ mới cho em → em swap `NEXT_PUBLIC_CONTRACT_ADDRESS` + reseed + Vercel prod redeploy + alias.
3. On the fresh contract, drive:
   - `register_work` + `anchor_work` + a real-path INFRINGEMENT scan
   - `file_appeal` (stake `2 × penalty`) → `resolve_appeal` (drives a fresh nondet re-scan)
   - a second real-path scan on a different URL so the scanner's reputation crosses into silver (≥ 3 honest / ≤ 1 overturned)

---

## Title

> Phase 2 Bundle — Appeal / Dispute Flow + Scanner Reputation Tiers (contract v7)

## Changes & Improvements (995 / 1000)

> Contract v7 adds two dispute-economy features. Redeploy required.
>
> F1 APPEAL — file_appeal(work_id, suspect_url) payable requires prior INFRINGEMENT (not shortcut) + stakes 2 × penalty. Original scanner cannot appeal. resolve_appeal() runs fresh gl.nondet.web.render + gl.nondet.exec_prompt with build_appeal_prompt (adjudicator biased to OVERTURN under ambiguity) under new APPEAL_PRINCIPLE (exact outcome match, similarity ±15). OVERTURN refunds appellant, rolls back scan_credited + infringement_count, slashes scanner. UPHELD sends stake to owner, confirms scanner.
>
> F2 REPUTATION — every real-path INFRINGEMENT bumps scanner_honest; every overturned appeal bumps scanner_overturned. Tiers: bronze (default), silver (≥3 honest, ≤1 overturned), gold (≥10 honest, 0 overturned). Bounty share scales 10 / 15 / 20 %. URL-shortcut hits do NOT count.
>
> New views: get_appeal, get_appeal_required_stake, get_scanner_reputation. Frontend: AppealPanel + nav rep chip. Fast tests 75 → 87.

## Evidence links

- **Contract v7 commit:** <https://github.com/phu1271997/LicenseLogic/commit/c2d4bce>
- **Frontend v7 commit (AppealPanel + rep chip):** <https://github.com/phu1271997/LicenseLogic/commit/552f5b8>
- **Docs commit (SECURITY T10/T11 + ECONOMICS appeal/tier):** <https://github.com/phu1271997/LicenseLogic/commit/d03e1f5>
- **Appeal-flow test suite (7 cases):** <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_appeal_flow.py>
- **Reputation test suite (5 cases):** <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_reputation.py>
- **SECURITY.md new threats T10 + T11:** <https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md#t10--false-positive-infringement-v7>
- **ECONOMICS.md v7 additions section:** <https://github.com/phu1271997/LicenseLogic/blob/main/ECONOMICS.md#v7-additions--appeals-and-reputation-tiered-payouts>
- **CHANGELOG 2026-08-31 anchor:** <https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#2026-08-31--phase-2-milestones-f1-appeal-flow--f2-scanner-reputation>
- **Live contract on Explorer (after redeploy):** `https://explorer-studio.genlayer.com/address/<NEW_ADDR>`
