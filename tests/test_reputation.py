"""F2 (Phase 2) — Scanner reputation.

Every honest INFRINGEMENT scan (real path, not URL shortcut) bumps
scanner_honest[addr]. Every appeal that overturns a verdict bumps
scanner_overturned[addr]. reputation_tier() reads:

    honest >= 10, overturned == 0        -> gold
    honest >= 20, overturned <= 1        -> gold
    honest >= 3,  overturned <= 1        -> silver
    otherwise                            -> bronze

Payout share follows tier: bronze 10 %, silver 15 %, gold 20 %.
"""
from __future__ import annotations

import json

from .conftest import addr_hex, verdict_json


def _scan(contract, direct_vm, url_no_scheme: str, sender):
    direct_vm.mock_web(url_no_scheme, {"status": 200, "body": "<html>copy</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 85, "copy", "many"),
    )
    direct_vm.sender = sender
    direct_vm.value = 0
    contract.scan_for_infringement("work_0", f"https://{url_no_scheme}")


def test_new_scanner_is_bronze(anchored_work, direct_bob):
    contract, _ = anchored_work
    rep = json.loads(contract.get_scanner_reputation(addr_hex(direct_bob)))
    assert rep["honest_scans"] == 0
    assert rep["overturned_scans"] == 0
    assert rep["tier"] == "bronze"
    assert rep["bounty_share_pct"] == 10


def test_bronze_gets_10pct_payout(anchored_work, direct_vm, direct_owner, direct_alice):
    contract, work_id = anchored_work
    # Owner funds a 1000-wei bounty pool.
    direct_vm.sender = direct_owner
    direct_vm.value = 1000
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    _scan(contract, direct_vm, "example.com/one", direct_alice)
    # Bronze share: 10 % of 1000 = 100 wei.
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 100


def test_silver_tier_after_three_honest_hits(
    anchored_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = anchored_work
    direct_vm.sender = direct_owner
    direct_vm.value = 10_000
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    for i in range(3):
        _scan(contract, direct_vm, f"example.com/s{i}", direct_alice)

    rep = json.loads(contract.get_scanner_reputation(addr_hex(direct_alice)))
    assert rep["honest_scans"] == 3
    assert rep["tier"] == "silver"
    assert rep["bounty_share_pct"] == 15


def test_gold_tier_after_ten_clean_hits(
    anchored_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = anchored_work
    direct_vm.sender = direct_owner
    direct_vm.value = 1_000_000
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    for i in range(10):
        _scan(contract, direct_vm, f"example.com/g{i}", direct_alice)

    rep = json.loads(contract.get_scanner_reputation(addr_hex(direct_alice)))
    assert rep["honest_scans"] == 10
    assert rep["overturned_scans"] == 0
    assert rep["tier"] == "gold"
    assert rep["bounty_share_pct"] == 20


def test_url_shortcut_does_not_advance_reputation(
    anchored_work, direct_vm, direct_owner
):
    """Deterministic self-scan INFRINGEMENT must not bump honest count."""
    contract, work_id = anchored_work
    direct_vm.sender = direct_owner
    direct_vm.value = 0
    # Registered URL for anchored_work is example.com/original.
    contract.scan_for_infringement(work_id, "https://example.com/original")
    rep = json.loads(contract.get_scanner_reputation(addr_hex(direct_owner)))
    assert rep["honest_scans"] == 0, "shortcut hits do not prove judgment"
