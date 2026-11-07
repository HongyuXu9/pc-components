"""Visible diagnostic launcher; normal Partly startup is unchanged."""
import argparse
import json
import logging
import os
from pathlib import Path
import socket
import sys
import threading
import urllib.error
import urllib.request
import webbrowser


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def open_when_ready(url, process_id, stopped):
    for _ in range(60):
        if stopped.is_set():
            return
        try:
            with urllib.request.urlopen(url + "/api/status", timeout=1) as response:
                status = json.load(response)
            if status.get("pid") == process_id:
                if not webbrowser.open(url, new=1):
                    print("Apri manualmente nel browser: " + url, flush=True)
                return
        except (OSError, ValueError, urllib.error.URLError):
            pass
        stopped.wait(0.25)
    if not stopped.is_set():
        print("Il browser non e' stato aperto automaticamente. Controlla i log della console.", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Avvia Partly con console diagnostica e browser.")
    parser.add_argument("--check", action="store_true", help="Controlla la configurazione senza avviare server o browser")
    args = parser.parse_args()
    from partly_server.config import HOST, PORT
    from partly_server.logging_config import logger
    import server

    if args.check:
        print(f"Configurazione debug valida: {ROOT}; http://{HOST}:{PORT}")
        return 0

    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex((HOST, PORT)) == 0:
            print(f"La porta {PORT} e' gia' in uso. Chiudi Partly prima di avviare il debug.")
            print("Questo launcher non arresta altri processi.")
            return 1

    logger.setLevel(logging.DEBUG)
    url = f"http://{HOST}:{PORT}"
    print("PARTLY - AVVIO DEBUG", flush=True)
    print("Console e log visibili. Nel browser premi F12 per Console, Network e breakpoint JavaScript.", flush=True)
    print("Il server rimane attivo anche se chiudi o ricarichi la pagina. Ctrl+C lo arresta.", flush=True)
    print("I dati sono quelli reali dell'app: i salvataggi non sono simulati.", flush=True)
    stopped = threading.Event()
    opener = threading.Thread(target=open_when_ready, args=(url, os.getpid(), stopped), daemon=True)
    opener.start()
    try:
        server.main()
        return 0
    except OSError as error:
        print(f"Avvio debug non riuscito: {error}", flush=True)
        return 1
    finally:
        stopped.set()


if __name__ == "__main__":
    raise SystemExit(main())
