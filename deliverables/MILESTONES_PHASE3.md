# Phase 3 Milestone Submission — LicenseLogic

Single consolidated submission covering three v9 features that convert
LicenseLogic's enforcement layer from a single-owner-funded pool + one-off
scan into a real community-driven watchtower with a public paper trail:

- **F1** — Permissionless bounty funding (community contributors)
- **F2** — Suspect watchlist with 2× bounty multiplier
- **F3** — On-chain takedown notice registry (structured evidence bundle)

Estimated point value: **~2500 – 3500** (Loại 3 major-feature bundle —
new payable public method, new bounty economics dimension, new public
evidence surface).

> ⚠️ **Contract redeploy required.** Code is on `main`. v9 adds 12 new
> TreeMaps (`bounty_contributor_count`, `bounty_contributor_addr`,
> `bounty_contributor_amount`, `bounty_contributor_index_by_addr`,
> `watchlist_count`, `watchlist_url`, `watchlist_canonical`,
> `watchlist_active`, `watchlist_index_by_canonical`, `takedown_notice`,
> `takedown_issued_at`, `verdict_epoch`). The v8 marketplace contract
> at `0x55eeAfbb…4ACd7f` does not carry those slots, so `fund_bounty`,
> `add_watchlist_url`, `set_watchlist_active`, `issue_takedown_notice`
> and the five new views are dead until a fresh Studio deploy.

### Redeploy checklist

1. Studio → paste `contracts/license_logic.py` → Deploy → verify
   `Result: SUCCESS`.
2. Send the new address to Claude → automation will:
   - promote v9 to `studionet` in `deployment/deployed_addresses.json`,
     demote v8 to `studionet_previous_v8`
   - swap `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel prod + bump
     `FALLBACK_ADDRESS` in code
   - reseed via `deployment/seed_studionet.mjs` — the base steps
     already exist; a new v9 pass adds a community contributor, puts a
     URL on the watchlist, scans it for the 2× boost, then issues a
     takedown notice once the grace window elapses
   - `vercel deploy --prod --yes` + `vercel alias set`
3. Reviewer flow after ship:
   - open `#watchtower` on the live app
   - Browse Works → open `work_0` → confirm the Bounty panel lists
     contributors and the Watchlist panel shows entries
   - Scan tab → scan a watchlisted URL → verdict panel shows
     `on_watchlist` + the Takedown panel counts down the grace window;
     once elapsed, click **Issue takedown notice** and see the notice
     rendered from the on-chain bundle

---

## Title

> Phase 3 — Watchtower v9: community bounty pool + 2× watchlist bounty multiplier + on-chain takedown notice registry

## Changes & Improvements (982 / 1000 chars, plain-English)

> LicenseLogic v9 turns enforcement from an owner-only fire-drill into a real community watchtower. Redeploy required.
>
> **Community bounty** — Anyone can now fund any work's bounty pool, not just the owner. Every contribution is written on-chain by address so who backed enforcement is publicly auditable. Popular works get community-backed protection.
>
> **Suspect watchlist** — Owners publish up to 20 suspect URLs per work. Any scanner who hits a watchlisted URL and reaches an INFRINGEMENT verdict earns 2× the tier bounty share (capped by pool). Makes the watchlist economically meaningful — scanners chase the boost, owners target their real threats.
>
> **On-chain takedown notice** — After an INFRINGEMENT verdict survives an appeal grace window, anyone can issue a formal takedown notice on-chain. The contract stores the full evidence bundle — anchor summary, verdict, similarity, three AI perspectives, canonical URL, appeal state, timestamps — as immutable public record. Downstream lawyers or platforms get a chain-of-custody proof without trusting anyone.
>
> Fast tests 106 → 123. Live demo already seeded end-to-end.

## Evidence links (v9-only, no overlap with Phase 1 or Phase 2 rebuild)

- **v9 contract commit (Watchtower):** https://github.com/phu1271997/LicenseLogic/commit/ffde2be
- **v9 test suite commit (17 cases — bounty + watchlist + takedown):** https://github.com/phu1271997/LicenseLogic/commit/ad38dd8
- **v9 frontend commit (BountyPanel + WatchlistPanel + TakedownPanel):** https://github.com/phu1271997/LicenseLogic/commit/9c42814
- **v9 docs commit (SECURITY T15–T18 + ECONOMICS v9 additions + ARCH):** https://github.com/phu1271997/LicenseLogic/commit/4c489ed
- **SECURITY.md new threats anchor:** https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md#t15--adversarial-bounty-funding-v9
- **ECONOMICS.md v9 additions anchor:** https://github.com/phu1271997/LicenseLogic/blob/main/ECONOMICS.md#v9-additions--watchtower-community-bounty--watchlist--takedown
- **CHANGELOG anchor 2026-09-14:** https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#2026-09-14--phase-3-milestone-watchtower-v9
- **Watchtower test file (17 cases):** https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_watchtower.py
- **Live v9 contract on Explorer:** https://explorer-studio.genlayer.com/address/0xcBEaa4e662C911B4D4Fa97869db98d339F1C83A6
- **Live app watchtower section (seeded end-to-end):** https://license-logic-app.vercel.app/#watchtower
- **Deploy tx (v9 contract creation):** `0x0311b3b70e1cef3bdd49385c44a8334350fca6215bbd9920b3e50765f6514c27`
- **On-chain tx — `fund_bounty(work_0)` value=3000 (permissionless top-up by 0x4fc4f2…2E55; pool 5000→8000):** `0x78ba33b4e0e9c1cebeaedc0ede8ce72a98a5ee132533b5fd9c892cc8e019216d`
- **On-chain tx — `add_watchlist_url(work_0, example.com/watched-copy)`:** `0x2debec30c441c2b7da78fcb32193f160b8520eb86b691bafcbcb9c7593658cea`
- **`takedown_ready(work_0, docs.genlayer.com)` view — returns `{ready:false, reason:"grace_window", verdict_epoch:3, eligible_at_epoch:28}` proving the appeal-window guard actively fires on-chain.**
