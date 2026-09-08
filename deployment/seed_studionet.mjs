#!/usr/bin/env node
// Reseed a freshly deployed LicenseLogic contract on studionet with a demo
// record that a reviewer can open and inspect. Idempotent for a given
// `.seed_pk` file: rerunning with the same key registers additional works,
// so delete the pk file to start from scratch.
//
// Usage (from repo root):
//   cd frontend && node ../deployment/seed_studionet.mjs
//
// Flags:
//   --addr=<0x...>      Override the contract address (else uses FALLBACK_ADDRESS).
//   --step=all|register|anchor|scan-infr|scan-clear|bounty|buy|tier|coauthors|buy-tier|community-bounty|watchlist|scan-watched|takedown|transferable-tier|list-resale|buy-resale
//                        Run a single stage instead of the full sequence.
//
// Outputs:
//   Prints every tx hash so the operator can paste them into
//   deployment/deployment_log.md.

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const ADDR = args.addr || "0x19DaA769E49a42eEC3808c6c895eC266aD5CE9E2";
const STEP = args.step || "all";
const OWNER_PK_FILE = path.resolve(".seed_owner_pk");
const BUYER_PK_FILE = path.resolve(".seed_buyer_pk");

const REG_URL = "https://docs.genlayer.com/";
const REG_DESC =
  "Official GenLayer developer documentation site — home page covering intelligent-contracts overview, developer quickstart, GenVM, and the SDK reference. Used as a stable public target for anchor + scan demos.";
const CLEAR_URL = "https://example.com/";
const LICENSE_PRICE = 1000n;
const PENALTY = 5000n;
const BOUNTY = 5000n;

function loadOrCreatePk(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const pk = generatePrivateKey();
    fs.writeFileSync(file, pk);
    console.log(`[pk] fresh key written to ${file}`);
    return pk;
  }
}

function makeClient(pk) {
  const account = createAccount(pk);
  return { account, client: createClient({ chain: studionet, account }) };
}

async function waitAccepted(client, hash) {
  try {
    const tx = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      interval: 4000,
      retries: 90,
    });
    return tx?.statusName || "ACCEPTED?";
  } catch (e) {
    return `wait_error: ${(e.message || "").slice(0, 200)}`;
  }
}

async function write(label, client, fn, argsArr = [], value = 0n) {
  const safe = JSON.stringify(argsArr, (_, v) =>
    typeof v === "bigint" ? String(v) : v,
  );
  console.log(`\n[${label}] ${fn}(${safe.slice(0, 120)}) value=${value}`);
  try {
    const hash = await client.writeContract({
      address: ADDR,
      functionName: fn,
      args: argsArr,
      value,
    });
    console.log(`[${label}] tx: ${hash}`);
    const status = await waitAccepted(client, hash);
    console.log(`[${label}] status: ${status}`);
    return { hash, status };
  } catch (e) {
    console.log(`[${label}] ERR: ${(e.message || String(e)).slice(0, 500)}`);
    return null;
  }
}

async function read(label, client, fn, argsArr = []) {
  try {
    const r = await client.readContract({ address: ADDR, functionName: fn, args: argsArr });
    const s = typeof r === "string" ? r : JSON.stringify(r);
    console.log(`[${label}] ${fn} => ${s.slice(0, 320)}`);
    return r;
  } catch (e) {
    console.log(`[${label}] ${fn} ERR: ${(e.message || "").slice(0, 200)}`);
  }
}

async function main() {
  console.log(`contract: ${ADDR}`);
  console.log(`step:     ${STEP}`);

  const ownerPk = loadOrCreatePk(OWNER_PK_FILE);
  const { account: owner, client: ownerClient } = makeClient(ownerPk);
  console.log(`owner:    ${owner.address}`);

  if (STEP === "all" || STEP === "register") {
    const before = await ownerClient.readContract({
      address: ADDR,
      functionName: "get_work_counter",
      args: [],
    });
    await write("register", ownerClient, "register_work", [
      REG_URL,
      REG_DESC,
      Number(LICENSE_PRICE),
      Number(PENALTY),
    ]);
    const after = await ownerClient.readContract({
      address: ADDR,
      functionName: "get_work_counter",
      args: [],
    });
    const workId = `work_${Number(after) - 1}`;
    console.log(`[register] work id = ${workId} (counter ${before} -> ${after})`);
    fs.writeFileSync(".seed_last_work_id", workId);
  }

  const workId = (() => {
    try {
      return fs.readFileSync(".seed_last_work_id", "utf8").trim();
    } catch {
      return "work_1";
    }
  })();

  if (STEP === "all" || STEP === "anchor") {
    await write("anchor", ownerClient, "anchor_work", [workId]);
    await read("anchor", ownerClient, "get_anchor", [workId]);
  }

  if (STEP === "all" || STEP === "scan-infr") {
    await write("scan-infr", ownerClient, "scan_for_infringement", [workId, REG_URL]);
    await read("scan-infr", ownerClient, "get_last_verdict_by_url", [workId, REG_URL]);
  }

  if (STEP === "all" || STEP === "scan-clear") {
    await write("scan-clear", ownerClient, "scan_for_infringement", [workId, CLEAR_URL]);
    await read("scan-clear", ownerClient, "get_last_verdict_by_url", [workId, CLEAR_URL]);
  }

  if (STEP === "all" || STEP === "bounty") {
    await write("bounty", ownerClient, "deposit_infringement_bounty", [workId], BOUNTY);
    await read("bounty", ownerClient, "get_bounty", [workId]);
  }

  if (STEP === "all" || STEP === "buy") {
    const buyerPk = loadOrCreatePk(BUYER_PK_FILE);
    const { account: buyer, client: buyerClient } = makeClient(buyerPk);
    console.log(`buyer:    ${buyer.address}`);
    await write("buy", buyerClient, "purchase_license", [workId], LICENSE_PRICE);
    await read("buy", buyerClient, "has_license", [workId, buyer.address]);
  }

  // v8 — add a commercial tier so the frontend has something meaningful to show.
  if (STEP === "all" || STEP === "tier") {
    await write("add-tier", ownerClient, "add_license_tier", [
      workId,
      "commercial-30d",
      2000n,
      30n, // 30 write-epochs expiry
    ]);
    await read("list-tiers", ownerClient, "list_license_tiers", [workId]);
  }

  // v8 — set a demo coauthor split so reviewers can see royalties flowing.
  if (STEP === "all" || STEP === "coauthors") {
    const bounty2 = loadOrCreatePk(path.resolve(".seed_coauthor_pk"));
    const { account: coauthor } = makeClient(bounty2);
    console.log(`coauthor: ${coauthor.address}`);
    await write(
      "set-coauthors",
      ownerClient,
      "set_coauthors",
      [workId, [owner.address, coauthor.address], [7000, 3000]],
    );
    await read("get-coauthors", ownerClient, "get_coauthors", [workId]);
  }

  // v8 — buy the tiered license via the new path so get_license has data.
  if (STEP === "all" || STEP === "buy-tier") {
    const buyerPk = loadOrCreatePk(BUYER_PK_FILE);
    const { account: buyer, client: buyerClient } = makeClient(buyerPk);
    await write(
      "buy-tier",
      buyerClient,
      "purchase_license_tier",
      [workId, 1],
      2000n,
    );
    await read("get-license", buyerClient, "get_license", [workId, buyer.address]);
    await read("get-epoch", ownerClient, "get_epoch", []);
  }

  // v9 — a community backer tops up the pool via fund_bounty (permissionless).
  if (STEP === "all" || STEP === "community-bounty") {
    const backerPk = loadOrCreatePk(path.resolve(".seed_backer_pk"));
    const { account: backer, client: backerClient } = makeClient(backerPk);
    console.log(`backer:   ${backer.address}`);
    await write("fund-bounty", backerClient, "fund_bounty", [workId], 3000n);
    await read(
      "list-contributors",
      ownerClient,
      "list_bounty_contributors",
      [workId],
    );
  }

  // v9 — owner adds a suspect URL to the watchlist.
  if (STEP === "all" || STEP === "watchlist") {
    await write(
      "add-watch",
      ownerClient,
      "add_watchlist_url",
      [workId, "https://example.com/watched-copy"],
    );
    await read("list-watchlist", ownerClient, "list_watchlist", [workId]);
  }

  // v9 — a scanner scans the watchlisted URL. Since example.com is not the
  // registered URL the LLM verdict decides; this is a real nondet path and
  // may return CLEAR — that's fine, the point is to exercise the flow.
  if (STEP === "watched-scan") {
    await write(
      "watched-scan",
      ownerClient,
      "scan_for_infringement",
      [workId, "https://example.com/watched-copy"],
    );
    await read(
      "watched-verdict",
      ownerClient,
      "get_last_verdict_by_url",
      [workId, "https://example.com/watched-copy"],
    );
  }

  // v9 — probe takedown readiness so reviewers see the state machine.
  if (STEP === "all" || STEP === "takedown") {
    await read(
      "takedown-ready",
      ownerClient,
      "takedown_ready",
      [workId, REG_URL],
    );
  }

  // v10 — mark the commercial-30d tier transferable + drop royalty to 500 bps.
  if (STEP === "all" || STEP === "transferable-tier") {
    await write(
      "make-tier-transferable",
      ownerClient,
      "set_tier_transferable",
      [workId, 1, true],
    );
    await write(
      "set-royalty",
      ownerClient,
      "set_resale_royalty_bps",
      [workId, 500n], // 5 %
    );
    await read(
      "royalty",
      ownerClient,
      "get_resale_royalty_bps",
      [workId],
    );
  }

  // v10 — buyer (who already holds tier_1 from the buy-tier step) lists it.
  if (STEP === "all" || STEP === "list-resale") {
    const buyerPk = loadOrCreatePk(BUYER_PK_FILE);
    const { account: buyer, client: buyerClient } = makeClient(buyerPk);
    console.log(`buyer:    ${buyer.address}`);
    await write("list-resale", buyerClient, "list_for_resale", [
      workId,
      2500n, // ask price
    ]);
    await read(
      "listings",
      ownerClient,
      "list_resale_listings",
      [workId],
    );
  }

  // v10 — a fresh secondary buyer picks up the listing.
  if (STEP === "all" || STEP === "buy-resale") {
    const buyerPk = loadOrCreatePk(BUYER_PK_FILE);
    const secondaryPk = loadOrCreatePk(path.resolve(".seed_secondary_pk"));
    const { account: buyer } = makeClient(buyerPk);
    const { account: secondary, client: secondaryClient } = makeClient(secondaryPk);
    console.log(`secondary: ${secondary.address}`);
    await write(
      "buy-resale",
      secondaryClient,
      "buy_from_resale",
      [workId, buyer.address],
      2500n,
    );
    await read(
      "get-license-secondary",
      ownerClient,
      "get_license",
      [workId, secondary.address],
    );
    await read(
      "listings-after",
      ownerClient,
      "list_resale_listings",
      [workId],
    );
  }

  await read("final", ownerClient, "get_work_counter", []);
  await read("final", ownerClient, "list_works", []);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
