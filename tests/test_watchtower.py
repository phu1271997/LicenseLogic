"""Phase 3 — v9 Watchtower: community bounty + suspect watchlist + takedown.

Covers:
- fund_bounty: anyone can top up the pool; per-contributor accounting.
- watchlist: owner-only add + soft-toggle; scanners get 2x bounty share
  when the scanned URL matches a canonical watchlist entry.
- takedown notice: guarded (INFRINGEMENT + no pending appeal + grace
  window past); idempotent re-issue.
"""
from __future__ import annotations

import json

import pytest

from .conftest import addr_hex, verdict_json


# ─────────────────────────────────────────────────────────────
# fund_bounty
# ─────────────────────────────────────────────────────────────


def test_fund_bounty_anyone_can_contribute(
    registered_work, direct_vm, direct_alice, direct_bob
):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    direct_vm.value = 500
    assert int(contract.fund_bounty(work_id)) == 500

    direct_vm.sender = direct_bob
    direct_vm.value = 300
    assert int(contract.fund_bounty(work_id)) == 800

    view = json.loads(contract.list_bounty_contributors(work_id))
    assert view["count"] == 2
    assert view["total_contributed"] == 800
    assert view["current_pool"] == 800


def test_fund_bounty_repeat_contributor_aggregates(
    registered_work, direct_vm, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    contract.fund_bounty(work_id)
    direct_vm.value = 250
    contract.fund_bounty(work_id)
    view = json.loads(contract.list_bounty_contributors(work_id))
    assert view["count"] == 1
    assert view["contributors"][0]["amount"] == 350


def test_fund_bounty_rejects_zero_value(registered_work, direct_vm, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with pytest.raises(Exception) as exc:
        contract.fund_bounty(work_id)
    assert "greater than 0" in str(exc.value)


def test_fund_bounty_rejects_missing_work(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    with pytest.raises(Exception) as exc:
        contract.fund_bounty("work_999")
    assert "does not exist" in str(exc.value)


# ─────────────────────────────────────────────────────────────
# watchlist
# ─────────────────────────────────────────────────────────────


def test_add_watchlist_owner_only(registered_work, direct_vm, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.add_watchlist_url(work_id, "https://example.com/leak")
    assert "Only the work owner" in str(exc.value)


def test_add_watchlist_stores_canonical(registered_work, direct_vm, direct_owner):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    idx = int(contract.add_watchlist_url(work_id, "https://Www.EXAMPLE.com/leak/?utm_source=x"))
    assert idx == 0
    view = json.loads(contract.list_watchlist(work_id))
    assert view["count"] == 1
    assert view["entries"][0]["canonical_url"] == "https://example.com/leak"
    assert view["entries"][0]["active"] is True


def test_add_watchlist_rejects_duplicate_canonical(
    registered_work, direct_vm, direct_owner
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_watchlist_url(work_id, "https://example.com/leak")
    with pytest.raises(Exception) as exc:
        contract.add_watchlist_url(work_id, "https://example.com/leak/?fbclid=abc")
    assert "already has this canonical URL" in str(exc.value)


def test_watchlist_soft_toggle(registered_work, direct_vm, direct_owner):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_watchlist_url(work_id, "https://example.com/leak")
    assert contract.set_watchlist_active(work_id, 0, False) is False
    view = json.loads(contract.list_watchlist(work_id))
    assert view["entries"][0]["active"] is False
    # is_on_watchlist reflects inactive state.
    assert contract.is_on_watchlist(work_id, "https://example.com/leak") is False


def test_watchlist_limit_enforced(registered_work, direct_vm, direct_owner):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    for i in range(20):
        contract.add_watchlist_url(work_id, f"https://example.com/leak/{i}")
    with pytest.raises(Exception) as exc:
        contract.add_watchlist_url(work_id, "https://example.com/leak/overflow")
    assert "Watchlist limit reached" in str(exc.value)


def test_watchlist_boost_doubles_bounty(
    anchored_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = anchored_work
    # Owner funds a small pool + puts a URL on the watchlist.
    direct_vm.sender = direct_owner
    direct_vm.value = 1000
    contract.deposit_infringement_bounty(work_id)
    contract.add_watchlist_url(work_id, "https://example.com/copy")

    # Scan the watchlisted URL to INFRINGEMENT.
    direct_vm.mock_web(
        "example.com/copy",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 90, "close copy", "shared phrasing"),
    )
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    record = json.loads(contract.scan_for_infringement(work_id, "https://example.com/copy"))
    assert record["verdict"] == "INFRINGEMENT"
    assert record["on_watchlist"] is True
    # Bronze payout would be 10 % of 1000 = 100; watchlist boost 2× = 200.
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 200
    # Pool drained by 200 → 800 left.
    assert int(contract.get_bounty(work_id)) == 800


def test_watchlist_boost_off_for_off_list_url(
    anchored_work, direct_vm, direct_owner, direct_alice
):
    """Same setup as above but scan a URL that is NOT on the watchlist —
    payout stays at the bronze 10 % baseline.
    """
    contract, work_id = anchored_work
    direct_vm.sender = direct_owner
    direct_vm.value = 1000
    contract.deposit_infringement_bounty(work_id)
    # NOTE: no add_watchlist_url call.

    direct_vm.mock_web(
        "example.com/copy",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 90, "close copy", "shared phrasing"),
    )
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    record = json.loads(contract.scan_for_infringement(work_id, "https://example.com/copy"))
    assert record["on_watchlist"] is False
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 100
    assert int(contract.get_bounty(work_id)) == 900


# ─────────────────────────────────────────────────────────────
# takedown notice
# ─────────────────────────────────────────────────────────────


def _drive_infringement(contract, direct_vm, scanner, url="https://example.com/dupe"):
    direct_vm.mock_web(
        "example.com/dupe",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 90, "close copy", "shared phrasing"),
    )
    direct_vm.sender = scanner
    direct_vm.value = 0
    return json.loads(contract.scan_for_infringement("work_0", url))


def test_takedown_requires_infringement(anchored_work, direct_vm, direct_owner):
    contract, work_id = anchored_work
    direct_vm.sender = direct_owner
    with pytest.raises(Exception) as exc:
        contract.issue_takedown_notice(work_id, "https://example.com/dupe")
    assert "No verdict" in str(exc.value)


def test_takedown_blocked_by_grace_window(
    anchored_work, direct_vm, direct_alice, direct_owner
):
    """Immediately after INFRINGEMENT, the grace window has not passed."""
    contract, work_id = anchored_work
    _drive_infringement(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_owner
    ready = json.loads(
        contract.takedown_ready(work_id, "https://example.com/dupe")
    )
    assert ready["ready"] is False
    assert ready["reason"] == "grace_window"
    with pytest.raises(Exception) as exc:
        contract.issue_takedown_notice(work_id, "https://example.com/dupe")
    assert "grace" in str(exc.value).lower()


def test_takedown_blocked_by_pending_appeal(
    anchored_work, direct_vm, direct_alice, direct_bob, direct_owner
):
    contract, work_id = anchored_work
    _drive_infringement(contract, direct_vm, direct_alice)
    # Bob files an appeal — leaves it pending.
    direct_vm.sender = direct_bob
    direct_vm.value = 50  # penalty=25 in fixture, stake=2*penalty=50
    contract.file_appeal(work_id, "https://example.com/dupe")

    direct_vm.sender = direct_owner
    direct_vm.value = 0
    ready = json.loads(
        contract.takedown_ready(work_id, "https://example.com/dupe")
    )
    assert ready["reason"] == "appeal_pending"
    with pytest.raises(Exception) as exc:
        contract.issue_takedown_notice(work_id, "https://example.com/dupe")
    assert "Appeal pending" in str(exc.value)


def test_takedown_after_grace_stores_notice(
    anchored_work, direct_vm, direct_alice, direct_owner
):
    contract, work_id = anchored_work
    _drive_infringement(contract, direct_vm, direct_alice)

    # Burn epochs with cheap unrelated writes so the grace window elapses.
    # Each write ticks the epoch by 1. Grace = 25.
    direct_vm.sender = direct_owner
    for _ in range(26):
        contract.set_scans_disabled(work_id, False)

    ready = json.loads(
        contract.takedown_ready(work_id, "https://example.com/dupe")
    )
    assert ready["ready"] is True
    notice_json = contract.issue_takedown_notice(
        work_id, "https://example.com/dupe"
    )
    notice = json.loads(notice_json)
    assert notice["verdict"] == "INFRINGEMENT"
    assert notice["similarity"] == 90
    assert notice["canonical_url"] == "https://example.com/dupe"
    assert notice["work_id"] == work_id
    assert notice["notice_version"] == "1.0"


def test_takedown_reissue_is_idempotent(
    anchored_work, direct_vm, direct_alice, direct_owner
):
    contract, work_id = anchored_work
    _drive_infringement(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_owner
    for _ in range(26):
        contract.set_scans_disabled(work_id, False)

    first = json.loads(
        contract.issue_takedown_notice(work_id, "https://example.com/dupe")
    )
    second = json.loads(
        contract.issue_takedown_notice(work_id, "https://example.com/dupe")
    )
    # Same notice byte-for-byte (issued_at_epoch stays fixed).
    assert first == second


def test_takedown_blocked_by_overturned_appeal(
    anchored_work, direct_vm, direct_alice, direct_bob, direct_owner
):
    contract, work_id = anchored_work
    _drive_infringement(contract, direct_vm, direct_alice)

    direct_vm.sender = direct_bob
    direct_vm.value = 50
    contract.file_appeal(work_id, "https://example.com/dupe")

    direct_vm.mock_web(
        "example.com/dupe",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "appeals adjudicator",
        json.dumps({"outcome": "OVERTURNED", "similarity": 30, "reasoning": "fair use"}),
    )
    direct_vm.value = 0
    contract.resolve_appeal(work_id, "https://example.com/dupe")

    # Even after grace, overturned verdicts cannot be turned into takedowns.
    direct_vm.sender = direct_owner
    for _ in range(26):
        contract.set_scans_disabled(work_id, False)

    ready = json.loads(
        contract.takedown_ready(work_id, "https://example.com/dupe")
    )
    assert ready["ready"] is False
    with pytest.raises(Exception) as exc:
        contract.issue_takedown_notice(work_id, "https://example.com/dupe")
    assert "overturned" in str(exc.value).lower()
