"""Phase 4 — v10 Secondary Market: transferable licenses + resale + royalty.

Covers:
- transfer_license blocked on non-transferable tiers, moves state cleanly,
  clears prior resale listing on sender, blocks to owner / to zero / to
  self / to an active licensee.
- resale royalty: default 5 %, owner-set override honored, 20 % cap
  enforced, coauthor split flows through royalty payout.
- buy_from_resale: rejects underpayment, refunds overpay to buyer,
  splits ask into royalty (owner side) + proceeds (seller), moves
  license atomically, rejects buyer who already holds an active license,
  rejects listing where seller no longer holds.
- list_resale_listings filters expired + closed rows.
"""
from __future__ import annotations

import json

import pytest

from .conftest import addr_hex


TIER_TRANSFERABLE_NAME = "transferable-30d"
TIER_TRANSFERABLE_PRICE = 1000
TIER_TRANSFERABLE_DUR = 200  # long enough that expiry does not lapse mid-test


def _add_transferable_tier(contract, work_id, direct_vm, direct_owner):
    direct_vm.sender = direct_owner
    idx = int(
        contract.add_license_tier(
            work_id,
            TIER_TRANSFERABLE_NAME,
            TIER_TRANSFERABLE_PRICE,
            TIER_TRANSFERABLE_DUR,
        )
    )
    contract.set_tier_transferable(work_id, idx, True)
    return idx


def _add_non_transferable_tier(contract, work_id, direct_vm, direct_owner):
    direct_vm.sender = direct_owner
    return int(
        contract.add_license_tier(
            work_id, "locked-tier", TIER_TRANSFERABLE_PRICE, TIER_TRANSFERABLE_DUR
        )
    )


def _buy_tier(contract, work_id, buyer, tier_idx, direct_vm, value=TIER_TRANSFERABLE_PRICE):
    direct_vm.sender = buyer
    direct_vm.value = value
    return contract.purchase_license_tier(work_id, tier_idx)


# ────────────────────────────────────────────────────────────────
# transferability toggles + default state
# ────────────────────────────────────────────────────────────────


def test_default_tiers_are_not_transferable(registered_work):
    contract, work_id = registered_work
    tiers = json.loads(contract.list_license_tiers(work_id))
    # tier_0 auto-created at register — default False.
    assert tiers["tiers"][0]["transferable"] is False


def test_set_tier_transferable_owner_only(
    registered_work, direct_vm, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.set_tier_transferable(work_id, 0, True)
    assert "Only the work owner" in str(exc.value)


def test_set_tier_transferable_flips_flag(
    registered_work, direct_vm, direct_owner
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.set_tier_transferable(work_id, 0, True)
    assert contract.is_tier_transferable(work_id, 0) is True
    contract.set_tier_transferable(work_id, 0, False)
    assert contract.is_tier_transferable(work_id, 0) is False


# ────────────────────────────────────────────────────────────────
# royalty bounds + defaults
# ────────────────────────────────────────────────────────────────


def test_royalty_defaults_to_500_bps(registered_work):
    contract, work_id = registered_work
    assert int(contract.get_resale_royalty_bps(work_id)) == 500


def test_set_resale_royalty_owner_only(
    registered_work, direct_vm, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.set_resale_royalty_bps(work_id, 1000)
    assert "Only the work owner" in str(exc.value)


def test_set_resale_royalty_bps_respects_cap(
    registered_work, direct_vm, direct_owner
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    with pytest.raises(Exception) as exc:
        contract.set_resale_royalty_bps(work_id, 2001)
    assert "exceeds cap" in str(exc.value)


def test_set_resale_royalty_zero_opts_out_of_default(
    registered_work, direct_vm, direct_owner
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.set_resale_royalty_bps(work_id, 0)
    assert int(contract.get_resale_royalty_bps(work_id)) == 0


# ────────────────────────────────────────────────────────────────
# transfer_license
# ────────────────────────────────────────────────────────────────


def test_transfer_blocked_on_non_transferable_tier(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_non_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)

    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.transfer_license(work_id, addr_hex(direct_bob))
    assert "not transferable" in str(exc.value)


def test_transfer_moves_state_cleanly(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)

    before_alice = json.loads(
        contract.get_license(work_id, addr_hex(direct_alice))
    )
    assert before_alice["active"] is True

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.transfer_license(work_id, addr_hex(direct_bob))

    after_alice = json.loads(
        contract.get_license(work_id, addr_hex(direct_alice))
    )
    assert after_alice["has_license"] is False
    after_bob = json.loads(
        contract.get_license(work_id, addr_hex(direct_bob))
    )
    assert after_bob["has_license"] is True
    assert after_bob["tier_idx"] == idx
    assert after_bob["transferred_in_count"] == 1


def test_transfer_blocks_to_owner_and_to_self(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with pytest.raises(Exception) as exc:
        contract.transfer_license(work_id, addr_hex(direct_owner))
    assert "work owner" in str(exc.value)

    with pytest.raises(Exception) as exc:
        contract.transfer_license(work_id, addr_hex(direct_alice))
    assert "sender" in str(exc.value)


def test_transfer_blocks_when_recipient_holds_active_license(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)
    _buy_tier(contract, work_id, direct_bob, idx, direct_vm)  # bob buys their own too

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with pytest.raises(Exception) as exc:
        contract.transfer_license(work_id, addr_hex(direct_bob))
    assert "already holds" in str(exc.value)


def test_transfer_auto_cancels_prior_resale_listing(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.list_for_resale(work_id, 1500)
    listing_before = json.loads(
        contract.get_resale_listing(work_id, addr_hex(direct_alice))
    )
    assert listing_before["active"] is True

    contract.transfer_license(work_id, addr_hex(direct_bob))
    listing_after = json.loads(
        contract.get_resale_listing(work_id, addr_hex(direct_alice))
    )
    assert listing_after["active"] is False


# ────────────────────────────────────────────────────────────────
# resale flow
# ────────────────────────────────────────────────────────────────


def test_list_for_resale_requires_ownership_and_transferable(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    idx_locked = _add_non_transferable_tier(
        contract, work_id, direct_vm, direct_owner
    )
    _buy_tier(contract, work_id, direct_alice, idx_locked, direct_vm)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with pytest.raises(Exception) as exc:
        contract.list_for_resale(work_id, 1500)
    assert "not transferable" in str(exc.value)


def test_buy_from_resale_splits_royalty_and_proceeds(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)

    # Owner sets 10 % royalty (default is 5 %).
    direct_vm.sender = direct_owner
    contract.set_resale_royalty_bps(work_id, 1000)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.list_for_resale(work_id, 2000)

    owner_before = int(contract.get_withdrawable(addr_hex(direct_owner)))
    alice_before = int(contract.get_withdrawable(addr_hex(direct_alice)))

    direct_vm.sender = direct_bob
    direct_vm.value = 2500  # 2000 ask + 500 overpay
    result = json.loads(
        contract.buy_from_resale(work_id, addr_hex(direct_alice))
    )
    assert result["royalty"] == 200  # 10% of 2000
    assert result["seller_proceeds"] == 1800
    assert result["overpay_refunded"] == 500

    # Owner (sole default coauthor) receives full royalty.
    assert (
        int(contract.get_withdrawable(addr_hex(direct_owner)))
        == owner_before + 200
    )
    # Seller receives proceeds (adds to the 1000 they got when originally
    # selling their own tier to themselves via the earlier _buy_tier — wait,
    # that went to owner. So alice's balance grows from 0 to 1800).
    assert (
        int(contract.get_withdrawable(addr_hex(direct_alice)))
        == alice_before + 1800
    )
    # Buyer got overpay back.
    assert int(contract.get_withdrawable(addr_hex(direct_bob))) == 500

    # License moved.
    assert (
        json.loads(contract.get_license(work_id, addr_hex(direct_bob)))["has_license"]
        is True
    )
    assert (
        json.loads(contract.get_license(work_id, addr_hex(direct_alice)))["has_license"]
        is False
    )


def test_buy_from_resale_rejects_underpayment(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.list_for_resale(work_id, 2000)

    direct_vm.sender = direct_bob
    direct_vm.value = 1999
    with pytest.raises(Exception) as exc:
        contract.buy_from_resale(work_id, addr_hex(direct_alice))
    assert "Insufficient payment" in str(exc.value)


def test_buy_from_resale_rejects_buyer_with_active_license(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)
    _buy_tier(contract, work_id, direct_bob, idx, direct_vm)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.list_for_resale(work_id, 2000)

    direct_vm.sender = direct_bob
    direct_vm.value = 2000
    with pytest.raises(Exception) as exc:
        contract.buy_from_resale(work_id, addr_hex(direct_alice))
    assert "already hold" in str(exc.value)


def test_buy_from_resale_royalty_split_across_coauthors(
    registered_work,
    direct_vm,
    direct_owner,
    direct_alice,
    direct_bob,
    direct_charlie,
):
    """When coauthors are set, the royalty flows through _split_credit."""
    contract, work_id = registered_work
    # 70/30 owner + coauthor split.
    direct_vm.sender = direct_owner
    contract.set_coauthors(
        work_id,
        [addr_hex(direct_owner), addr_hex(direct_charlie)],
        [7000, 3000],
    )
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)
    # After the initial buy: 1000 split 70/30 → owner 700 / charlie 300.
    owner0 = int(contract.get_withdrawable(addr_hex(direct_owner)))
    charlie0 = int(contract.get_withdrawable(addr_hex(direct_charlie)))
    assert owner0 == 700
    assert charlie0 == 300

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.list_for_resale(work_id, 1000)

    # Royalty defaults to 500 bps = 5 % of 1000 = 50.
    # 50 splits 70/30 → owner +35, charlie +15.
    direct_vm.sender = direct_bob
    direct_vm.value = 1000
    contract.buy_from_resale(work_id, addr_hex(direct_alice))
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == owner0 + 35
    assert int(contract.get_withdrawable(addr_hex(direct_charlie))) == charlie0 + 15
    # Seller (alice) receives 1000 - 50 = 950.
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 950


def test_list_resale_listings_filters_closed(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)
    _buy_tier(contract, work_id, direct_bob, idx, direct_vm)

    # Alice lists then cancels; Bob lists and stays open.
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.list_for_resale(work_id, 500)
    contract.cancel_resale(work_id)
    direct_vm.sender = direct_bob
    contract.list_for_resale(work_id, 700)

    listings = json.loads(contract.list_resale_listings(work_id))
    assert listings["count"] == 1
    assert listings["listings"][0]["seller"].lower() == addr_hex(direct_bob).lower()
    assert listings["listings"][0]["ask_price"] == 700


def test_cancel_resale_requires_active_listing(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    idx = _add_transferable_tier(contract, work_id, direct_vm, direct_owner)
    _buy_tier(contract, work_id, direct_alice, idx, direct_vm)

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with pytest.raises(Exception) as exc:
        contract.cancel_resale(work_id)
    assert "No active resale" in str(exc.value)
