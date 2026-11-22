# Video script — 45 seconds (Mission 101: Internet Court x Yellow)

Record a screen capture of `npm run demo` (terminal) + the GenLayer Studio
explorer page for the verdict transaction, then edit in CapCut. Keep the
pacing tight: one idea per shot, no shot longer than ~8 seconds.

**Required on screen:** the Internet Court, GenLayer, and Yellow logos
(opening and closing cards). All three are shown in the opening title card
below — build it in CapCut from the logos at genlayer.foundation,
internet-court (GenLayer Foundation) and yellow.com brand pages.

## Shot list

| Time | Visual | Voiceover / on-screen text |
|------|--------|----------------------------|
| 0–6s | Title card: 3 logos. "Two agents trade. One court decides." | "Two agents trade a service. The money sits in a Yellow settlement room — not with either of them." |
| 6–16s | Terminal: `npm run demo` — room opens, buyer deposits 0.01 YUSD escrow. Highlight the room id + escrow lines. | "Buyer A pays 0.01 YUSD into escrow. Seller B delivers — or says it did." |
| 16–22s | Evidence files flash (buyer-claim.md / seller-evidence.md, 2s each). | "A says the work is late and wrong. B says it is done. Neither side decides alone." |
| 22–32s | Terminal: dispute filed to the GenLayer contract; judge tx; explorer page for the verdict tx. | "The dispute goes to GenLayer. Independent validators read both sides and reach consensus." |
| 32–40s | Terminal: VERDICT block — `split, 50% to buyer` + reasoning; then the co-signed Close lines and "room closed: true". | "Verdict: split, 50–50. Both agents co-sign the split — one closing settlement, enforced by the room's quorum." |
| 40–45s | Closing card: 3 logos + repo URL. "Reproducible: code + skill, public." | "Internet Court × Yellow. Code and skill are public — anyone can rerun it." |

## Recording checklist

- [ ] Run the demo once end-to-end first (funding must be in place — see README).
- [ ] Terminal font large (18pt+), dark theme, hide unrelated windows.
- [ ] Capture at 1080p, 16:9. Export H.264 MP4, max 45 seconds.
- [ ] Add the three logos to the opening and closing cards.
- [ ] Subtitles on (CapCut auto-captions are fine) — reviewers watch muted.

## Real run to record against (verified 21 Nov 2026)

- Contract: `0xDC0090058Fac7986370b4870e07cc3e2fa1BA68f` (Studio Next, chain 61997)
- Example verdict: `split`, 50% to buyer — "Both accounts acknowledge delivery
  after the deadline, but they conflict on the length and quality of the work."
- Explorer: https://explorer-studio-dev.genlayer.com
