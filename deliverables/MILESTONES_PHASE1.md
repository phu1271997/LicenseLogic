# Phase 1 Milestone Submissions — LicenseLogic

Three separate submissions. Space them out across 2–4 weeks per the
Master Prompt's "phân kỳ submit" tip. All three commits landed on `main`
on 2026-08-27 (SHA range `87e61f6..811069a`).

Total Phase 1 estimated value: **1,500 – 3,300 points** across the three
submissions.

> ✅ **Contract redeploy complete (2026-08-29).** v6 lives at
> `0x19DaA769E49a42eEC3808c6c895eC266aD5CE9E2`. Frontend env swapped,
> studionet reseeded (work_0 anchored + INFRINGEMENT via URL shortcut
> with perspectives + CLEAR via real validator LLMs with per-lens
> reasoning + bounty + license), Vercel prod re-aliased.
>
> **Consolidated single-submission version** (user asked for one combined
> submission, not three separate ones) lives at the bottom of this file
> under "CONSOLIDATED PHASE 1 SUBMISSION".

---

## Milestone 1 — Documentation Overhaul v1

**Type:** Documentation & Developer Experience (Loại 8)
**Estimated points:** 300 – 800

### Title
Documentation Overhaul v1 — ARCHITECTURE, ECONOMICS, SECURITY, CONTRIBUTING + 3 ADRs + 3 sample scenarios

### Changes & Improvements (943 / 1000)

> Added 4 root docs cross-linked from README + 6 files under docs/, up from a project that had only README + DEPLOY + CHANGELOG.
>
> ARCHITECTURE.md — Mermaid system diagram, storage-model table, two consensus paths (self-scan shortcut vs validator LLM jury), trust boundaries.
> ECONOMICS.md — actor table, token-flow sequence diagram, per-event effect table, invariants, six anti-abuse rules.
> SECURITY.md — 9-threat model (T1-T9): prompt injection, alias farming, self-scan farming, double-license, u256 overflow, reentrancy, LLM disagreement, spam, Studio storage reset — each with defense and residual risk.
> CONTRIBUTING.md — dev loop, commit conventions, contract-change checklist, redeploy playbook.
> docs/adr/ADR-001..003 — decisions on studionet vs testnet, URL canonicalization scope, prompt_comparative choice.
> docs/samples/scenario-01..03 — fair use, verbatim copy, prompt injection walkthroughs.
>
> No contract redeploy needed.

### Evidence links

- Commit: <https://github.com/phu1271997/LicenseLogic/commit/87e61f6>
- <https://github.com/phu1271997/LicenseLogic/blob/main/ARCHITECTURE.md>
- <https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md>
- <https://github.com/phu1271997/LicenseLogic/blob/main/ECONOMICS.md>
- <https://github.com/phu1271997/LicenseLogic/tree/main/docs/adr>
- <https://github.com/phu1271997/LicenseLogic/tree/main/docs/samples>
- CHANGELOG anchor: <https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#2026-08-27--phase-1-milestones-m1-docs--m2-security--m3-ai-enhancement>

---

## Milestone 2 — Security Hardening Bundle v1

**Type:** Security / Architecture Improvement (Loại 5a)
**Estimated points:** 500 – 1000
**Requires contract redeploy before submit.**

### Title
Security Hardening Bundle v1 — admin pause + owner per-work scan freeze + safety-valve withdraw

### Changes & Improvements (987 / 1000)

> Contract v6 adds two kill-switches without touching the happy path.
>
> 1) Admin pause. New paused: bool + pause() / unpause() (admin-only). _require_not_paused() guards register_work, anchor_work, purchase_license, deposit_infringement_bounty, and scan_for_infringement. withdraw() is NOT guarded — safety valve so users can always retrieve balance during an incident.
>
> 2) Owner per-work freeze. New work_scan_disabled: TreeMap[str, bool] + set_scans_disabled(work_id, disabled) — owner-only. scan_for_infringement reverts with "Scans are disabled for {work_id} by its owner" when the flag is on.
>
> Two views: is_paused() and get_scans_disabled(work_id). Frontend renders an orange banner when paused and a Disable/Re-enable Scans toggle on the View tab when the burner owns the work.
>
> Fast tests grew 66 -> 75. New tests/test_security_pause.py (5 cases): admin-only gate, writes blocked when paused, withdraw still works when paused, owner-only toggle gate, scan reverts when disabled.

### Evidence links

- Contract commit: <https://github.com/phu1271997/LicenseLogic/commit/f7ab41f>
- Test commit: <https://github.com/phu1271997/LicenseLogic/commit/a68cbc6>
- Frontend commit: <https://github.com/phu1271997/LicenseLogic/commit/e39f70e>
- New test file: <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_security_pause.py>
- Threat model (T8 spam defense): <https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md>
- CHANGELOG anchor: <https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#m2--security-hardening-bundle-v1-contract-v6--redeploy-required>
- Live contract on Explorer (**after redeploy**): `https://explorer-studio.genlayer.com/address/<NEW_ADDR>`

---

## Milestone 3 — AI Enhancement: Multi-perspective + Stricter Validator

**Type:** AI Enhancement (Loại 1c + 1e bundled)
**Estimated points:** 700 – 1500
**Requires contract redeploy before submit.**

### Title
AI Enhancement — LEGAL / FORENSIC / SKEPTIC multi-perspective prompt + stricter validator principle (±15, matched-elements bucket, perspectives required)

### Changes & Improvements (987 / 1000)

> Contract v6 upgrades AI consensus on two axes.
>
> 1) Multi-perspective prompt. build_analysis_prompt asks the LLM to reason across three named lenses BEFORE the verdict — LEGAL (doctrine, substantial similarity, fair use), FORENSIC (verbatim overlap, mirrored structure, unique phrasings), SKEPTIC (independent-creation on a shared domain). Verdict JSON gains perspectives: {legal, forensic, skeptic}. Each lens is non-empty; _sanitise_perspectives() truncates to 240 chars and falls back to a sentinel that breaks consensus if a lens is skipped.
>
> 2) Stricter principle. CONSENSUS_PRINCIPLE requires: similarity drift within 15 points (was 25); matched_elements bucket-agreement; perspectives with all three keys non-empty.
>
> Error branches (shortcut, fetch fail, LLM fail, injection, parse fail) emit constant per-branch perspectives so leader and validator match.
>
> Frontend renders the three lenses as labeled columns in the verdict panel. New tests/test_multi_perspective.py (4 cases).

### Evidence links

- Contract commit: <https://github.com/phu1271997/LicenseLogic/commit/f7ab41f>
- Test commit: <https://github.com/phu1271997/LicenseLogic/commit/a68cbc6>
- Frontend commit: <https://github.com/phu1271997/LicenseLogic/commit/e39f70e>
- New test file: <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_multi_perspective.py>
- Updated principle assertions: <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_consensus_principle.py>
- ADR-003 on the consensus choice: <https://github.com/phu1271997/LicenseLogic/blob/main/docs/adr/ADR-003-prompt-comparative-consensus.md>
- CHANGELOG anchor: <https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#m3--ai-enhancement-multi-perspective--stricter-validator-v6>
- Live scan verdict record (**after redeploy + reseed**) proving `perspectives` on-chain — Explorer tx URL to paste here

---

## Redeploy checklist (for M2 and M3)

1. **Studio deploy** — paste `contracts/license_logic.py` into
   <https://studio.genlayer.com/contracts>, Deploy, verify `Result: SUCCESS`.
2. **Give me the new address** — I will:
   - update `deployment/deployed_addresses.json` (studionet → new; old bumped to `studionet_previous_v5`)
   - `vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes`
   - `printf '<new-addr>' | vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production`
   - reseed via `deployment/seed_studionet.mjs` (fresh burner, ~2 min)
   - `vercel deploy --prod --yes` + `vercel alias set` to `license-logic.vercel.app`
3. **Re-verify on Explorer** — click through to confirm the new contract
   responds to `is_paused`, `get_scans_disabled`, and that a fresh scan
   verdict carries `perspectives`.
4. **Submit M2 first, then M3 ~1–2 weeks later.** Both point at the
   same v6 codebase but describe distinct milestone categories.

## Local test results (both suites)

```
$ .venv/bin/pytest tests -m 'not slow' -q
75 passed, 1 skipped, 5 deselected in 0.78s

$ LICENSELOGIC_CONTRACT=0x19DaA769E49a42eEC3808c6c895eC266aD5CE9E2 \
    .venv/bin/pytest tests -m slow -q
7 passed, 76 deselected in 11.72s
```

---

## CONSOLIDATED PHASE 1 SUBMISSION (single-post version)

### Title
Phase 1 Bundle — Documentation Overhaul + Security Hardening (admin pause + owner scan-freeze) + AI Enhancement (multi-perspective + stricter validator)

### Changes & Improvements (995 / 1000)

> Redeployed contract v6 at 0x19DaA769E49a42eEC3808c6c895eC266aD5CE9E2. Three bundled improvements:
>
> M1 DOCS — added ARCHITECTURE.md (Mermaid + storage model), ECONOMICS.md (token-flow + invariants), SECURITY.md (9-threat model), CONTRIBUTING.md (redeploy playbook), 3 ADRs, 3 sample scenarios.
>
> M2 SECURITY — admin pause() / unpause() + _require_not_paused() guard on every write except withdraw() (safety valve). Owner set_scans_disabled(work_id) freezes scans per-work without pausing the contract. New views is_paused() + get_scans_disabled(). Frontend shows orange pause banner + owner-only toggle.
>
> M3 AI — build_analysis_prompt asks LLM to reason across LEGAL / FORENSIC / SKEPTIC lenses before verdict. JSON gains perspectives {legal, forensic, skeptic}. CONSENSUS_PRINCIPLE tightened: similarity ±25 → ±15, matched_elements bucket-agreement, perspectives required. Error branches emit constant per-branch perspectives.
>
> Fast tests 66 → 75. Slow tests 5 → 7 (probe v6 views).

### Evidence links

- Live contract on Explorer: <https://explorer-studio.genlayer.com/address/0x19DaA769E49a42eEC3808c6c895eC266aD5CE9E2>
- Contract v6 commit diff: <https://github.com/phu1271997/LicenseLogic/commit/f7ab41f>
- SECURITY.md (9-threat model): <https://github.com/phu1271997/LicenseLogic/blob/main/SECURITY.md>
- ARCHITECTURE.md (Mermaid diagram): <https://github.com/phu1271997/LicenseLogic/blob/main/ARCHITECTURE.md>
- ADR-003 (why prompt_comparative): <https://github.com/phu1271997/LicenseLogic/blob/main/docs/adr/ADR-003-prompt-comparative-consensus.md>
- New pause / scan-freeze tests: <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_security_pause.py>
- New multi-perspective tests: <https://github.com/phu1271997/LicenseLogic/blob/main/tests/test_multi_perspective.py>
- CHANGELOG anchor: <https://github.com/phu1271997/LicenseLogic/blob/main/CHANGELOG.md#2026-08-27--phase-1-milestones-m1-docs--m2-security--m3-ai-enhancement>
- Sample on-chain CLEAR verdict tx (real LLM, carries perspectives): `0xa03c0e633446c510f1e534de7fa5f2e7aab94b2c617daf2225e40cfea8b9dbe0`
