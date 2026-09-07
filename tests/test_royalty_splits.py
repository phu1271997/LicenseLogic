"""Phase 3 · F2 — Co-author royalty splits (v8).

Every license revenue and every UPHELD appeal stake credit is split by
the coauthor basis points registered for a work. If no coauthors are set,
the primary owner receives 100 % (legacy behavior).
"""
from __future__ import annotations

import json

import pytest

from .conftest import addr_hex, verdict_json


PENALTY = 25
STAKE = PENALTY * 2  # APPEAL_STAKE_MULT = 2


def test_default_split_is_owner_full(registered_work, direct_owner):
    contract, work_id = registered_work
    coauthors = json.loads(contract.get_coauthors(work_id))
    assert coauthors["count"] == 1
    assert coauthors["coauthors"][0]["address"].lower() == addr_hex(direct_owner).lower()
    assert coauthors["coauthors"][0]["bps"] == 10000
    assert coauthors["coauthors"][0]["default"] is True


def test_owner_only_set_coauthors(registered_work, direct_vm, direct_alice, direct_bob):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.set_coauthors(work_id, [addr_hex(direct_alice), addr_hex(direct_bob)], [5000, 5000])
    assert "Only the work owner" in str(exc.value)


def test_bps_must_sum_to_10000(registered_work, direct_vm, direct_owner, direct_alice, direct_bob):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    with pytest.raises(Exception) as exc:
        contract.set_coauthors(
            work_id, [addr_hex(direct_alice), addr_hex(direct_bob)], [4000, 5000]
        )
    assert "must sum to 10000" in str(exc.value) or "must sum to" in str(exc.value)


def test_split_credits_two_coauthors_proportionally(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.set_coauthors(
        work_id,
        [addr_hex(direct_alice), addr_hex(direct_bob)],
        [7000, 3000],
    )

    direct_vm.sender = direct_charlie
    direct_vm.value = 1000
    contract.purchase_license(work_id)

    # 70 / 30 split — alice gets 700, bob gets 300 (remainder to last).
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 700
    assert int(contract.get_withdrawable(addr_hex(direct_bob))) == 300
    # Owner (who is NOT a coauthor now) gets nothing.
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 0


def test_split_remainder_goes_to_last_coauthor(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
):
    """101 wei at 33/33/34 has rounding; the last coauthor absorbs the loss.

    3 addresses: alice 3333 bps, bob 3333 bps, charlie 3334 bps.
    On 101 wei: alice = 101*3333/10000 = 33; bob = same = 33;
    remainder to charlie = 101 - 33 - 33 = 35 (>= its 33.6 nominal share).
    Sum stays 101 exactly.
    """
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.set_coauthors(
        work_id,
        [addr_hex(direct_alice), addr_hex(direct_bob), addr_hex(direct_charlie)],
        [3333, 3333, 3334],
    )

    # Buyer must not be the owner. Reuse direct_charlie as buyer AND coauthor —
    # the flow credits withdrawable balances by address regardless.
    direct_vm.sender = direct_charlie
    direct_vm.value = 101
    contract.purchase_license(work_id)

    a = int(contract.get_withdrawable(addr_hex(direct_alice)))
    b = int(contract.get_withdrawable(addr_hex(direct_bob)))
    c = int(contract.get_withdrawable(addr_hex(direct_charlie)))
    assert a + b + c == 101, "no wei may be lost or minted"
    assert a == 33
    assert b == 33
    assert c == 35  # remainder absorbs rounding


def test_appeal_upheld_stake_splits_across_coauthors(
    anchored_work, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
):
    contract, work_id = anchored_work
    direct_vm.sender = direct_owner
    contract.set_coauthors(
        work_id,
        [addr_hex(direct_alice), addr_hex(direct_bob)],
        [6000, 4000],
    )

    # Alice scans and finds INFRINGEMENT.
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
    contract.scan_for_infringement(work_id, "https://example.com/copy")

    # Charlie appeals; re-scan UPHELDs.
    direct_vm.sender = direct_charlie
    direct_vm.value = STAKE
    contract.file_appeal(work_id, "https://example.com/copy")

    direct_vm.mock_web(
        "example.com/copy",
        {"status": 200, "body": "<html>near-verbatim copy of original</html>"},
    )
    direct_vm.mock_llm(
        "appeals adjudicator",
        json.dumps({"outcome": "UPHELD", "similarity": 80, "reasoning": "still lifted"}),
    )
    direct_vm.value = 0
    contract.resolve_appeal(work_id, "https://example.com/copy")

    # UPHELD stake splits 60/40 across coauthors.
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) >= (STAKE * 60 // 100)
    assert int(contract.get_withdrawable(addr_hex(direct_bob))) >= (STAKE * 40 // 100)
    # Sum must equal STAKE exactly.
    total = int(contract.get_withdrawable(addr_hex(direct_alice))) + int(
        contract.get_withdrawable(addr_hex(direct_bob))
    )
    # Alice also earned bounty from the honest scan, so subtract that noise:
    # we just assert the stake wasn't lost. The bounty pool starts empty in
    # this fixture, so no bounty was actually paid. Total should equal STAKE.
    assert total == STAKE


def test_max_coauthor_limit(registered_work, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    fake = "0x000000000000000000000000000000000000dEaD"
    fake2 = "0x000000000000000000000000000000000000BEEF"
    with pytest.raises(Exception) as exc:
        contract.set_coauthors(
            work_id,
            [addr_hex(direct_alice), addr_hex(direct_bob), addr_hex(direct_charlie), fake, fake2],
            [2000, 2000, 2000, 2000, 2000],
        )
    assert "1..4" in str(exc.value)


def test_set_coauthors_overwrites_prior(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.set_coauthors(
        work_id, [addr_hex(direct_alice), addr_hex(direct_bob)], [5000, 5000]
    )
    # Overwrite with a different set.
    contract.set_coauthors(work_id, [addr_hex(direct_charlie)], [10000])
    view = json.loads(contract.get_coauthors(work_id))
    assert view["count"] == 1
    assert view["coauthors"][0]["address"].lower() == addr_hex(direct_charlie).lower()


def test_epoch_ticks_on_writes(registered_work, direct_vm, direct_owner, direct_alice):
    contract, work_id = registered_work
    e0 = int(contract.get_epoch())
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    contract.purchase_license(work_id)
    e1 = int(contract.get_epoch())
    assert e1 > e0
    # Reads (get_epoch) must NOT tick.
    assert int(contract.get_epoch()) == e1
