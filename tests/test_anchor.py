"""Anchor workflow tests.

Covers reviewer feedback: "fetch and anchor the original work".
"""
from __future__ import annotations

import json

import pytest

from .conftest import BASE_DESC, BASE_URL


ANCHOR_SUMMARY_TEXT = (
    "The Original Work by A. Author. A short essay describing "
    "distinctive claim one and distinctive claim two."
)


def _install_anchor_mocks(direct_vm, url_no_scheme: str = "example.com/original") -> None:
    direct_vm.mock_web(
        url_no_scheme,
        {"status": 200, "body": "<html><h1>The Original Work</h1><p>Body</p></html>"},
    )
    direct_vm.mock_llm("Summarize the following web page", ANCHOR_SUMMARY_TEXT)


def test_new_work_is_unanchored_by_default(registered_work):
    contract, work_id = registered_work
    parsed = json.loads(contract.get_work(work_id))
    assert parsed["anchored"] is False
    assert parsed["anchor_summary"] == ""


def test_owner_can_anchor_and_summary_is_persisted(
    registered_work, direct_vm, direct_owner
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    _install_anchor_mocks(direct_vm)

    result = json.loads(contract.anchor_work(work_id))
    assert result["anchored"] is True
    assert result["summary"]
    assert result["anchored_url"] == BASE_URL

    view = json.loads(contract.get_work(work_id))
    assert view["anchored"] is True
    assert view["anchor_summary"]


def test_non_owner_cannot_anchor(registered_work, direct_vm, direct_alice):
    contract, work_id = registered_work
    direct_vm.sender = direct_alice
    _install_anchor_mocks(direct_vm)

    with direct_vm.expect_revert("Only the work owner can anchor"):
        contract.anchor_work(work_id)


def test_anchor_cannot_be_re_run_after_success(
    registered_work, direct_vm, direct_owner
):
    contract, work_id = registered_work
    direct_vm.sender = direct_owner
    _install_anchor_mocks(direct_vm)

    contract.anchor_work(work_id)

    with direct_vm.expect_revert("already anchored"):
        contract.anchor_work(work_id)


def test_anchor_reverts_when_fetch_fails(
    contract, direct_vm, direct_owner
):
    direct_vm.sender = direct_owner
    work_id = contract.register_work(
        "https://example.com/dead", BASE_DESC + " dead url", 10, 5
    )

    direct_vm.mock_web("example.com/dead", {"status": 500, "body": ""})
    direct_vm.mock_llm("Summarize the following web page", ANCHOR_SUMMARY_TEXT)

    try:
        contract.anchor_work(work_id)
    except Exception as exc:
        assert "Anchor failed" in str(exc) or "fetch" in str(exc).lower()
    else:
        view = json.loads(contract.get_work(work_id))
        assert view["anchored"] is False


def test_anchor_reverts_when_url_missing(contract, direct_vm, direct_owner):
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("does not exist"):
        contract.anchor_work("work_missing")
