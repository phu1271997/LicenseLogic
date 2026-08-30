"""F1 (Phase 2) — Appeal / Dispute Flow.

An INFRINGEMENT verdict can be appealed by staking 2 x penalty_amount.
resolve_appeal runs a second-look consensus and either OVERTURNS
(refund appellant, roll back count, slash scanner reputation) or UPHOLDS
(stake redirected to owner, scanner reputation confirmed).
"""
from __future__ import annotations

import json

import pytest

from .conftest import addr_hex, verdict_json


PENALTY = 25
STAKE = PENALTY * 2  # APPEAL_STAKE_MULT = 2


def _seed_infringement(contract, direct_vm, direct_alice, url="https://example.com/dupe"):
    """Register+anchor happens in `anchored_work`; drive a REAL INFRINGEMENT scan."""
    direct_vm.mock_web(
        "example.com/dupe",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 90, "close copy", "shared phrasing"),
    )
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    record = json.loads(contract.scan_for_infringement("work_0", url))
    assert record["verdict"] == "INFRINGEMENT"
    assert record["registered_url_shortcut"] is False


def test_file_appeal_requires_prior_infringement(anchored_work, direct_vm, direct_bob):
    contract, work_id = anchored_work
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    with pytest.raises(Exception) as exc:
        contract.file_appeal(work_id, "https://example.com/never-scanned")
    assert "No verdict found" in str(exc.value)


def test_file_appeal_uphold_stake_to_owner(
    anchored_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = anchored_work
    _seed_infringement(contract, direct_vm, direct_alice)
    assert int(contract.get_infringement_count(work_id)) == 1

    # Bob files an appeal.
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    filed = json.loads(contract.file_appeal(work_id, "https://example.com/dupe"))
    assert filed["state"] == "pending"

    # Re-scan comes back UPHELD.
    direct_vm.mock_web(
        "example.com/dupe",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "appeals adjudicator",
        json.dumps({"outcome": "UPHELD", "similarity": 80, "reasoning": "still lifted"}),
    )
    direct_vm.value = 0
    direct_vm.sender = direct_owner  # anyone can trigger resolve
    resolved = json.loads(contract.resolve_appeal(work_id, "https://example.com/dupe"))
    assert resolved["outcome"] == "UPHELD"

    # Stake goes to owner via withdrawable_balance.
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) >= STAKE
    # Scanner reputation confirmed (now honest=2 — one from the original scan
    # payout, one from the uphold).
    rep = json.loads(contract.get_scanner_reputation(addr_hex(direct_alice)))
    assert rep["honest_scans"] >= 2
    assert rep["overturned_scans"] == 0


def test_file_appeal_overturn_refunds_and_slashes(
    anchored_work, direct_vm, direct_alice, direct_bob
):
    contract, work_id = anchored_work
    _seed_infringement(contract, direct_vm, direct_alice)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.file_appeal(work_id, "https://example.com/dupe")

    direct_vm.mock_web(
        "example.com/dupe",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "appeals adjudicator",
        json.dumps({"outcome": "OVERTURNED", "similarity": 30, "reasoning": "actually fair use"}),
    )
    direct_vm.value = 0
    resolved = json.loads(contract.resolve_appeal(work_id, "https://example.com/dupe"))
    assert resolved["outcome"] == "OVERTURNED"

    # Appellant refunded the stake.
    assert int(contract.get_withdrawable(addr_hex(direct_bob))) >= STAKE
    # Infringement count rolled back.
    assert int(contract.get_infringement_count(work_id)) == 0
    # Scanner reputation slashed.
    rep = json.loads(contract.get_scanner_reputation(addr_hex(direct_alice)))
    assert rep["overturned_scans"] == 1


def test_original_scanner_cannot_appeal_own_verdict(
    anchored_work, direct_vm, direct_alice
):
    contract, work_id = anchored_work
    _seed_infringement(contract, direct_vm, direct_alice)

    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with pytest.raises(Exception) as exc:
        contract.file_appeal(work_id, "https://example.com/dupe")
    assert "Original scanner cannot appeal" in str(exc.value)


def test_appeal_rejects_underfunded_stake(
    anchored_work, direct_vm, direct_alice, direct_bob
):
    contract, work_id = anchored_work
    _seed_infringement(contract, direct_vm, direct_alice)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE - 1
    with pytest.raises(Exception) as exc:
        contract.file_appeal(work_id, "https://example.com/dupe")
    assert "Insufficient appeal stake" in str(exc.value)


def test_appeal_view_reports_state(anchored_work, direct_vm, direct_alice, direct_bob):
    contract, work_id = anchored_work
    _seed_infringement(contract, direct_vm, direct_alice)

    view_before = json.loads(contract.get_appeal(work_id, "https://example.com/dupe"))
    assert view_before["state"] == "none"

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.file_appeal(work_id, "https://example.com/dupe")

    view_after = json.loads(contract.get_appeal(work_id, "https://example.com/dupe"))
    assert view_after["state"] == "pending"
    assert view_after["stake"] == STAKE
    assert view_after["appellant"].lower() == addr_hex(direct_bob).lower()


def test_required_stake_view(anchored_work):
    contract, work_id = anchored_work
    required = int(contract.get_appeal_required_stake(work_id))
    assert required == PENALTY * 2
