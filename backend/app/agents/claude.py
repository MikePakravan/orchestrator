from typing import Any

from anthropic import AsyncAnthropic

from app.agents.base import AgentConnector
from app.config import Settings


class ClaudeReviewerAgent(AgentConnector):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.settings.use_mock_agents or not self.settings.anthropic_api_key:
            return self._mock(payload)

        client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        response = await client.messages.create(
            model=self.settings.claude_model,
            max_tokens=1500,
            messages=[
                {
                    "role": "user",
                    "content": "You are the Claude Reviewer Agent. Provide JSON feedback only. Do not modify code.\n"
                    f"Payload: {payload}",
                }
            ],
        )
        return {"raw_response": response.content[0].text}

    def _mock(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "feedback": [
                {
                    "id": "security-001",
                    "category": "security",
                    "severity": "high",
                    "finding": "Provider credentials must be read from environment variables only.",
                    "recommendation": "Keep API keys out of source files, README examples, and logs.",
                },
                {
                    "id": "ops-001",
                    "category": "operations",
                    "severity": "medium",
                    "finding": "Dev infrastructure should not expose destructive resource operations.",
                    "recommendation": "Include create/update IaC only and avoid delete scripts or delete workflows.",
                },
            ],
            "reviewed_payload_keys": sorted(payload.keys()),
        }

