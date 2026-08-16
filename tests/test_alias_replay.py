"""Alias replay tests — steward feedback.

Verifies that equivalent URL variants (tracking params, trailing slash,
uppercase host, http↔https, fragment, `www.` prefix) collapse to a single
canonical evidence identity, so a suspect cannot drain a bounty pool by
replaying aliases of the same page.
"""
from __future__ import annotations

import json

import pytest

from .conftest import addr_hex, verdict_json

ORIGINAL_URL = "https://example.com/target-article"
ALIAS_VARIANTS = [
    "https://example.com/target-article",                           # baseline
    "https://example.com/target-article/",                          # trailing slash
    "https://EXAMPLE.com/target-article",                           # uppercase host
    "https://www.example.com/target-article",                       # www prefix
    "http://example.com/target-article",                            # http scheme
    "https://example.com/target-article#section-2",                 # fragment
    "https://example.com/target-article?utm_source=twitter",        # utm param
    "https://example.com/target-article?utm_campaign=x&fbclid=y",   # multi tracking
    "https://example.com:443/target-article",                       # default port
]


def _mock_infringement(direct_vm, url_no_scheme: str) -> None:
    direct_vm.mock_web(url_no_scheme, {"status": 200, "body": "<html>copied text</html>"})
    direct_vm.mock_llm(
        "copyright/IP similarity judge",
        verdict_json("INFRINGEMENT", 88, "close copy", "structure, wording"),
    )


def test_canonical_url_view_collapses_all_variants(anchored_work):
    contract, _ = anchored_work
    canonicals = {contract.get_canonical_url(v) for v in ALIAS_VARIANTS}
    assert len(canonicals) == 1, f"aliases produced multiple canonicals: {canonicals}"


@pytest.mark.parametrize("alias", ALIAS_VARIANTS[1:])
def test_alias_hits_same_verdict_slot_as_baseline(
    anchored_work, direct_vm, direct_owner, direct_bob, alias
):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    direct_vm.value = 200
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    _mock_infringement(direct_vm, "example.com/target-article")

    baseline = json.loads(contract.scan_for_infringement(work_id, ALIAS_VARIANTS[0]))
    assert baseline["already_credited"] is False
    pool_after_first = int(contract.get_bounty(work_id))
    bal_after_first = int(contract.get_withdrawable(addr_hex(direct_bob)))
    assert pool_after_first < 200
    assert bal_after_first > 0
    assert int(contract.get_infringement_count(work_id)) == 1

    replay = json.loads(contract.scan_for_infringement(work_id, alias))
    assert replay["already_credited"] is True, (
        f"alias {alias!r} did not collide with baseline canonical key"
    )
    assert int(contract.get_bounty(work_id)) == pool_after_first
    assert int(contract.get_withdrawable(addr_hex(direct_bob))) == bal_after_first
    assert int(contract.get_infringement_count(work_id)) == 1


def test_alias_replay_across_all_variants_never_double_pays(
    anchored_work, direct_vm, direct_owner, direct_bob
):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    direct_vm.value = 500
    contract.deposit_infringement_bounty(work_id)
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    _mock_infringement(direct_vm, "example.com/target-article")

    first_pool = 500
    for i, variant in enumerate(ALIAS_VARIANTS):
        contract.scan_for_infringement(work_id, variant)
        pool = int(contract.get_bounty(work_id))
        if i == 0:
            assert pool < first_pool
            first_pool = pool
        else:
            assert pool == first_pool, (
                f"variant #{i} {variant!r} drained the pool from {first_pool} to {pool}"
            )

    assert int(contract.get_infringement_count(work_id)) == 1


def test_registered_url_alias_variants_also_receive_no_bounty(
    contract, direct_vm, direct_owner
):
    """The registered-URL shortcut must also be alias-safe."""
    direct_vm.sender = direct_owner
    work_id = contract.register_work(
        "https://blog.example.com/post-42",
        "A long enough description of the original post for validator work.",
        10,
        5,
    )

    direct_vm.mock_web(
        "blog.example.com/post-42",
        {"status": 200, "body": "<html>post</html>"},
    )
    direct_vm.mock_llm(
        "Summarize the following web page",
        "Post 42 on blog.example.com. Distinctive claim A. Distinctive claim B.",
    )
    contract.anchor_work(work_id)
    direct_vm.clear_mocks()

    direct_vm.value = 300
    contract.deposit_infringement_bounty(work_id)
    initial_pool = int(contract.get_bounty(work_id))
    direct_vm.value = 0

    alias_of_registered = [
        "https://blog.example.com/post-42",
        "http://blog.example.com/post-42/",
        "https://BLOG.example.com/post-42?utm_source=x",
        "https://www.blog.example.com/post-42#top",
    ]
    for alias in alias_of_registered:
        result = json.loads(contract.scan_for_infringement(work_id, alias))
        assert result["registered_url_shortcut"] is True, alias

    assert int(contract.get_bounty(work_id)) == initial_pool
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 0
    assert int(contract.get_infringement_count(work_id)) == 1


def test_scan_reverts_when_work_not_anchored(
    registered_work, direct_vm, direct_bob
):
    contract, work_id = registered_work
    direct_vm.sender = direct_bob
    _mock_infringement(direct_vm, "example.com/target-article")

    with direct_vm.expect_revert("call anchor_work"):
        contract.scan_for_infringement(work_id, ORIGINAL_URL)


def test_last_verdict_lookup_is_canonical(anchored_work, direct_vm, direct_bob):
    contract, work_id = anchored_work
    direct_vm.sender = direct_bob
    _mock_infringement(direct_vm, "example.com/target-article")

    contract.scan_for_infringement(work_id, ORIGINAL_URL)

    for alias in ALIAS_VARIANTS:
        v = json.loads(contract.get_last_verdict_by_url(work_id, alias))
        assert "error" not in v, f"lookup failed for {alias!r}: {v}"
        assert v["verdict"] == "INFRINGEMENT"
        assert v["canonical_url"] == contract.get_canonical_url(alias)


def test_is_scan_credited_view_is_canonical(anchored_work, direct_vm, direct_bob):
    contract, work_id = anchored_work
    direct_vm.sender = direct_bob
    _mock_infringement(direct_vm, "example.com/target-article")
    contract.scan_for_infringement(work_id, ORIGINAL_URL)

    for alias in ALIAS_VARIANTS:
        assert contract.is_scan_credited(work_id, alias) is True, alias
