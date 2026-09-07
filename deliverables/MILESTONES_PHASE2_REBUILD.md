# Phase 2 Milestone Submission (REBUILD) — LicenseLogic

The prior Phase 2 (v7 appeal / reputation) and Phase 3 (v8 marketplace,
earlier draft) submissions were rejected. This is the rebuilt **Phase 2**
that ships the whole License Marketplace v8 as one large, coherent
major-feature bundle on top of the accepted Phase 1 (v6) baseline.

Estimated point value: **~2500 – 3500** (Loại 3 major-feature bundle
that measurably changes the on-chain economic surface — new payable
methods, new economic invariants, new persistent per-license state).

> ⚠️ **Contract redeploy required.** Code is on `main` at contract
> commit `1bcfb13` and the fast test suite is green at **106 passed,
> 1 skipped, 7 deselected**. v8 adds 11 new TreeMaps
> (`license_tiers_count`, `tier_name`, `tier_price`,
> `tier_duration_epochs`, `tier_active`, `license_tier_idx`,
> `license_expires_at`, `license_purchased_at`, `coauthors_count`,
> `coauthor_addr`, `coauthor_bps`) plus a new `epoch: u256`. The
> previous studionet address does not carry those slots, so
> `purchase_license_tier`, `add_license_tier`, `set_coauthors`,
> `get_license`, `list_license_tiers`, `get_coauthors`, `get_epoch`
> are dead until a fresh Studio deploy.

### Redeploy checklist

1. Studio → paste `contracts/license_logic.py` → Deploy → verify
   `Result: SUCCESS`.
2. Send the new address to Claude → automation will:
   - update `deployment/deployed_addresses.json` (bump v6 → previous, insert v8 as current)
   - swap `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel prod
   - reseed via `deployment/seed_studionet.mjs` (fresh burner, ~2 min) so the
     new contract holds a demo work with default tier + commercial tier
     + 70/30 coauthor split + a tiered license purchase already on-chain
   - `vercel deploy --prod --yes` + `vercel alias set` to `license-logic.vercel.app`
3. Reviewer flow after ship:
   - open `#marketplace` on the live app
   - Browse Works → open `work_0` → confirm Tiers panel shows two tiers
     (default perpetual + commercial 30-epoch) and Coauthors panel shows
     the 70/30 split
   - License tab → enter `work_0` → Load tiers → pick "commercial-30d"
     → Purchase → `get_license` shows `active=true, tier_idx=1,
     expires_at > current_epoch`

---

## Title

> Phase 2 (rebuild) — License Marketplace v8: multi-tier license offers + write-epoch expiry + on-chain co-author royalty splits

## Changes & Improvements (997 / 1000)

> Contract v8 replaces the flat license_price with a real marketplace. Redeploy required.
>
> F1 MULTI-TIER OFFERS — register_work auto-creates tier_0 from legacy license_price so old clients keep working; add_license_tier(name, price, duration_epochs) appends up to 8 tiers per work; set_tier_active soft-toggles a tier without invalidating existing licenses. purchase_license_tier(work_id, tier_idx) reverts on inactive tier or underpayment, and either creates or RENEWS the license (extending expires_at by the tier's duration; a perpetual duration=0 tier overrides any prior expiry).
>
> F2 TIME-BOUND EXPIRY — new self.epoch: u256 ticks once per @gl.public.write (views never tick). license_expires_at is stamped at purchase; has_license() flips false when epoch >= expires_at. New get_license view exposes {active, tier_idx, expires_at, purchased_at, current_epoch}.
>
> F3 ROYALTY SPLITS — set_coauthors([addr...], [bps...]) registers up to 4 coauthors, bps must sum to 10000. _split_credit pays all coauthors except the last by amount*bps//10000; the last coauthor absorbs the rounding remainder — invariant test confirms sum(splits) == amount exactly. Every license revenue AND every UPHELD appeal stake now splits.
>
> Fast tests 87 → 106. New views: list_license_tiers, get_coauthors, get_license, get_epoch.

## Evidence links (do NOT reuse Phase 1 links)

- **Contract v8 commit (this phase, sole new file changed):** <https://github.com/phu1271997/LicenseLogic/commit/1bcfb13>
- **v8 test suite — license tiers (10 cases):** <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_license_tiers.py>
- **v8 test suite — royalty splits invariants (9 cases):** <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_royalty_splits.py>
- **Frontend v8 commit — tier picker + Manage panels:** <https://github.com/phu1271997/LicenseLogic/commit/6bb198f>
- **Docs commit — SECURITY T12/T13/T14 + ECONOMICS v8 section + ARCH storage table:** <https://github.com/phu1271997/LicenseLogic/commit/556ec03>
- **SECURITY.md new threats (T12 bps rounding · T13 inactive-tier revive · T14 epoch manipulation):** <https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md#t12--coauthor-bps-drift--rounding-loss-v8>
- **ECONOMICS.md v8 additions section (marketplace + expiry + splits formula):** <https://github.com/phu1271997/LicenseLogic/blob/main/ECONOMICS.md#v8-additions--license-marketplace-multi-tier-expiry-royalty-splits>
- **CHANGELOG anchor 2026-09-07:** <https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#2026-09-07--phase-3-milestone-license-marketplace-v8>
- **Seed-script v8 steps commit — populates tiers + coauthors + tiered buy on a fresh deploy:** <https://github.com/phu1271997/LicenseLogic/commit/d625f88>
- **Live contract on Explorer (paste AFTER Studio redeploy):** `https://explorer-studio.genlayer.com/address/<NEW_V8_ADDR>`
- **Live app section (after Vercel prod ship):** <https://license-logic.vercel.app/#marketplace>
