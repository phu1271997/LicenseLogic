from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

CONTRACT_PATH = Path(__file__).resolve().parent.parent / "contracts" / "license_logic.py"
BASE_DESC = "This is a sufficiently long original work description for direct-mode testing."
BASE_URL = "https://example.com/original"
ANCHOR_SUMMARY_TEXT = (
    "The Original Work by A. Author. A short essay describing "
    "distinctive claim one and distinctive claim two."
)


def addr_hex(addr) -> str:
    if isinstance(addr, str):
        return addr
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    if hasattr(addr, "hex"):
        return "0x" + addr.hex()
    return str(addr)


def verdict_json(
    verdict: str,
    similarity: int,
    reasoning: str = "reasoning",
    matched_elements: str = "matched",
) -> str:
    return json.dumps(
        {
            "verdict": verdict,
            "similarity": similarity,
            "reasoning": reasoning,
            "matched_elements": matched_elements,
        }
    )


def prompt_canary(work_desc: str, suspect_text: str) -> str:
    material = f"{work_desc[:256]}::{suspect_text[:256]}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def install_anchor_mocks(direct_vm, url_no_scheme: str = "example.com/original") -> None:
    """Install broad mocks so a subsequent anchor_work call succeeds."""
    direct_vm.mock_web(
        url_no_scheme,
        {"status": 200, "body": "<html><h1>The Original Work</h1><p>Body</p></html>"},
    )
    direct_vm.mock_llm("Summarize the following web page", ANCHOR_SUMMARY_TEXT)


@pytest.fixture
def contract(direct_deploy):
    return direct_deploy(CONTRACT_PATH)


@pytest.fixture
def registered_work(contract):
    """Registered but NOT anchored. Use `anchored_work` when the test needs to scan."""
    work_id = contract.register_work(BASE_URL, BASE_DESC, 100, 25)
    return contract, work_id


@pytest.fixture
def anchored_work(registered_work, direct_vm, direct_owner):
    """Registered + anchored. Ready for scan_for_infringement."""
    contract, work_id = registered_work
    prior_sender = getattr(direct_vm, "sender", None)
    prior_value = getattr(direct_vm, "value", None)
    direct_vm.sender = direct_owner
    direct_vm.value = 0
    install_anchor_mocks(direct_vm)
    contract.anchor_work(work_id)
    direct_vm.clear_mocks()
    if prior_sender is not None:
        direct_vm.sender = prior_sender
    if prior_value is not None:
        direct_vm.value = prior_value
    return contract, work_id
