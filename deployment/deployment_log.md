# Deployment Log

## 2026-06-18 Resubmission Deployment

- Network: `studionet`
- Contract address: `0x70B0CBB3A9A199f01aD2E1382ECE1b99B989a5CF`
- Deployment tx hash: `0xc9cc2f0da882bc35297910a67d05776fc3d19a92d7101704e58d63b3947541f3`
- Deployer wallet: `0x3ceAaaBDdF16d1E05d51fB5E93C86e11d4E5F5Bd`
- Contract file: `contracts/license_logic.py`
- Status: deployed successfully by operator; post-deploy verification in progress

## Purpose Of This Redeploy

This deployment is the resubmission build that addresses the feedback from the GenLayer Builder Program review:

- added contract tests under `tests/`
- replaced unsafe validator fallback behavior with `gl.eq_principle.prompt_comparative`
- added reproducible deployment artifacts under `deployment/`
- fixed runtime issues discovered through contract review and explorer-oriented testing

## Runtime Fixes Included In This Build

1. Declared persistent scalars at class level: `admin`, `work_counter`, `total_received`
2. Replaced non-deterministic Python `hash()` usage with deterministic `sha256`
3. Replaced unsafe TreeMap index reads with guarded `.get(..., default)` access
4. Switched all user-facing reverts to `gl.vm.UserError`
5. Added withdrawable accounting and `withdraw()` so license fees and bounty rewards are not trapped

## Verification Checklist

- [ ] `storage_test.py` deployed successfully first
- [ ] `license_logic.py` deployed successfully
- [ ] `register_work` executed successfully
- [ ] `purchase_license` executed successfully
- [ ] `scan_for_infringement` executed successfully
- [ ] `get_work` confirmed updated storage state
- [ ] explorer screenshots saved under `deployment/verification/`

## Captured Transactions

- Deploy tx hash: `0xc9cc2f0da882bc35297910a67d05776fc3d19a92d7101704e58d63b3947541f3`
- Register tx hash: `0xb1f16c0f7abcc700ebffcfc416a5ae8d24c338c71565e0567e7a127bb980930f`
- Purchase tx hash: `0x3b8255498d9ec1e5c81638c7934df3450759e032382394c1b6b65c7a5db7879d`
- Scan tx hash: `0x1dea4b43892711c625a45b2eaba421d9d391e1c5f1d8e60dbb5a794b92013f5c`

## Verification Notes To Fill In

- Register result: `PENDING_FILL`
- Purchase result: `PENDING_FILL`
- Scan verdict: `PENDING_FILL`
- Scan similarity: `PENDING_FILL`
- Storage verification note: `PENDING_FILL`
