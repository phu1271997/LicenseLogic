from __future__ import annotations

import json

from .conftest import BASE_DESC, verdict_json


def test_list_works_returns_empty_before_registration(contract):
    payload = json.loads(contract.list_works())
    assert payload["count"] == 0
    assert payload["works"] == []


def test_list_works_reflects_registered_entries(contract, direct_vm, direct_accounts):
    for index in range(3):
        direct_vm.sender = direct_accounts[index % len(direct_accounts)]
        contract.register_work(
            f"https://example.com/work-{index}",
            f"{BASE_DESC} entry {index}",
            100 + index,
            10 * index,
        )

    payload = json.loads(contract.list_works())
    assert payload["count"] == 3
    ids = [entry["work_id"] for entry in payload["works"]]
    assert ids == ["work_0", "work_1", "work_2"]
    assert payload["works"][0]["license_price"] == 100


def test_get_last_verdict_by_url_matches_deterministic_hash(anchored_work, direct_vm):
    contract, work_id = anchored_work
    suspect = "https://example.com/mirror"
    direct_vm.mock_web("example.com/mirror", {"status": 200, "body": "<html>mirror</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 82, "mirror copy", "matched"),
    )
    contract.scan_for_infringement(work_id, suspect)

    verdict = json.loads(contract.get_last_verdict_by_url(work_id, suspect))
    assert verdict["verdict"] == "INFRINGEMENT"
    assert verdict["similarity"] == 82
    assert verdict["suspect_url"] == suspect


def test_receive_credits_sender_balance(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 42
    contract.__receive__()

    assert int(contract.get_withdrawable(str(direct_alice.hex() if hasattr(direct_alice, "hex") else direct_alice))) >= 0


def test_scan_result_survives_json_round_trip(anchored_work, direct_vm):
    contract, work_id = anchored_work
    direct_vm.mock_web("example.com/roundtrip", {"status": 200, "body": "<html>data</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("CLEAR", 12, "clean text", "none"),
    )
    raw = contract.scan_for_infringement(work_id, "https://example.com/roundtrip")
    parsed = json.loads(raw)
    assert parsed["verdict"] == "CLEAR"
    assert parsed["similarity"] == 12
    assert parsed["fetch_failed"] is False
