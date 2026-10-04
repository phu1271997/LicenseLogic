#!/usr/bin/env python3
"""Minimal deterministic seed for a freshly deployed LicenseLogic contract.

Registers a demo work + a transferable tier, sets a resale royalty, has a
second funded wallet buy the tier and list it for resale — so the live app's
Secondary Market view is non-empty. No nondet calls (fast, reliable). Keys are
read from the environment in-memory and never written to disk.

Usage:
    source ~/.genlayer/env.sh
    python3 scripts/seed_min.py --addr 0x...
"""
import argparse
import os
import sys

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

REG_URL = "https://docs.genlayer.com/"
REG_DESC = (
    "Official GenLayer developer documentation — intelligent-contracts overview, "
    "quickstart, GenVM and SDK reference. Stable public target for the demo."
)
PRICE = 1000
PENALTY = 5000
TIER_NAME = "transferable-30d"
TIER_PRICE = 1000
TIER_DUR = 200
ROYALTY_BPS = 1000
ASK = 2000


def wait(client, tx, label):
    try:
        client.wait_for_transaction_receipt(
            transaction_hash=tx, status="ACCEPTED", interval=3000, retries=80
        )
        print(f"    [{label}] accepted {tx}")
    except Exception as exc:  # noqa: BLE001
        print(f"    [{label}] wait note: {str(exc)[:160]} (tx {tx})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", required=True)
    a = ap.parse_args()
    addr = a.addr

    owner_pk = os.environ.get("GENLAYER_PRIVATE_KEY")
    buyer_pk = os.environ.get("GENLAYER_PRIVATE_KEY_2")
    if not owner_pk or not buyer_pk:
        print("ERROR: source ~/.genlayer/env.sh first", file=sys.stderr)
        return 1

    owner = create_account(owner_pk)
    buyer = create_account(buyer_pk)
    oc = create_client(chain=studionet, account=owner)
    bc = create_client(chain=studionet, account=buyer)
    print(f"contract: {addr}")
    print(f"owner:    {owner.address}")
    print(f"buyer:    {buyer.address}")

    before = int(oc.read_contract(address=addr, function_name="get_work_counter", args=[]))
    tx = oc.write_contract(
        address=addr, function_name="register_work",
        args=[REG_URL, REG_DESC, PRICE, PENALTY], value=0,
    )
    wait(oc, tx, "register")
    after = int(oc.read_contract(address=addr, function_name="get_work_counter", args=[]))
    work_id = f"work_{after - 1}"
    print(f"[register] {work_id} (counter {before} -> {after})")

    tx = oc.write_contract(
        address=addr, function_name="add_license_tier",
        args=[work_id, TIER_NAME, TIER_PRICE, TIER_DUR], value=0,
    )
    wait(oc, tx, "add_tier")
    tiers = oc.read_contract(address=addr, function_name="list_license_tiers", args=[work_id])
    print(f"[tiers] {tiers}")
    idx = 1  # first appended tier after the auto default tier_0

    tx = oc.write_contract(
        address=addr, function_name="set_tier_transferable",
        args=[work_id, idx, True], value=0,
    )
    wait(oc, tx, "transferable")

    tx = oc.write_contract(
        address=addr, function_name="set_resale_royalty_bps",
        args=[work_id, ROYALTY_BPS], value=0,
    )
    wait(oc, tx, "royalty")

    tx = bc.write_contract(
        address=addr, function_name="purchase_license_tier",
        args=[work_id, idx], value=TIER_PRICE,
    )
    wait(bc, tx, "buy_tier")

    tx = bc.write_contract(
        address=addr, function_name="list_for_resale",
        args=[work_id, ASK], value=0,
    )
    wait(bc, tx, "list_resale")

    listings = oc.read_contract(address=addr, function_name="list_resale_listings", args=[work_id])
    print(f"[resale] {listings}")
    print("\n[v] seed complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
