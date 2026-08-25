# GENLAYER PROJECT EXPLORER — SUBMISSION DRAFT
**Project:** LicenseLogic · **Prepared:** 2026-08-25 · **Status: READY**

---

## Project name
LicenseLogic

## Primary category
**Dispute Resolution**

Reason: the contract's core value is an on-chain judgment about whether a suspect web page infringes a registered work — a subjective decision reached by validator LLM consensus. That maps directly to GenLayer's own "adjudication layer" positioning. Not `AI & Agents` because that primary is over-populated in the catalog and does not distinguish an adjudication app from a generic AI helper. Not `Marketplaces` because the app is not a marketplace; the mechanism is dispute + evidence, not commerce.

## Category tags
- **Tag 1: Evidence Assessment** — implemented by `scan_for_infringement(work_id, suspect_url)` and `anchor_work(work_id)`. The contract fetches the suspect URL via `gl.nondet.web.render`, builds a similarity-judgment prompt (owner description + LLM-anchored snapshot of the original as trusted second source), runs it through validator consensus with a hand-written `CONSENSUS_PRINCIPLE`, and stores the resulting verdict + reasoning + similarity score on-chain. This is evidence handling end-to-end.
- **Tag 2: License Claims** — implemented by `register_work(work_url, work_desc, license_price, penalty_amount)` and `purchase_license(work_id)` (payable). The contract stores license terms per work and lets any wallet mint a per-address license by sending native GEN; `has_license(work_id, addr)` is the on-chain proof.

Rejected tags (checked against contract):
- Escrow Claims — no 2-sided escrow with contested deliverable.
- Moderation Appeals — no takedown / appeal of a moderation action.
- Appeal Review — no second-tier review of a prior verdict.
- Jury Selection — the app does not pick jurors. Validator selection is GenLayer's, not the app's. Calling something "AI jury" in copy does not count.

## Logo
`TO BE PROVIDED` — spec: PNG/JPEG/WebP, 128–2048 px, ≤ 2 MB. Concept: shield silhouette with a stylized clause-mark (§) inside, single mark on opaque dark card, accent color matching the app's indigo `--accent: #6366f1`. I can generate a matching SVG + PNG on request.

## One-liner (179 / 180)
> Register web content on-chain, then have GenLayer validators fetch any suspect URL, judge similarity with LLM consensus, and pay a bounty for the first honest infringement report.

## Description (960 / 1000)
> LicenseLogic turns copyright enforcement into an on-chain workflow. An owner registers a work with a reference URL, description, license price, and penalty. They then anchor the work — validators fetch the URL and store an LLM-consensus summary as immutable provenance, so later scans compare against a snapshot, not just the owner's words.
>
> Anyone can submit a suspect URL. The contract fetches it via `gl.nondet.web.render`, prompts each validator's LLM for a verdict (INFRINGEMENT / CLEAR / UNCERTAIN) plus similarity and reasoning, and settles by consensus. The first honest INFRINGEMENT scan for a given canonical URL is paid from the work's bounty pool; replays return the same verdict but no double-pay. URLs are canonicalized (http↔https, case, www., default ports, trailing slash, fragment, utm_*/fbclid) so aliases collapse to one evidence slot.
>
> Licenses are minted by paying the listed price to `purchase_license`. Owners withdraw via `withdraw()`.

## How to try it
Prerequisites:
- A modern desktop browser (Chrome/Firefox/Safari).
- **No wallet install required.** The frontend uses a per-tab in-browser burner that studionet auto-funds — refreshing the page mints a new signer with a spendable balance. All flows below work end-to-end without MetaMask.
- If you want to see a fully-populated record before doing anything: `work_1` is already anchored and has an INFRINGEMENT verdict plus a CLEAR verdict on file. Open the **Browse Works** tab to confirm.

Step 1 — Browse existing records.
Open <https://license-logic.vercel.app> → click **Browse Works**. You should see three works. `work_1` is tagged `anchored` and shows `1 infringement(s)`.

Step 2 — Inspect the seeded record.
Switch to **View Work**, enter `work_1`, submit. You will see the anchor summary (a paragraph-long LLM-consensus description of the reference page), the license price, penalty, and bounty pool.

Step 3 — Run your own scan.
Switch to **Scan Infringement**. Work ID `work_1`, Suspect URL `https://example.com/`. Submit. The banner walks through *Submitting → Fetching page + AI consensus (this can take a minute) → Reading verdict from chain*. When it lands you see a CLEAR verdict with reasoning and a similarity bar. To see the other branch, scan `https://docs.genlayer.com/` (the registered URL) — INFRINGEMENT via the non-payable registered-URL shortcut.

Step 4 — Register + anchor + scan your own work.
Switch to **Register Work**. URL: any public article page. Description: at least 20 characters describing the work. License Price / Penalty: any small integer (e.g. `1000` / `5000`). Submit. Note the returned `work_N`. Switch to **View Work**, enter that id, click **Anchor Work**, and wait for consensus. Then go to **Scan Infringement** and scan any URL against that new id.

Step 5 — Purchase a license.
Switch to **Purchase License**. Work ID `work_1`, Payment Amount `1000`. Submit. You now hold a license for `work_1`; `has_license(work_1, <your address>)` returns true.

Expected end state: every step surfaces a real tx hash linked to the studionet explorer. The verdict panel shows validator-consensus reasoning that changes wording between runs but keeps the same bucket — that is the on-chain AI in action.

If something goes wrong:
- "no anchored original — call anchor_work(work_id) first" — the work needs anchoring by its owner first. Only visible if you scan a work you registered yourself and skipped Step 4's Anchor click.
- Yellow "chain slow to confirm" banner — the tx did land; the app fell back to reading state directly and shows the on-chain result under the banner.
- "Insufficient payment" on license purchase — send at least the listed price shown in the View / Browse tabs.

## Expected verification outcome (480 / 500)
> Browse Works lists 3 records; `work_1` is anchored, `infringement_count=1`. View Work `work_1` renders an LLM-consensus summary of docs.genlayer.com. Scan `work_1` vs `https://example.com/` → **CLEAR**, similarity ≈ 0, reasoning by validator LLMs. Scan `work_1` vs `https://docs.genlayer.com/` → **INFRINGEMENT**, similarity 100, `registered_url_shortcut=true`. Purchase License `work_1` at 1000 wei succeeds; `has_license` true. Every action returns a tx hash linked to explorer.

## Contract link
<https://explorer-studio.genlayer.com/address/0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035>

- Address: `0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035`
- Network: **studionet** (GenLayer Studio hosted)
- Status: **Preview**
- Verified live: `gen_getContractSchema` returns the full method list; on-chain reads via `list_works` return the 3 seeded records above.

Reference tx hashes on studionet (from the 2026-08-25 seeding pass, all reached ACCEPTED / FINALIZED):
- register work_1: `0x246f202ca48287e90b3957f709dd2d13ddfaad027cc27eef9a3e52d2e1357738`
- anchor  work_1: `0xc5a49b4ddc8fb6860d810c92245a03b4461248687ea92c417729ed60ba120563`
- scan   work_1 → INFRINGEMENT: `0x5063840d2ee20c7ffa72960466b34820a269fdb6f911d094c52233184d84b04b`
- scan   work_1 → CLEAR: `0xa62e8f13fdbb440310da1449acbc88842cc5802eaa1316714700ce7834817bd4`
- deposit bounty work_1: `0x1184f6a270d634f2c28ab4b633206a008658f66f04c2b0ce23d22011a02c9886`
- purchase license work_1: `0xc09a26f7c9b40b85a66662f29d09a95c8f01d3e4828471ef5d4428de783bb705`

## Website
<https://license-logic.vercel.app>

## GitHub
<https://github.com/phu1271997/LicenseLogic>

## Community links (optional)
Leave empty.
