// Internet Court x Yellow — full demo CLI (testnet only).
//
// Flow:
//   1. Buyer + seller open a Yellow settlement room (sandbox, YUSD).
//   2. Buyer deposits 0.01 YUSD escrow into the room.
//   3. Seller claims delivery; buyer disputes. The dispute + both sides'
//      evidence are filed to the GenLayer Intelligent Contract.
//   4. GenLayer validators judge and return a verdict JSON
//      (release | refund | split + percentage + reasoning).
//   5. Both parties co-sign the verdict's split and close the room.
//      Funds release back to the channels per the verdict.
//
// Usage:
//   cp .env.example .env   # fill in keys + contract address
//   npm run demo
//
// Keys are THROWAWAY test keys only. Nothing here touches mainnet or real money.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Decimal } from "decimal.js";
import type { Hex } from "viem";
import {
  connectParticipant,
  inspectNode,
  prepareFunding,
  createRoom,
  depositEscrow,
  settleByVerdict,
  getSession,
  allocationOf,
  disconnectAll,
  ASSET,
} from "./yellow.js";
import { writeContract, readContract } from "./genlayer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ESCROW = new Decimal("0.01"); // YUSD

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

async function main() {
  const buyerKey = env("BUYER_PRIVATE_KEY") as Hex;
  const sellerKey = env("SELLER_PRIVATE_KEY") as Hex;
  const genlayerKey = env("GENLAYER_PRIVATE_KEY") as Hex;
  const contractAddress = env("CONTRACT_ADDRESS") as Hex;

  const buyerClaim = readFileSync(
    path.resolve(__dirname, "evidence/buyer-claim.md"),
    "utf8",
  );
  const sellerEvidence = readFileSync(
    path.resolve(__dirname, "evidence/seller-evidence.md"),
    "utf8",
  );

  console.log("== 1. Connect to Yellow sandbox ==");
  const buyer = await connectParticipant(buyerKey);
  const seller = await connectParticipant(sellerKey);
  console.log("buyer :", buyer.address);
  console.log("seller:", seller.address);
  try {
    const node = await inspectNode(buyer.client);
    console.log(`node  : ${node.nodeAddress} v${node.nodeVersion}`);
    console.log(`asset : ${ASSET} (decimals ${node.assetDecimals}, token ${node.assetToken})`);

    console.log("\n== 2. Fund buyer channel (test YUSD only) ==");
    await prepareFunding(buyer, ESCROW);

    console.log("\n== 3. Open settlement room ==");
    const roomName = `court-demo-${Date.now().toString(36)}`;
    const room = await createRoom(buyer, seller, roomName);
    console.log("room  :", room.appSessionId, `(version ${room.version})`);

    console.log("\n== 4. Buyer deposits escrow ==");
    await depositEscrow(buyer, seller, room.appSessionId, ESCROW);
    const afterDeposit = await getSession(buyer.client, room.appSessionId);
    console.log(
      `room balance: buyer=${allocationOf(afterDeposit, buyer.address).toFixed()} ` +
        `seller=${allocationOf(afterDeposit, seller.address).toFixed()} ${ASSET}`,
    );

    console.log("\n== 5. Dispute! File to the GenLayer court ==");
    const disputeId = `demo-${Date.now().toString(36)}`;
    console.log("dispute id:", disputeId);
    const filed = await writeContract({
      privateKey: genlayerKey,
      contractAddress,
      functionName: "file_dispute",
      args: [
        disputeId,
        room.appSessionId,
        buyer.address,
        seller.address,
        buyerClaim,
        sellerEvidence,
        `${ESCROW.toFixed()} ${ASSET}`,
        `0 ${ASSET}`,
      ],
    });
    console.log("file tx:", filed.txHash);

    console.log("\n== 6. GenLayer validators judge (LLM consensus) ==");
    const judged = await writeContract({
      privateKey: genlayerKey,
      contractAddress,
      functionName: "judge_dispute",
      args: [disputeId],
    });
    console.log("judge tx:", judged.txHash);
    const verdict = await readContract<{
      status: string;
      verdict: string;
      split_buyer_pct: string;
      reasoning: string;
    }>({
      contractAddress,
      functionName: "get_verdict",
      args: [disputeId],
    });
    console.log("VERDICT:", JSON.stringify(verdict, null, 2));

    console.log("\n== 7. Co-sign the verdict split + close the room ==");
    const split = await settleByVerdict(
      buyer,
      seller,
      room.appSessionId,
      Number(verdict.split_buyer_pct),
      disputeId,
    );
    const closed = await getSession(buyer.client, room.appSessionId);
    console.log(
      `final split: buyer=${split.buyerShare.toFixed()} seller=${split.sellerShare.toFixed()} ${ASSET}`,
    );
    console.log(`room closed: ${closed.isClosed} (version ${closed.version})`);

    console.log("\n== Done ==");
    console.log(`Dispute ${disputeId}: ${verdict.verdict} (${verdict.split_buyer_pct}% to buyer).`);
    console.log("Reasoning:", verdict.reasoning);
  } finally {
    await disconnectAll(buyer, seller);
  }
}

main().catch((e) => {
  console.error("\nDEMO FAILED:", e?.message ?? e);
  process.exit(1);
});
