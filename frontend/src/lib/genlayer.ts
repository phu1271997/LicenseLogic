import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

// Create a default account for read operations and demo writes
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
