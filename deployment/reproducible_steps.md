# Reproducible Deployment Procedure

## Prerequisites

- GenLayer Studio access at <https://studio.genlayer.com/contracts>
- Test wallet funded from the Studio faucet
- This repository checked out locally
- Local validation run: `.venv/bin/pytest tests -q`

## Step 1: Sanity-check Studio with `storage_test.py`

1. Open Studio and create a new contract.
2. Paste `contracts/storage_test.py`.
3. Deploy.
4. Call `set_value("hello", "world")`.
5. Call `get_value("hello")`.
6. Expected result: `"world"`.

## Step 2: Deploy the main LicenseLogic contract

1. Reset Studio storage.
2. Paste `contracts/license_logic.py`.
3. Deploy and wait for `FINALIZED`.
4. Copy the contract address and tx hash into `deployment/deployed_addresses.json`.

## Step 3: Verify `register_work`

Use:

- `work_url`: `https://en.wikipedia.org/wiki/Photosynthesis`
- `work_desc`: `Wikipedia article on photosynthesis covering light-dependent reactions and the Calvin cycle, written as a canonical original reference for infringement analysis.`
- `license_price`: `1000000000000000000`
- `penalty_amount`: `5000000000000000000`

Expected:

- Return value `work_0`
- `get_work("work_0")` shows the stored metadata

## Step 4: Verify `purchase_license`

1. Call `purchase_license("work_0")` with the exact license price.
2. Repeat with a higher payment to confirm overpayment accounting.
3. Call `get_withdrawable(<owner-address>)`.

Expected:

- First call returns `licensed`
- Repeat purchase from the same address returns `already_licensed`
- Owner withdrawable balance increases

## Step 5: Verify `scan_for_infringement`

1. Scan the work against itself:
   - `suspect_url`: `https://en.wikipedia.org/wiki/Photosynthesis`
2. Scan an unrelated page:
   - `suspect_url`: `https://en.wikipedia.org/wiki/Quantum_mechanics`
3. Scan a broken or unreachable page to verify `fetch_failed`.

Expected:

- Self-scan returns `INFRINGEMENT`
- Unrelated page returns `CLEAR` or `UNCERTAIN`
- Unreachable page returns `UNCERTAIN` with `fetch_failed=true`

## Step 6: Save verification artifacts

Store the following in `deployment/verification/`:

- Studio screenshot for register flow
- Studio screenshot for purchase flow
- Studio screenshot for scan flow
- Explorer/storage screenshot showing updated contract state

## Step 7: Seed demo data

Run:

```bash
python deployment/seed_data.py
```

This script prints the 3 recommended demo records and the exact method payloads to seed after deployment.
