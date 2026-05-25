from abc import ABC, abstractmethod
from typing import Any


PLACEHOLDER_MARKERS = ("placeholder", "replace-me", "todo", "example")


class AgentConnector(ABC):
    name: str

    @abstractmethod
    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Return a structured JSON-compatible message."""


def has_configured_secret(value: str | None) -> bool:
    if value is None:
        return False

    stripped = value.strip()
    if not stripped:
        return False

    return not any(marker in stripped.lower() for marker in PLACEHOLDER_MARKERS)


def strip_sensitive_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if "key" not in key.lower() and "secret" not in key.lower()}
