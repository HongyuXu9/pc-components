"""Entrypoint for the Partly local HTTP server."""
from http.server import ThreadingHTTPServer
import os

from partly_server.config import APP_VERSION, DATA_FILE, HOST, LOG_FILE, PORT
from partly_server.handler import PartlyHandler
from partly_server.logging_config import logger


def main():
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]\n", encoding="utf-8")

    server = ThreadingHTTPServer((HOST, PORT), PartlyHandler)
    logger.info("Partly is running at http://%s:%s (PID %s)", HOST, PORT, os.getpid())
    logger.info("App version: %s", APP_VERSION)
    logger.info("Data file: %s", DATA_FILE)
    logger.info("Log file: %s", LOG_FILE)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Partly server stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
