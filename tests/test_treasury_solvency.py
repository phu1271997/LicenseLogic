from __future__ import annotations

import json
import random

from .conftest import BASE_DESC, verdict_json


def _sum_treemap_values(mapping) -> int:
    return sum(int(value) for _, value in mapping.items())


def test_randomized_accounting_invariant(contract, direct_vm, direct_accounts):
    random.seed(7)
    work_ids: list[str] = []

    for index in range(100):
        action = random.choice(["register", "purchase", "bounty", "scan"])

        if action == "register" or not work_ids:
            owner = direct_accounts[index % len(direct_accounts)]
            direct_vm.sender = owner
            work_id = contract.register_work(
                f"https://example.com/work-{index}",
                f"{BASE_DESC} #{index}",
                random.randint(0, 200),
                random.randint(0, 50),
            )
            work_ids.append(work_id)
            continue

        work_id = random.choice(work_ids)

        if action == "purchase":
            buyer = direct_accounts[(index + 3) % len(direct_accounts)]
            direct_vm.sender = buyer
            price = int(json.loads(contract.get_work(work_id))["license_price"])
            direct_vm.value = price + random.randint(0, 50)
            try:
                contract.purchase_license(work_id)
            except Exception:
                pass

        elif action == "bounty":
            owner_hex = json.loads(contract.get_work(work_id))["owner"]
            owner_bytes = bytes.fromhex(owner_hex[2:])
            direct_vm.sender = owner_bytes
            direct_vm.value = random.randint(1, 30)
            try:
                contract.deposit_infringement_bounty(work_id)
            except Exception:
                pass

        else:
            direct_vm.sender = direct_accounts[(index + 5) % len(direct_accounts)]
            url = f"https://example.com/suspect-{index}"
            direct_vm.clear_mocks()
            direct_vm.mock_web(url.replace("https://", ""), {"status": 200, "body": f"<html>{index}</html>"})
            direct_vm.mock_llm(
                "copyright/IP similarity judge",
                verdict_json(
                    random.choice(["INFRINGEMENT", "CLEAR", "UNCERTAIN"]),
                    random.randint(0, 100),
                    "randomized test",
                    "none",
                ),
            )
            contract.scan_for_infringement(work_id, url)

        reserved = _sum_treemap_values(contract.withdrawable_balance) + _sum_treemap_values(contract.infringement_bounty)
        assert reserved <= int(contract.get_total_received())


def test_bounty_payout_never_underflows(registered_work, direct_vm):
    contract, work_id = registered_work
    direct_vm.value = 9
    contract.deposit_infringement_bounty(work_id)

    for index in range(20):
        direct_vm.mock_web(f"example.com/hit-{index}", {"status": 200, "body": "<html>copy</html>"})
        direct_vm.mock_llm(
            "copyright/IP similarity judge",
            verdict_json("INFRINGEMENT", 90, "copy", "same"),
        )
        contract.scan_for_infringement(work_id, f"https://example.com/hit-{index}")

    assert int(contract.get_bounty(work_id)) >= 0
