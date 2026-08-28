# ADR-002 — Canonicalize URLs before deriving evidence keys

**Status:** accepted · **Date:** 2026-08-16

## Context

Every scan writes a verdict record keyed by `{work_id}:sha256(URL)[:16]`
and pays bounty via `scan_credited[work_id:hash]`. Without normalization,
the following are all distinct keys pointing at the same page:

- `http://Site.com/A` vs `https://site.com/A/`
- `https://site.com/a` vs `https://www.site.com/a`
- `https://site.com/a?utm_source=x` vs `https://site.com/a`
- `https://site.com/a#anchor` vs `https://site.com/a`
- `https://site.com:443/a` vs `https://site.com/a`

A scanner could farm bounty by permuting these variants. Owners could
also unintentionally split evidence across permutations, making the
`infringement_count` metric misleading.

## Decision

Introduce `canonical_url(value: str) -> str` inside the contract,
applied everywhere a URL crosses the storage boundary:

- scheme lowercased; `http` coalesced to `https`
- host lowercased
- default ports (80 / 443) stripped
- leading `www.` removed
- path kept as-is (case-sensitive per RFC 3986) except trailing slash on
  non-root paths stripped
- fragment dropped
- tracking query params removed (`utm_*`, `fbclid`, `gclid`, `msclkid`,
  `yclid`, `twclid`, `dclid`, `igshid`, `mc_cid`, `mc_eid`, `_hsenc`,
  `_hsmi`, `_ga`, `ref`, `ref_src`, `referrer`, `source`, `campaign`,
  `medium`, `spm`, `share`, `share_source`, `share_medium`); remainder
  sorted for stability

The canonical form is what gets hashed. A `get_canonical_url(url)` view
lets the frontend show the collapsed evidence key so the reviewer
understands why two "different" URLs deduplicated.

## Consequences

- Scanner cannot farm the bounty by URL permutation.
- Owner cannot accidentally accumulate multiple infringement counts for
  the same real page.
- Path case stays significant — many web servers treat `/A` and `/a` as
  distinct resources; forcing lowercase there would create false
  collisions.
- `test_alias_replay.py` proves 8 variants collapse to one credit.

## Rejected alternatives

- **Store the URL exactly as submitted** — see the farming attack above.
- **Ask the frontend to canonicalize** — impossible to enforce; a
  scripted client could bypass. Canonicalization must live in the
  contract.
