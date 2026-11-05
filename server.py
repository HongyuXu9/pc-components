"""Serve Partly locally and persist the app data in data.json."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
import json


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data.json"
HOST = "127.0.0.1"
PORT = 8765
data_lock = Lock()


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
            self._json_response(200, {"saved": True})
        except (ValueError, OSError, json.JSONDecodeError) as error:
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
        print(f"[{self.log_date_time_string()}] {format_string % args}")


if __name__ == "__main__":
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]\n", encoding="utf-8")
    server = ThreadingHTTPServer((HOST, PORT), PartlyHandler)
    print(f"Partly is running at http://{HOST}:{PORT}")
    print(f"Data file: {DATA_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPartly server stopped.")
    finally:
        server.server_close()
