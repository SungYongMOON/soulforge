from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Optional

from ..models import FetchResult


@dataclass
class ConnectorExecutionError(Exception):
    code: str
    message: str
    retryable: bool = False
    detail: Optional[Dict[str, Any]] = None

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"


class BaseConnector(ABC):
    source: str

    def __init__(self, source: str) -> None:
        self.source = source

    @abstractmethod
    def fetch_since(self, cursor: Optional[Dict[str, Any]], limit: int) -> FetchResult:
        raise NotImplementedError
