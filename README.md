# LicenseLogic

LicenseLogic only works on GenLayer because it needs three things Solidity cannot do: fetch live web pages during execution, make subjective similarity judgments with LLMs, and force that judgment through validator consensus instead of trusting a single model.

The project lets creators register original works, sell usage licenses, and scan arbitrary suspect URLs for infringement. The contract records verdicts, similarity scores, and scan reasoning on-chain while preserving a validator-safe fallback path when live fetches fail.

## Current Status

- Contract compiled and tested against GenVM v0.2.16 (`66 passed, 1 skipped`)
- Reviewer-flagged runtime bugs fixed (see [CHANGELOG.md](CHANGELOG.md))
- Studionet deployment: [`0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035`](https://explorer-studio.genlayer.com/address/0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035)
- Live frontend: [https://license-logic.vercel.app](https://license-logic.vercel.app)
- Explorer submission draft: [SUBMISSION.md](SUBMISSION.md)

## Try It Now

The frontend spins up an auto-funded studionet burner per browser tab — no wallet install required.

1. Open <https://license-logic.vercel.app> → **Browse Works**. Three records visible; `work_1` is anchored with an INFRINGEMENT verdict on file.
2. **View Work** `work_1` — see the LLM-consensus anchor summary of `docs.genlayer.com`.
3. **Scan Infringement** `work_1` vs `https://example.com/` → CLEAR verdict with validator reasoning; vs `https://docs.genlayer.com/` → INFRINGEMENT via the non-payable registered-URL shortcut.
4. **Purchase License** `work_1`, amount `1000` — you now hold a license.
5. **Register Work** with your own URL, then **View Work** + click **Anchor Work** to run a fresh fetch + LLM consensus on your record.

Full E2E evidence, tx hashes, and reseed script in [`deployment/deployment_log.md`](deployment/deployment_log.md).

## Reviewer Feedback Addressed (2026-07-15 resubmission)

- **Frontend 404** — added env fallback, explorer link in header, browse tab, `.env.example`, and step-by-step Vercel deploy instructions in `frontend/README.md` so a redeploy is a five-minute task
- **Contract errors on explorer** — replaced the EVM `_Recipient` transfer path with the native `gl.get_contract_at(...).emit_transfer(...)`, wrapped `exec_prompt` in try/except, added `__receive__` for stray transfers, and switched `evaluate_scan` to return a JSON string so `prompt_comparative` compares payloads the validator LLM can actually read
- **Stronger validator fallback** — the consensus principle now explicitly forces `UNCERTAIN` when either side reports `fetch_failed=true` or `injection_attempt=true`
- **More reproducible deployment evidence** — see [`deployment/deployment_log.md`](deployment/deployment_log.md) for the redeploy playbook and expected on-chain assertions

## Test Coverage

Twelve test modules cover registration, purchases, scanning, consensus rules,
prompt injection, treasury invariants, edge cases, end-to-end flow, views,
anchor lifecycle, adversarial bounty replays, and alias-URL collapse.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest tests -q
```

Latest local result:

```text
66 passed, 1 skipped
```

## Reproducible Lint

`ruff.toml` at the repo root pins the ruleset; `requirements-dev.txt` pins the
ruff version. Any environment installing `requirements-dev.txt` runs the same
check the reviewer runs:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/ruff check contracts/ tests/
```

Expected: `All checks passed!`

## Project Layout

```text
contracts/          # Intelligent Contract (Python) + storage_test.py
tests/              # pytest: 66 fast + 5 slow (studionet read-only)
deployment/         # deployed_addresses.json + seed scripts + logs
frontend/           # Next.js 16 + genlayer-js
deliverables/       # Explorer submission draft + logo assets
docs/adr/           # Architecture Decision Records
docs/samples/       # walk-through scenarios
ARCHITECTURE.md     # system diagram + storage model + trust boundaries
ECONOMICS.md        # token flows + invariants + anti-abuse rules
SECURITY.md         # 9-threat model + per-threat defense
CONTRIBUTING.md     # dev loop + commit conventions + redeploy playbook
DEPLOY.md
CHANGELOG.md
```

## Further reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit together
- [ECONOMICS.md](ECONOMICS.md) — where the GEN moves
- [SECURITY.md](SECURITY.md) — what attacks we defend against
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to hack on this
- [docs/adr/](docs/adr/) — key design decisions with tradeoffs

## Reproducible Deployment

See [`DEPLOY.md`](DEPLOY.md) for the operator checklist and [`deployment/reproducible_steps.md`](deployment/reproducible_steps.md) for the resubmission-friendly sequence with expected outcomes and artifact locations.
