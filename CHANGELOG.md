# CHANGELOG

## 2026-09-14 — Phase 3 Milestone (Watchtower v9)

Contract v9 (redeploy required). Turns the enforcement layer from a
single owner-funded pool + single-URL scan model into a real
community-driven watchtower.

### F1 — Permissionless bounty funding

- New storage: `bounty_contributor_count`, `bounty_contributor_addr`,
  `bounty_contributor_amount`, `bounty_contributor_index_by_addr`. Cap:
  `MAX_BOUNTY_CONTRIBUTORS = 50` per work.
- New payable write: `fund_bounty(work_id)` — anyone (owner included)
  tops up the pool. Repeat contributions from the same address are
  AGGREGATED into their existing slot (spam-resistant).
- New view: `list_bounty_contributors(work_id)` — public audit of who
  backed a work's enforcement.
- Legacy `deposit_infringement_bounty` (owner-only) still works and
  shares the same pool storage.

### F2 — Suspect watchlist with 2× bounty multiplier

- New storage: `watchlist_count`, `watchlist_url`,
  `watchlist_canonical`, `watchlist_active`,
  `watchlist_index_by_canonical`. Cap: `MAX_WATCHLIST_PER_WORK = 20`.
- New owner-only writes: `add_watchlist_url(work_id, url)` (rejects
  canonical duplicates), `set_watchlist_active(work_id, idx, bool)`
  (soft-toggle — never renumbers indices so historic evidence keys
  stay stable).
- New views: `list_watchlist(work_id)`,
  `is_on_watchlist(work_id, url)`.
- `scan_for_infringement` now emits `on_watchlist` on every verdict
  record. When an INFRINGEMENT lands on an active watchlist entry, the
  scanner's bounty share is multiplied by
  `WATCHLIST_BOOST_NUM / WATCHLIST_BOOST_DEN = 2 / 1`, still capped at
  the remaining pool. The shortcut path never pays bounty (unchanged),
  so watchlist boost only applies to the real-LLM path.

### F3 — On-chain takedown notice registry

- New storage: `takedown_notice`, `takedown_issued_at`,
  `verdict_epoch`. `scan_for_infringement` now stamps
  `verdict_epoch[verdict_key] = self.epoch` for every verdict.
- New write: `issue_takedown_notice(work_id, url)` — anyone can call.
  Guards: INFRINGEMENT verdict + not fetch_failed + no pending/
  overturned appeal + `epoch >= verdict_epoch + TAKEDOWN_APPEAL_GRACE_EPOCHS`
  (25 epochs; pre-v9 verdicts with epoch 0 are accepted immediately).
  Idempotent — repeat calls return the stored notice byte-for-byte.
- New views: `get_takedown_notice(work_id, url)`,
  `takedown_ready(work_id, url)` (dry-run with the specific
  ineligibility reason).
- Notice bundle stores every evidence field a downstream lawyer /
  platform needs — anchor summary, verdict, similarity, perspectives,
  canonical URL, appeal state, issuer, timestamps in epochs.

### Frontend

- View tab: two new panels — `BountyPanel` (public contributor list +
  Fund Bounty button anyone can press) and `WatchlistPanel` (list all
  entries; owner-only Add + Deactivate/Reactivate controls).
- Scan tab: verdict panel gains a `TakedownPanel` that shows the
  dry-run state, explains the grace window countdown, and — once
  eligible — offers a one-click "Issue takedown notice" button. If a
  notice already exists it renders the on-chain evidence bundle
  directly.
- Landing page: new `#watchtower` section with three cards, three new
  signal cards (`on_watchlist`, `bounty contributor list`, `takedown
  notice`). Nav gets a Watchtower link.

### Tests

- New `tests/test_watchtower.py` — 17 cases across three suites:
  fund_bounty (anyone-can-fund, repeat-aggregation, reject-zero,
  missing-work), watchlist (owner-only, canonical dedupe, soft-toggle,
  20-entry limit, 2× boost matches expected math on-chain, off-list
  scan gets baseline share), takedown notice (rejects missing verdict,
  respects grace window, blocks on pending / overturned appeal,
  succeeds after grace + stores full bundle, idempotent re-issue).
- Fast suite: **106 → 123 pass** (1 skipped, 7 deselected).

### Docs

- `SECURITY.md` — four new threats: T15 adversarial bounty funding
  (aggregate-per-address defense), T16 watchlist stuffing / squatting
  (canonical dedupe + real-LLM verdict still required for payout),
  T17 premature takedown notice (grace window + appeal-state guard),
  T18 takedown notice tampering / replay (idempotent by design).
- `ECONOMICS.md` — new "v9 additions" section covering permissionless
  bounty, watchlist multiplier, takedown notice mechanics. Formulas
  table extended to distinguish off-watchlist vs on-watchlist payouts.
- `ARCHITECTURE.md` — storage-model table extended with v9 entries.

## 2026-09-07 — Phase 3 Milestone (License Marketplace v8)

Contract v8 (redeploy required). Turns the single flat `license_price`
into a full marketplace with multi-tier offers, time-bound licenses, and
on-chain co-author royalty splits.

### F1 — Multi-tier license offers

- New storage: `license_tiers_count`, `tier_name`, `tier_price`,
  `tier_duration_epochs`, `tier_active` (TreeMap-per-index keyed
  `f"{work_id}:{idx}"`). Max 8 tiers per work.
- `register_work` now auto-creates `tier_0` from the legacy
  `license_price` (perpetual, active) so old clients keep working.
- New writes: `add_license_tier(work_id, name, price, duration_epochs)`,
  `set_tier_active(work_id, idx, bool)`.
- New payable write: `purchase_license_tier(work_id, tier_idx)` —
  reverts on inactive tier or underpayment; extends expiry on renew;
  perpetual (duration 0) overrides prior expiry.
- Legacy `purchase_license(work_id)` still works and routes through
  `tier_0` while preserving idempotent refund semantics.

### F2 — Time-bound license expiry via write-epoch counter

- New storage: `epoch: u256` (global monotonic). `_tick_epoch()` runs at
  the top of every write; views never tick.
- New per-license storage: `license_tier_idx`, `license_expires_at`,
  `license_purchased_at` (keyed `f"{work_id}:{addr}"`).
- `has_license(work_id, addr)` now returns false once
  `epoch >= expires_at` (perpetual: `expires_at == 0` short-circuits true).
- New view: `get_license(work_id, addr)` — full license status
  (`has_license`, `active`, `tier_idx`, `expires_at`, `purchased_at`,
  `current_epoch`).
- New view: `get_epoch()`.

### F3 — Co-author royalty splits

- New storage: `coauthors_count`, `coauthor_addr`, `coauthor_bps`.
  Max 4 coauthors per work; bps must sum to `BPS_TOTAL = 10000`.
- New write: `set_coauthors(work_id, [addr, ...], [bps, ...])` —
  owner-only. Overwrites any prior set.
- New helper `_split_credit(work_id, amount)` used for every license
  revenue AND every UPHELD appeal-stake credit. Pays coauthors by bps;
  remainder always credits the LAST coauthor so `sum(splits) == amount`
  exactly (invariant: no wei is lost or minted).
- Bounty payouts on scans still go 100 % to the scanner — the split
  applies only to owner-side revenue.
- New view: `get_coauthors(work_id)` — returns default `[owner @ 100%]`
  when no coauthors registered.
- New view: `list_license_tiers(work_id)`.
- `get_work(work_id)` now includes `tiers_count` and `coauthors_count`.

### Frontend

- License tab: tier picker (radio list of tiers with name / price /
  duration / active). Purchase button routes to `purchase_license_tier`
  when tiers are loaded, falls back to the legacy call otherwise. Renders
  the buyer's live `get_license` snapshot after purchase.
- View tab: two new owner-facing panels — `TiersPanel` (list all tiers,
  add-tier form, one-click Deactivate / Reactivate) and `CoauthorsPanel`
  (list current split, up-to-4-row editor that enforces bps sum = 10000
  client-side).
- New marketing section `#marketplace` with three cards. Three new
  signal cards (`license_tiers`, `coauthor_bps`, `epoch`).
- Fixed a long-standing pre-existing lint error by renaming the local
  `usePrefilled` helper to `prefillScan` — `use*` prefix was tripping
  `react-hooks/rules-of-hooks` on every prior CI run.

### Tests

- New `tests/test_license_tiers.py` — 10 cases: default tier seeded on
  register, owner-only gate on `add_license_tier` / `set_tier_active`,
  tier append + count, tier purchase happy path (records expiry), revert
  on inactive tier, revert on underpayment, epoch expiry lapses via
  unrelated writes, renew extends expiry, perpetual overrides, tier limit
  enforced.
- New `tests/test_royalty_splits.py` — 9 cases: default split = owner
  100 %, owner-only gate, bps sum enforcement, 70/30 split credits
  proportionally, 33/33/34 remainder → last coauthor (sum-preservation
  invariant), UPHELD appeal stake splits by bps, max-4 limit, overwrite
  wipes prior, epoch ticks on writes and NOT on views.
- Fast suite: **87 → 106 pass** (1 skipped, 7 deselected).

### Docs

- `SECURITY.md` — three new threats: T12 coauthor bps drift / rounding
  loss (defense: last-coauthor remainder), T13 inactive-tier purchase
  resurrection (defense: on-chain `tier_active` check), T14 epoch-expiry
  manipulation (defense: writes cost fees; views never tick; perpetual
  tier for absolute guarantees).
- `ECONOMICS.md` — new "v8 additions" section covering multi-tier,
  epoch-based expiry, royalty split formula. Formulas table extended.

## 2026-08-31 — Phase 2 Milestones (F1 Appeal Flow · F2 Scanner Reputation)

Contract v7 (redeploy required). Bundles two major features that make the
dispute layer real economics instead of a one-shot decision.

### F1 — Appeal / Dispute Flow

Any INFRINGEMENT verdict that came from the LLM path (not the URL
shortcut) can now be appealed. New API:

- `file_appeal(work_id, suspect_url)` — payable. Requires the prior
  verdict was INFRINGEMENT, no appeal has already resolved, and the
  caller stakes `2 * penalty_amount[work_id]`. The original scanner
  cannot file. If penalty is 0, appeals are disabled for that work.
- `resolve_appeal(work_id, suspect_url)` — anyone can trigger. Runs a
  fresh `gl.nondet.web.render` + `gl.nondet.exec_prompt` with a
  purpose-built `build_appeal_prompt` (frames the model as an appeals
  adjudicator that must bias toward OVERTURN under ambiguity) under a
  new stricter `APPEAL_PRINCIPLE` (outcome must match exactly, similarity
  ±15, outcome-similarity consistency).
- **OVERTURN outcome:** appellant refunded, `scan_credited` rolled back,
  `infringement_count` decremented, scanner's honest count decremented,
  scanner's overturn count incremented (visible in reputation).
- **UPHELD outcome:** stake redirected to the work owner via
  `withdrawable_balance`; scanner's honest count incremented.
- New views: `get_appeal(work_id, suspect_url)`,
  `get_appeal_required_stake(work_id)`.

### F2 — Scanner Reputation

Every honest INFRINGEMENT scan on the real LLM path bumps
`scanner_honest[addr]`. Every appeal that overturns a verdict bumps
`scanner_overturned[addr]`. URL-shortcut hits do NOT count — the shortcut
is deterministic, so it can not prove judgment.

Bounty payout now scales with tier instead of the flat 10 %:

- **Gold** (≥ 10 honest, 0 overturned — or ≥ 20 honest, ≤ 1 overturned): 20 %
- **Silver** (≥ 3 honest, ≤ 1 overturned): 15 %
- **Bronze** (default): 10 %

New view: `get_scanner_reputation(addr)` returns
`{address, honest_scans, overturned_scans, tier, bounty_share_pct}`.

### Storage additions (v7)

- `appeal_stake: TreeMap[str, u256]`
- `appeal_appellant: TreeMap[str, str]`
- `appeal_scanner: TreeMap[str, str]` — remembered from the original scan
- `appeal_state: TreeMap[str, str]` — "pending" | "overturned" | "upheld"
- `appeal_outcome_reason: TreeMap[str, str]`
- `scanner_honest: TreeMap[str, u256]`
- `scanner_overturned: TreeMap[str, u256]`

### Frontend

- `VerdictPanel` now renders an `AppealPanel` inline for appealable
  verdicts: shows required stake, an input + "File appeal" button, then
  a "Resolve appeal (re-scan + consensus)" button once state is
  `pending`, and the resolution reasoning when state is `overturned` or
  `upheld`. Degrades cleanly on old contracts that lack the views.
- StickyNav shows a live reputation chip for the burner —
  `you · bronze / silver / gold` — with a hover tooltip breaking down
  honest/overturned/bounty share.

### Tests

- `tests/test_appeal_flow.py` (7 cases) — file, uphold-refund-to-owner,
  overturn-refund-and-slash, original-scanner-blocked, underfunded stake,
  view state transitions, required-stake view.
- `tests/test_reputation.py` (5 cases) — bronze default, bronze payout
  10 %, silver at 3 hits, gold at 10 hits, shortcut does not advance rep.

Fast suite: 75 → **87 passed**, 1 skip.

## 2026-08-27 — Phase 1 Milestones (M1 Docs · M2 Security · M3 AI Enhancement)

### M1 — Documentation Overhaul v1 (no contract change)

New root docs (all cross-linked from README):
- `ARCHITECTURE.md` — Mermaid system diagram, storage model, 2 consensus
  paths (deterministic shortcut vs validator LLM jury), trust boundaries.
- `ECONOMICS.md` — actor table, token-flow sequence diagram, per-event
  effect table, invariants, anti-abuse rules, gas/consensus cost profile.
- `SECURITY.md` — 9-threat model with per-threat defense + residual risk
  (prompt injection, alias farming, self-scan farming, double-license,
  overflow, reentrancy, LLM disagreement, spam, Studio storage reset).
- `CONTRIBUTING.md` — dev loop, commit conventions, contract-change
  checklist, redeploy playbook.
- `docs/adr/` — 3 Architecture Decision Records covering the studionet
  choice, URL canonicalization, and the `prompt_comparative` consensus
  choice.
- `docs/samples/` — 3 walk-through scenarios (fair use / verbatim copy /
  prompt injection) so reviewers can pattern-match verdicts to real cases.

### M2 — Security Hardening Bundle v1 (contract v6 — REDEPLOY REQUIRED)

Contract additions (see `contracts/license_logic.py`):
1. **Admin pause / unpause.** New `paused: bool` storage + `pause()` /
   `unpause()` methods (admin-only) + `_require_not_paused()` guard in
   every state-mutating method except `withdraw()` (safety valve).
2. **Owner-controlled per-work scan freeze.** New
   `work_scan_disabled: TreeMap[str, bool]` + `set_scans_disabled(work_id, disabled)`
   (owner-only) + guard in `scan_for_infringement`. Lets an owner
   temporarily block spam scans against their work without asking the
   admin to pause the whole contract.
3. **Two new views** — `is_paused()`, `get_scans_disabled(work_id)` — so
   the frontend can show a banner.
4. **Threat model documented** in `SECURITY.md` above (T1–T9 with
   defenses).

### M3 — AI Enhancement: Multi-perspective + Stricter Validator (v6)

Contract changes (same v6 as M2 — one redeploy covers both):
1. **Multi-perspective prompt.** `build_analysis_prompt` now instructs the
   validator LLM to reason across three explicit lenses before its
   verdict — **Legal** (copyright doctrine, fair use), **Forensic**
   (verbatim overlap, structural mirroring), **Skeptic** (could this be
   independent creation on a shared domain?). The verdict JSON now
   carries a `perspectives` object with one short string per lens.
2. **Stricter consensus principle.** `CONSENSUS_PRINCIPLE` tightened:
   - similarity drift narrowed **±25 → ±15** points
   - `matched_elements` must bucket-agree (both name `canonical_url`, or
     both name something else, or both `none`) — mixed states are
     disagreement
   - `perspectives` must be present on both sides; each lens must not be
     empty, though wording may differ
3. **Frontend forward-compatibility.** When the on-chain verdict carries
   `perspectives`, the UI renders a three-column breakdown in the
   verdict panel. If the field is missing (old contract), the panel
   degrades gracefully to the pre-M3 layout.

### Tests

`tests/test_security_pause.py` (5 cases) — admin-only gate on pause /
unpause, write-methods blocked when paused, `withdraw()` still allowed
when paused, owner-only gate on `set_scans_disabled`, scan reverts when
disabled.

`tests/test_multi_perspective.py` (4 cases) — prompt renders 3 named
lenses, verdict JSON preserves `perspectives`, validator returns match on
different wording, validator returns disagreement when a lens is empty.

Existing fast suite still passes end-to-end: 66 → **75 passed**, 1 skip.

## 2026-08-16 — Fifth Resubmission (steward: anchor-bound scan + canonical evidence + reproducible lint)

### Reviewer Feedback Addressed

> "Thanks for the update. The exact-key guard and non-payable registered-URL
> shortcut address part of the request, but scans still ignore the fetched
> original anchor and equivalent URL variants can receive fresh bounty
> credits. Please bind scanning and payouts to a stable anchored original,
> canonicalize the evidence identity, add alias-replay tests, and make the
> documented lint check pass reproducibly."

### Contract Changes (redeploy required)

1. **Scans are bound to a stable anchored original.** New helper
   `_load_anchor_summary(work_id)` reads
   `work_content_anchor[work_id].summary` and returns it only when
   `anchored=true`. `scan_for_infringement` reverts with
   `"Work {work_id} has no anchored original — call anchor_work(work_id) first"`
   when the work has never been anchored, so both counter increments and
   bounty payouts are only possible against a validator-consensus snapshot
   of the original. The LLM analysis prompt now includes the anchor summary
   as a trusted second source, alongside the owner-supplied description.

2. **Canonicalized evidence identity.** New `canonical_url(url)` helper:
   - scheme lowercased; `http` collapsed to `https`,
   - host lowercased, default ports (`:80`, `:443`) stripped, leading `www.`
     removed,
   - trailing slash trimmed (root `/` preserved),
   - fragment dropped,
   - tracking params (`utm_*`, `fbclid`, `gclid`, `mc_*`, `ref`, `spm`,
     `share`, etc.) filtered, remaining params sorted.
   All evidence keys are now `f"{work_id}:{sha256(canonical_url(url))}"`,
   so `https://EXAMPLE.com/foo/`, `http://example.com/foo?utm_source=x`,
   `https://www.example.com/foo#top`, and `https://example.com:443/foo`
   collapse to a single slot. The registered-URL shortcut also compares
   canonicals. Every verdict record now carries `canonical_url`, and views
   `get_last_verdict_by_url`, `is_scan_credited`, and new
   `get_canonical_url(suspect_url)` all canonicalize their input.

3. **Additional lint cleanups.**
   - `B904`: added `raise ... from exc` at the two `Address(...)` catch sites
     and the anchor consensus JSON parse site.
   - `PIE810`: merged `endswith(":80") or endswith(":443")` → `endswith((":80", ":443"))`.
   - `FURB188`: replaced conditional slice with `str.removeprefix("www.")`.
   - `SIM105`: replaced `try/except/pass` in `list_works` with
     `contextlib.suppress`.

### New / Updated Tests

- **`tests/test_alias_replay.py` (9 scenarios)**: canonical view collapses
  9 alias variants to 1; parametrized test verifies every non-baseline
  alias slots into the baseline's key (`already_credited=true`, pool
  unchanged); iterating all 9 variants never double-pays;
  registered-URL alias variants also skip payout; scan reverts before
  anchor; `get_last_verdict_by_url` and `is_scan_credited` are
  canonicalized.
- **`tests/conftest.py`**: new `anchored_work` fixture (registers +
  anchors + clears mocks + restores sender/value) and `install_anchor_mocks`
  helper. Every test that calls `scan_for_infringement` was migrated to
  `anchored_work`.
- **`tests/test_treasury_solvency.py`**: the randomized invariant test now
  anchors each newly registered work so its subsequent scans are legal.
- Suite: **66 passed, 1 skipped** (was 52/1).

### Reproducible Lint

- New `ruff.toml` at repo root: pinned `target-version = "py310"`, curated
  ruleset (`E, F, I, B, BLE, PIE, RUF, UP, FURB, SIM`), narrow ignores
  (`F403/F405` for the required `from genlayer import *`, `E501` for
  intentionally long principle strings).
- `requirements-dev.txt` pins `ruff==0.16.2` alongside `genlayer-test`.
- README documents:
  `pip install -r requirements-dev.txt && ruff check contracts/ tests/`
- Local + CI now produce the same output: `All checks passed!`.

### Deployment

- **Contract must be redeployed** — scan behavior and evidence-key
  derivation changed. Previous address
  `0x8372967d074C066EC2006782171d39E18eB5a46f` is superseded. New address
  to be filled in `deployment/deployed_addresses.json` and
  `frontend/src/lib/genlayer.ts` `FALLBACK_ADDRESS` after redeploy.

## 2026-08-13 — Fourth Resubmission (steward: bounty + anchor + lint)

### Reviewer Feedback Addressed

> "Please make bounty rewards idempotent for each evidence-bound scan and
> remove or make the registered-URL shortcut non-payable. Also fetch and
> anchor the original work, then add adversarial replay tests and resolve
> the contract lint errors before resubmitting."

### Contract Changes (redeploy required)

1. **Idempotent bounty per (work_id, suspect_url).** New storage field
   `scan_credited: TreeMap[str, bool]`. `scan_for_infringement` now gates
   both `infringement_count` increment and bounty payout on
   `not scan_credited[verdict_key]`, then sets the flag after the first
   INFRINGEMENT verdict. Replayed scans of the same URL still return the
   verdict record but never re-pay bounty or double-count infringements.
   Verdict JSON now carries `already_credited` and `registered_url_shortcut`
   flags so clients can distinguish fresh detections from replays.

2. **Registered-URL shortcut is non-payable.** When
   `clean_suspect_url == original_url` the shortcut still records a
   verdict (evidence trail), but the payout branch is now guarded by
   `if not is_registered_url_shortcut` — owners cannot drain their own
   bounty pool by scanning their canonical URL.

3. **Fetch and anchor the original work.** New method `anchor_work(work_id)`:
   owner-only, runs a nondet fetch (`gl.nondet.web.render`) + LLM summary
   (`gl.nondet.exec_prompt`) inside `gl.eq_principle.prompt_comparative`
   with a dedicated `ANCHOR_PRINCIPLE` — validators must agree that both
   sides fetched the SAME page (same title/author/topic, differences in
   phrasing OK). Result stored in `work_content_anchor: TreeMap[str, str]`.
   Reverts if consensus reports `anchored=false`. Idempotent — a
   successfully anchored work cannot be re-anchored. New views
   `get_anchor(work_id)` and `is_scan_credited(work_id, suspect_url)`;
   `get_work` and `list_works` now expose an `anchored` flag.

4. **Lint clean.** `ruff check` returns zero findings:
   - Import block reordered (stdlib before `from genlayer import *`).
   - All 4 blind `except Exception` sites either narrowed to
     `(ValueError, TypeError)` (URL parsing, `Address(...)`) or annotated
     `# noqa: BLE001` at the two nondet call sites where GenVM legitimately
     raises anything.
   - F-string uses `!s` conversion flag instead of `str(...)`.
   - `normalise_verdict` dropped the unused `Optional[int]` sentinel.

### New Tests (`tests/test_adversarial_replay.py`, `tests/test_anchor.py`)

Replay tests:
- Replay same URL 3× → bounty paid once, counter increments once,
  `already_credited=true` on 2nd+3rd.
- Registered-URL shortcut → verdict recorded, bounty pool untouched, no
  self-credit to owner.
- Registered-URL shortcut × 3 → counter still 1, pool untouched.
- Same URL across two different works → each work counted independently
  (still 1-per-(work,url)).
- CLEAR verdict → no credit → later INFRINGEMENT on a different URL
  still pays normally.
- Fetch-failed scan → forced UNCERTAIN, no credit.

Anchor tests:
- New work reports `anchored=false` by default.
- Owner successfully anchors → summary persisted, `get_work` shows it.
- Non-owner cannot anchor (reverts).
- Already-anchored work cannot be re-anchored (reverts).
- Anchor fetch failure reverts.
- Missing work reverts.

Full suite: **52 passed, 1 skipped** (was 40 passed, 1 skipped).

### Frontend

- `Verdict` type gains `already_credited` and `registered_url_shortcut`;
  scan tab surfaces "Replay — bounty already claimed" and "Self-scan of
  registered URL — no bounty paid" chips when relevant.
- `WorkInfo` / `WorkSummary` types gain `anchored` + `anchor_summary`.
- New "Anchor Work" button in the View tab: owner-only, calls
  `anchor_work(work_id)` and shows the resulting summary.
- Browse tab shows an anchor badge per work.

### Deployment

- **Contract must be redeployed** — new storage fields (`scan_credited`,
  `work_content_anchor`). Old address `0xee3bA410d441aF48a8B4AaFC822b5C145facA8D7`
  is superseded. New address to be filled in
  `deployment/deployed_addresses.json` and
  `frontend/src/lib/genlayer.ts` FALLBACK_ADDRESS after redeploy.

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

