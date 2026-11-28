// Settlement gate — the steward's rule, enforced in code, not in prose.
//
// settleByVerdict() MUST NOT be called unless ALL of these hold:
//   1. every court transaction the settlement depends on SUCCEEDED — the
//      consensus receipt's resultName is exactly FINISHED_WITH_RETURN.
//      (Observed live on Studio Next: a failed judge call, e.g. judging a
//      nonexistent dispute, still returns a tx hash — with resultName
//      FINISHED_WITH_ERROR and NO throw. A tx hash alone proves nothing.)
//   2. the dispute HAS a verdict (status "judged"). An "open" / unjudged
//      dispute has no verdict to settle on.
//   3. the verdict carries a VALID split percentage: an integer 0-100,
//      consistent with the verdict label (release -> 0, refund -> 100,
//      split -> any integer 0-100). The percentage is what controls the
//      payment, so a missing, non-integer, out-of-range, or mismatched
//      percentage blocks settlement.
//
// Anything else throws BEFORE any Yellow call is made. The gate is
// fail-closed: unknown resultNames, missing fields, and malformed
// verdicts all block. Pure functions (no network) so the checks script
// can exercise every failure mode without a live chain.

/** The only consensus receipt result that means "the call succeeded". */
export const COURT_TX_SUCCESS = "FINISHED_WITH_RETURN";

export interface VerdictShape {
  status?: unknown;
  verdict?: unknown;
  split_buyer_pct?: unknown;
  reasoning?: unknown;
}

export function isCourtTxSuccess(resultName: string | undefined): boolean {
  return resultName === COURT_TX_SUCCESS;
}

/** Parse + validate the percentage exactly as the contract stores it. */
export function parseSplitPct(
  raw: unknown,
  verdictLabel: string,
): { pct: number } | { error: string } {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { error: `split_buyer_pct is missing or not a number (got ${String(raw)})` };
  }
  // The contract stores the percentage as a decimal string ("0"-"100").
  // Reject anything that is not a plain integer in range: "50.5", "abc",
  // "", 150, -1, and floats all fail here.
  const text = String(raw).trim();
  if (!/^(0|[1-9][0-9]?|100)$/.test(text)) {
    return { error: `split_buyer_pct "${text}" is not an integer 0-100` };
  }
  const pct = Number(text);
  if (verdictLabel === "release" && pct !== 0) {
    return { error: `release verdict must carry split_buyer_pct 0, got ${pct}` };
  }
  if (verdictLabel === "refund" && pct !== 100) {
    return { error: `refund verdict must carry split_buyer_pct 100, got ${pct}` };
  }
  return { pct };
}

/**
 * The full gate. Returns the validated buyer percentage on success,
 * otherwise throws with the exact reason settlement is blocked.
 * Call this AFTER the judge tx and BEFORE any Yellow settlement call.
 */
export function assertSettlementAllowed(params: {
  fileTxResultName: string | undefined;
  judgeTxResultName: string | undefined;
  verdict: VerdictShape | null | undefined;
}): number {
  const { fileTxResultName, judgeTxResultName, verdict } = params;

  if (!isCourtTxSuccess(fileTxResultName)) {
    throw new Error(
      `SETTLEMENT BLOCKED: file_dispute transaction did not succeed ` +
        `(resultName ${JSON.stringify(fileTxResultName)}). ` +
        `The dispute was never filed, so there is nothing to settle.`,
    );
  }
  if (!isCourtTxSuccess(judgeTxResultName)) {
    throw new Error(
      `SETTLEMENT BLOCKED: judge_dispute transaction did not succeed ` +
        `(resultName ${JSON.stringify(judgeTxResultName)}). ` +
        `No validator verdict exists, so settlement cannot proceed.`,
    );
  }
  if (!verdict || typeof verdict !== "object") {
    throw new Error(
      `SETTLEMENT BLOCKED: no verdict returned for the dispute.`,
    );
  }
  if (verdict.status !== "judged") {
    throw new Error(
      `SETTLEMENT BLOCKED: dispute is not judged (status ${JSON.stringify(verdict.status)}). ` +
        `An unjudged dispute has no verdict to settle on.`,
    );
  }
  const label = verdict.verdict;
  if (label !== "release" && label !== "refund" && label !== "split") {
    throw new Error(
      `SETTLEMENT BLOCKED: verdict label ${JSON.stringify(label)} is not release/refund/split.`,
    );
  }
  const parsed = parseSplitPct(verdict.split_buyer_pct, label);
  if ("error" in parsed) {
    throw new Error(`SETTLEMENT BLOCKED: ${parsed.error}.`);
  }
  if (typeof verdict.reasoning !== "string" || verdict.reasoning.length === 0) {
    throw new Error(`SETTLEMENT BLOCKED: verdict has no reasoning.`);
  }
  return parsed.pct;
}
