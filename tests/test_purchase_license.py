from __future__ import annotations

import pytest

from .conftest import addr_hex


def test_purchase_license_happy_path_exact_price(registered_work, direct_vm, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    direct_vm.value = 100

    assert contract.purchase_license(work_id) == "licensed"
    assert contract.has_license(work_id, addr_hex(direct_alice)) is True
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 0


def test_purchase_license_overpay_credits_owner(registered_work, direct_vm, direct_owner, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    direct_vm.value = 150

    contract.purchase_license(work_id)

    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 150


def test_purchase_license_rejects_underpayment(registered_work, direct_vm, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    direct_vm.value = 99

    with direct_vm.expect_revert("Insufficient payment"):
        contract.purchase_license(work_id)


def test_purchase_license_rejects_missing_work(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 100

    with direct_vm.expect_revert("does not exist"):
        contract.purchase_license("work_999")


def test_purchase_license_is_idempotent_for_same_buyer(registered_work, direct_vm, direct_owner, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    assert contract.purchase_license(work_id) == "licensed"

    direct_vm.value = 120
    assert contract.purchase_license(work_id) == "already_licensed"
    assert contract.has_license(work_id, addr_hex(direct_alice)) is True
    assert int(contract.get_withdrawable(addr_hex(direct_owner))) == 100
    assert int(contract.get_withdrawable(addr_hex(direct_alice))) == 120


def test_purchase_license_rejects_self_license(registered_work, direct_vm, direct_owner):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    direct_vm.value = 100

    with direct_vm.expect_revert("Owner cannot purchase"):
        contract.purchase_license(work_id)

