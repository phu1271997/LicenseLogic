# Deployment Guide

## Deploy Procedure

1. Open https://studio.genlayer.com/run-debug
2. Settings → Reset Storage → Confirm
3. Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
4. **Deploy `storage_test.py` first:**
   - Paste the contents of `contracts/storage_test.py` into the editor
   - Click Deploy
   - Call `set_value` with key=`"hello"`, value=`"world"`
   - Call `get_value` with key=`"hello"` — verify it returns `"world"`
   - Click the transaction in the sidebar and confirm `Result: SUCCESS`
5. **If storage_test succeeds, deploy `license_logic.py`:**
   - Reset storage again (Settings → Reset Storage)
   - Paste the contents of `contracts/license_logic.py` into the editor
   - Click Deploy
   - Click the deploy transaction — confirm `Result: SUCCESS` (not just `Status: FINALIZED`)
6. Test with the inputs from [test_inputs.md](test_inputs.md)

## Pre-Deploy Checklist

- [x] Line 1 is exactly `# v0.2.16`
- [x] Line 2 is the `# { "Depends": ... }` comment
- [x] `__init__` sets ONLY scalars (`self.admin`, `self.work_counter`) — no TreeMap/DynArray assignment
- [x] No `float` in any public method signature — all money/scores use `int`/`u256`
- [x] All storage uses `TreeMap[K,V]` — no `dict`/`list` in storage or signatures
- [x] Public methods return only allowed types (`str`, `u256`, `Address`)
- [x] Main class is `Contract(gl.Contract)`
- [x] Every `gl.nondet.*` call is inside `gl.vm.run_nondet_unsafe`
- [x] `validator_fn` checks verdict bucket, never exact LLM output equality
- [x] LLM JSON is cleaned, key-aliased, and validated; garbage raises `gl.UserError`
- [x] Untrusted web content is delimited with `<<<UNTRUSTED_WEB_CONTENT>>>` markers

## Troubleshooting — The 7 Rules

| Symptom | Rule | Fix |
|---------|------|-----|
| `Contract Queues not found` / `IdlenessPhase not found` / `RevealingPhase not found` | Rule 1 | First line must be exactly `# v0.2.16`, second line must be the Depends comment |
| `AssertionError: Is right the same storage type? TreeMap <- TreeMap` | Rule 2 | Remove any `self.field = TreeMap()` or `self.field = DynArray()` from `__init__` |
| Deploy error mentioning `float` | Rule 3 | Replace all `float` params/returns with `int` or `u256` |
| Type error on method params or returns | Rule 4 | Only use `str`, `bool`, `bytes`, `int`, `u8`-`u256`, `i8`-`i256`, `Address`, `DynArray[T]`, `TreeMap[K,V]` |
| Storage-related errors at runtime | Rule 5 | Use `TreeMap`/`DynArray` for all storage, never `dict`/`list` |
| Contract not found / class not recognised | Rule 6 | Class must be named exactly `Contract` and extend `gl.Contract` |
| Consensus failure / non-deterministic errors | Rule 7 | All `gl.nondet.*` calls must be inside `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` |
