#!/usr/bin/env python3
"""Deploy contracts/license_logic.py to GenLayer studionet.

Usage:
    source ~/.genlayer/env.sh
    python3 scripts/deploy.py
"""
import json
import os
import sys
from pathlib import Path

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contracts" / "license_logic.py"


def addr_from_receipt(r):
    if not r:
        return None
    if isinstance(r, dict):
        return (
            r.get("data", {}).get("contract_address")
            or r.get("contract_address")
            or r.get("contractAddress")
            or r.get("to")
            or r.get("tx_data_decoded", {}).get("contract_address")
        )
    return getattr(r, "contract_address", None) or getattr(r, "contractAddress", None)


def main():
    key = os.environ.get("GENLAYER_PRIVATE_KEY")
    if not key or "REPLACE_ME" in key:
        print("ERROR: run `source ~/.genlayer/env.sh` first", file=sys.stderr)
        return 1

    account = create_account(key)
    client = create_client(chain=studionet, account=account)
    print("=" * 56)
    print(f"Deployer: {account.address}")
    print(f"Chain:    {studionet.name} (id={studionet.id})")
    print(f"Contract: {CONTRACT}")
    print("=" * 56)

    code = CONTRACT.read_text()
    client.get_contract_schema_for_code(code.encode())
    print("[+] schema OK, deploying...")
    tx = client.deploy_contract(code=code, account=account)
    print(f"    tx: {tx}")

    addr = None
    try:
        rcpt = client.wait_for_transaction_receipt(
            transaction_hash=tx, status="FINALIZED", interval=3000, retries=100
        )
        addr = addr_from_receipt(rcpt)
    except Exception as exc:  # noqa: BLE001
        print(f"[!] FINALIZED wait failed ({exc}); polling receipt...")
        rcpt = client.get_transaction_receipt(transaction_hash=tx)
        addr = addr_from_receipt(rcpt)

    if not addr:
        raise RuntimeError("no contract address in receipt")

    print(f"[v] deployed at: {addr}")
    print(f"    explorer: https://genlayer-explorer.vercel.app/address/{addr}")
    print(f"    tx hash:  {tx}")

    out = {
        "network": "studionet",
        "chainId": studionet.id,
        "deployer": account.address,
        "contract_address": addr,
        "tx": str(tx),
    }
    (ROOT / "deployment" / "last_deploy.json").write_text(json.dumps(out, indent=2))
    print("\n[v] wrote deployment/last_deploy.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
