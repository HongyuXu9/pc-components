"""Application paths and server configuration."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data.json"
LOG_FILE = ROOT / "partly.log"
ENV_FILE = ROOT / ".env"
GEMINI_MODEL = "gemini-3.1-flash-lite"
HOST = "127.0.0.1"
PORT = 8766
APP_VERSION = "2026.11.05.collections-2"
HEARTBEAT_TIMEOUT_SECONDS = 30
