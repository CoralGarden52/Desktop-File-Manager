import json
import urllib.error
import urllib.request

from ..config import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MAX_TOKENS,
    LLM_MODEL_ID,
    LLM_TEMPERATURE,
    LLM_TIMEOUT_SECONDS,
)


class LlmService:
    def __init__(self):
        self.base_url = LLM_BASE_URL.rstrip("/")
        self.api_key = LLM_API_KEY
        self.model_id = LLM_MODEL_ID
        self.temperature = LLM_TEMPERATURE
        self.max_tokens = LLM_MAX_TOKENS
        self.timeout_seconds = LLM_TIMEOUT_SECONDS

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        if not self.enabled:
            raise RuntimeError("LLM_API_KEY is not configured")

        payload = {
            "model": self.model_id,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as resp:
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                return (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"LLM HTTPError: {exc.code} {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"LLM request failed: {exc}") from exc


llm_service = LlmService()
