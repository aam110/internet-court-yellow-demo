# Internet Court × Yellow — dispute judge over a settlement room

**GenLayer Mission 101 — Internet Court: Partner Demo Lab.** A working
integration of two Internet Court partners: **Yellow** holds the money,
**GenLayer** decides what happens to it.

Two agents trade a service inside one Yellow settlement room. When they
disagree about delivery, an independent GenLayer jury reads both sides'
evidence in natural language and returns a verdict — `release`, `refund`,
or `split` — and the room settles exactly along that verdict. Neither
agent can settle alone: the room's quorum requires both signatures, and
the split itself comes from the court's verdict, not from either party.

> **Testnet only. No real money anywhere.** Yellow runs on the sandbox
> Nitronode + Sepolia testnet (test YUSD); GenLayer runs on Studio Next
> (test GEN). All keys in this repo's workflow are throwaway test keys.

## The flow

```
Buyer A ──┐
          │  1. open room (2 participants, quorum 2 = unanimous)
Seller B ─┘
     │
     │  2. A deposits 0.01 YUSD escrow into the room (off-chain, no gas per step)
     ▼
  B delivers ──► A disputes ("late and wrong") ──► dispute + evidence filed
     │                                              to the GenLayer contract
     │  3. GenLayer validators judge (LLM consensus, prompt_comparative)
     ▼
  VERDICT {"verdict": "split", "split_buyer_pct": 50, "reasoning": "..."}
     │
     │  4. A + B co-sign the verdict's split, room closes (one final settlement)
     ▼
  Funds release to the channels: 0.005 YUSD back to A, 0.005 YUSD to B
```

**Why GenLayer is not decoration:** the verdict is the *only* input that
decides the final allocation. Remove the court and the room has no way to
split contested funds — the quorum rule means no single party can move
money alone, and the contract's verdict is what both parties sign.

## Steward response (28 Nov 2026) — what changed for the Projects review

Steward zoefunds (27 Nov 2026) asked for three things before the
11 Dec 2026 deadline; all three are done and linked here:

1. **Validator agreement covers the split percentage.** The judge's
   equivalence principle is now *"The values of verdict and
   split_buyer_pct have to match"* (was: verdict only), so validators
   agree on the percentage that controls payment, not just the label.
   The contract also validates strictly: the percentage must be a JSON
   integer 0–100 (`release` must carry 0, `refund` must carry 100); any
   other value is rejected, never silently rewritten — the stored
   percentage is exactly the agreed one.
2. **Settlement is gated.** `demo/settlement-gate.ts` blocks settlement
   unless BOTH court transactions succeeded (receipt resultName is
   exactly `FINISHED_WITH_RETURN` — a tx hash alone proves nothing: a
   failed judge call still returns a hash, with `FINISHED_WITH_ERROR`)
   AND the verdict is judged with a valid percentage. `demo/settle-dispute.ts`
   calls the gate before any Yellow call. Failed, unjudged, and
   invalid-percentage cases all abort with a clear error.
3. **`.env` setup fixed + documented.** The documented flow
   (`cp .env.example .env`, then `npm run demo`) previously did NOT
   load `.env` at all — nothing read it. All entry points now load it
   via `dotenv` (verified — see "Environment setup"), and the explicit
   export step is documented as a fallback.
4. **Checks:** `scripts/check-settlement-gates.ts` proves the gates with
   real runs — **18/18 checks passed** (15 pure + 3 live on Studio
   Next), including a live failed judge tx, a live unjudged dispute,
   and a live judged verdict. See "Settlement-gate checks" below.

## Live status (verified 28 Nov 2026)

| Piece | Status |
|---|---|
| GenLayer contract deployed (Studio Next, chain 61997) — **v2, current** | ✅ `0x9d886f66a042Ce1d96Bd32e58360c7233F4370b9` — [explorer](https://explorer-studio-dev.genlayer.com/address/0x9d886f66a042Ce1d96Bd32e58360c7233F4370b9) |
| Deploy tx (v2) | `0x692c3b1c7ac2cd61a4dddd16bd8ee555320318dabd1f89eb086440d0495b4246` |
| Dispute filed + judged on-chain, v2 contract (run 1) | ✅ verdict `split`, 50% to buyer — judge tx `0x7aa1ec9b47c1e96834d074a0d4933d4d0610c85773e019a9955d424684957c4e` |
| Dispute filed + judged on-chain, v2 contract (checks run) | ✅ verdict `split`, 50% to buyer — judge tx `0xaf0a4f92ad61b3d7f0a2f56bc9a0693d132a4b49d28c5bc2d3c925ec44196586` |
| Settlement-gate checks | ✅ **18/18 passed** (15 pure + 3 live) — `npm run check:gates` |
| Yellow room open → deposit → verdict split → close | 🟡 code-complete, **awaiting sandbox YUSD faucet** (see below) |

Superseded v1 contract (still live, kept for the record):
`0xDC0090058Fac7986370b4870e07cc3e2fa1BA68f`, deploy tx
`0x60964770ebca8e4f3e4aef014819e472e46acdb1de360f4ce5315191600a5e77`,
judge txs `0x8056414f…` and `0x621e73c1…` (both split, 50% to buyer).

Example verdict reasoning (real, from run 2 — validators, not scripted):

> "Both accounts acknowledge delivery after the deadline, but they
> conflict on the length and quality of the work. A 50% split reflects
> the admitted lateness and disputed extent of fulfillment; the
> referenced drafts are not included in the evidence provided."

### Yellow funding status (honest note)

The demo's Yellow half needs 0.01 test YUSD in the buyer's account. The
sandbox faucet (`https://nitronode-sandbox.yellow.org/v1/playground/`,
API `POST /v1/faucet-app/requestTokens`) returned **HTTP 503** on every
attempt on 21 Nov 2026 — and again when re-checked on 28 Nov 2026 — the
faucet service itself is down, so the live room run could not be completed
from this machine yet. The full code path is written and type-checked; the moment the faucet is back, `npm run demo`
runs end-to-end. If you are reproducing this and the faucet is up, the
funding step is: connect a disposable wallet in the playground, drip YUSD,
and (only if the faucet funds on-chain rather than the channel) a little
Sepolia ETH from https://sepoliafaucet.com for gas.

## Reproduce it

### Prerequisites

- Node.js 20+ (tested on Node 24)
- Three throwaway test keys (buyer, seller, GenLayer caller). Generate with:
  `node -e "console.log(require('viem/accounts').generatePrivateKey())"`
  Never reuse a key that holds real funds.

### Steps

```bash
git clone https://github.com/aam110/internet-court-yellow-demo.git
cd internet-court-yellow-demo
npm install
cp .env.example .env   # fill in the three keys + CONTRACT_ADDRESS
```

### Environment setup — `.env` loading (verified 28 Nov 2026)

All entry points (`npm run demo`, `npm run deploy:contract`,
`npm run check:gates`, `npm run test:contract`) load the repo-root `.env`
file via `dotenv` before reading any variable. Verified: with no shell
exports at all, `npm run check:gates` picked up `GENLAYER_PRIVATE_KEY`
and `CONTRACT_ADDRESS` from `.env` and ran its live checks against
Studio Next. (Before 28 Nov 2026 this did NOT work — nothing loaded
`.env`, so the file was silently ignored.)

**Explicit export step (fallback, if `.env` loading ever fails):**

```bash
set -a; source .env; set +a   # export every line of .env into the shell
npm run demo
# or export just the keys you need:
export GENLAYER_PRIVATE_KEY=0x... CONTRACT_ADDRESS=0x...
npm run demo
```

Never commit `.env` — it is gitignored. Keys are throwaway test keys only.

**1. Fund the test accounts (all free, all testnet)**

- **GenLayer caller:** fund with test GEN via the Studio Next faucet call
  (the same call the Studio "Fund account" button makes):
  ```bash
  curl -s https://studio-dev.genlayer.com/api -X POST \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"sim_fundAccount",
         "params":["<YOUR_CHECKSUMMED_ADDRESS>","100000000000000000000"]}'
  ```
  (Use a checksummed address — lowercase addresses are silently ignored.)
- **Yellow buyer:** drip test YUSD from the sandbox playground faucet —
  https://nitronode-sandbox.yellow.org/v1/playground/ — and a little Sepolia
  ETH from https://sepoliafaucet.com if on-chain funding is needed.
  The seller needs no funds at all (it only signs off-chain messages).

**2. Deploy the court contract (or reuse the deployed one)**

```bash
GENLAYER_PRIVATE_KEY=0x... npm run deploy:contract
# prints CONTRACT_ADDRESS=0x... — put it in .env
```

**3. Run the demo**

```bash
npm run demo
```

Expected output: room opens → escrow deposited → dispute filed → GenLayer
verdict printed → verdict split co-signed → room closed. The whole run is
also exercised contract-only via `npx tsx scripts/test-contract.ts`.

### Settlement-gate checks

```bash
npm run check:gates
```

Runs `scripts/check-settlement-gates.ts` — 18 checks, all must pass:

- **Pure (15, no network):** failed judge tx blocks; failed file tx
  blocks; unknown resultName blocks (fail-closed); missing / non-numeric /
  out-of-range / fractional / empty percentage blocks; `release` carrying
  50 and `refund` carrying 0 block; unjudged dispute blocks; missing
  verdict blocks; valid `split 50`, `release 0`, `refund 100` allow.
- **Live (3, Studio Next):** a real unjudged dispute blocks; a real
  failed judge tx (judging a nonexistent dispute, receipt
  `FINISHED_WITH_ERROR`) blocks; a real judged verdict (split, 50%)
  allows settlement — stopping at the Yellow boundary, because the
  sandbox faucet is down (HTTP 503) and no live room exists to settle.

Result on 28 Nov 2026: **18/18 passed.**

## How it works

### The court contract — `contracts/internet_court_dispute.py`

A GenLayer Intelligent Contract (Python, boilerplate style from
`genlayerlabs/genlayer-project-boilerplate`):

- `file_dispute(dispute_id, room_id, buyer, seller, buyer_claim,
  seller_evidence, buyer_deposit, seller_deposit)` — stores the open dispute.
- `judge_dispute(dispute_id)` — runs the judge: the claim, evidence, and room
  state go to `gl.nondet.exec_prompt(..., response_format="json")`, wrapped in
  `gl.eq_principle.prompt_comparative` with the criterion
  *"The values of verdict and split_buyer_pct have to match"*, so
  independent validators must agree on the verdict AND on the percentage
  that controls payment. The contract then validates strictly: the
  percentage must be a JSON integer 0–100, `release` must carry 0 and
  `refund` must carry 100 — anything else is rejected, never silently
  rewritten, so the stored percentage is exactly the agreed one.
- `get_dispute` / `get_verdict` — read-only views.

Verdict rules are in the prompt: clear delivery → `release` (0% to buyer);
clear non-delivery → `refund` (100% to buyer); partial/late/mixed →
`split` with a fair percentage.

### The settlement gate — `demo/settlement-gate.ts`

`demo/settle-dispute.ts` does not settle on a tx hash or a raw verdict.
Before any Yellow call it runs `assertSettlementAllowed()`, which requires
all three: (1) both court transactions succeeded — receipt resultName
exactly `FINISHED_WITH_RETURN` for `file_dispute` and `judge_dispute`
(a failed consensus call still returns a tx hash, with resultName
`FINISHED_WITH_ERROR`, and never throws — so the receipt must be checked);
(2) the dispute is judged (`status == "judged"`); (3) the verdict carries
a valid percentage — integer 0–100, consistent with the label
(`release` → 0, `refund` → 100). Any failure throws with the exact reason
and no Yellow call happens. The gate is fail-closed: unknown resultNames
and malformed verdicts block. The percentage passed to
`settleByVerdict()` is the gate-validated one, not the raw field.

### The room — `demo/yellow.ts`

Built on `@yellow-org/sdk` v1 following the official quickstart and the
`yellow-settlement-room` skill (copied under `skill/`, MIT):

- Two participants, equal weight 1, **quorum 2 (unanimous)** — no unilateral
  settlement.
- Buyer deposits escrow via `submitAppSessionDeposit`; the verdict split is
  applied with an `Operate` update restating the full allocation, then a
  `Close` update releases everything to the channels.
- Every update re-reads live session state (`version` must be exactly
  `session.version + 1`) and is signed by both parties with
  `AppSessionWalletSignerV1`.

### The signing path — `demo/genlayer.ts`

Headless deploys/calls use `genlayer-js` **2.0.0-rc.3** (1.1.8 lacks the
Studio Next chain and its deploy path omits the fees distribution — the
consensus contract reverts with `FeesDistributionMissing`). The flow is the
one proven by the live Mission 101 x402 demo: `estimateTransactionFees` →
build the consensus `addTransaction` calldata → sign locally with viem →
broadcast a legacy tx (gasPrice 0, no `type` field).

## Honest limits

- **Settlement is cooperative, by design.** Per the Yellow skill's
  "Composes with" section, the intended composition is *verdict-informed
  cooperative settlement*: the parties agree up front to sign the split the
  verdict dictates. Adjudicator-enforced settlement against a
  non-cooperative party is roadmap, not shipped — a session has no dispute
  mechanism, challenge, or timeout of its own. If a party refuses to
  co-sign, funds stay in the session. Do not place already-contested funds
  in a session.
- **Node trust.** Funds leave a session only via a node-co-signed release;
  if the sandbox node won't co-sign, there is no on-chain path out. The
  protocol is not fully trust-minimized — weaker than on-chain escrow,
  stronger than a spending-allowance delegation.
- **Studio Next state is not guaranteed** across deployments; the contract
  source + deploy script are in this repo so the court can be redeployed
  in one command.

## Repo layout

```
internet-court-yellow-demo/
  README.md                  # this file
  package.json               # @yellow-org/sdk, genlayer-js, viem, tsx
  .env.example               # keys + contract address (throwaway test keys only)
  skill/yellow-settlement-room/   # Yellow's agent skill, copied verbatim (MIT)
    SKILL.md
    references/agent-lifecycle.md
    LICENSE
  contracts/
    internet_court_dispute.py     # GenLayer Intelligent Contract (the judge)
  demo/
    settle-dispute.ts             # full CLI: room -> dispute -> verdict -> settle
    settlement-gate.ts            # settlement gate: court txs + valid % required
    yellow.ts                     # Yellow room helpers (connect/fund/room/settle)
    genlayer.ts                   # Studio Next deploy/call helpers
    evidence/
      buyer-claim.md              # buyer side of the demo dispute
      seller-evidence.md          # seller side of the demo dispute
  scripts/
    deploy-contract.ts            # deploy the court contract
    test-contract.ts              # contract-only live smoke test
    check-settlement-gates.ts     # steward checks: 18/18 (15 pure + 3 live)
  video/
    script-45s.md                 # shot list + voiceover for the 45s demo video
```

## Mission

Built for **GenLayer Mission 101 — Internet Court: Partner Demo Lab**
(partner: Yellow). Demo video: 45 seconds, see `video/script-45s.md`.
