// Checks for the steward's settlement gates (Projects submission, 27 Nov 2026).
//
// Proves, with real runs, that settlement CANNOT be triggered when:
//   (i)   a court transaction failed,
//   (ii)  the verdict has no valid percentage,
//   (iii) the dispute has not been judged yet —
// and that a successful judge tx + valid percentage DOES allow it.
// The gate itself is pure (demo/settlement-gate.ts); the live cases run
// against the deployed contract on Studio Next (test GEN, throwaway key).
//
// Yellow boundary (honest limit): the Yellow sandbox YUSD faucet is down
// (HTTP 503), so no live Yellow room exists to settle. The live cases stop
// at the gate — the exact point where settleByVerdict() would be called —
// and say so. No Yellow result is faked.
//
// Usage:
//   cp .env.example .env   # fill GENLAYER_PRIVATE_KEY + CONTRACT_ADDRESS
//   npx tsx scripts/check-settlement-gates.ts
// Exits 0 only if EVERY check passes; prints a PASS/FAIL table.
import "dotenv/config";
import { writeContract, readContract } from "../demo/genlayer.js";
import {
  assertSettlementAllowed,
  COURT_TX_SUCCESS,
} from "../demo/settlement-gate.js";
import type { Hex } from "viem";

const PK = process.env.GENLAYER_PRIVATE_KEY as Hex | undefined;
const ADDR = process.env.CONTRACT_ADDRESS as Hex | undefined;

interface Case {
  name: string;
  live: boolean;
  pass: boolean;
  detail: string;
}
const cases: Case[] = [];
function record(name: string, live: boolean, pass: boolean, detail: string) {
  cases.push({ name, live, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${live ? "live" : "pure"}] ${name}\n      ${detail}`);
}
function expectBlocked(name: string, live: boolean, fn: () => unknown, mustContain: string) {
  try {
    fn();
    record(name, live, false, `gate ALLOWED it (expected block: ${mustContain})`);
  } catch (e) {
    const msg = (e as Error).message;
    record(name, live, msg.includes(mustContain), `blocked: ${msg.slice(0, 220)}`);
  }
}

const GOOD_VERDICT = {
  status: "judged",
  verdict: "split",
  split_buyer_pct: "50",
  reasoning: "partial delivery, split is fair",
};

async function main() {
  console.log("== A. Pure gate checks (no network) ==\n");

  // (i) failed court tx cannot trigger settlement
  expectBlocked(
    "(i) failed judge tx blocks settlement",
    false,
    () =>
      assertSettlementAllowed({
        fileTxResultName: COURT_TX_SUCCESS,
        judgeTxResultName: "FINISHED_WITH_ERROR",
        verdict: GOOD_VERDICT,
      }),
    "judge_dispute transaction did not succeed",
  );
  expectBlocked(
    "(i) failed file tx blocks settlement",
    false,
    () =>
      assertSettlementAllowed({
        fileTxResultName: "FINISHED_WITH_ERROR",
        judgeTxResultName: COURT_TX_SUCCESS,
        verdict: GOOD_VERDICT,
      }),
    "file_dispute transaction did not succeed",
  );
  expectBlocked(
    "(i) unknown resultName blocks settlement (fail-closed)",
    false,
    () =>
      assertSettlementAllowed({
        fileTxResultName: COURT_TX_SUCCESS,
        judgeTxResultName: undefined,
        verdict: GOOD_VERDICT,
      }),
    "judge_dispute transaction did not succeed",
  );

  // (ii) verdict without a valid percentage cannot trigger settlement
  const badPcts: Array<[string, unknown]> = [
    ["missing percentage", undefined],
    ["non-numeric percentage", "abc"],
    ["out-of-range percentage", "150"],
    ["fractional percentage", "50.5"],
    ["empty percentage", ""],
    ["release carrying 50", "50"],
    ["refund carrying 0", "0"],
  ];
  for (const [label, pct] of badPcts) {
    const verdict =
      label === "release carrying 50"
        ? { ...GOOD_VERDICT, verdict: "release", split_buyer_pct: pct }
        : label === "refund carrying 0"
          ? { ...GOOD_VERDICT, verdict: "refund", split_buyer_pct: pct }
          : { ...GOOD_VERDICT, split_buyer_pct: pct };
    expectBlocked(
      `(ii) ${label} blocks settlement`,
      false,
      () =>
        assertSettlementAllowed({
          fileTxResultName: COURT_TX_SUCCESS,
          judgeTxResultName: COURT_TX_SUCCESS,
          verdict,
        }),
      "SETTLEMENT BLOCKED",
    );
  }

  // (iii) unjudged dispute cannot trigger settlement
  expectBlocked(
    "(iii) unjudged dispute blocks settlement",
    false,
    () =>
      assertSettlementAllowed({
        fileTxResultName: COURT_TX_SUCCESS,
        judgeTxResultName: COURT_TX_SUCCESS,
        verdict: {
          status: "open",
          verdict: "",
          split_buyer_pct: "",
          reasoning: "",
        },
      }),
    "not judged",
  );
  expectBlocked(
    "(iii) missing verdict blocks settlement",
    false,
    () =>
      assertSettlementAllowed({
        fileTxResultName: COURT_TX_SUCCESS,
        judgeTxResultName: COURT_TX_SUCCESS,
        verdict: null,
      }),
    "no verdict returned",
  );

  // (iv) valid case allows settlement
  for (const [label, verdict] of [
    ["split 50", GOOD_VERDICT],
    ["release 0", { ...GOOD_VERDICT, verdict: "release", split_buyer_pct: "0" }],
    ["refund 100", { ...GOOD_VERDICT, verdict: "refund", split_buyer_pct: "100" }],
  ] as const) {
    try {
      const pct = assertSettlementAllowed({
        fileTxResultName: COURT_TX_SUCCESS,
        judgeTxResultName: COURT_TX_SUCCESS,
        verdict,
      });
      record(`(iv) valid ${label} allows settlement`, false, pct === Number(verdict.split_buyer_pct), `gate returned buyerPct=${pct}`);
    } catch (e) {
      record(`(iv) valid ${label} allows settlement`, false, false, `gate threw: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  console.log("\n== B. Live gate checks (Studio Next, contract " + (ADDR ?? "(none)") + ") ==\n");
  if (!PK || !ADDR) {
    console.log("SKIP live checks: GENLAYER_PRIVATE_KEY / CONTRACT_ADDRESS not set.");
  } else {
    // (iii) live: file a dispute, read the verdict BEFORE judging — gate blocks.
    const liveId = `check-${Date.now().toString(36)}`;
    console.log("live dispute id:", liveId);
    const filed = await writeContract({
      privateKey: PK,
      contractAddress: ADDR,
      functionName: "file_dispute",
      args: [
        liveId,
        "check-room",
        "0xBuyer000000000000000000000000000000000001",
        "0xSeller00000000000000000000000000000000002",
        "Check: ordered 500 words in 48h, got 120 words 3 days late.",
        "Check: delivered 480 words plus headlines; delay 12h not 3 days.",
        "0.005 YUSD",
        "0.005 YUSD",
      ],
    });
    console.log("file tx:", filed.txHash, "result:", filed.resultName);
    const unjudged = await readContract<Record<string, unknown>>({
      contractAddress: ADDR,
      functionName: "get_verdict",
      args: [liveId],
    });
    console.log("verdict before judging:", JSON.stringify(unjudged));
    expectBlocked(
      "(iii) live unjudged dispute blocks settlement",
      true,
      () =>
        assertSettlementAllowed({
          fileTxResultName: filed.resultName,
          judgeTxResultName: COURT_TX_SUCCESS,
          verdict: unjudged as never,
        }),
      "not judged",
    );

    // (i) live: judge a NONEXISTENT dispute — the tx returns
    // FINISHED_WITH_ERROR (no throw) — gate blocks.
    const badId = `check-missing-${Date.now().toString(36)}`;
    const failedJudge = await writeContract({
      privateKey: PK,
      contractAddress: ADDR,
      functionName: "judge_dispute",
      args: [badId],
    });
    console.log("failed judge tx:", failedJudge.txHash, "result:", failedJudge.resultName);
    expectBlocked(
      "(i) live failed judge tx blocks settlement",
      true,
      () =>
        assertSettlementAllowed({
          fileTxResultName: COURT_TX_SUCCESS,
          judgeTxResultName: failedJudge.resultName,
          verdict: GOOD_VERDICT,
        }),
      "judge_dispute transaction did not succeed",
    );

    // (iv) live: judge the filed dispute for real — gate allows.
    const judged = await writeContract({
      privateKey: PK,
      contractAddress: ADDR,
      functionName: "judge_dispute",
      args: [liveId],
    });
    console.log("judge tx:", judged.txHash, "result:", judged.resultName);
    const verdict = await readContract<Record<string, unknown>>({
      contractAddress: ADDR,
      functionName: "get_verdict",
      args: [liveId],
    });
    console.log("verdict after judging:", JSON.stringify(verdict));
    try {
      const pct = assertSettlementAllowed({
        fileTxResultName: filed.resultName,
        judgeTxResultName: judged.resultName,
        verdict: verdict as never,
      });
      record(
        "(iv) live judged verdict allows settlement (to the Yellow boundary)",
        true,
        pct === Number((verdict as { split_buyer_pct: string }).split_buyer_pct),
        `gate returned buyerPct=${pct}; verdict=${JSON.stringify(verdict).slice(0, 200)}`,
      );
    } catch (e) {
      record(
        "(iv) live judged verdict allows settlement (to the Yellow boundary)",
        true,
        false,
        `gate threw: ${(e as Error).message.slice(0, 200)}`,
      );
    }
    console.log(
      "\nNOTE — Yellow boundary: no live Yellow room exists to settle (sandbox " +
        "YUSD faucet down, HTTP 503), so the live checks stop at the gate — " +
        "the exact point settleByVerdict() would be called. No Yellow result " +
        "is claimed.",
    );
  }

  console.log("\n== Summary ==");
  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  }
  console.log(`\n${cases.length - failed.length}/${cases.length} checks passed.`);
  if (failed.length > 0) {
    console.error("CHECKS FAILED");
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
}

main().catch((e) => {
  console.error("CHECKS ERROR:", e?.message ?? e);
  process.exit(1);
});
