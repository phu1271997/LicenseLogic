# Scenario 02 — Verbatim copy on a mirror domain

## Setup

- **Original work:** technical tutorial at `https://your-docs.example/guide/setup`.
- **Description:** "Step-by-step setup guide for framework X, ~2000 words,
  with 8 numbered steps and 3 gotcha callouts."
- **License price:** 1000 wei · **Penalty:** 5000 wei · **Bounty:** 20000 wei

## Suspect

`https://mirror-site.example/guide/setup` — near-verbatim copy of the
same 2000 words, only the header and footer navigation changed. No
attribution.

## Expected verdict

- `verdict = INFRINGEMENT` from validator consensus (Path B, real LLM).
- `similarity ≥ 85`
- `matched_elements` names the shared paragraphs / numbered-step text.
- `fetch_failed = false`
- `injection_attempt = false`
- **First honest scan** pays `bounty_pool // 10 = 2000 wei` to the
  scanner via `withdrawable_balance`.
- Replay of the same canonical URL returns the same verdict, no payout.
- URL aliases (`https://mirror-site.example/guide/setup/`,
  `?utm_source=twitter`, `#top`) all collapse to the same evidence key —
  no farming.

## Why this matters

This is the archetypal case the app exists to detect. The **combination**
of live fetch + LLM similarity + canonical-URL deduplication is what
Solidity cannot do.
