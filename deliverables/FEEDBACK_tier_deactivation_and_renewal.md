# Reviewer feedback — default-tier deactivation + cross-tier renewal

**Feedback (on the v8 license-marketplace milestone, commits `1bcfb13` / `6bb198f`):**

> Please make default-tier deactivation apply to both purchase methods. Define
> and enforce cross-tier renewal so time bought under a cheaper offer does not
> silently become time under a different offer; include contract tests for a
> disabled default-tier purchase through each method, same-tier renewal, and
> switching from a cheap long-duration tier to an expensive short-duration tier.

## Resolution — fixed in commit `7539e13`, tests in `b06a33e`

| | |
|---|---|
| Fix commit | `7539e13` — v10.1 reviewer fixes (tier gating) |
| Tests commit | `b06a33e` |
| Contract (studionet, live) | `0x2FE1B8C8c0E47a2a40F114f4e3cD8A6F817C8410` |
| Live app | https://license-logic-app-lovat.vercel.app |

### 1. Default-tier deactivation applies to BOTH purchase methods
`purchase_license` (legacy) previously fell back to the legacy price and still
sold when `tier_0` was deactivated. It now refuses exactly like
`purchase_license_tier`:

```python
if not self.tier_active.get(tier_key, False):
    raise gl.vm.UserError("Default tier is deactivated — purchase unavailable")
```

### 2. Cross-tier renewal is defined and enforced
`purchase_license_tier` no longer lets time bought under one offer silently
become time under another:
- **same tier, still active** → renew / stack the expiry;
- **a still-active license on a different tier** → **revert** (no silent
  re-labelling of bought time);
- **expired license** → treated as a fresh purchase on the requested tier.

```python
if still_active and current_tier != idx:
    raise gl.vm.UserError(
        f"Active license is on tier {current_tier}; renew that tier to extend it, "
        f"or wait for it to expire before switching to tier {idx} "
        f"(cross-tier renewal would silently convert bought time)"
    )
```
Validation runs before any funds move, so a rejected renewal leaves ownership,
royalty credits and balances unchanged.

### Contract tests (`tests/test_license_tiers.py`)
- `test_disabled_default_tier_blocks_both_purchase_methods` — a disabled default
  tier is refused through `purchase_license` **and** `purchase_license_tier`;
  no license created, no balance moved.
- `test_same_tier_renewal_stacks_time` — renewing the same tier extends (stacks)
  the expiry.
- `test_cross_tier_switch_while_active_reverts` — switching from a cheap
  long-duration tier to an expensive short-duration tier while active **reverts**,
  leaving tier, expiry and balances unchanged.

All tier tests pass (`gltest tests/test_license_tiers.py` → 13 passed).
