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


def test_perpetual_tier_overrides_expiry(
    registered_work, direct_vm, direct_owner, direct_alice
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    contract.add_license_tier(work_id, "short", 10, 3)
    contract.add_license_tier(work_id, "forever", 20, 0)  # perpetual

    direct_vm.sender = direct_alice
    direct_vm.value = 10
    contract.purchase_license_tier(work_id, 1)

    direct_vm.value = 20
    result = json.loads(contract.purchase_license_tier(work_id, 2))
    assert result["status"] == "renewed"
    assert result["expires_at"] == 0  # perpetual overrides

    view = json.loads(contract.get_license(work_id, addr_hex(direct_alice)))
    assert view["active"] is True
    assert view["expires_at"] == 0


def test_tier_limit_enforced(registered_work, direct_vm, direct_owner):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    # tier_0 already there; add up to the limit.
    for i in range(1, 8):
        contract.add_license_tier(work_id, f"t{i}", 100 + i, i)
    with pytest.raises(Exception) as exc:
        contract.add_license_tier(work_id, "overflow", 999, 999)
    assert "Tier limit reached" in str(exc.value)
