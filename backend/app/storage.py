import json
from pathlib import Path

from app.models import TaskRecord, utc_now


class TaskHistoryStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def save(self, task: TaskRecord) -> None:
        tasks = self._read_all()
        task.updated_at = utc_now()
        tasks[task.task_id] = task.model_dump(mode="json")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(tasks, indent=2), encoding="utf-8")

    def get(self, task_id: str) -> TaskRecord | None:
        raw_task = self._read_all().get(task_id)
        if raw_task is None:
            return None
        return TaskRecord.model_validate(raw_task)

    def _read_all(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

