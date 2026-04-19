import secrets
import time
from dataclasses import dataclass


@dataclass
class TempTokenRecord:
    storage_key: str
    expires_at: float


class TempTokenService:
    def __init__(self) -> None:
        self._token_map: dict[str, TempTokenRecord] = {}

    def issue(self, storage_key: str, ttl_seconds: int = 300) -> str:
        token = secrets.token_urlsafe(24)
        self._token_map[token] = TempTokenRecord(storage_key=storage_key, expires_at=time.time() + ttl_seconds)
        return token

    def resolve(self, token: str) -> str | None:
        record = self._token_map.get(token)
        if not record:
            return None
        if time.time() > record.expires_at:
            self._token_map.pop(token, None)
            return None
        return record.storage_key


temp_token_service = TempTokenService()
