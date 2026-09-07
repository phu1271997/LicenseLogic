# Phase 3 Milestone Submission — LicenseLogic

Single consolidated submission covering three v8 features that convert
the flat single-price license into a real marketplace:

- **F1** — Multi-tier license offers
- **F2** — Time-bound license expiry (write-epoch counter)
- **F3** — Co-author royalty splits

Estimated point value: **~2500 – 3500** (Loại 3 major feature bundle
with strong economic + storage impact).

> ⚠️ **Contract redeploy required.** Phase 3 code is on `main` and the
> fast test suite is green at **106 passed, 1 skipped, 7 deselected**,
> but v8 adds 11 new TreeMaps
> (`license_tiers_count`, `tier_name`, `tier_price`,
> `tier_duration_epochs`, `tier_active`, `license_tier_idx`,
> `license_expires_at`, `license_purchased_at`, `coauthors_count`,
> `coauthor_addr`, `coauthor_bps`) plus a new `epoch: u256`. The v7
> contract on `0x19DaA769…5CE9E2` does not have those views, so
> `purchase_license_tier` / `add_license_tier` / `set_coauthors` /
> `get_license` / `list_license_tiers` / `get_coauthors` / `get_epoch`
> are dead until a fresh Studio deploy.

### Redeploy checklist

1. Studio → paste `contracts/license_logic.py` → Deploy → verify `Result: SUCCESS`.
2. Give me the new address → I will:
   - update `deployment/deployed_addresses.json`
   - swap `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel prod
   - reseed via `deployment/seed_studionet.mjs` (fresh burner, ~2 min)
   - `vercel deploy --prod --yes` + `vercel alias set` to `license-logic.vercel.app`
3. On the fresh contract, drive:
   - `register_work` → confirm `list_license_tiers` shows the auto-created
     default tier
   - `add_license_tier(work_id, "commercial", 500, 100)` → confirm the
     new tier via `list_license_tiers`
   - `set_coauthors(work_id, [addr_a, addr_b], [7000, 3000])` → confirm
     via `get_coauthors`
   - `purchase_license_tier(work_id, 1)` from a non-owner burner → verify
     `get_license` shows `active=true`, `tier_idx=1`, `expires_at =
     current_epoch + 100`
   - drive a few unrelated writes to advance the epoch, re-check
     `get_license`; when epoch overtakes expires_at the license reads
     `active=false`

---

## Title

> Phase 3 Bundle — License Marketplace v8: multi-tier offers + write-epoch expiry + on-chain co-author royalty splits (contract v8)

## Changes & Improvements (997 / 1000)

> Contract v8 turns the flat license_price into a real marketplace. Redeploy required.
>
> F1 MULTI-TIER OFFERS — register_work auto-creates tier_0 from legacy license_price; add_license_tier(name, price, duration_epochs) appends up to 8 tiers per work; set_tier_active soft-toggles a tier without breaking existing licenses. purchase_license_tier(work_id, tier_idx) reverts on inactive tier / underpayment, and either creates or RENEWS the license (extending expires_at by the tier's duration; a perpetual duration=0 tier overrides).
>
> F2 TIME-BOUND EXPIRY — new self.epoch: u256 ticks once per write (never on views); license_expires_at is stamped at purchase; has_license() flips false when epoch >= expires_at. New get_license view exposes {active, tier_idx, expires_at, purchased_at, current_epoch}.
>
> F3 ROYALTY SPLITS — set_coauthors([addr...], [bps...]) registers up to 4 coauthors with bps summing to 10000. _split_credit(work_id, amount) pays all coauthors except the last by amount*bps//10000; the last coauthor absorbs the rounding remainder — invariant test confirms sum(splits) == amount exactly. Every license revenue AND every UPHELD appeal stake now splits.
>
> Fast tests 87 → 106. New views: list_license_tiers, get_coauthors, get_license, get_epoch.

## Evidence links

- **Contract v8 commit (Phase 3):** paste after `git push`
- **Frontend v8 commit (tier picker + Manage panels):** paste after `git push`
- **Docs commit (SECURITY T12/T13/T14 + ECONOMICS v8 section):** paste after `git push`
- **License-tier test suite (10 cases):** <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_license_tiers.py>
- **Royalty-split test suite (9 cases, invariant-checked):** <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_royalty_splits.py>
- **SECURITY.md new threats T12–T14:** <https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md#t12--coauthor-bps-drift--rounding-loss-v8>
- **ECONOMICS.md v8 additions:** <https://github.com/phu1271997/LicenseLogic/blob/main/ECONOMICS.md#v8-additions--license-marketplace-multi-tier-expiry-royalty-splits>
- **CHANGELOG 2026-09-07 anchor:** <https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#2026-09-07--phase-3-milestone-license-marketplace-v8>
- **Live contract on Explorer (after redeploy):** `https://explorer-studio.genlayer.com/address/<NEW_ADDR>`
- **Live app (after Vercel prod ship):** <https://license-logic.vercel.app/#marketplace>
