"""Phase 3 · F1 — Multi-tier license marketplace + expiry epochs (v8).

Covers:
- register_work auto-creates tier_0 from legacy license_price.
- add_license_tier / set_tier_active gating.
- purchase_license_tier price + inactive-tier revert.
- Time-bound licenses (duration_epochs) expire via the global epoch counter.
- Renewal of an existing license extends the expiry.
"""
from __future__ import annotations

import json

import pytest

from .conftest import addr_hex


def test_register_seeds_default_tier(registered_work):
    contract, work_id = registered_work
    tiers = json.loads(contract.list_license_tiers(work_id))
    assert tiers["count"] == 1
    default = tiers["tiers"][0]
    assert default["name"] == "default"
    assert default["price"] == 100
    assert default["duration_epochs"] == 0
    assert default["active"] is True


def test_owner_only_add_tier(registered_work, direct_vm, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.add_license_tier(work_id, "commercial", 500, 100)
    assert "Only the work owner" in str(exc.value)


def test_add_tier_appends_and_increments_count(registered_work, direct_vm, direct_owner):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    new_idx = int(contract.add_license_tier(work_id, "commercial", 500, 100))
    assert new_idx == 1
    tiers = json.loads(contract.list_license_tiers(work_id))
    assert tiers["count"] == 2
    commercial = tiers["tiers"][1]
    assert commercial["name"] == "commercial"
    assert commercial["price"] == 500
    assert commercial["duration_epochs"] == 100
    assert commercial["active"] is True


def test_tier_purchase_credits_owner_and_records_expiry(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "commercial", 500, 100)

    direct_vm.sender = direct_alice
    direct_vm.value = 500
    result = json.loads(contract.purchase_license_tier(work_id, 1))
    assert result["status"] == "licensed"
    assert result["tier_idx"] == 1
    # expires_at = current_epoch + 100
    assert result["expires_at"] == result["current_epoch"] + 100

    # Owner (default sole coauthor) receives full 500.
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 500

    license_view = json.loads(contract.get_license(work_id, addr_hex(direct_alice)))
    assert license_view["has_license"] is True
    assert license_view["active"] is True
    assert license_view["tier_idx"] == 1
    assert license_view["expires_at"] == result["expires_at"]


def test_tier_purchase_reverts_when_inactive(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "commercial", 500, 100)
    contract.set_tier_active(work_id, 1, False)

    direct_vm.sender = direct_alice
    direct_vm.value = 500
    with pytest.raises(Exception) as exc:
        contract.purchase_license_tier(work_id, 1)
    assert "inactive" in str(exc.value)


def test_tier_purchase_rejects_underpayment(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "commercial", 500, 100)
    direct_vm.sender = direct_alice
    direct_vm.value = 499
    with pytest.raises(Exception) as exc:
        contract.purchase_license_tier(work_id, 1)
    assert "Insufficient payment" in str(exc.value)


def test_time_bound_license_expires_via_epoch(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "short", 10, 3)  # expires after 3 more writes

    direct_vm.sender = direct_alice
    direct_vm.value = 10
    contract.purchase_license_tier(work_id, 1)
    assert contract.has_license(work_id, addr_hex(direct_alice)) is True

    # Advance the epoch via unrelated writes (any write ticks the epoch).
    direct_vm.sender = direct_bob
    direct_vm.value = 10
    for _ in range(3):
        contract.purchase_license_tier(work_id, 1)  # renews bob's license; ticks epoch

    # After enough epochs, alice's license should have lapsed.
    assert contract.has_license(work_id, addr_hex(direct_alice)) is False
    view = json.loads(contract.get_license(work_id, addr_hex(direct_alice)))
    assert view["has_license"] is True   # record still present
    assert view["active"] is False       # but expired


def test_renew_extends_expiry(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "short", 10, 5)

    direct_vm.sender = direct_alice
    direct_vm.value = 10
    first = json.loads(contract.purchase_license_tier(work_id, 1))
    first_exp = first["expires_at"]

    direct_vm.value = 10
    second = json.loads(contract.purchase_license_tier(work_id, 1))
    assert second["status"] == "renewed"
    assert second["expires_at"] > first_exp


def test_switch_to_perpetual_after_expiry(
    registered_work, direct_vm, direct_owner, direct_alice, direct_bob
):
    """A holder can switch to a perpetual tier only AFTER the current term
    lapses. (Switching while still active is rejected — see the cross-tier
    renewal tests below.) Once expired, the perpetual purchase starts fresh.
    """
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "short", 10, 3)
    contract.add_license_tier(work_id, "forever", 20, 0)  # perpetual

    direct_vm.sender = direct_alice
    direct_vm.value = 10
    contract.purchase_license_tier(work_id, 1)

    # Burn epochs so alice's short license lapses.
    direct_vm.sender = direct_bob
    direct_vm.value = 10
    for _ in range(3):
        contract.purchase_license_tier(work_id, 1)
    assert contract.has_license(work_id, addr_hex(direct_alice)) is False

    # Now alice switches to the perpetual tier — allowed because expired.
    direct_vm.sender = direct_alice
    direct_vm.value = 20
    result = json.loads(contract.purchase_license_tier(work_id, 2))
    assert result["status"] == "licensed"  # fresh, not a stacked renewal
    assert result["expires_at"] == 0       # perpetual

    view = json.loads(contract.get_license(work_id, addr_hex(direct_alice)))
    assert view["active"] is True
    assert view["tier_idx"] == 2
    assert view["expires_at"] == 0


# ────────────────────────────────────────────────────────────────
# v10 reviewer fixes — default-tier deactivation + cross-tier renewal
# ────────────────────────────────────────────────────────────────


def test_disabled_default_tier_blocks_both_purchase_methods(
    registered_work, direct_vm, direct_owner, direct_alice
):
    """Deactivating tier_0 must refuse BOTH purchase_license (legacy) and
    purchase_license_tier(0). Neither path may silently fall back to a sale,
    and a refused buy must leave ownership and balances unchanged.
    """
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.set_tier_active(work_id, 0, False)

    owner_before = int(contract.get_withdrawable(addr_hex(direct_owner)))

    # Legacy path.
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    with pytest.raises(Exception) as exc:
        contract.purchase_license(work_id)
    assert "deactivated" in str(exc.value).lower()

    # Tiered path.
    direct_vm.value = 100
    with pytest.raises(Exception) as exc:
        contract.purchase_license_tier(work_id, 0)
    assert "inactive" in str(exc.value).lower()

    # No license created, no money booked.
    assert contract.has_license(work_id, addr_hex(direct_alice)) is False
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == owner_before


def test_same_tier_renewal_stacks_time(
    registered_work, direct_vm, direct_owner, direct_alice
):
    """Renewing the SAME tier extends (stacks) the expiry — the defined,
    allowed form of renewal.
    """
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "monthly", 50, 30)

    direct_vm.sender = direct_alice
    direct_vm.value = 50
    first = json.loads(contract.purchase_license_tier(work_id, 1))
    direct_vm.value = 50
    second = json.loads(contract.purchase_license_tier(work_id, 1))
    assert second["status"] == "renewed"
    assert second["tier_idx"] == 1
    # Second term stacks on top of the first (minus the one epoch this write ticks).
    assert second["expires_at"] == first["expires_at"] + 30


def test_cross_tier_switch_while_active_reverts(
    registered_work, direct_vm, direct_owner, direct_alice
):
    """Switching from a cheap long-duration tier to an expensive short-duration
    tier while the license is still ACTIVE must REVERT, so time bought under the
    cheaper offer is never silently relabelled as the pricier offer. The refusal
    leaves ownership, the original expiry, and all balances unchanged.
    """
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    cheap_long = int(contract.add_license_tier(work_id, "cheap-long", 10, 100))
    pricey_short = int(contract.add_license_tier(work_id, "pricey-short", 500, 3))

    direct_vm.sender = direct_alice
    direct_vm.value = 10
    bought = json.loads(contract.purchase_license_tier(work_id, cheap_long))
    owner_after_buy = int(contract.get_withdrawable(addr_hex(direct_owner)))
    assert owner_after_buy == 10

    # Attempt the cross-tier switch while still active → revert.
    direct_vm.value = 500
    with pytest.raises(Exception) as exc:
        contract.purchase_license_tier(work_id, pricey_short)
    assert "tier" in str(exc.value).lower()

    # State unchanged: still on the cheap-long tier, same expiry.
    view = json.loads(contract.get_license(work_id, addr_hex(direct_alice)))
    assert view["tier_idx"] == cheap_long
    assert view["expires_at"] == bought["expires_at"]
    # The pricey payment was NOT booked to the owner, and alice got no credit.
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == owner_after_buy
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 0


def test_tier_limit_enforced(registered_work, direct_vm, direct_owner):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    # tier_0 already there; add up to the limit.
    for i in range(1, 8):
        contract.add_license_tier(work_id, f"t{i}", 100 + i, i)
    with pytest.raises(Exception) as exc:
        contract.add_license_tier(work_id, "overflow", 999, 999)
    assert "Tier limit reached" in str(exc.value)
