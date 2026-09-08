# Phase 4 Milestone Submission — LicenseLogic

Final milestone in the four-phase roadmap. Ships a full on-chain
secondary market for licenses:

- **F1** — Transferable licenses (opt-in per tier)
- **F2** — On-chain resale market (list / buy / cancel)
- **F3** — Perpetual creator royalty enforced by the contract

Estimated point value: **~2500 – 3500** (Loại 3 major-feature bundle —
new payable public method, new asset class turning static licenses into
tradable assets, novel on-chain royalty enforcement).

> ⚠️ **Contract redeploy required.** v10 adds 8 new storage fields
> (`tier_transferable`, `resale_royalty_bps`, `resale_royalty_set`,
> `license_transferred_count`, `resale_ask_price`, `resale_active`,
> `resale_seller_count/addr/index_by_addr`). The v9 Watchtower contract
> at `0xcBEaa4e6…F1C83A6` does not carry those slots, so
> `set_tier_transferable`, `set_resale_royalty_bps`, `transfer_license`,
> `list_for_resale`, `cancel_resale`, `buy_from_resale`, plus the four
> new views are dead until a fresh Studio deploy.

### Redeploy checklist

1. From repo root: `source ~/.genlayer/env.sh` then run the local
   deploy script (or Studio) with `contracts/license_logic.py`
   (v0.5.0). Wait for `Result: SUCCESS` and copy the address.
2. Automation then:
   - promotes v10 to `studionet` in `deployment/deployed_addresses.json`
     (demotes v9 to `studionet_previous_v9`)
   - bumps `FALLBACK_ADDRESS` in `frontend/src/lib/genlayer.ts`
   - reseeds via `deployment/seed_studionet.mjs` — a new v10 step
     unlocks a tier for transfer + records a resale listing + settles
     one resale purchase so `list_resale_listings` is non-empty on
     first visit
   - `vercel deploy --prod` + `vercel alias set license-logic-app`
3. Reviewer flow after ship:
   - open `#secondary` on live app; see the three explainer cards
   - Browse Works → View `work_0` → confirm the ResalePanel shows the
     royalty bps and any live listings
   - Purchase License tab: buy the transferable tier → the license
     status card unlocks Transfer + List-for-sale controls; buy from
     the resale market as a different burner tab to verify the license
     moves + royalty credits the owner side.

---

## Title

> Phase 4 — Secondary Market v10: transferable licenses + on-chain resale market + perpetual creator royalty

## Changes & Improvements (~490 / 500 chars, plain-English, no dashes)

> LicenseLogic v10 turns licenses into tradable assets.
>
> Transferable tiers: owners can now let a license be handed off to another wallet, or list it for resale. Locked tiers still work exactly like before.
>
> On-chain resale market: any holder on a transferable tier can list at any price. Anyone can buy directly from the contract, no off-chain marketplace needed. Overpay is refunded, listings auto-close.
>
> Creator royalty forever: every resale routes a slice (default 5%, cap 20%) back to the work's co-authors on-chain. Creators earn on every hop.

## Evidence links (v10-only — không trùng Phase 1 / 2 / 3)

- **v10 contract commit (Secondary Market):** https://github.com/phu1271997/LicenseLogic/commit/69b8c76
- **v10 test-suite commit (19 cases — transferability + resale + royalty):** https://github.com/phu1271997/LicenseLogic/commit/8d914ed
- **v10 frontend commit (ResalePanel + transfer/list controls + transferable pill):** https://github.com/phu1271997/LicenseLogic/commit/10a68b8
- **v10 docs commit (SECURITY T19–T22 + ECONOMICS v10 section + ARCH):** https://github.com/phu1271997/LicenseLogic/commit/d4814e0
- **Secondary market test file (19 cases):** https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_secondary_market.py
- **SECURITY.md new threats anchor:** https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md#t19--zombie-resale-listing-after-transfer-v10
- **ECONOMICS.md v10 additions anchor:** https://github.com/phu1271997/LicenseLogic/blob/main/ECONOMICS.md#v10-additions--secondary-market-transferable-licenses--resale--royalty
- **CHANGELOG anchor 2026-09-21:** https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#2026-09-21--phase-4-milestone-secondary-market-v10
- **Live v10 contract on Explorer:** https://explorer-studio.genlayer.com/address/0x476Ee007F9bd26b33a5707dB364d7b1D469e86a5
- **Live app secondary section (seeded end-to-end):** https://license-logic-app.vercel.app/#secondary
- **Deploy tx (v10 contract creation):** `0x2ff0fa2e301daac783203263560c0cf5d2fcdbbe6aad6dab48e0437b0ab20a7a`
- **On-chain tx — `set_tier_transferable(work_0, 1, true)`:** `0xfbaf00e49c8fe4a459991da3201aebd43211ed96b7a03555610981b75c05eeac`
- **On-chain tx — `set_resale_royalty_bps(work_0, 500)` (5%):** `0x6276c4b95db4304f62eea3818510eac8fa2a063544031e8138f2b8c4f4974d76`
- **On-chain tx — `list_for_resale(work_0, 2500)` by first buyer:** `0xa6b9170e5499c290830695fe9b64fb081b5afbaec5824caf0ea54c5f21b8de3a`
- **On-chain tx — `buy_from_resale(work_0, first_buyer)` value=2500 by secondary buyer 0x372Acb…6cfA. After: `get_license` returns `{active:true, tier_idx:1, transferable:true, transferred_in_count:1}` on the new holder; `list_resale_listings` count 1→0 (listing auto-closed).:** `0x32b5c7df869f44f4cca5ad71bfa09f341634cd317021dae3e665e2564edd3ff0`
