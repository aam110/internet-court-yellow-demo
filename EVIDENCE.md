# Evidence — Internet Court x Yellow (GenLayer Mission 101 / Projects)

Real, verifiable artifacts behind this demo. Nothing here is simulated or
mocked; every transaction below happened on a live testnet.

## Steward response (28 Nov 2026) — Projects submission `3f9e08fb…`

Steward zoefunds (27 Nov 2026) asked for: validator agreement covering
the split percentage, settlement gated on successful court transactions +
valid-percentage verdict, a working `.env` setup (or explicit export
step), and linked corrected source + checks. All done — see below and
`README.md` ("Steward response"). Respond-by deadline: **11 Dec 2026**.

## GenLayer judge contract — v2 (live on Studio Next, current)

- **Contract:** `0x9d886f66a042Ce1d96Bd32e58360c7233F4370b9`
- **Chain:** GenLayer Studio Next (chain ID 61997), test GEN only
- **Deploy tx:** `0x692c3b1c7ac2cd61a4dddd16bd8ee555320318dabd1f89eb086440d0495b4246`
- **Explorer:** https://explorer-studio-dev.genlayer.com/address/0x9d886f66a042Ce1d96Bd32e58360c7233F4370b9
- **Source:** `contracts/internet_court_dispute.py` (judge: `file_dispute` /
  `judge_dispute` via `prompt_comparative` / `get_verdict`)
- **What changed in v2:** the equivalence principle is now *"The values of
  verdict and split_buyer_pct have to match"* (validators agree on the
  percentage that controls payment, not just the label); strict validation
  (percentage must be a JSON integer 0–100; `release` → 0, `refund` → 100,
  anything else rejected, never silently rewritten).

### Two real validator-consensus verdicts on the v2 contract

1. **Judge tx**
   `0x7aa1ec9b47c1e96834d074a0d4933d4d0610c85773e019a9955d424684957c4e`
   — verdict: split, 50% to buyer. Reasoning: "The parties give directly
   conflicting accounts of word count, translation quality, and delay, and
   the room evidence does not resolve which account is accurate. Because
   delivery is disputed and may be partial or late, a 50/50 split is the
   fairest outcome."
2. **Judge tx** (settlement-gate checks run)
   `0xaf0a4f92ad61b3d7f0a2f56bc9a0693d132a4b49d28c5bc2d3c925ec44196586`
   — verdict: split, 50% to buyer. Reasoning: "Both accounts indicate late
   delivery, but they conflict on the word count and extent of the delay.
   With no evidence resolving those differences, an equal split fairly
   reflects admitted lateness and disputed completion."

## Settlement-gate checks — 18/18 passed (28 Nov 2026)

`scripts/check-settlement-gates.ts` (`npm run check:gates`):

- **15 pure checks (no network):** failed judge tx blocks; failed file tx
  blocks; unknown resultName blocks (fail-closed); missing / non-numeric /
  out-of-range / fractional / empty percentage blocks; `release` carrying
  50 and `refund` carrying 0 block; unjudged dispute blocks; missing
  verdict blocks; valid `split 50`, `release 0`, `refund 100` allow.
- **3 live checks (Studio Next, v2 contract):**
  - Unjudged dispute blocks — dispute `check-mx07d4na`, file tx
    `0xd5f7c54d9c1ecb5114abccfd5cd8e3facb9c5acfc500cee9e97deea45b04bc6c`
    (`FINISHED_WITH_RETURN`), verdict read before judging is
    `status "open"` → gate blocked.
  - Failed judge tx blocks — judging a nonexistent dispute returned tx
    `0x2d24f8beb2ef5af33b89bd85565b6fa4bf698a66da36e2674430bbe1ac104b89`
    with resultName `FINISHED_WITH_ERROR` (no throw — a tx hash alone
    proves nothing) → gate blocked.
  - Judged verdict allows — judge tx
    `0xaf0a4f92ad61b3d7f0a2f56bc9a0693d132a4b49d28c5bc2d3c925ec44196586`
    (`FINISHED_WITH_RETURN`), verdict split 50% → gate returned
    buyerPct=50. The check stops at the Yellow boundary (see below).

## `.env` setup — verified working (28 Nov 2026)

All entry points load the repo-root `.env` via `dotenv`. Verified with no
shell exports at all: `npm run check:gates` picked up
`GENLAYER_PRIVATE_KEY` and `CONTRACT_ADDRESS` from `.env` and ran its live
checks. Before this fix nothing loaded `.env` — the documented
`cp .env.example .env` flow was silently ignored. An explicit export step
(`set -a; source .env; set +a`) is documented in the README as a fallback.

## GenLayer judge contract — v1 (superseded, kept for the record)

- **Contract:** `0xDC0090058Fac7986370b4870e07cc3e2fa1BA68f`
- **Deploy tx:** `0x60964770ebca8e4f3e4aef014819e472e46acdb1de360f4ce5315191600a5e77`
- **Explorer:** https://explorer-studio-dev.genlayer.com/address/0xDC0090058Fac7986370b4870e07cc3e2fa1BA68f
- **Verdicts (both split, 50% to buyer):**
  1. Judge tx `0x8056414fd36815159e36539ae63cc5604ff89ac3c1c2f70e93bee57ce2ee946a`
  2. Judge tx `0x621e73c13ea09e096a6d0c76aca7116240655bf67f6793a38a920a6955cc2767`
  (Reasoning, run 2: "Both accounts acknowledge delivery after the
  deadline, but they conflict on the length and quality of the work…")
- A third probe verdict on v1 (28 Nov 2026, receipt-shape probe): judge tx
  `0xd99bda02ae8dbbe4a1a1aae399e65a47d98fcd0547ef030ed81d93e1bb111f23`,
  split 50% to buyer — this probe also proved a failed judge call returns
  `FINISHED_WITH_ERROR` with a tx hash
  (`0x13e60f6e2a60749427d700db9d8ddd533657738348e8efbd22d45f69577073dc`).

Evidence files the judges read: `demo/evidence/buyer-claim.md` and
`demo/evidence/seller-evidence.md`.

## Yellow settlement room (code-complete, awaiting faucet)

- **Design:** two agents trade in one Yellow (Nitrolite) settlement room;
  buyer deposits **0.01 test YUSD** escrow; on dispute the case goes to the
  GenLayer judge above; both agents close the room with a co-signed
  settlement.
- **Sandbox node (live probe):** `wss://nitronode-sandbox.yellow.org/v1/ws`
  (node `0x6f375dad…`, Sepolia 11155111, assets `eth` / `yellow` / `yusd`).
- **Status:** the Yellow sandbox YUSD faucet
  (`POST /v1/faucet-app/requestTokens`) has returned HTTP 503 since
  21 Nov 2026 — re-checked 28 Nov 2026, still 503 — so the live
  end-to-end run awaits the faucet. The demo code
  (`demo/settle-dispute.ts`, `demo/yellow.ts`) is written and type-checked;
  the moment the faucet is back, `npm run demo` runs end-to-end. The
  settlement-gate checks (18/18, see above) stop exactly at the Yellow
  boundary and claim no Yellow result.
- **Demo buyer address:** `0x9f716A8CCeD20f7Ac1EEc44d41345e0d447E39EE`
  (throwaway test key, never a real wallet).

## Demo video

45-second demo video (5 AI-generated clips + title card with the Internet
Court, GenLayer, and Yellow logos): `video/demo-45s.mp4` (in this repo).
Script: `video/script-45s.md`.
