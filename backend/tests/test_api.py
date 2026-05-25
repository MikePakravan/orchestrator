from pathlib import Path

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_health() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "multi-agent-orchestrator"


def test_task_workflow_persists_history(tmp_path: Path) -> None:
    settings = get_settings()
    original_path = settings.task_history_path
    original_mock_mode = settings.use_mock_agents
    try:
        settings.task_history_path = tmp_path / "tasks.json"
        settings.use_mock_agents = True
        client = TestClient(app)

        start_response = client.post("/api/tasks/start", json={"request": "Build a dev MVP"})

        assert start_response.status_code == 200
        start_payload = start_response.json()
        assert start_payload["task_id"]
        assert start_payload["status"] == "completed"

        task_response = client.get(f"/api/tasks/{start_payload['task_id']}")

        assert task_response.status_code == 200
        task = task_response.json()
        assert task["status"] == "completed"
        assert [message["step"] for message in task["history"]] == [
            "requirements",
            "architecture_proposal",
            "review_feedback",
            "feedback_decisions",
            "final_solution",
        ]
        assert task["final_output"]["final_solution"]["approved_fixes_applied"]
        assert settings.task_history_path.exists()
    finally:
        settings.task_history_path = original_path
        settings.use_mock_agents = original_mock_mode


def test_task_start_returns_clear_error_when_real_provider_mode_lacks_keys(tmp_path: Path) -> None:
    settings = get_settings()
    original_path = settings.task_history_path
    original_mock_mode = settings.use_mock_agents
    original_keys = (settings.gemini_api_key, settings.openai_api_key, settings.anthropic_api_key)
    try:
        settings.task_history_path = tmp_path / "tasks.json"
        settings.use_mock_agents = False
        settings.gemini_api_key = None
        settings.openai_api_key = None
        settings.anthropic_api_key = None
        client = TestClient(app)

        response = client.post("/api/tasks/start", json={"request": "Build a dev MVP"})

        assert response.status_code == 503
        detail = response.json()["detail"]
        assert detail["message"] == "Real provider mode is enabled, but required provider keys are missing."
        assert detail["missing"] == ["GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]
        assert "USE_MOCK_AGENTS=true" in detail["resolution"]
    finally:
        settings.task_history_path = original_path
        settings.use_mock_agents = original_mock_mode
        settings.gemini_api_key, settings.openai_api_key, settings.anthropic_api_key = original_keys

