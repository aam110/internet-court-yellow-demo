// GenLayer Studio Next helpers — headless, throwaway test key only.
// Pattern proven by the live Mission 101 x402 demo (je26/genlayer-x402):
// estimate fees -> build consensus addTransaction calldata -> sign locally
// with viem -> broadcast a legacy tx (gasPrice 0, no `type` field).
// genlayer-js 2.0.0-rc.3 is required (1.1.8 lacks studioDevnet + fee estimation;
// its deploy path omits the fees distribution and reverts with
// FeesDistributionMissing on Studio Next).
import { createClient, createAccount, abi } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Hex,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const STUDIO_RPC =
  process.env.GENLAYER_RPC ?? "https://studio-dev.genlayer.com/api";
const CONSENSUS_CONTRACT = studioDevnet.consensusMainContract!;
export const CONSENSUS = CONSENSUS_CONTRACT.address as Hex;

// encodeFunctionData needs a const ABI; the chain ABI is runtime data,
// so call it through a loosely-typed alias.
const encodeCalldata = encodeFunctionData as unknown as (args: {
  abi: unknown;
  functionName: string;
  args: unknown[];
}) => Hex;

export function genlayerClient() {
  return createClient({ chain: studioDevnet, endpoint: STUDIO_RPC });
}

function viemClients(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  const chain = {
    id: 61997,
    name: "GenLayer Studio Next",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: { default: { http: [STUDIO_RPC] } },
  } as const;
  return {
    account,
    public: createPublicClient({ chain, transport: http(STUDIO_RPC) }),
    wallet: createWalletClient({ account, chain, transport: http(STUDIO_RPC) }),
  };
}

async function estimateFees() {
  const client = genlayerClient();
  const fees = await client.estimateTransactionFees({});
  return fees as {
    feeValue: bigint;
    distribution: unknown;
    messageAllocations?: unknown[];
  };
}

/** Build the consensus addTransaction calldata for a deploy or a method call. */
function buildAddTransaction(params: {
  sender: Hex;
  recipient: Hex;
  txCalldata: Hex;
  feesDistribution: unknown;
  messageAllocations: unknown[];
}) {
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
  return encodeCalldata({
    abi: CONSENSUS_CONTRACT.abi,
    functionName: "addTransaction",
    args: [
      {
        sender: params.sender,
        recipient: params.recipient,
        numOfInitialValidators: BigInt(
          studioDevnet.defaultNumberOfInitialValidators,
        ),
        maxRotations: BigInt(studioDevnet.defaultConsensusMaxRotations),
        validUntil,
        saltNonce: 0n,
        userValue: 0n,
        feesDistribution: params.feesDistribution,
        txCalldata: params.txCalldata,
        messageAllocations: params.messageAllocations,
      },
    ],
  });
}

async function signAndBroadcast(params: {
  privateKey: Hex;
  to: Hex;
  data: Hex;
  value: bigint;
}): Promise<Hash> {
  const { account, public: pub, wallet } = viemClients(params.privateKey);
  const nonce = await pub.getTransactionCount({ address: account.address });
  // 1-param eth_estimateGas (the node rejects the 2-param form).
  const gasEst = await pub.estimateGas({
    account,
    to: params.to,
    data: params.data,
    value: params.value,
  });
  const gas = (gasEst * 12n) / 10n; // +20% headroom; gasPrice is 0 on this testnet
  // gasPrice (not maxFeePerGas) => viem sends a legacy tx, which is what
  // this node accepts.
  return wallet.sendTransaction({
    to: params.to,
    data: params.data,
    value: params.value,
    gas,
    gasPrice: 0n,
    nonce,
  });
}

export async function waitForAccepted(
  txHash: Hash,
): Promise<{ resultName?: string; contractAddress?: string; raw: unknown }> {
  const client = genlayerClient();
  const receipt = (await client.waitForTransactionReceipt({
    hash: txHash as never,
    waitUntil: "decided",
    retries: 200,
    interval: 5000,
  })) as unknown as {
    resultName?: string;
    txExecutionResultName?: string;
    txDataDecoded?: { contractAddress?: string };
    data?: { contract_address?: string };
  };
  return {
    resultName:
      receipt.resultName ?? receipt.txExecutionResultName ?? "decided",
    contractAddress:
      receipt.txDataDecoded?.contractAddress ?? receipt.data?.contract_address,
    raw: receipt,
  };
}

/** Deploy an intelligent contract (.py source) and return its address. */
export async function deployContract(params: {
  privateKey: Hex;
  code: string;
}): Promise<{ txHash: Hash; address: string }> {
  const { account } = viemClients(params.privateKey);
  const fees = await estimateFees();
  const calldataObj = abi.calldata.makeCalldataObject(undefined, [], undefined);
  const constructorCalldata = abi.calldata.encode(calldataObj);
  const serialized = abi.transactions.serialize([
    params.code,
    constructorCalldata,
    false,
  ]);
  const data = buildAddTransaction({
    sender: account.address,
    recipient: "0x0000000000000000000000000000000000000000",
    txCalldata: serialized as Hex,
    feesDistribution: fees.distribution,
    messageAllocations: (fees.messageAllocations ?? []) as unknown[],
  });
  const txHash = await signAndBroadcast({
    privateKey: params.privateKey,
    to: CONSENSUS,
    data,
    value: fees.feeValue,
  });
  const receipt = await waitForAccepted(txHash);
  if (!receipt.contractAddress) {
    throw new Error(
      `Deploy receipt has no contract address (result ${receipt.resultName}): ` +
        JSON.stringify(receipt.raw).slice(0, 1500),
    );
  }
  return { txHash, address: receipt.contractAddress };
}

/** Call a write method on a deployed intelligent contract. */
export async function writeContract(params: {
  privateKey: Hex;
  contractAddress: Hex;
  functionName: string;
  args: unknown[];
}): Promise<{ txHash: Hash; resultName?: string }> {
  const { account } = viemClients(params.privateKey);
  const fees = await estimateFees();
  const calldataObj = abi.calldata.makeCalldataObject(
    params.functionName,
    params.args as never,
    undefined,
  );
  const methodCalldata = abi.calldata.encode(calldataObj);
  const serialized = abi.transactions.serialize([methodCalldata, false]);
  const data = buildAddTransaction({
    sender: account.address,
    recipient: params.contractAddress,
    txCalldata: serialized as Hex,
    feesDistribution: fees.distribution,
    messageAllocations: (fees.messageAllocations ?? []) as unknown[],
  });
  const txHash = await signAndBroadcast({
    privateKey: params.privateKey,
    to: CONSENSUS,
    data,
    value: fees.feeValue,
  });
  const receipt = await waitForAccepted(txHash);
  return { txHash, resultName: receipt.resultName };
}

/** Call a read-only (view) method — free, no signing. */
export async function readContract<T = unknown>(params: {
  contractAddress: Hex;
  functionName: string;
  args: unknown[];
}): Promise<T> {
  const client = genlayerClient();
  return (await client.readContract({
    address: params.contractAddress,
    functionName: params.functionName,
    args: params.args as never,
  })) as T;
}
