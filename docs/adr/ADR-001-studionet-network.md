# ADR-001 — Deploy on studionet, not testnet

**Status:** accepted · **Date:** 2026-06-18 · **Supersedes:** —

## Context

GenLayer runs two hosted networks that a builder can target:

- **studionet** — GenLayer Studio's hosted chain. Faucet-free (GEN moves
  from the Studio Accounts panel), chain id `61999`, RPC
  `https://studio.genlayer.com/api`. Behaves the same as localnet for the
  builder — same GenVM, same nondet API.
- **testnet Bradbury** — the "real" testnet the LLM inference research is
  done on. Requires the public faucet at
  `testnet-faucet.genlayer.foundation`. Chain id differs. Faucet funds
  testnet only, not studionet.

The Portal Explorer differentiates them: studionet listings appear as
**Preview**, testnet listings as **Live**.

## Decision

LicenseLogic deploys to **studionet**. All references — contract,
frontend `chain`, funding source, seed script — point at studionet.

## Consequences

- Reviewers see the app as **Preview** on Portal. That is truthful; we
  never advertise it as Live.
- No wallet install is required for demos: the in-browser burner is
  auto-funded by the studionet provider.
- If the Foundation ever wants a Live listing, we redeploy to Bradbury,
  update `NEXT_PUBLIC_CONTRACT_ADDRESS`, and reseed there. The code path
  does not change; only chain object + funding change.

## Alternatives considered

- **Bradbury for the demo listing** — would give the "Live" badge but
  requires reviewers to install MetaMask, add the network, and use the
  public faucet before they can try anything. Onboarding friction
  outweighs the badge for a product whose main flow is triggering
  validator LLMs.
- **localnet only** — no public URL; disqualifies the Explorer entry.
