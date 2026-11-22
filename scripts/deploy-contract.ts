// Deploy the Internet Court dispute contract to GenLayer Studio Next (testnet).
// Headless: signs with a THROWAWAY test key funded via sim_fundAccount.
// Usage: GENLAYER_PRIVATE_KEY=0x... npm run deploy:contract
// Prints CONTRACT_ADDRESS=<address> on success.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployContract } from "../demo/genlayer.js";
import type { Hex } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PK = process.env.GENLAYER_PRIVATE_KEY as Hex;
if (!PK) {
  console.error(
    "GENLAYER_PRIVATE_KEY is required (throwaway test key only, never a real key).",
  );
  process.exit(1);
}

async function main() {
  const code = readFileSync(
    path.resolve(__dirname, "../contracts/internet_court_dispute.py"),
    "utf8",
  );
  console.log("contract bytes:", code.length);
  const { txHash, address } = await deployContract({ privateKey: PK, code });
  console.log("deploy tx:", txHash);
  console.log("CONTRACT_ADDRESS=" + address);
}

main().catch((e) => {
  console.error("DEPLOY FAIL:", e?.message ?? e);
  process.exit(1);
});
