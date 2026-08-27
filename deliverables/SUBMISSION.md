# GENLAYER PROJECT EXPLORER — SUBMISSION DRAFT
**Project:** LicenseLogic · **Prepared:** 2026-08-27 · **Status: READY**

Live URL: <https://license-logic.vercel.app>
Contract: `0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035` on GenLayer **studionet**
GitHub: <https://github.com/phu1271997/LicenseLogic>

---

## Project name
LicenseLogic

## Primary category
**Dispute Resolution**

The contract's core value is an on-chain judgment about whether a suspect web page infringes a registered work — a subjective decision reached by validator LLM consensus. That maps directly to GenLayer's own "adjudication layer" positioning. Not `AI & Agents` because that primary is over-populated in the catalog and does not distinguish an adjudication app from a generic AI helper. Not `Marketplaces` because the app is not a marketplace; the mechanism is dispute + evidence, not commerce.

## Category tags
- **Tag 1: Evidence Assessment** — implemented by `scan_for_infringement(work_id, suspect_url)` and `anchor_work(work_id)`. The contract fetches the suspect URL via `gl.nondet.web.render`, builds a similarity-judgment prompt (owner description + LLM-anchored snapshot of the original as trusted second source), runs it through validator consensus with a hand-written `CONSENSUS_PRINCIPLE`, and stores the resulting verdict + reasoning + similarity score on-chain. This is evidence handling end-to-end.
- **Tag 2: License Claims** — implemented by `register_work(work_url, work_desc, license_price, penalty_amount)` and `purchase_license(work_id)` (payable). The contract stores license terms per work and lets any wallet mint a per-address license by sending native GEN; `has_license(work_id, addr)` is the on-chain proof.

Rejected tags (checked against contract):
- Escrow Claims — no 2-sided escrow with contested deliverable.
- Moderation Appeals — no takedown / appeal of a moderation action.
- Appeal Review — no second-tier review of a prior verdict.
- Jury Selection — the app does not pick jurors. Validator selection is GenLayer's, not the app's. Calling something "AI jury" in copy does not count.

## Logo
`deliverables/logo-1024.png` (1.0 MB) · `deliverables/logo-512.png` (284 KB) · SVG source `deliverables/logo.svg`.
Upload the 1024 to Portal.

Motif: shield silhouette with a folded-corner document + checkmark inside — reads as "verified licensed work". Single mark, no text. Opaque dark card `#161624 → #07070C`, mark gradient matching the app header accent. Verified legible at 128 px.

## One-liner (177 / 180)
> Register a work on-chain, then GenLayer validators fetch any suspect URL, read it live, and vote by LLM consensus on whether it infringes — bounty for the first honest report.

## Description (980 / 1000)
> LicenseLogic turns copyright enforcement into an on-chain workflow. An owner registers a work with a reference URL, description, license price, and penalty, then anchors it — validators fetch the URL and store an LLM-consensus summary as immutable provenance, so later scans judge against a real snapshot, not just the owner's words.
>
> Anyone can submit a suspect URL. The contract fetches it via `gl.nondet.web.render`, prompts each validator LLM for a verdict (INFRINGEMENT / CLEAR / UNCERTAIN) plus similarity and reasoning, and settles by `prompt_comparative` consensus. The first honest INFRINGEMENT for a canonical URL pays from the work's bounty pool; replays return the same verdict but do not double-pay. URLs are canonicalized (http↔https, case, www., ports, trailing slash, fragment, utm_*/fbclid) so aliases collapse to one evidence slot. A per-scan canary token forces UNCERTAIN on prompt injection.
>
> Licenses are minted by paying the listed price to `purchase_license`.

## How to try it
Prerequisites:
- A modern desktop browser (Chrome / Firefox / Safari).
- **No wallet install required.** The frontend spins up a studionet burner per tab that the network auto-funds. Refreshing mints a new signer with a spendable balance.
- If you just want to inspect seeded records first: `work_1` and `work_3` are both anchored and each carries at least one on-chain verdict.

Step 1 — Browse existing records.
Open <https://license-logic.vercel.app>, land on the **Browse Works** tab (default). You should see four works; `work_3` is tagged `anchored` and shows `1 infringement(s)`.

Step 2 — Inspect the seeded record.
Switch to **View Work**, enter `work_3`, submit. You will see the anchor summary (a paragraph-long LLM-consensus description of docs.genlayer.com), the license price, penalty, and bounty pool.

Step 3 — Run a real scan (CLEAR).
Switch to **Scan Infringement**. Use the preset button "Preset: CLEAR → work_1 vs example.com" (or manually enter `work_1` / `https://example.com/`) and submit. The banner walks through *Submitting → Fetching page + AI consensus → Reading verdict from chain*. When it lands you get a **CLEAR** verdict with reasoning drafted by the validator LLMs and a low similarity bar.

Step 4 — Run the shortcut path (INFRINGEMENT).
Same tab, "Preset: INFRINGEMENT → work_1 vs registered URL". Submit. Verdict is **INFRINGEMENT** with `registered_url_shortcut=true` — a deterministic path (no LLM call, no bounty payout) that proves the contract recognizes exact-URL self-scans.

Step 5 — Purchase a license.
Switch to **Purchase License**. Work ID `work_1`, Payment Amount `1000`. Submit. You now hold a license for `work_1`; `has_license(work_1, <your address>)` returns true.

Expected end state: every step surfaces a real tx hash linked to the studionet explorer. The verdict panel shows validator-consensus reasoning that changes wording between runs but keeps the same bucket — that is the on-chain AI in action.

If something goes wrong:
- "no anchored original — call anchor_work(work_id) first" — the work needs anchoring by its owner first. Only visible if you register your own work and skip the Anchor click.
- Yellow "chain slow to confirm" banner — the tx did land; the app fell back to reading state directly and shows the on-chain result under the banner.
- "Insufficient payment" on license purchase — send at least the listed price shown on the Browse tab.

## Expected verification outcome (444 / 500)
> Browse Works shows 4 records; work_1 and work_3 are anchored. View Work work_3 renders an LLM-consensus summary of docs.genlayer.com. Scan work_3 vs https://example.com/ → CLEAR, similarity 0, reasoning by validator LLMs. Scan work_3 vs https://docs.genlayer.com/ → INFRINGEMENT, similarity 100, registered_url_shortcut=true. Purchase License work_3 at 1000 wei succeeds; has_license true. Every action returns a tx hash linked to explorer.

## Contract link
<https://explorer-studio.genlayer.com/address/0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035>

- Address: `0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035`
- Network: **studionet** (GenLayer Studio hosted)
- Status: **Preview**
- Verified live 2026-08-27: `gen_getContractSchema` returns 20 methods; on-chain reads via `list_works` return 4 seeded works; `get_last_verdict_by_url("work_3", "https://example.com/")` returns the CLEAR JSON verdict written by validator consensus.

Reference tx hashes on studionet (2026-08-27 seed pass, all ACCEPTED):
- register work_3: `0xe6d5ae788c6a2fab5341100c0a6a15e29f32b6ca91955a6a78946df1e8343d13`
- anchor work_3: `0x10f08abd4474fcfb14a46553d475f1aea4068aed810a1787b4538dea34f765eb`
- scan work_3 → INFRINGEMENT (shortcut): `0x3b98a5142cab0108692bcdeefcaf33838e999920b267728a8fe72b510e33e833`
- scan work_3 → CLEAR (real LLM): `0x94828d8e07ea35eb08d199d69421eeb649e80a6b1fde3014f387e95bb6ab50ea`
- deposit bounty work_3: `0xfaa1eb26e03b4888d15f048d3d7b925161677be76016ce910a5039f569ab3424`
- purchase license work_3: `0x7bbddb476dd842fae0f1aea6be41dac3089277f7d19f8432eddcf64a63050ffa`

## Website
<https://license-logic.vercel.app>

## GitHub
<https://github.com/phu1271997/LicenseLogic>

## Community links (optional)
Leave empty.

---

## Hard character counts — verified by `wc -m`

```bash
$ printf '%s' "Register a work on-chain, then GenLayer validators fetch any suspect URL, read it live, and vote by LLM consensus on whether it infringes — bounty for the first honest report." | wc -m
177   # cap 180 ✓
$ printf '%s' "$(cat description.txt)" | wc -m
980   # cap 1000 ✓
$ printf '%s' "$(cat expected_verification.txt)" | wc -m
444   # cap 500 ✓
```

## Pre-submission checklist (Portal fields)

- [x] Logo PNG 1024×1024, 1.0 MB (under 2 MB cap) — `deliverables/logo-1024.png`
- [x] Logo PNG 512×512, 284 KB backup — `deliverables/logo-512.png`
- [x] One-liner 177 / 180
- [x] Description 980 / 1000
- [x] Expected verification 444 / 500
- [x] Contract link resolvable (schema returns 20 methods)
- [x] `list_works` returns 4 seeded works
- [x] Live URL 200 in incognito, no wallet install, burner auto-funds
- [x] Seed pass 2026-08-27 wrote CLEAR verdict via real validator LLMs on work_3
- [x] Primary category **Dispute Resolution**
- [x] Tags **Evidence Assessment** + **License Claims** — each mapped to an on-chain method
- [x] Status **Preview** (studionet)
