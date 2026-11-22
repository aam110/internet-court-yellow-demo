# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Internet Court dispute judge for the Yellow settlement-room demo.

Mission 101 — Internet Court: Partner Demo Lab (GenLayer x Yellow).

Role in the demo
----------------
Two agents (buyer A, seller B) trade inside one Yellow settlement room.
When they disagree about delivery, either side files the dispute here with
both sides' evidence plus the room state. Independent GenLayer validators
read the evidence in natural language and return a verdict as JSON:

    {"verdict": "release" | "refund" | "split",
     "split_buyer_pct": int,          # 0-100, share of the room funds going back to the buyer
     "reasoning": str}

The verdict is the ONLY input that decides the final co-signed split of the
Yellow room: "release" pays the seller, "refund" pays the buyer back, and
"split" divides the funds. GenLayer decides the money; Yellow holds and
releases it. Neither side can settle unilaterally.

Pattern: GenLayer boilerplate style (genlayer-project-boilerplate,
contracts/football_bets.py) — prompt_comparative judge, JSON output.
"""

import json
from dataclasses import dataclass

from genlayer import *


@allow_storage
@dataclass
class Dispute:
    id: str
    room_id: str
    buyer: str
    seller: str
    buyer_claim: str
    seller_evidence: str
    buyer_deposit: str
    seller_deposit: str
    status: str  # "open" | "judged"
    verdict: str  # "" until judged, then "release" | "refund" | "split"
    split_buyer_pct: str  # "" until judged, then "0"-"100"
    reasoning: str


class InternetCourtDispute(gl.Contract):
    disputes: TreeMap[str, Dispute]

    def __init__(self):
        pass

    def _judge(
        self, buyer_claim: str, seller_evidence: str, buyer_deposit: str, seller_deposit: str
    ) -> dict:
        def get_verdict() -> str:
            prompt = f"""You are an independent judge of the Internet Court.
Two agents traded a service inside a Yellow settlement room and now disagree
about delivery. Decide what happens to the escrowed funds.

BUYER'S CLAIM (what was promised vs what was delivered):
{buyer_claim}

SELLER'S EVIDENCE (proof of delivery / work done):
{seller_evidence}

ROOM STATE:
- Buyer deposited: {buyer_deposit}
- Seller deposited: {seller_deposit}

RULES:
- If the seller clearly delivered what was promised, verdict is "release"
  (seller keeps the funds) and split_buyer_pct is 0.
- If the seller clearly did NOT deliver, or delivered something materially
  different from the promise, verdict is "refund" (buyer gets the funds
  back) and split_buyer_pct is 100.
- If delivery was partial, late, or of mixed quality, verdict is "split"
  and split_buyer_pct is your fair percentage (0-100) of the funds going
  back to the buyer.
- Base the verdict ONLY on the evidence above. Do not invent facts.
- Keep the reasoning to 1-3 short sentences.

Respond in JSON:
{{
    "verdict": str,           // "release" | "refund" | "split"
    "split_buyer_pct": int,   // 0-100
    "reasoning": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors."""
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(result, sort_keys=True)

        result_json = json.loads(
            gl.eq_principle.prompt_comparative(
                get_verdict, "The value of verdict has to match"
            )
        )
        return result_json

    @gl.public.write
    def file_dispute(
        self,
        dispute_id: str,
        room_id: str,
        buyer: str,
        seller: str,
        buyer_claim: str,
        seller_evidence: str,
        buyer_deposit: str,
        seller_deposit: str,
    ) -> None:
        if dispute_id in self.disputes:
            raise Exception("Dispute already filed")
        dispute = Dispute(
            id=dispute_id,
            room_id=room_id,
            buyer=buyer,
            seller=seller,
            buyer_claim=buyer_claim,
            seller_evidence=seller_evidence,
            buyer_deposit=buyer_deposit,
            seller_deposit=seller_deposit,
            status="open",
            verdict="",
            split_buyer_pct="",
            reasoning="",
        )
        self.disputes[dispute_id] = dispute

    @gl.public.write
    def judge_dispute(self, dispute_id: str) -> None:
        if dispute_id not in self.disputes:
            raise Exception("Dispute not found")
        dispute = self.disputes[dispute_id]
        if dispute.status == "judged":
            raise Exception("Dispute already judged")

        verdict = self._judge(
            dispute.buyer_claim,
            dispute.seller_evidence,
            dispute.buyer_deposit,
            dispute.seller_deposit,
        )

        verdict_value = str(verdict["verdict"])
        if verdict_value not in ("release", "refund", "split"):
            raise Exception("Invalid verdict returned by judge")
        pct = int(verdict["split_buyer_pct"])
        if pct < 0 or pct > 100:
            raise Exception("Invalid split percentage returned by judge")
        # Normalize: release/refund pin the percentage.
        if verdict_value == "release":
            pct = 0
        elif verdict_value == "refund":
            pct = 100

        dispute.status = "judged"
        dispute.verdict = verdict_value
        dispute.split_buyer_pct = str(pct)
        dispute.reasoning = str(verdict["reasoning"])
        self.disputes[dispute_id] = dispute

    @gl.public.view
    def get_dispute(self, dispute_id: str) -> dict:
        if dispute_id not in self.disputes:
            raise Exception("Dispute not found")
        d = self.disputes[dispute_id]
        return {
            "id": d.id,
            "room_id": d.room_id,
            "buyer": d.buyer,
            "seller": d.seller,
            "buyer_claim": d.buyer_claim,
            "seller_evidence": d.seller_evidence,
            "buyer_deposit": d.buyer_deposit,
            "seller_deposit": d.seller_deposit,
            "status": d.status,
            "verdict": d.verdict,
            "split_buyer_pct": d.split_buyer_pct,
            "reasoning": d.reasoning,
        }

    @gl.public.view
    def get_verdict(self, dispute_id: str) -> dict:
        if dispute_id not in self.disputes:
            raise Exception("Dispute not found")
        d = self.disputes[dispute_id]
        return {
            "status": d.status,
            "verdict": d.verdict,
            "split_buyer_pct": d.split_buyer_pct,
            "reasoning": d.reasoning,
        }
