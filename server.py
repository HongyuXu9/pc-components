"""Serve Partly locally and persist the app data in data.json."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
import json
import logging
import os
import base64
import urllib.error
import urllib.request
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data.json"
LOG_FILE = ROOT / "partly.log"
ENV_FILE = ROOT / ".env"
GEMINI_MODEL = "gemini-3.1-flash-lite"
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
        path_parts = [part for part in unquote(urlsplit(self.path).path).split("/") if part]
        if any(part.startswith(".") for part in path_parts):
            self.send_error(404)
            return
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
            if isinstance(value, list):
                value = {"components": value, "watchlist": [], "trash": []}
            if not isinstance(value, dict) or any(
                not isinstance(value.get(key, []), list)
                for key in ("components", "watchlist", "trash")
            ):
                self._json_response(400, {"error": "Expected component, watchlist, and trash arrays"})
                return
            value = {key: value.get(key, []) for key in ("components", "watchlist", "trash")}
            encoded = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
            temporary = DATA_FILE.with_suffix(".json.tmp")
            with data_lock:
                temporary.write_text(encoded, encoding="utf-8")
                temporary.replace(DATA_FILE)
            logger.info(
                "Saved %s components to data.json (%s bytes)",
                len(value["components"]),
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
        if self.path == "/api/extract-image":
            self._extract_image_with_gemini()
            return
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

    def _extract_image_with_gemini(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 12_000_000:
                self._json_response(413, {"error": "Image request must be under 12 MB"})
                return
            request_data = json.loads(self.rfile.read(length))
            mime_type = str(request_data.get("mimeType", ""))
            image_data = str(request_data.get("data", ""))
            if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
                self._json_response(415, {"error": "Use a PNG, JPEG, or WebP image"})
                return
            if image_data.startswith("data:"):
                image_data = image_data.split(",", 1)[-1]
            image_bytes = base64.b64decode(image_data, validate=True)
            if not image_bytes or len(image_bytes) > 8_000_000:
                self._json_response(413, {"error": "Image must be under 8 MB"})
                return

            api_key = os.environ.get("GEMINI_API_KEY", "").strip()
            if not api_key and ENV_FILE.exists():
                for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
                    if line.strip().startswith("GEMINI_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip("\"'")
                        break
            if not api_key:
                self._json_response(503, {"error": "Gemini is not configured. Add GEMINI_API_KEY to .env."})
                return

            logger.info("Gemini image extraction requested (%s, %s bytes)", mime_type, len(image_bytes))
            categories = ["CPU", "GPU", "RAM", "Motherboard", "Storage", "Power supply", "Case", "Cooling", "Monitor", "Accessories", "Other"]
            schema = {
                "type": "OBJECT",
                "properties": {
                    "store": {"type": "STRING"},
                    "items": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "name": {"type": "STRING"},
                                "category": {"type": "STRING", "enum": categories},
                                "price": {"type": "STRING"},
                            },
                            "required": ["name", "category", "price"],
                        },
                    },
                },
                "required": ["store", "items"],
            }
            payload = {
                "contents": [{
                    "parts": [
                        {"text": "Extract only actual purchasable products visible in this shopping screenshot. Ignore headings, shipping, availability, gift options, buttons, and other page controls. Return one item per actual product. Read the displayed price carefully, including superscript cents; if no price is visible, use an empty string. Return price as plain decimal digits such as 11.49, with no currency symbol. Never guess a price or store. Use the store name only if visible. Product names should be concise and specific. Choose the closest category from the schema."},
                        {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode("ascii")}},
                    ],
                }],
                "generationConfig": {"response_mime_type": "application/json", "response_schema": schema, "temperature": 0.1},
            }
            api_request = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                method="POST",
            )
            with urllib.request.urlopen(api_request, timeout=45) as response:
                api_result = json.loads(response.read().decode("utf-8"))
            result_text = api_result["candidates"][0]["content"]["parts"][0]["text"]
            self._json_response(200, json.loads(result_text))
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")[:1000]
            logger.error("Gemini extraction failed with HTTP %s: %s", error.code, details)
            self._json_response(502, {"error": f"Gemini API returned HTTP {error.code}"})
        except Exception as error:
            logger.exception("Gemini image extraction failed")
            self._json_response(500, {"error": str(error)})

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
