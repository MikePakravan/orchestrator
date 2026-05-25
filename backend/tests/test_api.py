from pathlib import Path

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_health() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_task_workflow_persists_history(tmp_path: Path) -> None:
    settings = get_settings()
    settings.task_history_path = tmp_path / "tasks.json"
    settings.use_mock_agents = True
    client = TestClient(app)

    start_response = client.post("/api/tasks/start", json={"request": "Build a dev MVP"})

    assert start_response.status_code == 200
    task_id = start_response.json()["task_id"]

    task_response = client.get(f"/api/tasks/{task_id}")

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

