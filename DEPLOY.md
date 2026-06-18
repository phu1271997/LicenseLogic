# Deployment Guide

This document is the operator checklist. The full reproducible artifact pack lives in [`deployment/`](deployment/).

## Before Deploying

- Confirm line 1 of `contracts/license_logic.py` is exactly `# v0.2.16`
- Confirm line 2 is the pinned `Depends` comment
- Run `.venv/bin/pytest tests -q`
- Review [`CHANGELOG.md`](CHANGELOG.md) for the runtime fixes being validated
- Keep [`test_inputs.md`](test_inputs.md) open for manual Studio calls

## Studio Procedure

1. Open [GenLayer Studio](https://studio.genlayer.com/run-debug).
2. Deploy `contracts/storage_test.py` first as a sanity check.
3. Reset storage.
4. Deploy `contracts/license_logic.py`.
5. Run `register_work`, `purchase_license`, and `scan_for_infringement`.
6. Save explorer screenshots into `deployment/verification/`.
7. Record the finalized address and tx hash in `deployment/deployed_addresses.json`.

## Expected Manual Verifications

- `register_work` returns `work_0`
- `purchase_license` succeeds with exact price and overpayment
- `scan_for_infringement` stores a verdict JSON
- `get_work` reflects updated `infringement_count`
- `get_withdrawable` reflects owner earnings and scanner bounty credits

## Artifact Pack

- [`deployment/reproducible_steps.md`](deployment/reproducible_steps.md)
- [`deployment/deployed_addresses.json`](deployment/deployed_addresses.json)
- [`deployment/deployment_log.md`](deployment/deployment_log.md)
- [`deployment/seed_data.py`](deployment/seed_data.py)
- [`deployment/verification/README.md`](deployment/verification/README.md)
