from typing import Any

import pytest

from app.orchestrator import MultiAgentOrchestrator


class FakeGeminiAgent:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(payload)
        if "claude_feedback" in payload:
            return {
                "feedback_decisions": [
                    {"id": "fix-approved", "decision": "approved", "modified_fix": "Apply the security fix."},
                    {"id": "fix-modified", "decision": "modified", "modified_fix": "Apply a scoped ops fix."},
                    {"id": "fix-rejected", "decision": "rejected", "modified_fix": "Do not apply this."},
                ]
            }

        return {
            "product_goal": "Build the MVP.",
            "requirements": ["Capture requests.", "Persist history."],
            "acceptance_criteria": ["Every workflow step is visible."],
        }


class FakeOpenAIAgent:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(payload)
        if "approved_fixes" in payload:
            return {"final_solution": "done", "approved_fixes": payload["approved_fixes"]}

        return {"architecture": "initial"}


class FakeClaudeAgent:
    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "feedback": [
                {"id": "fix-approved", "severity": "high", "recommendation": "Apply the security fix."},
                {"id": "fix-modified", "severity": "medium", "recommendation": "Apply an ops fix."},
                {"id": "fix-rejected", "severity": "low", "recommendation": "Do not apply this."},
            ],
            "reviewed_payload_keys": sorted(payload.keys()),
        }


@pytest.mark.asyncio
async def test_orchestrator_sends_only_gemini_approved_fixes_to_final_openai_step() -> None:
    gemini = FakeGeminiAgent()
    openai_agent = FakeOpenAIAgent()
    claude = FakeClaudeAgent()
    orchestrator = MultiAgentOrchestrator(gemini=gemini, openai_agent=openai_agent, claude=claude)

    task = await orchestrator.run("Build the MVP")

    assert task.status == "completed"
    assert [message.step for message in task.history] == [
        "requirements",
        "architecture_proposal",
        "review_feedback",
        "feedback_decisions",
        "final_solution",
    ]
    final_openai_payload = openai_agent.calls[-1]
    assert [fix["id"] for fix in final_openai_payload["approved_fixes"]] == ["fix-approved", "fix-modified"]
    assert "fix-rejected" not in {fix["id"] for fix in final_openai_payload["approved_fixes"]}
