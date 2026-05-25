from abc import ABC, abstractmethod
from typing import Any


class AgentConnector(ABC):
    @abstractmethod
    async def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Return a structured JSON-compatible message."""


def strip_sensitive_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if "key" not in key.lower() and "secret" not in key.lower()}

