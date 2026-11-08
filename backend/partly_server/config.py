"""Application paths and server configuration."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = ROOT / "frontend"
DATA_FILE = ROOT / "data" / "data.json"
LOG_FILE = ROOT / "logs" / "partly.log"
ENV_FILE = ROOT / ".env"
GEMINI_MODEL = "gemini-3.1-flash-lite"
OFFER_SEARCH_MODEL = "gemini-3.5-flash"
HOST = "127.0.0.1"
PORT = 8766
APP_VERSION = "2026.11.05.collections-2"
HEARTBEAT_TIMEOUT_SECONDS = 30
