#!/usr/bin/env python3
"""Emit reproducible demo payloads for post-deploy seeding.

This script intentionally avoids performing live network writes because the
required deployer wallet/session depends on the operator environment. Instead,
it prints the exact payloads to use in Studio or an SDK script after the new
contract address is finalized.
"""

from __future__ import annotations

import json


SAMPLE_WORKS = [
    {
        "title": "Machine Learning Blog Post",
        "work_url": "https://example.com/ml-blog-original",
        "work_desc": (
            "Original long-form article about supervised vs unsupervised "
            "machine learning, model evaluation, and common deployment pitfalls."
        ),
        "license_price": 10**18,
        "penalty_amount": 5 * 10**18,
    },
    {
        "title": "Original Song Lyrics",
        "work_url": "https://example.com/original-lyrics",
        "work_desc": (
            "Original song lyrics describing a night train, city lights, and a "
            "repeating chorus built around memory and distance."
        ),
        "license_price": 5 * 10**17,
        "penalty_amount": 2 * 10**18,
    },
    {
        "title": "Open-source SDK Code",
        "work_url": "https://github.com/example/original-sdk/blob/main/src/index.ts",
        "work_desc": (
            "Reference SDK entrypoint covering wallet setup, API client "
            "construction, and typed contract calls for a blockchain app."
        ),
        "license_price": 2 * 10**18,
        "penalty_amount": 8 * 10**18,
    },
]


def main() -> None:
    print("# Seed payloads for LicenseLogic")
    print()
    for index, sample in enumerate(SAMPLE_WORKS, start=1):
        print(f"## Sample {index}: {sample['title']}")
        print(
            json.dumps(
                {
                    "method": "register_work",
                    "args": [
                        sample["work_url"],
                        sample["work_desc"],
                        sample["license_price"],
                        sample["penalty_amount"],
                    ],
                },
                indent=2,
            )
        )
        print()


if __name__ == "__main__":
    main()
