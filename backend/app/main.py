from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.agents.claude import ClaudeReviewerAgent
from app.agents.gemini import GeminiBossAgent
from app.agents.openai_agent import OpenAIArchitectBuilderAgent
from app.config import Settings, get_settings
from app.models import HealthResponse, TaskStartRequest, TaskStartResponse
from app.orchestrator import MultiAgentOrchestrator
from app.storage import TaskHistoryStore


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


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
    if (STATIC_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
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
    settings: Settings = Depends(get_settings),
    orchestrator: MultiAgentOrchestrator = Depends(get_orchestrator),
    store: TaskHistoryStore = Depends(get_store),
) -> TaskStartResponse:
    missing_keys = settings.missing_provider_keys()
    if missing_keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Real provider mode is enabled, but required provider keys are missing.",
                "missing": missing_keys,
                "resolution": "Set USE_MOCK_AGENTS=true for local development or configure the missing keys.",
            },
        )

    try:
        task = await orchestrator.run(request.request)
        store.save(task)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Task failed during orchestration.",
                "error_type": exc.__class__.__name__,
            },
        ) from exc

    return TaskStartResponse(task_id=task.task_id, status=task.status)


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str, store: TaskHistoryStore = Depends(get_store)):
    task = store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")

    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found")

    return FileResponse(index_path)

