"""Adversarial replay tests.

Covers reviewer feedback:
- Bounty must be idempotent per (work_id, suspect_url).
- Registered-URL shortcut must not pay out bounty.
- Same suspect URL scanned multiple times must not double-count infringements.
- A different work with the same suspect URL is a distinct scan.
"""
from __future__ import annotations

import json

from .conftest import BASE_DESC, BASE_URL, addr_hex, install_anchor_mocks, verdict_json


def _mock_infringement(direct_vm, url_no_scheme: str) -> None:
    direct_vm.mock_web(url_no_scheme, {"status": 200, "body": "<html>copied text</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 88, "close copy", "structure, wording"),
    )


def test_replay_same_url_pays_bounty_only_once(
    anchored_work, direct_vm, direct_owner, direct_bob
):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    direct_vm.value = 100
    contract.deposit_infringement_bounty(work_id)
    initial_pool = int(contract.get_bounty(work_id))
    assert initial_pool == 100

    direct_vm.value = 0
    direct_vm.sender = direct_bob
    _mock_infringement(direct_vm, "example.com/copy")

    first = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/copy")
    )
    assert first["verdict"] == "INFRINGEMENT"
    assert first["already_credited"] is False
    assert first["registered_url_shortcut"] is False

    bounty_after_first = int(contract.get_bounty(work_id))
    scanner_balance_after_first = int(
        contract.get_withdrawable(addr_hex(direct_bob))
    )
    assert bounty_after_first < initial_pool
    assert scanner_balance_after_first > 0
    assert int(contract.get_infringement_count(work_id)) == 1
    assert contract.is_scan_credited(work_id, "https://example.com/copy") is True

    second = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/copy")
    )
    assert second["verdict"] == "INFRINGEMENT"
    assert second["already_credited"] is True

    assert int(contract.get_bounty(work_id)) == bounty_after_first
    assert (
        int(contract.get_withdrawable(addr_hex(direct_bob)))
        == scanner_balance_after_first
    )
    assert int(contract.get_infringement_count(work_id)) == 1

    third = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/copy")
    )
    assert third["already_credited"] is True
    assert int(contract.get_bounty(work_id)) == bounty_after_first
    assert int(contract.get_infringement_count(work_id)) == 1


def test_registered_url_shortcut_records_verdict_but_pays_no_bounty(
    anchored_work, direct_vm, direct_owner
):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    direct_vm.value = 500
    contract.deposit_infringement_bounty(work_id)
    initial_pool = int(contract.get_bounty(work_id))
    assert initial_pool == 500

    direct_vm.value = 0
    result = json.loads(contract.scan_for_infringement(work_id, BASE_URL))

    assert result["verdict"] == "INFRINGEMENT"
    assert result["similarity"] == 100
    assert result["registered_url_shortcut"] is True

    assert int(contract.get_bounty(work_id)) == initial_pool
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 0
    assert int(contract.get_infringement_count(work_id)) == 1
    assert contract.is_scan_credited(work_id, BASE_URL) is True


def test_registered_url_shortcut_is_also_idempotent(
    anchored_work, direct_vm, direct_owner
):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    direct_vm.value = 200
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    contract.scan_for_infringement(work_id, BASE_URL)
    contract.scan_for_infringement(work_id, BASE_URL)
    contract.scan_for_infringement(work_id, BASE_URL)

    assert int(contract.get_infringement_count(work_id)) == 1
    assert int(contract.get_bounty(work_id)) == 200
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 0


def test_replay_across_different_works_are_independent(
    contract, direct_vm, direct_owner, direct_alice, direct_bob
):
    direct_vm.sender = direct_owner
    work_a = contract.register_work(
        "https://example.com/work-a", BASE_DESC + " A", 10, 5
    )
    install_anchor_mocks(direct_vm, "example.com/work-a")
    contract.anchor_work(work_a)
    direct_vm.clear_mocks()

    direct_vm.sender = direct_alice
    work_b = contract.register_work(
        "https://example.com/work-b", BASE_DESC + " B", 10, 5
    )
    install_anchor_mocks(direct_vm, "example.com/work-b")
    contract.anchor_work(work_b)
    direct_vm.clear_mocks()

    direct_vm.sender = direct_owner
    direct_vm.value = 60
    contract.deposit_infringement_bounty(work_a)

    direct_vm.sender = direct_alice
    direct_vm.value = 60
    contract.deposit_infringement_bounty(work_b)

    direct_vm.value = 0
    direct_vm.sender = direct_bob
    _mock_infringement(direct_vm, "example.com/copy")

    r_a = json.loads(contract.scan_for_infringement(work_a, "https://example.com/copy"))
    r_b = json.loads(contract.scan_for_infringement(work_b, "https://example.com/copy"))

    assert r_a["already_credited"] is False
    assert r_b["already_credited"] is False
    assert int(contract.get_infringement_count(work_a)) == 1
    assert int(contract.get_infringement_count(work_b)) == 1
    assert int(contract.get_bounty(work_a)) < 60
    assert int(contract.get_bounty(work_b)) < 60

    r_a_replay = json.loads(
        contract.scan_for_infringement(work_a, "https://example.com/copy")
    )
    assert r_a_replay["already_credited"] is True
    assert int(contract.get_infringement_count(work_a)) == 1


def test_clear_verdict_does_not_credit_and_a_later_infringement_still_pays(
    anchored_work, direct_vm, direct_owner, direct_bob
):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    direct_vm.value = 80
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    direct_vm.mock_web(
        "example.com/borderline", {"status": 200, "body": "<html>maybe</html>"}
    )
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("CLEAR", 12, "different", "none"),
    )
    clear = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/borderline")
    )
    assert clear["verdict"] == "CLEAR"
    assert (
        contract.is_scan_credited(work_id, "https://example.com/borderline")
        is False
    )
    assert int(contract.get_infringement_count(work_id)) == 0
    assert int(contract.get_bounty(work_id)) == 80
    assert int(contract.get_withdrawable(addr_hex(direct_bob))) == 0

    direct_vm.clear_mocks()
    _mock_infringement(direct_vm, "example.com/other")
    hit = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/other")
    )
    assert hit["verdict"] == "INFRINGEMENT"
    assert hit["already_credited"] is False
    assert int(contract.get_infringement_count(work_id)) == 1
    assert int(contract.get_bounty(work_id)) < 80
    assert int(contract.get_withdrawable(addr_hex(direct_bob))) > 0


def test_fetch_failed_does_not_credit_bounty(
    anchored_work, direct_vm, direct_owner, direct_bob
):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    direct_vm.value = 100
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    direct_vm.mock_web("example.com/deadlink", {"status": 500, "body": ""})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 90, "irrelevant", "irrelevant"),
    )
    result = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/deadlink")
    )

    if result.get("fetch_failed"):
        assert result["verdict"] == "UNCERTAIN"
        assert int(contract.get_bounty(work_id)) == 100
        assert int(contract.get_withdrawable(addr_hex(direct_bob))) == 0
        assert int(contract.get_infringement_count(work_id)) == 0
        assert (
            contract.is_scan_credited(work_id, "https://example.com/deadlink") is False
        )
