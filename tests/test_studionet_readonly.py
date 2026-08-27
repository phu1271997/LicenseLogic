"""Slow read-only probes against the live studionet contract.

Runs against the deployed LicenseLogic address using nothing but view calls,
so no funded wallet is needed. Confirms the on-chain state a reviewer will
see when they open the app.

Enable with:
    LICENSELOGIC_CONTRACT=0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035 \\
        .venv/bin/pytest tests -m slow -q

If LICENSELOGIC_CONTRACT is unset, tests are skipped so the fast suite stays
network-free.
"""
from __future__ import annotations

import json
import os

import pytest

DEFAULT_CONTRACT = "0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035"
CONTRACT_ADDR = os.getenv("LICENSELOGIC_CONTRACT", "")
NETWORK_ENABLED = bool(CONTRACT_ADDR) or os.getenv("RUN_STUDIONET_TESTS") == "1"

pytestmark = pytest.mark.slow


@pytest.fixture(scope="module")
def gl_client():
    if not NETWORK_ENABLED:
        pytest.skip("set LICENSELOGIC_CONTRACT to enable")
    try:
        from genlayer_py import create_account, create_client
        from genlayer_py.chains import studionet
    except ImportError as exc:
        pytest.skip(f"genlayer_py unavailable: {exc}")
    account = create_account()
    return create_client(chain=studionet, account=account)


@pytest.fixture(scope="module")
def addr() -> str:
    return CONTRACT_ADDR or DEFAULT_CONTRACT


def _read(client, addr, fn, args=None):
    return client.read_contract(address=addr, function_name=fn, args=args or [])


def test_work_counter_progresses(gl_client, addr):
    counter = int(_read(gl_client, addr, "get_work_counter"))
    assert counter >= 3, f"expected at least 3 seeded works, got {counter}"


def test_list_works_returns_json(gl_client, addr):
    raw = _read(gl_client, addr, "list_works")
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    assert isinstance(parsed, dict)
    assert "count" in parsed and "works" in parsed
    assert isinstance(parsed["works"], list)
    assert parsed["count"] == len(parsed["works"])


def test_canonical_url_view(gl_client, addr):
    """URL canonicalizer collapses aliases — evidence identity is stable."""
    raw = _read(
        gl_client,
        addr,
        "get_canonical_url",
        ["HTTPS://Www.EXAMPLE.com/a/?utm_source=x&fbclid=y#frag"],
    )
    canonical = raw if isinstance(raw, str) else str(raw)
    assert canonical == "https://example.com/a", f"got {canonical!r}"


def test_seeded_work_1_is_anchored(gl_client, addr):
    raw = _read(gl_client, addr, "get_work", ["work_1"])
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    assert parsed.get("work_id") == "work_1"
    assert parsed.get("anchored") is True, "work_1 should be anchored — reseed if not"
    assert parsed.get("infringement_count", 0) >= 1


def test_seeded_clear_verdict_readable(gl_client, addr):
    """Latest seed pass wrote a CLEAR verdict on work_3 for example.com."""
    for wid in ("work_3", "work_1"):
        raw = _read(
            gl_client,
            addr,
            "get_last_verdict_by_url",
            [wid, "https://example.com/"],
        )
        text = raw if isinstance(raw, str) else json.dumps(raw)
        if '"error"' in text:
            continue
        parsed = json.loads(text) if isinstance(text, str) else text
        if parsed.get("verdict") == "CLEAR":
            assert parsed.get("similarity", 100) < 40, parsed
            assert parsed.get("fetch_failed") is False
            return
    pytest.skip("no CLEAR verdict on chain yet — run deployment/seed_studionet.mjs")
