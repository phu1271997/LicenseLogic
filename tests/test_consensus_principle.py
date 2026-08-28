from __future__ import annotations

import json

from .conftest import CONTRACT_PATH, verdict_json


def test_contract_source_uses_prompt_comparative():
    source = CONTRACT_PATH.read_text()

    assert "gl.eq_principle.prompt_comparative" in source
    assert "gl.vm.run_nondet_unsafe" not in source
    # No hand-written validator_fn that just returns True for any input.
    assert "def validator_fn" not in source


def test_consensus_principle_documents_adjacent_uncertain_rule():
    source = CONTRACT_PATH.read_text()

    assert "INFRINGEMENT and CLEAR are NEVER compatible" in source
    assert "UNCERTAIN is adjacent to both" in source
    # v6 tightened the similarity drift bound.
    assert "within 15 points" in source
    # v6 introduced multi-perspective reasoning.
    assert "perspectives object MUST be present" in source


def test_fetch_failure_returns_uncertain_without_increment(anchored_work):
    contract, work_id = anchored_work

    result = json.loads(contract.scan_for_infringement(work_id, "https://example.com/unreachable"))

    assert result["verdict"] == "UNCERTAIN"
    assert result["fetch_failed"] is True
    assert int(contract.get_infringement_count(work_id)) == 0


def test_similarity_bucket_normalization_prevents_conflicting_verdict(anchored_work, direct_vm):
    contract, work_id = anchored_work
    direct_vm.mock_web("example.com/highscore", {"status": 200, "body": "<html>same content</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("CLEAR", 85, "contradictory output", "same headings"),
    )

    result = json.loads(contract.scan_for_infringement(work_id, "https://example.com/highscore"))

    assert result["verdict"] == "INFRINGEMENT"
    assert result["similarity"] == 85

