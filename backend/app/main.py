from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.agents.claude import ClaudeReviewerAgent
from app.agents.gemini import GeminiBossAgent
from app.agents.openai_agent import OpenAIArchitectBuilderAgent
from app.config import Settings, get_settings
from app.models import HealthResponse, TaskStartRequest, TaskStartResponse
from app.orchestrator import MultiAgentOrchestrator
from app.storage import TaskHistoryStore


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Multi-Agent Orchestrator", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    return app


app = create_app()


def get_store(settings: Settings = Depends(get_settings)) -> TaskHistoryStore:
    return TaskHistoryStore(settings.task_history_path)


def get_orchestrator(settings: Settings = Depends(get_settings)) -> MultiAgentOrchestrator:
    return MultiAgentOrchestrator(
        gemini=GeminiBossAgent(settings),
        openai_agent=OpenAIArchitectBuilderAgent(settings),
        claude=ClaudeReviewerAgent(settings),
    )


@app.get("/api/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", environment=settings.app_env)


@app.post("/api/tasks/start", response_model=TaskStartResponse)
async def start_task(
    request: TaskStartRequest,
    orchestrator: MultiAgentOrchestrator = Depends(get_orchestrator),
    store: TaskHistoryStore = Depends(get_store),
) -> TaskStartResponse:
    task = await orchestrator.run(request.request)
    store.save(task)
    return TaskStartResponse(task_id=task.task_id, status=task.status)


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str, store: TaskHistoryStore = Depends(get_store)):
    task = store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

