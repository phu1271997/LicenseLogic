# Contributing to LicenseLogic

## Repo layout

```
contracts/       # Intelligent Contract (Python) + storage_test.py
frontend/        # Next.js 16 + genlayer-js
tests/           # pytest — 66 fast, 5 slow (studionet read-only)
deployment/      # deployed_addresses.json + seed scripts + logs
deliverables/    # Explorer submission draft + logo assets
docs/            # ADRs + sample scenarios
DEPLOY.md        # operator checklist
ARCHITECTURE.md  # system diagram + data model
ECONOMICS.md     # token flows
SECURITY.md      # threat model
CHANGELOG.md
```

## Development loop

```bash
# 1) create venv + install pinned dev deps
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# 2) fast tests (mocked LLM/web, no network)
.venv/bin/pytest tests -m 'not slow' -q

# 3) lint
.venv/bin/ruff check contracts/ tests/

# 4) frontend dev
cd frontend
npm install
npm run dev              # http://localhost:3000
npm run build            # production build
npm run lint

# 5) slow tests (read-only against live studionet)
LICENSELOGIC_CONTRACT=0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035 \
  .venv/bin/pytest tests -m slow -q
```

## Commit conventions

Prefix every commit with a type. Recognized types:

- `feat` — new user-visible feature
- `fix` — bug fix
- `test` — tests only
- `docs` — documentation only
- `ui` — frontend structural change
- `ux` — visual polish / theming
- `chore` — meta (env, deps, gitignore)
- `sec` — security-relevant change

Example:

```
sec(contract): add admin pause + owner scan-disable + tighter principle
```

Body should explain **why** the change matters, not just what it does.

## Adding a new contract method

1. Add the method with the correct decorator
   (`@gl.public.write` / `@gl.public.write.payable` / `@gl.public.view`).
2. Read from storage **before** any nondet block; capture via closure.
3. Guard every u256 mutation with `checked_add` / `checked_sub`.
4. If the method is non-deterministic, wrap the block in
   `gl.eq_principle.prompt_comparative` or
   `gl.vm.run_nondet(leader_fn, validator_fn)`. Never
   `gl.vm.run_nondet_unsafe` unless documented.
5. Add:
   - a happy-path test in `tests/`
   - at least one edge case (web fail, JSON parse fail, zero value, replay)
   - a `CHANGELOG.md` entry
6. Wire it into the frontend if it belongs in the user flow.
7. Redeploy on studionet, update `deployment/deployed_addresses.json`,
   update `NEXT_PUBLIC_CONTRACT_ADDRESS` on Vercel, redeploy frontend.

## Redeploying the contract

Contract storage is not migrated between deploys — every redeploy is a
fresh state. Plan for reseeding.

```bash
# 1) Studio: paste contracts/license_logic.py, Deploy, verify Result: SUCCESS
# 2) Copy new address into deployment/deployed_addresses.json (studionet slot)
# 3) Bump prior version to studionet_previous_vN
# 4) Update NEXT_PUBLIC_CONTRACT_ADDRESS on Vercel:
vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes
printf '0x<new-addr>' | vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production
# 5) Reseed
cd frontend
cp ../deployment/seed_studionet.mjs ./_seed.mjs
node _seed.mjs
rm _seed.mjs
# 6) Redeploy frontend
vercel deploy --prod --yes
vercel alias set <new-hash>.vercel.app license-logic.vercel.app
```

## Style

- Python: `ruff` with the ruleset pinned in `ruff.toml`; run `ruff check`
  before pushing.
- TypeScript: `next lint` + strict TS settings; no `any` outside SDK
  boundaries.
- Never store `int` in storage — use `bigint` or a sized int (R14).
- Every `TreeMap` key is `str` at the calldata boundary (R19).
