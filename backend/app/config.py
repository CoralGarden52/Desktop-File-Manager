import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"

# Persist uploaded files in the required project directory:
# D:\Git\Desktop-File-Manager\files
FILES_DIR = PROJECT_ROOT / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    try:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            os.environ[key] = value
    except Exception:
        # Keep app boot resilient if .env is malformed.
        return


_load_env_file(BASE_DIR / ".env")

# Single-agent LLM config (OpenAI-compatible API)
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://aihubmix.com/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL_ID = os.getenv("LLM_MODEL_ID", "coding-glm-5.1")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "4096"))
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))
