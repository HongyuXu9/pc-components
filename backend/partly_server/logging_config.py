"""File and console logging configuration."""
import logging
from logging.handlers import RotatingFileHandler

from .config import LOG_FILE

logger = logging.getLogger("partly")
logger.setLevel(logging.INFO)
_formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
_file_handler = RotatingFileHandler(
    LOG_FILE, maxBytes=1_000_000, backupCount=3, encoding="utf-8"
)
_file_handler.setFormatter(_formatter)
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_formatter)
logger.addHandler(_file_handler)
logger.addHandler(_console_handler)
