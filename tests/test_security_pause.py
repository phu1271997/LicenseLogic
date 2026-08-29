"""M2 — Security Hardening Bundle v1.

Admin can freeze writes with pause() / unpause(). Owners can freeze scans
on a per-work basis with set_scans_disabled(). withdraw() stays available
even when paused, as an emergency safety valve.
"""
from __future__ import annotations

import pytest

from .conftest import CONTRACT_PATH


@pytest.fixture
def deployed(direct_deploy, direct_vm, direct_owner):
    """Deploy with direct_owner as the admin (first sender)."""
    direct_vm.sender = direct_owner
    return direct_deploy(CONTRACT_PATH), direct_owner


def test_pause_and_unpause_are_admin_only(deployed, direct_vm, direct_alice):
    contract, admin = deployed

    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.pause()
    assert "Only admin" in str(exc.value)

    # Admin can pause.
    direct_vm.sender = admin
    assert bool(contract.pause()) is True
    assert bool(contract.is_paused()) is True

    # Non-admin cannot unpause either.
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc2:
        contract.unpause()
    assert "Only admin" in str(exc2.value)

    # Admin can unpause.
    direct_vm.sender = admin
    assert bool(contract.unpause()) is False
    assert bool(contract.is_paused()) is False


def test_paused_blocks_register_purchase_bounty(deployed, direct_vm, direct_alice):
    contract, admin = deployed

    direct_vm.sender = admin
    contract.pause()

    # register_work is guarded
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.register_work(
            "https://example.com/paused-test",
            "A description long enough to satisfy the twenty character minimum here.",
            100,
            25,
        )
    assert "paused" in str(exc.value).lower()


def test_withdraw_still_works_when_paused(deployed, direct_vm, direct_owner, direct_alice):
    contract, admin = deployed

    # Set up a withdrawable balance via a completed purchase, then pause.
    direct_vm.sender = direct_owner
    work_id = contract.register_work(
        "https://example.com/pause-safety-valve",
        "Another sufficiently long description for the pause safety-valve test case.",
        50,
        10,
    )
    direct_vm.sender = direct_alice
    direct_vm.value = 50
    contract.purchase_license(work_id)
    direct_vm.value = 0

    direct_vm.sender = admin
    contract.pause()

    # Owner can still withdraw while contract is paused (safety valve).
    direct_vm.sender = direct_owner
    amount = int(contract.withdraw())
    assert amount == 50


def test_set_scans_disabled_is_owner_only(deployed, direct_vm, direct_owner, direct_alice):
    contract, _ = deployed
    direct_vm.sender = direct_owner
    work_id = contract.register_work(
        "https://example.com/scan-toggle",
        "Yet another long enough description to satisfy the registration length check.",
        10,
        5,
    )

    # A non-owner cannot toggle scans.
    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.set_scans_disabled(work_id, True)
    assert "owner" in str(exc.value).lower()

    # Owner can toggle both directions.
    direct_vm.sender = direct_owner
    assert bool(contract.set_scans_disabled(work_id, True)) is True
    assert bool(contract.get_scans_disabled(work_id)) is True
    assert bool(contract.set_scans_disabled(work_id, False)) is False
    assert bool(contract.get_scans_disabled(work_id)) is False


def test_disabled_scans_revert_with_message(anchored_work, direct_vm, direct_owner, direct_alice):
    contract, work_id = anchored_work

    direct_vm.sender = direct_owner
    contract.set_scans_disabled(work_id, True)

    direct_vm.sender = direct_alice
    with pytest.raises(Exception) as exc:
        contract.scan_for_infringement(work_id, "https://example.com/any-suspect")
    msg = str(exc.value)
    assert "disabled" in msg.lower()
    assert work_id in msg
