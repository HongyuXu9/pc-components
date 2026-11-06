"""Thread-safe state shared by API request handlers."""
from threading import Lock
import time

from .config import HEARTBEAT_TIMEOUT_SECONDS

data_lock = Lock()
_heartbeat_lock = Lock()
_last_client_heartbeat = None
_close_requested = False

def record_client_heartbeat():
    global _last_client_heartbeat
    with _heartbeat_lock:
        _last_client_heartbeat = time.monotonic()

def is_client_active():
    with _heartbeat_lock:
        return _last_client_heartbeat is not None and time.monotonic() - _last_client_heartbeat < HEARTBEAT_TIMEOUT_SECONDS

def request_close():
    global _close_requested
    with _heartbeat_lock:
        _close_requested = True

def is_close_requested():
    with _heartbeat_lock:
        return _close_requested
