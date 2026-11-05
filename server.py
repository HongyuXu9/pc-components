"""Serve Partly locally and persist the app data in data.json."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
import json
import logging


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data.json"
LOG_FILE = ROOT / "partly.log"
HOST = "127.0.0.1"
PORT = 8766
data_lock = Lock()

logger = logging.getLogger("partly")
logger.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
file_handler.setFormatter(formatter)
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(file_handler)
logger.addHandler(console_handler)


class PartlyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/data":
            try:
                with data_lock:
                    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
                self._json_response(200, data)
            except (OSError, json.JSONDecodeError) as error:
                logger.exception("Failed to read data.json")
                self._json_response(500, {"error": str(error)})
            return
        if self.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_PUT(self):
        if self.path != "/api/data":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 10_000_000:
                self._json_response(413, {"error": "Data file is too large"})
                return
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, list):
                self._json_response(400, {"error": "Expected a JSON array"})
                return
            encoded = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
            temporary = DATA_FILE.with_suffix(".json.tmp")
            with data_lock:
                temporary.write_text(encoded, encoding="utf-8")
                temporary.replace(DATA_FILE)
            logger.info(
                "Saved %s components to data.json (%s bytes)",
                len(value),
                len(encoded.encode("utf-8")),
            )
            self._json_response(200, {"saved": True})
        except (ValueError, OSError, json.JSONDecodeError) as error:
            logger.exception("Failed to save data.json")
            self._json_response(400, {"error": str(error)})
        except Exception as error:
            logger.exception("Unexpected error while saving data.json")
            self._json_response(500, {"error": str(error)})

    def do_POST(self):
        if self.path != "/api/log":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                self._json_response(413, {"error": "Log message is too large"})
                return
            entry = json.loads(self.rfile.read(length))
            level = str(entry.get("level", "INFO")).upper()
            message = str(entry.get("message", "Client reported an error"))
            context = str(entry.get("context", ""))
            log_method = getattr(logger, level.lower(), logger.info)
            log_method("Browser %s: %s %s", level, message, context)
            self._json_response(200, {"logged": True})
        except Exception as error:
            logger.exception("Failed to write browser error to log")
            self._json_response(400, {"error": str(error)})

    def _json_response(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format_string, *args):
        logger.info("%s %s", self.address_string(), format_string % args)


if __name__ == "__main__":
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]\n", encoding="utf-8")
    server = ThreadingHTTPServer((HOST, PORT), PartlyHandler)
    logger.info("Partly is running at http://%s:%s", HOST, PORT)
    logger.info("Data file: %s", DATA_FILE)
    logger.info("Log file: %s", LOG_FILE)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Partly server stopped.")
    finally:
        server.server_close()
