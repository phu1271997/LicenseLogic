from __future__ import annotations

import json

from .conftest import verdict_json


def test_scan_happy_path_infringement_updates_storage(anchored_work, direct_vm):
    contract, work_id = anchored_work
    direct_vm.mock_web("example.com/suspect", {"status": 200, "body": "<html>copied text</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 88, "close copy", "structure, wording"),
    )

    result = json.loads(contract.scan_for_infringement(work_id, "https://example.com/suspect"))

    assert result["verdict"] == "INFRINGEMENT"
    assert result["similarity"] == 88
    assert int(contract.get_infringement_count(work_id)) == 1


def test_scan_happy_path_clear_does_not_increment_counter(anchored_work, direct_vm):
    contract, work_id = anchored_work
    direct_vm.mock_web("example.com/clear", {"status": 200, "body": "<html>different text</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("CLEAR", 12, "different", "none"),
    )

    result = json.loads(contract.scan_for_infringement(work_id, "https://example.com/clear"))

    assert result["verdict"] == "CLEAR"
    assert int(contract.get_infringement_count(work_id)) == 0


def test_scan_uncertain_does_not_increment_counter(anchored_work, direct_vm):
    contract, work_id = anchored_work
    direct_vm.mock_web("example.com/uncertain", {"status": 200, "body": "<html>mixed overlap</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("UNCERTAIN", 55, "borderline", "topic overlap"),
    )

    result = json.loads(contract.scan_for_infringement(work_id, "https://example.com/uncertain"))

    assert result["verdict"] == "UNCERTAIN"
    assert int(contract.get_infringement_count(work_id)) == 0


def test_scan_rejects_missing_work(contract, direct_vm):
    with direct_vm.expect_revert("does not exist"):
        contract.scan_for_infringement("work_404", "https://example.com/suspect")


def test_scan_rejects_invalid_url(anchored_work, direct_vm):
    contract, work_id = anchored_work
    with direct_vm.expect_revert("valid http(s) URL"):
        contract.scan_for_infringement(work_id, "notaurl")

