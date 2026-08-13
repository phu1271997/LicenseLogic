import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  TransactionStatus,
  type GenLayerTransaction,
  type TransactionHash,
} from "genlayer-js/types";

const FALLBACK_ADDRESS = "0x8372967d074C066EC2006782171d39E18eB5a46f";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  FALLBACK_ADDRESS) as `0x${string}`;

export const NETWORK_LABEL =
  process.env.NEXT_PUBLIC_NETWORK_LABEL || "Studionet";

export const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_BASE ||
  "https://studio.genlayer.com/contracts";

const account = createAccount();

export const client = createClient({
  chain: studionet,
  account,
});

// Decided states — chain has finished processing the tx and state is applied.
// FINALIZED only comes after the finality window closes (can take many minutes
// on studionet). ACCEPTED is enough to safely read state that the tx wrote.
const DECIDED: TransactionStatus[] = [
  TransactionStatus.ACCEPTED,
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
  TransactionStatus.LEADER_TIMEOUT,
  TransactionStatus.VALIDATORS_TIMEOUT,
];

function isDecided(tx: GenLayerTransaction | null | undefined): boolean {
  const name = tx?.statusName;
  return !!name && DECIDED.includes(name);
}

export interface WaitResult {
  tx: GenLayerTransaction | null;
  status: TransactionStatus | "UNKNOWN";
  timedOut: boolean;
}

export async function waitForTx(
  hash: `0x${string}`,
  opts: { targetStatus?: TransactionStatus; timeoutMs?: number; intervalMs?: number } = {}
): Promise<WaitResult> {
  const targetStatus = opts.targetStatus ?? TransactionStatus.ACCEPTED;
  const intervalMs = opts.intervalMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 300_000; // 5 min hard ceiling
  const maxRetries = Math.max(1, Math.ceil(timeoutMs / intervalMs));

  const txHash = hash as unknown as TransactionHash;

  // Tier 1: SDK helper, wait for the target status.
  try {
    const tx = (await client.waitForTransactionReceipt({
      hash: txHash,
      status: targetStatus,
      interval: intervalMs,
      retries: maxRetries,
    })) as GenLayerTransaction;
    return {
      tx,
      status: tx.statusName ?? "UNKNOWN",
      timedOut: false,
    };
  } catch {
    // Fall through to manual polling.
  }

  // Tier 2: manual poll — accept any decided state.
  const deadline = Date.now() + timeoutMs;
  let lastTx: GenLayerTransaction | null = null;
  while (Date.now() < deadline) {
    try {
      const tx = (await client.getTransaction({ hash: txHash })) as GenLayerTransaction;
      lastTx = tx;
      if (isDecided(tx)) {
        return {
          tx,
          status: tx.statusName ?? "UNKNOWN",
          timedOut: false,
        };
      }
    } catch {
      // Node hiccup — try again next tick.
    }
    await sleep(intervalMs);
  }

  return {
    tx: lastTx,
    status: lastTx?.statusName ?? "UNKNOWN",
    timedOut: true,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readContract(functionName: string, args: any[] = []) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
}

export interface WriteResult {
  hash: `0x${string}`;
  wait: WaitResult;
}

export async function writeContract(
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[] = [],
  value: bigint = BigInt(0),
  opts: { targetStatus?: TransactionStatus; timeoutMs?: number; intervalMs?: number } = {}
): Promise<WriteResult> {
  const hash = (await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  })) as `0x${string}`;

  const wait = await waitForTx(hash, opts);
  return { hash, wait };
}

// Read a view with retries. Useful right after a write that may not have
// propagated to the read node yet, or when the write wait timed out and the
// state hasn't quite caught up.
export async function readWithRetry<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: { retries?: number; intervalMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 20;
  const intervalMs = opts.intervalMs ?? 2000;
  let last: T | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      last = await fn();
      if (predicate(last)) return last;
    } catch {
      // ignore, retry
    }
    await sleep(intervalMs);
  }
  if (last === undefined) throw new Error("readWithRetry produced no value");
  return last;
}

export function explorerUrl(address: string = CONTRACT_ADDRESS): string {
  const base = EXPLORER_BASE.replace(/\/$/, "");
  return `${base}/${address}`;
}

export function txExplorerUrl(hash: string): string {
  const base = EXPLORER_BASE.replace(/\/contracts$/, "").replace(/\/$/, "");
  return `${base}/tx/${hash}`;
}
