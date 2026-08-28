# Scenario 01 — Fair use / short quote

## Setup

- **Original work:** long-read essay published at `https://your-blog.example/essay/42`.
- **Description:** "3000-word analysis of X with distinctive framing and a
  bespoke conclusion."
- **License price:** 5000 wei · **Penalty:** 20000 wei · **Bounty:** 10000 wei

## Suspect

`https://news-aggregator.example/story/999` — a news roundup that quotes
one paragraph (≈120 words) from the essay under attribution, with the
majority of the page being editorial commentary.

## Expected verdict

- `verdict = CLEAR` or `UNCERTAIN` depending on the validator LLMs. Any
  serious analysis should conclude that a short attributed quote inside
  a larger editorial context is fair use, not infringement.
- `similarity ≈ 15–35`
- `fetch_failed = false`
- `injection_attempt = false`
- No bounty paid.

## Why this matters

The AI is not a keyword matcher — it needs to weigh proportion,
attribution, and transformative use. Solidity + a keyword oracle would
flag the shared paragraph as INFRINGEMENT; GenLayer validator LLMs
apply doctrinal judgment.
