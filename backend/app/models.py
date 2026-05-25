from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AgentRole(str, Enum):
    gemini_boss = "gemini_boss"
    openai_architect_builder = "openai_architect_builder"
    claude_reviewer = "claude_reviewer"


class TaskStatus(str, Enum):
    completed = "completed"
    failed = "failed"


class TaskStartRequest(BaseModel):
    request: str = Field(min_length=1, max_length=8000)


class AgentMessage(BaseModel):
    role: AgentRole
    step: str
    content: dict[str, Any]
    created_at: datetime = Field(default_factory=utc_now)


class TaskRecord(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid4()))
    status: TaskStatus
    user_request: str
    history: list[AgentMessage]
    final_output: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class TaskStartResponse(BaseModel):
    task_id: str
    status: TaskStatus


class HealthResponse(BaseModel):
    status: str
    environment: str
    service: str = "multi-agent-orchestrator"

