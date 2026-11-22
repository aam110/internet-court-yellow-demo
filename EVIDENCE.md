# Evidence — Internet Court x Yellow (GenLayer Mission 101 / Projects)

Real, verifiable artifacts behind this demo. Nothing here is simulated or
mocked; every transaction below happened on a live testnet.

## GenLayer judge contract (live on Studio Next)

- **Contract:** `0xDC0090058Fac7986370b4870e07cc3e2fa1BA68f`
- **Chain:** GenLayer Studio Next (chain ID 61997), test GEN only
- **Deploy tx:** `0x60964770ebca8e4f3e4aef014819e472e46acdb1de360f4ce5315191600a5e77`
- **Explorer:** https://explorer-studio-dev.genlayer.com/address/0xDC0090058Fac7986370b4870e07cc3e2fa1BA68f
- **Source:** `contracts/internet_court_dispute.py` (judge: `file_dispute` /
  `judge_dispute` via `prompt_comparative` / `get_verdict`)

## Two real validator-consensus verdicts

Both disputes were judged by GenLayer validator consensus. Both verdicts:
**split, 50% to buyer** — with distinct reasoning each time.

1. **Judge tx**
   `0x8056414fd36815159e36539ae63cc5604ff89ac3c1c2f70e93bee57ce2ee946a`
   — verdict: split, 50% to buyer.
2. **Judge tx**
   `0x621e73c13ea09e096a6d0c76aca7116240655bf67f6793a38a920a6955cc2767`
   — verdict: split, 50% to buyer. Reasoning begins: "Both accounts
   acknowledge delivery after the deadline, but they conflict on the length
   and quality of the work…"

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
  21 Nov 2026, so the live end-to-end run awaits the faucet. The demo code
  (`demo/settle-dispute.ts`, `demo/yellow.ts`) is written and type-checked;
  the moment the faucet is back, `npm run demo` runs end-to-end.
- **Demo buyer address:** `0x9f716A8CCeD20f7Ac1EEc44d41345e0d447E39EE`
  (throwaway test key, never a real wallet).

## Demo video

45-second demo video (5 AI-generated clips + title card with the Internet
Court, GenLayer, and Yellow logos): `video/demo-45s.mp4` (in this repo).
Script: `video/script-45s.md`.
