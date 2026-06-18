from __future__ import annotations

import json

import pytest

from .conftest import BASE_DESC, BASE_URL


def test_register_work_happy_path(contract):
    work_id = contract.register_work(BASE_URL, BASE_DESC, 100, 25)

    data = json.loads(contract.get_work(work_id))
    assert work_id == "work_0"
    assert data["work_url"] == BASE_URL
    assert data["work_desc"] == BASE_DESC
    assert data["license_price"] == 100
    assert data["penalty_amount"] == 25
    assert int(contract.get_work_counter()) == 1


def test_register_work_allows_free_license_price(contract):
    work_id = contract.register_work(BASE_URL, BASE_DESC, 0, 25)
    data = json.loads(contract.get_work(work_id))

    assert data["license_price"] == 0


def test_register_work_allows_zero_penalty_with_warning(contract):
    work_id = contract.register_work(BASE_URL, BASE_DESC, 100, 0)
    data = json.loads(contract.get_work(work_id))

    assert data["penalty_amount"] == 0
    assert "informational only" in data["registration_warning"]


def test_register_work_rejects_empty_url(contract, direct_vm):
    with direct_vm.expect_revert("valid http(s) URL"):
        contract.register_work("", BASE_DESC, 100, 25)


def test_register_work_rejects_too_short_description(contract, direct_vm):
    with direct_vm.expect_revert("at least 20 characters"):
        contract.register_work(BASE_URL, "too short", 100, 25)


def test_register_work_rejects_too_long_description(contract, direct_vm):
    with direct_vm.expect_revert("at most 10000 characters"):
        contract.register_work(BASE_URL, "x" * 10001, 100, 25)


def test_register_work_multiple_registrations_increment_counter(contract):
    assert contract.register_work(BASE_URL, BASE_DESC, 100, 25) == "work_0"
    assert contract.register_work("https://example.com/second", BASE_DESC, 200, 50) == "work_1"
    assert int(contract.get_work_counter()) == 2

