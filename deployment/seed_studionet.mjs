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
//   --step=all|register|anchor|scan-infr|scan-clear|bounty|buy
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

const ADDR = args.addr || "0x637170df1AE9bf4b93DD26ca35ba9Df2bdc37035";
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
  console.log(`\n[${label}] ${fn}(${JSON.stringify(argsArr).slice(0, 120)}) value=${value}`);
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

  await read("final", ownerClient, "get_work_counter", []);
  await read("final", ownerClient, "list_works", []);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
