from app.agents.claude import ClaudeReviewerAgent
from app.agents.gemini import GeminiBossAgent
from app.agents.openai_agent import OpenAIArchitectBuilderAgent
from app.models import AgentMessage, AgentRole, TaskRecord, TaskStatus


class MultiAgentOrchestrator:
    def __init__(
        self,
        gemini: GeminiBossAgent,
        openai_agent: OpenAIArchitectBuilderAgent,
        claude: ClaudeReviewerAgent,
    ) -> None:
        self.gemini = gemini
        self.openai_agent = openai_agent
        self.claude = claude

    async def run(self, user_request: str) -> TaskRecord:
        history: list[AgentMessage] = []

        gemini_requirements = await self.gemini.run({"user_request": user_request})
        history.append(AgentMessage(role=AgentRole.gemini_boss, step="requirements", content=gemini_requirements))

        openai_proposal = await self.openai_agent.run(
            {"user_request": user_request, "gemini_requirements": gemini_requirements}
        )
        history.append(
            AgentMessage(role=AgentRole.openai_architect_builder, step="architecture_proposal", content=openai_proposal)
        )

        claude_feedback = await self.claude.run(
            {"gemini_requirements": gemini_requirements, "openai_proposal": openai_proposal}
        )
        history.append(AgentMessage(role=AgentRole.claude_reviewer, step="review_feedback", content=claude_feedback))

        gemini_decisions = await self.gemini.run(
            {"gemini_requirements": gemini_requirements, "claude_feedback": claude_feedback}
        )
        history.append(AgentMessage(role=AgentRole.gemini_boss, step="feedback_decisions", content=gemini_decisions))

        approved_fixes = [
            decision
            for decision in gemini_decisions.get("feedback_decisions", [])
            if decision.get("decision") in {"approved", "modified"}
        ]
        final_solution = await self.openai_agent.run(
            {
                "user_request": user_request,
                "gemini_requirements": gemini_requirements,
                "openai_proposal": openai_proposal,
                "approved_fixes": approved_fixes,
            }
        )
        history.append(
            AgentMessage(role=AgentRole.openai_architect_builder, step="final_solution", content=final_solution)
        )

        return TaskRecord(
            status=TaskStatus.completed,
            user_request=user_request,
            history=history,
            final_output=final_solution,
        )

