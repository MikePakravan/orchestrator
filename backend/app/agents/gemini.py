from typing import Any

import httpx

from app.agents.base import AgentConnector
from app.config import Settings


class GeminiBossAgent(AgentConnector):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.settings.use_mock_agents or not self.settings.gemini_api_key:
            return self._mock(payload)

        prompt = (
            "You are the Gemini Boss Agent. Return strict JSON with product_goal, "
            "requirements, acceptance_criteria, and feedback_decisions when feedback is present.\n"
            f"Payload: {payload}"
        )
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.settings.gemini_model}:generateContent"
        )
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                params={"key": self.settings.gemini_api_key},
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
            response.raise_for_status()
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return {"raw_response": text}

    def _mock(self, payload: dict[str, Any]) -> dict[str, Any]:
        if "claude_feedback" in payload:
            feedback_items = payload["claude_feedback"].get("feedback", [])
            decisions = [
                {
                    "id": item.get("id", f"feedback-{index + 1}"),
                    "decision": "approved" if item.get("severity") in {"critical", "high", "medium"} else "rejected",
                    "reason": "Approved for MVP quality bar." if item.get("severity") != "low" else "Deferred for dev MVP.",
                    "modified_fix": item.get("recommendation"),
                }
                for index, item in enumerate(feedback_items)
            ]
            return {"feedback_decisions": decisions}

        request = payload["user_request"]
        return {
            "product_goal": "Create a dev-only multi-agent orchestrator MVP.",
            "requirements": [
                "Accept a user request from the UI.",
                "Coordinate Gemini, OpenAI, and Claude agent roles with structured JSON messages.",
                "Persist task history.",
                "Expose start, task lookup, and health API endpoints.",
            ],
            "acceptance_criteria": [
                "A user can submit a request and see every workflow step.",
                "Only Gemini-approved Claude feedback is sent to OpenAI for final updates.",
                "The application can run locally without real provider keys.",
                "No secrets, tenant IDs, or subscription IDs are stored in the repository.",
            ],
            "source_request": request,
        }

