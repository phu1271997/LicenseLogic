from __future__ import annotations

import json
import os

import pytest

from .conftest import addr_hex, verdict_json


def test_direct_e2e_register_purchase_scan_verify(anchored_work, direct_vm, direct_owner, direct_alice):
    contract, work_id = anchored_work

    direct_vm.sender = direct_alice
    direct_vm.value = 100
    assert contract.purchase_license(work_id) == "licensed"

    direct_vm.clear_mocks()
    direct_vm.mock_web("example.com/e2e", {"status": 200, "body": "<html>same structure</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 91, "e2e copy", "same structure"),
    )
    verdict = json.loads(contract.scan_for_infringement(work_id, "https://example.com/e2e"))
    work = json.loads(contract.get_work(work_id))

    assert contract.has_license(work_id, addr_hex(direct_alice)) is True
    assert verdict["verdict"] == "INFRINGEMENT"
    assert work["infringement_count"] == 1
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 100


@pytest.mark.skipif(
    os.getenv("RUN_STUDIONET_TESTS") != "1",
    reason="Studionet integration is opt-in and requires live RPC/wallet setup.",
)
def test_studionet_e2e_placeholder():
    pytest.skip("Implement with hosted Studio/studionet credentials in CI or manual verification.")

