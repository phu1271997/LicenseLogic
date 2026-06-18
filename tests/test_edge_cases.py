from __future__ import annotations

import json

from .conftest import BASE_DESC, BASE_URL, addr_hex


def test_missing_treemap_reads_return_safe_defaults(contract):
    assert int(contract.get_infringement_count("work_missing")) == 0
    assert json.loads(contract.get_last_verdict("work_missing", "hash"))["error"] == "No verdict found for this key"


def test_two_buyers_can_purchase_same_work(registered_work, direct_vm, direct_alice, direct_bob):
    contract, work_id = registered_work

    direct_vm.sender = direct_alice
    direct_vm.value = 100
    assert contract.purchase_license(work_id) == "licensed"

    direct_vm.sender = direct_bob
    direct_vm.value = 100
    assert contract.purchase_license(work_id) == "licensed"

    assert contract.has_license(work_id, addr_hex(direct_alice)) is True
    assert contract.has_license(work_id, addr_hex(direct_bob)) is True


def test_work_counter_overflow_rejects_gracefully(contract, direct_vm):
    contract.work_counter = type(contract.work_counter)((1 << 256) - 1)

    with direct_vm.expect_revert("u256 overflow"):
        contract.register_work(BASE_URL, BASE_DESC, 100, 25)


def test_bounty_payout_cap_prevents_negative_pool(registered_work, direct_vm):
    contract, work_id = registered_work
    direct_vm.value = 3
    contract.deposit_infringement_bounty(work_id)

    for index in range(6):
        direct_vm.clear_mocks()
        direct_vm.mock_web(f"example.com/repeat-{index}", {"status": 200, "body": "<html>repeat</html>"})
        direct_vm.mock_llm(
            "copyright/IP similarity judge",
            json.dumps(
                {
                    "verdict": "INFRINGEMENT",
                    "similarity": 90,
                    "reasoning": "repeat",
                    "matched_elements": "same",
                }
            ),
        )
        contract.scan_for_infringement(work_id, f"https://example.com/repeat-{index}")

    assert int(contract.get_bounty(work_id)) == 0

