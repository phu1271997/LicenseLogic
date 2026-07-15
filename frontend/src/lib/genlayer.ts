import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const FALLBACK_ADDRESS = "0xee3bA410d441aF48a8B4AaFC822b5C145facA8D7";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readContract(functionName: string, args: any[] = []) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
}

export async function writeContract(
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[] = [],
  value: bigint = BigInt(0)
) {
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });

  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: "FINALIZED" as never,
  });

  return { hash, receipt };
}

export function explorerUrl(address: string = CONTRACT_ADDRESS): string {
  const base = EXPLORER_BASE.replace(/\/$/, "");
  return `${base}/${address}`;
}
