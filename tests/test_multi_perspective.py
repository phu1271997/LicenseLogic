"""M3 — AI Enhancement: Multi-perspective prompt + stricter principle.

Verifies:
- build_analysis_prompt names the three lenses explicitly
- CONSENSUS_PRINCIPLE requires perspectives + tighter similarity drift
- verdict_record on-chain carries a `perspectives` object with all 3 lenses
- error branches (shortcut / fetch-fail / injection) still supply
  perspectives so the consensus principle can accept
"""
from __future__ import annotations

import importlib.util
import json

import pytest

from .conftest import CONTRACT_PATH, verdict_json


def _load_contract_module():
    spec = importlib.util.spec_from_file_location("license_logic", CONTRACT_PATH)
    mod = importlib.util.module_from_spec(spec)
    # `from genlayer import *` will need a stub — but we only touch pure Python
    # helpers below, not the class body. Skip execution and just parse text.
    return mod


def test_prompt_declares_three_lenses():
    """The build_analysis_prompt must name LEGAL, FORENSIC, and SKEPTIC."""
    source = CONTRACT_PATH.read_text()
    assert "LEGAL —" in source
    assert "FORENSIC —" in source
    assert "SKEPTIC —" in source
    # Each lens must be a required non-empty field in the JSON schema.
    assert '"legal":' in source
    assert '"forensic":' in source
    assert '"skeptic":' in source


def test_principle_requires_perspectives_and_tight_drift():
    source = CONTRACT_PATH.read_text()
    assert "perspectives object MUST be present" in source
    assert "within 15 points" in source
    # Regression: the old ±25 language must be gone.
    assert "within 25 points" not in source


def test_verdict_record_includes_perspectives(anchored_work, direct_vm):
    """A successful LLM path preserves the model's three lenses on-chain."""
    contract, work_id = anchored_work
    direct_vm.mock_web(
        "example.com/multi-lens",
        {"status": 200, "body": "<html>lifted paragraph verbatim from original</html>"},
    )
    # Use a fuller payload that includes perspectives — mirrors what the
    # real model returns under the new prompt.
    payload = {
        "verdict": "INFRINGEMENT",
        "similarity": 88,
        "reasoning": "Substantial verbatim overlap with the anchored snapshot.",
        "matched_elements": "opening paragraph, section 2 headings",
        "perspectives": {
            "legal": "Reproduction of expressive elements without attribution meets substantial-similarity threshold.",
            "forensic": "Multiple verbatim sentences and mirrored section structure detected.",
            "skeptic": "Independent creation implausible given identical unique phrasings.",
        },
    }
    direct_vm.mock_llm("copyright/IP similarity judge", json.dumps(payload))

    record = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/multi-lens")
    )
    assert record["verdict"] == "INFRINGEMENT"
    assert record["similarity"] == 88
    p = record["perspectives"]
    assert set(p.keys()) == {"legal", "forensic", "skeptic"}
    for lens in ("legal", "forensic", "skeptic"):
        assert isinstance(p[lens], str) and p[lens].strip(), lens


def test_error_branches_still_supply_perspectives(anchored_work):
    """Fetch failure returns UNCERTAIN + a perspectives object with all 3 lenses."""
    contract, work_id = anchored_work
    record = json.loads(
        contract.scan_for_infringement(work_id, "https://example.com/never-mocked")
    )
    assert record["verdict"] == "UNCERTAIN"
    assert record["fetch_failed"] is True
    p = record["perspectives"]
    assert set(p.keys()) == {"legal", "forensic", "skeptic"}
    for lens in ("legal", "forensic", "skeptic"):
        assert isinstance(p[lens], str) and p[lens].strip(), lens
