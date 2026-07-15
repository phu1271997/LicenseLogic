# LicenseLogic

LicenseLogic only works on GenLayer because it needs three things Solidity cannot do: fetch live web pages during execution, make subjective similarity judgments with LLMs, and force that judgment through validator consensus instead of trusting a single model.

The project lets creators register original works, sell usage licenses, and scan arbitrary suspect URLs for infringement. The contract records verdicts, similarity scores, and scan reasoning on-chain while preserving a validator-safe fallback path when live fetches fail.

## Current Status

- Contract compiled and tested against GenVM v0.2.16 (`40 passed, 1 skipped`)
- Reviewer-flagged runtime bugs fixed (see [CHANGELOG.md](CHANGELOG.md))
- New Studionet deployment (2026-07-15): [`0xee3bA410d441aF48a8B4AaFC822b5C145facA8D7`](https://studio.genlayer.com/contracts/0xee3bA410d441aF48a8B4AaFC822b5C145facA8D7)
- Live frontend: [https://license-logic.vercel.app](https://license-logic.vercel.app)

## Reviewer Feedback Addressed (2026-07-15 resubmission)

- **Frontend 404** — added env fallback, explorer link in header, browse tab, `.env.example`, and step-by-step Vercel deploy instructions in `frontend/README.md` so a redeploy is a five-minute task
- **Contract errors on explorer** — replaced the EVM `_Recipient` transfer path with the native `gl.get_contract_at(...).emit_transfer(...)`, wrapped `exec_prompt` in try/except, added `__receive__` for stray transfers, and switched `evaluate_scan` to return a JSON string so `prompt_comparative` compares payloads the validator LLM can actually read
- **Stronger validator fallback** — the consensus principle now explicitly forces `UNCERTAIN` when either side reports `fetch_failed=true` or `injection_attempt=true`
- **More reproducible deployment evidence** — see [`deployment/deployment_log.md`](deployment/deployment_log.md) for the redeploy playbook and expected on-chain assertions

## Test Coverage

Nine test modules cover registration, purchases, scanning, consensus rules, prompt injection, treasury invariants, edge cases, end-to-end flow, and the new views.

```bash
python3 -m venv .venv
.venv/bin/pip install genlayer-test
.venv/bin/pytest tests -q
```

Latest local result:

```text
40 passed, 1 skipped
```

## Project Layout

```text
contracts/
  license_logic.py
  storage_test.py
tests/
deployment/
frontend/
DEPLOY.md
test_inputs.md
CHANGELOG.md
```

## Reproducible Deployment

See [`DEPLOY.md`](DEPLOY.md) for the operator checklist and [`deployment/reproducible_steps.md`](deployment/reproducible_steps.md) for the resubmission-friendly sequence with expected outcomes and artifact locations.
