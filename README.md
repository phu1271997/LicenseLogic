# LicenseLogic

LicenseLogic only works on GenLayer because it needs three things Solidity cannot do: fetch live web pages during execution, make subjective similarity judgments with LLMs, and force that judgment through validator consensus instead of trusting a single model.

The project lets creators register original works, sell usage licenses, and scan arbitrary suspect URLs for infringement. The contract records verdicts, similarity scores, and scan reasoning on-chain while preserving a validator-safe fallback path when live fetches fail.

## Current Status

- Live frontend: [license-logic.vercel.app](https://license-logic.vercel.app)
- Contract runtime fixes applied for GenVM v0.2.16 compatibility
- Direct-mode `gltest` suite added under [`tests/`](tests/)
- Deployment evidence scaffold added under [`deployment/`](deployment/)

## What Changed For Resubmission

- Replaced unsafe validator fallback with `gl.eq_principle.prompt_comparative`
- Added class-level scalar declarations for persistent fields
- Replaced Python `hash()` with deterministic `sha256`
- Guarded storage reads with `.get(..., default)` to avoid TreeMap crashes
- Switched all contract errors to `gl.vm.UserError`
- Added pull-based withdrawal accounting so license fees and bounty rewards are not trapped
- Added prompt-injection canary handling and graceful `fetch_failed` degradation

## Test Coverage

The repo now includes 8 test modules covering registration, purchases, scanning, consensus rules, prompt injection, treasury invariants, edge cases, and end-to-end flow.

```bash
python3.12 -m venv .venv
.venv/bin/pip install genlayer-test
.venv/bin/pytest tests -q
```

Latest local result:

```text
35 passed, 1 skipped
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
