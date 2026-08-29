"""Slow read-only probes against the live studionet contract.

Runs against the deployed LicenseLogic address using nothing but view calls,
so no funded wallet is needed. Confirms the on-chain state a reviewer will
see when they open the app.

Enable with:
    LICENSELOGIC_CONTRACT=0x19DaA769E49a42eEC3808c6c895eC266aD5CE9E2 \\
        .venv/bin/pytest tests -m slow -q

If LICENSELOGIC_CONTRACT is unset, tests are skipped so the fast suite stays
network-free.
"""
from __future__ import annotations

import json
import os

import pytest

DEFAULT_CONTRACT = "0x19DaA769E49a42eEC3808c6c895eC266aD5CE9E2"
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
    assert counter >= 1, f"expected at least 1 seeded work, got {counter}"


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


def test_seeded_work_0_is_anchored(gl_client, addr):
    raw = _read(gl_client, addr, "get_work", ["work_0"])
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    assert parsed.get("work_id") == "work_0"
    assert parsed.get("anchored") is True, "work_0 should be anchored — reseed if not"
    assert parsed.get("infringement_count", 0) >= 1


def test_seeded_clear_verdict_has_perspectives(gl_client, addr):
    """v6 seed writes a CLEAR verdict on work_0 for example.com — with perspectives."""
    for wid in ("work_0", "work_1", "work_3"):
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
            p = parsed.get("perspectives") or {}
            assert set(p.keys()) >= {"legal", "forensic", "skeptic"}, p
            for lens in ("legal", "forensic", "skeptic"):
                assert isinstance(p[lens], str) and p[lens].strip(), lens
            return
    pytest.skip("no CLEAR verdict on chain yet — run deployment/seed_studionet.mjs")


def test_v6_pause_view_exists(gl_client, addr):
    """v6 exposed a `is_paused` view. Live contract should return False by default."""
    raw = _read(gl_client, addr, "is_paused")
    assert bool(raw) is False, "contract unexpectedly paused on studionet"


def test_v6_scans_disabled_view_exists(gl_client, addr):
    """v6 exposed per-work scan-disable state; default is False."""
    raw = _read(gl_client, addr, "get_scans_disabled", ["work_0"])
    assert bool(raw) is False, "work_0 unexpectedly has scans disabled"
