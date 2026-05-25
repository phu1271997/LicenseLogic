# LicenseLogic

Autonomous IP licensing and infringement enforcement on GenLayer.

## What It Does

LicenseLogic is an Intelligent Contract that lets creators:

1. **Register** an original work (article, code, design) with a canonical URL and description
2. **License** the work — other users pay on-chain to obtain usage rights
3. **Scan** any suspect URL for infringement — the contract fetches the page, reads its content, and uses LLM consensus to judge whether it copies the registered work
4. **Enforce** automatically — confirmed infringements are recorded on-chain with similarity scores and reasoning

## GenLayer Powers Used

- **Live web rendering** (`gl.nondet.web.render`) — the contract reads arbitrary web pages at judgment time, not just static on-chain data
- **LLM-based semantic analysis** (`gl.nondet.exec_prompt`) — subjective similarity judgment that understands paraphrasing, structural copying, and content derivation
- **Optimistic Democracy consensus** (`gl.vm.run_nondet_unsafe`) — leader proposes a verdict, validators independently re-judge and confirm the verdict bucket matches

## Why Solidity Can't Do This

Traditional smart contracts (Solidity/EVM) are purely deterministic. They cannot:

- Fetch external web pages during execution
- Make subjective judgments about content similarity
- Handle the nuance of "is this a copy or just similar?"

LicenseLogic requires both **live web access** and **semantic reasoning** — capabilities unique to GenLayer's Intelligent Contracts.

## Project Structure

```
contracts/
  license_logic.py   — main Intelligent Contract
  storage_test.py    — minimal sanity contract (deploy first)
DEPLOY.md            — deployment procedure & troubleshooting
test_inputs.md       — sample inputs for Studio testing
```

## Quick Start

See [DEPLOY.md](DEPLOY.md) for the full deployment procedure.
