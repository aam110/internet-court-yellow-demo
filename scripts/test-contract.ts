// Live smoke test of the deployed dispute contract on Studio Next.
// Usage: GENLAYER_PRIVATE_KEY=0x... CONTRACT_ADDRESS=0x... npx tsx scripts/test-contract.ts
import { writeContract, readContract } from "../demo/genlayer.js";
import type { Hex } from "viem";

const PK = process.env.GENLAYER_PRIVATE_KEY as Hex;
const ADDR = process.env.CONTRACT_ADDRESS as Hex;
if (!PK || !ADDR) {
  console.error("GENLAYER_PRIVATE_KEY and CONTRACT_ADDRESS are required.");
  process.exit(1);
}

const DISPUTE_ID = `demo-${Date.now().toString(36)}`;

async function main() {
  console.log("contract:", ADDR);
  console.log("dispute id:", DISPUTE_ID);

  console.log("\n== file_dispute ==");
  const filed = await writeContract({
    privateKey: PK,
    contractAddress: ADDR,
    functionName: "file_dispute",
    args: [
      DISPUTE_ID,
      "yellow-room-demo-1",
      "0xBuyer000000000000000000000000000000000001",
      "0xSeller00000000000000000000000000000000002",
      "I ordered a 500-word product description in English, delivery in 48h. What arrived was 120 words, machine-translated, 3 days late.",
      "Delivered a 480-word description plus 3 headline options. The buyer approved the outline first; delay was 12 hours, not 3 days. Drafts attached in the room chat.",
      "0.005 YUSD",
      "0.005 YUSD",
    ],
  });
  console.log("file tx:", filed.txHash, "result:", filed.resultName);

  console.log("\n== get_dispute ==");
  const dispute = await readContract<Record<string, unknown>>({
    contractAddress: ADDR,
    functionName: "get_dispute",
    args: [DISPUTE_ID],
  });
  console.log(JSON.stringify(dispute, null, 2));

  console.log("\n== judge_dispute (LLM consensus, may take minutes) ==");
  const judged = await writeContract({
    privateKey: PK,
    contractAddress: ADDR,
    functionName: "judge_dispute",
    args: [DISPUTE_ID],
  });
  console.log("judge tx:", judged.txHash, "result:", judged.resultName);

  console.log("\n== get_verdict ==");
  const verdict = await readContract<Record<string, unknown>>({
    contractAddress: ADDR,
    functionName: "get_verdict",
    args: [DISPUTE_ID],
  });
  console.log(JSON.stringify(verdict, null, 2));
}

main().catch((e) => {
  console.error("TEST FAIL:", e?.message ?? e);
  process.exit(1);
});
