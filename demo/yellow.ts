// Yellow Nitrolite settlement-room helpers for the Mission 101 demo.
// Follows the official quickstart (docs.yellow.org) and the runnable
// examples/nitrolite-v1-lifecycle example, plus the yellow-settlement-room
// skill (skill/yellow-settlement-room/SKILL.md, MIT).
//
// Sandbox only: wss://nitronode-sandbox.yellow.org/v1/ws, Sepolia (11155111),
// asset YUSD (sandbox faucet). NOTHING here touches mainnet or real money.
//
// Trust boundary (from the skill — do not soften): settlement is
// verdict-informed COOPERATIVE settlement. Both parties sign the final split
// the GenLayer verdict dictates. A session has no dispute mechanism of its
// own: if a party refuses to co-sign, funds stay in the session.
import {
  Client,
  createSigners,
  withBlockchainRPC,
  AppSessionWalletSignerV1,
  EthereumMsgSigner,
  packCreateAppSessionRequestV1,
  packAppStateUpdateV1,
  AppStateUpdateIntent,
  type AppDefinitionV1,
  type AppStateUpdateV1,
  type AppSessionInfoV1,
} from "@yellow-org/sdk";
import type { Address, Hex } from "viem";
import { Decimal } from "decimal.js";

export const NITRONODE_WS_URL =
  process.env.NITRONODE_WS_URL ??
  "wss://nitronode-sandbox.yellow.org/v1/ws";
export const SEPOLIA_RPC_URL =
  process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const CHAIN_ID = 11155111n;
export const ASSET = "yusd";

export interface Participant {
  client: Client;
  address: Address;
  sessionSigner: AppSessionWalletSignerV1;
  privateKey: Hex;
}

/** Node.js shim copied verbatim from the official lifecycle example.
 *  Public RPCs need the viem LocalAccount preserved on writeContract(),
 *  otherwise approveToken()/checkpoint() fail with account errors. */
function enableNodeLocalAccountTransactions(client: Client): void {
  const sdkClient = client as unknown as {
    createEVMClients?: (
      chainId: bigint,
      rpcURL: string,
    ) => { walletClient?: { account?: unknown; writeContract?: unknown } };
  };
  const originalFactory = sdkClient.createEVMClients?.bind(client);
  if (!originalFactory) {
    console.warn(
      "Warning: enableNodeLocalAccountTransactions could not patch createEVMClients.",
    );
    return;
  }
  sdkClient.createEVMClients = (chainId: bigint, rpcURL: string) => {
    const result = originalFactory(chainId, rpcURL);
    const walletClient = result.walletClient as unknown as {
      account?: unknown;
      writeContract?: (
        request: Record<string, unknown>,
      ) => Promise<Hex>;
    } | null;
    if (!walletClient?.account || !walletClient.writeContract) return result;
    const localAccount = walletClient.account;
    const originalWriteContract = walletClient.writeContract.bind(walletClient);
    walletClient.writeContract = (request: Record<string, unknown>) =>
      originalWriteContract({ ...request, account: localAccount });
    return result;
  };
}

export async function connectParticipant(
  privateKey: Hex,
): Promise<Participant> {
  const signers = createSigners(privateKey);
  const client = await Client.create(
    NITRONODE_WS_URL,
    signers.stateSigner,
    signers.txSigner,
    withBlockchainRPC(CHAIN_ID, SEPOLIA_RPC_URL),
  );
  enableNodeLocalAccountTransactions(client);
  const address = client.getUserAddress();
  const sessionSigner = new AppSessionWalletSignerV1(
    new EthereumMsgSigner(privateKey),
  );
  return { client, address, sessionSigner, privateKey };
}

export async function inspectNode(client: Client): Promise<{
  nodeAddress: string;
  nodeVersion: string;
  assetDecimals: number;
  assetToken: string;
}> {
  const nodeConfig = await client.getConfig();
  const blockchains = await client.getBlockchains();
  const chain = blockchains.find((c) => c.id === CHAIN_ID);
  if (!chain) throw new Error(`Nitronode does not list chain ${CHAIN_ID}`);
  const assets = await client.getAssets(CHAIN_ID);
  const asset = assets.find((a) => a.symbol.toLowerCase() === ASSET);
  if (!asset) {
    throw new Error(
      `Nitronode does not list asset ${ASSET} on chain ${CHAIN_ID}. ` +
        `Available: ${assets.map((a) => a.symbol).join(", ")}`,
    );
  }
  const token = asset.tokens.find((t) => t.blockchainId === CHAIN_ID);
  return {
    nodeAddress: nodeConfig.nodeAddress,
    nodeVersion: nodeConfig.nodeVersion,
    assetDecimals: asset.decimals,
    assetToken: token?.address ?? "(no token listed for this chain)",
  };
}

/** Yellow account (channel) balance for an asset, or 0 if none. */
export async function channelBalance(
  client: Client,
  wallet: Address,
): Promise<Decimal> {
  const balances = await client.getBalances(wallet);
  const entry = balances.find((b) => b.asset.toLowerCase() === ASSET);
  return entry ? entry.balance : new Decimal(0);
}

/**
 * Make sure the depositor's home channel holds at least `needed`.
 * Path 1 — faucet-funded channel balance already covers it: nothing to do.
 * Path 2 — on-chain YUSD exists: approve + deposit + checkpoint (needs Sepolia gas).
 * Otherwise throws with exact funding instructions (no silent fallback).
 */
export async function prepareFunding(
  depositor: Participant,
  needed: Decimal,
): Promise<void> {
  const { client } = depositor;
  const have = await channelBalance(client, depositor.address);
  console.log(`channel balance: ${have.toFixed()} ${ASSET} (need ${needed.toFixed()})`);
  if (have.greaterThanOrEqualTo(needed)) {
    console.log("channel already funded — skipping on-chain deposit");
    return;
  }
  const onChain = await client.getOnChainBalance(
    CHAIN_ID,
    ASSET,
    depositor.address,
  );
  const shortfall = needed.minus(have);
  if (onChain.lessThan(shortfall)) {
    throw new Error(
      `FUNDING NEEDED: ${depositor.address} has ${have.toFixed()} ${ASSET} in its ` +
        `Yellow channel and ${onChain.toFixed()} ${ASSET} on-chain, but the demo needs ` +
        `${needed.toFixed()} ${ASSET}. Get free test YUSD from the sandbox playground faucet ` +
        `(https://nitronode-sandbox.yellow.org/v1/playground/ — connect the wallet and use ` +
        `the faucet), plus a little Sepolia ETH for gas (https://sepoliafaucet.com), then re-run.`,
    );
  }
  await client.setHomeBlockchain(ASSET, CHAIN_ID).catch((e: Error) => {
    if (!/already set/i.test(e.message)) throw e;
  });
  console.log(`approving + depositing ${shortfall.toFixed()} ${ASSET} on-chain...`);
  await client.approveToken(CHAIN_ID, ASSET, shortfall);
  await client.deposit(CHAIN_ID, ASSET, shortfall);
  const txHash = await client.checkpoint(ASSET);
  console.log("deposit checkpoint tx:", txHash);
}

export async function createRoom(
  buyer: Participant,
  seller: Participant,
  roomName: string,
): Promise<{ appSessionId: string; version: string }> {
  const appID = roomName.replace(/[^a-z0-9_-]/gi, "-").toLowerCase().slice(0, 66);
  // NOTE: SDK 1.4.0 has no registerApp on the client (the 1.2.1 lifecycle
  // example's registerApp call throws 'apps.v1 group is disabled' on the
  // sandbox node anyway). Sessions are created directly.
  const definition: AppDefinitionV1 = {
    applicationId: appID,
    participants: [
      { walletAddress: buyer.address, signatureWeight: 1 },
      { walletAddress: seller.address, signatureWeight: 1 },
    ],
    quorum: 2, // unanimous: no party can settle alone
    nonce:
      BigInt(Date.now()) * 1_000_000n +
      BigInt(Math.floor(Math.random() * 1_000_000)),
  };
  const sessionData = JSON.stringify({
    intent: "internet-court-demo-room",
    buyer: buyer.address,
    seller: seller.address,
  });
  const payload = packCreateAppSessionRequestV1(definition, sessionData);
  const created = await buyer.client.createAppSession(definition, sessionData, [
    await buyer.sessionSigner.signMessage(payload),
    await seller.sessionSigner.signMessage(payload),
  ]);
  return { appSessionId: created.appSessionId, version: created.version };
}

export async function getSession(client: Client, appSessionId: string) {
  const { sessions } = await client.getAppSessions({ appSessionId });
  const session = sessions[0];
  if (!session) throw new Error(`Session ${appSessionId} not found`);
  return session;
}

async function signUpdate(
  update: AppStateUpdateV1,
  buyer: Participant,
  seller: Participant,
): Promise<string[]> {
  const payload = packAppStateUpdateV1(update);
  return [
    await buyer.sessionSigner.signMessage(payload),
    await seller.sessionSigner.signMessage(payload),
  ];
}

export function allocationOf(
  session: AppSessionInfoV1,
  participant: Address,
): Decimal {
  const entry = session.allocations?.find(
    (a) => a.participant.toLowerCase() === participant.toLowerCase(),
  );
  return entry ? entry.amount : new Decimal(0);
}

/** Buyer commits escrow into the room. Both parties co-sign (quorum 2). */
export async function depositEscrow(
  buyer: Participant,
  seller: Participant,
  appSessionId: string,
  amount: Decimal,
): Promise<void> {
  const session = await getSession(buyer.client, appSessionId);
  const update: AppStateUpdateV1 = {
    appSessionId,
    intent: AppStateUpdateIntent.Deposit,
    version: session.version + 1n,
    allocations: [
      { participant: buyer.address, asset: ASSET, amount },
    ],
    sessionData: JSON.stringify({ intent: "buyer_escrow", amount: amount.toFixed() }),
  };
  const sigs = await signUpdate(update, buyer, seller);
  await buyer.client.submitAppSessionDeposit(update, sigs, ASSET, amount);
}

/**
 * Apply the GenLayer verdict as the room's final split, then close.
 * Operate restates the full allocation per the verdict (buyer gets
 * splitBuyerPct% of the escrow total, seller the rest); Close restates the
 * same allocation and releases everything back to the channels.
 * Both updates are co-signed by buyer AND seller (quorum 2) — this is the
 * verdict-informed cooperative settlement the skill describes.
 */
export async function settleByVerdict(
  buyer: Participant,
  seller: Participant,
  appSessionId: string,
  splitBuyerPct: number,
  disputeId: string,
): Promise<{ buyerShare: Decimal; sellerShare: Decimal }> {
  const session = await getSession(buyer.client, appSessionId);
  const total = allocationOf(session, buyer.address).plus(
    allocationOf(session, seller.address),
  );
  const buyerShare = total.mul(splitBuyerPct).div(100);
  const sellerShare = total.minus(buyerShare);

  const operate: AppStateUpdateV1 = {
    appSessionId,
    intent: AppStateUpdateIntent.Operate,
    version: session.version + 1n,
    allocations: [
      { participant: buyer.address, asset: ASSET, amount: buyerShare },
      { participant: seller.address, asset: ASSET, amount: sellerShare },
    ],
    sessionData: JSON.stringify({
      intent: "verdict_split",
      dispute_id: disputeId,
      split_buyer_pct: splitBuyerPct,
    }),
  };
  await buyer.client.submitAppState(
    operate,
    await signUpdate(operate, buyer, seller),
  );

  const afterOperate = await getSession(buyer.client, appSessionId);
  const close: AppStateUpdateV1 = {
    appSessionId,
    intent: AppStateUpdateIntent.Close,
    version: afterOperate.version + 1n,
    allocations: [
      { participant: buyer.address, asset: ASSET, amount: buyerShare },
      { participant: seller.address, asset: ASSET, amount: sellerShare },
    ],
    sessionData: JSON.stringify({ intent: "close_after_verdict", dispute_id: disputeId }),
  };
  await buyer.client.submitAppState(
    close,
    await signUpdate(close, buyer, seller),
  );
  return { buyerShare, sellerShare };
}

export async function disconnectAll(...participants: Participant[]) {
  await Promise.allSettled(participants.map((p) => p.client.close()));
}
