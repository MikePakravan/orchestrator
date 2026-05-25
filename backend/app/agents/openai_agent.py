from typing import Any

from openai import AsyncOpenAI

from app.agents.base import AgentConnector, has_configured_secret
from app.config import Settings


class OpenAIArchitectBuilderAgent(AgentConnector):
    name = "openai_architect_builder"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.settings.use_mock_agents or not has_configured_secret(self.settings.openai_api_key):
            return self._mock(payload)

        client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        response = await client.chat.completions.create(
            model=self.settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are the OpenAI Architect/Builder Agent. Return concise JSON-compatible architecture and implementation output.",
                },
                {"role": "user", "content": str(payload)},
            ],
            temperature=0.2,
        )
        return {"raw_response": response.choices[0].message.content}

    def _mock(self, payload: dict[str, Any]) -> dict[str, Any]:
        if "approved_fixes" in payload:
            return {
                "final_solution": {
                    "summary": "Updated implementation proposal with Gemini-approved review fixes applied.",
                    "approved_fixes_applied": payload["approved_fixes"],
                    "delivery": ["React frontend", "FastAPI backend", "Azure dev IaC", "build/test GitHub Actions"],
                }
            }

        return {
            "architecture": {
                "frontend": "React/Vite single-page app served separately in local dev.",
                "backend": "FastAPI API with provider connector classes and JSON file task history.",
                "cloud": "Azure App Service, Linux plan, Key Vault, Storage Account, Application Insights, Log Analytics.",
            },
            "implementation_plan": [
                "Create typed agent message contracts.",
                "Run the required sequential orchestration workflow.",
                "Store task history after completion.",
                "Keep deployment out of CI for the dev MVP.",
            ],
        }
