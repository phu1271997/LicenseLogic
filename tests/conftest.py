from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest


CONTRACT_PATH = Path(__file__).resolve().parent.parent / "contracts" / "license_logic.py"
BASE_DESC = "This is a sufficiently long original work description for direct-mode testing."
BASE_URL = "https://example.com/original"


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


@pytest.fixture
def contract(direct_deploy):
    return direct_deploy(CONTRACT_PATH)


@pytest.fixture
def registered_work(contract):
    work_id = contract.register_work(BASE_URL, BASE_DESC, 100, 25)
    return contract, work_id
