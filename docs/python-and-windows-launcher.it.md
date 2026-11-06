# Server Python e avvio su Windows

[English](python-and-windows-launcher.md) · **Italiano** · [简体中文](python-and-windows-launcher.zh-CN.md)

Questa guida descrive il percorso completo dall’icona Partly al server locale,
e i punti da modificare quando si vuole studiare o cambiare la configurazione.

## Avvio: dall’icona al server

Sia `Partly.lnk` sia `run_app.bat` avviano la stessa catena. Il collegamento
`.lnk` punta direttamente a `wscript.exe` con `run_app.vbs` come argomento.

```text
Partly.lnk ─┐
            ├─> run_app.vbs ─> PowerShell nascosta ─> run_app.ps1 ─> python server.py
run_app.bat ┘
```

1. **`run_app.bat`** avvia Windows Script Host (`wscript.exe`) passando il
   percorso di `run_app.vbs`. Usa `%~dp0`, quindi funziona anche se la cartella
   del progetto viene spostata. Il batch termina subito: non è il processo che
   serve le pagine.
2. **`run_app.vbs`** costruisce il comando per Windows PowerShell con
   `-NoProfile`, `-WindowStyle Hidden` e `-ExecutionPolicy Bypass`, poi lo avvia
   senza finestra. `-NoProfile` evita che le preferenze personali di PowerShell
   interferiscano; `-ExecutionPolicy Bypass` vale solo per questo avvio e non
   cambia l’impostazione permanente di Windows.
3. **`run_app.ps1`** trova la cartella dell’app a partire dal percorso dello
   script, controlla la porta, individua Python, avvia `server.py` nascosto,
   attende che risponda e apre Partly in una finestra app di Chrome o Edge.
4. Il launcher resta in attesa mentre la pagina Partly è attiva. Alla chiusura
   della finestra, il browser invia `/api/close`; il launcher ferma il processo
   Python che ha avviato. Un heartbeat periodico copre il caso in cui il browser
   si chiuda senza riuscire a inviare il segnale.

In Gestione attività quindi il processo che tiene aperto il server è
`python.exe`; `run_app.bat` e `wscript.exe` non sono il server. PowerShell
rimane nascosta per coordinare l’avvio e la chiusura.

Se Chrome o Edge non vengono trovati nei percorsi controllati dal launcher,
`run_app.ps1` apre l’URL con il browser predefinito di Windows.

## Configurazione Python

La configurazione è in `partly_server/config.py`:

| Costante | Cosa controlla |
| --- | --- |
| `ROOT` | Cartella principale del progetto, calcolata dalla posizione del pacchetto Python |
| `DATA_FILE` | Percorso di `data.json`, dove sono salvate Build, Da valutare e Cestino |
| `LOG_FILE` | Percorso di `partly.log` |
| `ENV_FILE` | Percorso del `.env` locale, usato per la chiave Gemini |
| `HOST` | Interfaccia di rete su cui ascolta il server; `127.0.0.1` lo limita a questo PC |
| `PORT` | Porta HTTP locale, attualmente `8766` |
| `APP_VERSION` | Versione riportata dall’endpoint `/api/version` |
| `GEMINI_MODEL` | Modello usato per il riconoscimento AI delle immagini |
| `HEARTBEAT_TIMEOUT_SECONDS` | Tempo senza heartbeat oltre il quale il launcher considera l’app non più attiva |

Se cambi `PORT`, aggiorna anche `$appUrl` in `run_app.ps1`. L’interfaccia usa
percorsi API relativi, quindi non ha un numero di porta da modificare. Il server
si lega all’indirizzo locale e non è configurato per servire richieste da altri
dispositivi della rete.

## Cartelle del server

- **`server.py`** è l’entry point mantenuto stabile per il launcher. Prepara
  `data.json` se manca, crea il server HTTP, scrive le informazioni iniziali
  nel log e avvia `serve_forever()`.
- **`partly_server/config.py`** contiene percorsi e impostazioni.
- **`partly_server/handler.py`** implementa gli endpoint HTTP e serve i file
  statici dell’app.
- **`partly_server/runtime_state.py`** custodisce i lock per l’accesso ai dati,
  l’ultimo heartbeat ricevuto e la richiesta di chiusura. I lock evitano che
  richieste simultanee leggano o scrivano quello stato nello stesso momento.
- **`partly_server/logging_config.py`** configura il logger `partly` per scrivere
  sia su file sia sul flusso console.

Il server usa solo moduli inclusi in Python: non c’è un `pip install` richiesto.

## Endpoint principali

| Metodo e percorso | Funzione |
| --- | --- |
| `GET /api/status` | Restituisce host, porta e PID del server |
| `GET /api/version` | Restituisce la versione configurata |
| `GET /api/data` | Legge il file JSON salvato |
| `PUT /api/data` | Salva le tre liste in modo atomico |
| `POST /api/log` | Aggiunge al log gli eventi e gli errori comunicati dal browser |
| `POST /api/heartbeat` e `GET /api/heartbeat` | Aggiorna e controlla la presenza della pagina Partly |
| `POST /api/close` e `GET /api/close` | Segnala al launcher la chiusura intenzionale della pagina |
| `POST /api/extract-image` | Inoltra uno screenshot a Gemini quando AI assist è attivo |

Per salvare i dati, il server serializza il JSON in un file temporaneo nella
stessa cartella e poi lo rinomina su `data.json`. La sostituzione atomica riduce
il rischio di lasciare un file a metà se il processo si interrompe durante la
scrittura. `data_lock` serializza gli accessi concorrenti nel processo locale.

## Log e chiave Gemini

`partly_server/logging_config.py` usa `RotatingFileHandler`: `partly.log` ruota
quando raggiunge 1 MB e conserva fino a tre copie precedenti. Il log include sia
le richieste HTTP sia gli eventi inviati dall’Activity log del browser. Il
launcher accoda gli eventi se il server non è ancora disponibile; in caso di
errore di avvio li scrive su `partly.log` o, se il file è occupato, su
`partly-launcher.log`.

Per abilitare Gemini, crea `.env` nella cartella principale, accanto a
`server.py`, con questa sola riga e la tua chiave personale:

```dotenv
GEMINI_API_KEY=incolla_la_tua_chiave_qui
```

Il file `.env` è escluso da Git. Il server controlla prima la variabile
d’ambiente `GEMINI_API_KEY`; se non è definita, legge la stessa impostazione da
`.env`. Non inserire la chiave in `config.py`, nei documenti o in un commit.
Riavvia Partly dopo aver cambiato la chiave. Con AI assist disattivato, il
riconoscimento continua a usare l’OCR locale.

## Avvio manuale per imparare o diagnosticare

Apri PowerShell nella cartella del progetto e avvia:

```powershell
py -3 server.py
```

Se il comando `py` non è installato ma `python` è disponibile, usa
`python server.py`. In questo modo il server resta visibile nel terminale; per
fermarlo premi `Ctrl+C`. Per aprire l’interfaccia, visita
`http://127.0.0.1:8766` nel browser.

Quando avvii il server manualmente, non c’è il processo `run_app.ps1` che ne
segue il ciclo di vita: chiudere la scheda non ferma automaticamente Python.
Per l’uso normale, avvia `Partly.lnk` o `run_app.bat`, così il launcher può
gestire apertura, log e chiusura insieme.

Il launcher controlla la porta `8766` prima di partire. Se trova un processo in
ascolto su quella porta, lo termina e avvia una nuova istanza; perciò evita di
usare quella porta per un altro servizio mentre avvii Partly.
