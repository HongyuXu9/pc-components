# Server Python e avvio su Windows

[English](../en/python-and-windows-launcher.md) · **Italiano** · [简体中文](../zh-CN/python-and-windows-launcher.md)

Questa guida descrive il percorso completo dall’icona Partly al server locale,
e i punti da modificare quando si vuole studiare o cambiare la configurazione.

## Avvio: dall’icona al server

Sia `Partly.lnk` sia `scripts/run_app.bat` avviano la stessa catena. Il collegamento
`.lnk` punta direttamente a `wscript.exe` con `scripts/run_app.vbs` come argomento.

```text
Partly.lnk ─┐
            ├─> scripts/run_app.vbs ─> PowerShell nascosta ─> scripts/run_app.ps1 ─> python backend/server.py
scripts/run_app.bat ┘
```

1. **`scripts/run_app.bat`** avvia Windows Script Host (`wscript.exe`) passando il
   percorso di `scripts/run_app.vbs`. Usa `%~dp0`, quindi funziona anche se la cartella
   del progetto viene spostata. Il batch termina subito: non è il processo che
   serve le pagine.
2. **`scripts/run_app.vbs`** costruisce il comando per Windows PowerShell con
   `-NoProfile`, `-WindowStyle Hidden` e `-ExecutionPolicy Bypass`, poi lo avvia
   senza finestra. `-NoProfile` evita che le preferenze personali di PowerShell
   interferiscano; `-ExecutionPolicy Bypass` vale solo per questo avvio e non
   cambia l’impostazione permanente di Windows.
3. **`scripts/run_app.ps1`** trova la cartella dell’app a partire dal percorso dello
   script, controlla la porta, individua Python, avvia `backend/server.py` nascosto,
   attende che risponda e apre Partly in una finestra app di Chrome o Edge.
4. Il launcher resta in attesa mentre la pagina Partly è attiva. Alla chiusura
   della finestra, il browser invia `/api/close`; il launcher ferma il processo
   Python che ha avviato. Un heartbeat periodico copre il caso in cui il browser
   si chiuda senza riuscire a inviare il segnale.

In Gestione attività quindi il processo che tiene aperto il server è
`python.exe`; `scripts/run_app.bat` e `wscript.exe` non sono il server. PowerShell
rimane nascosta per coordinare l’avvio e la chiusura.

Se Chrome o Edge non vengono trovati nei percorsi controllati dal launcher,
`scripts/run_app.ps1` apre l’URL con il browser predefinito di Windows.

## Configurazione Python

La configurazione è in `backend/partly_server/config.py`:

| Costante | Cosa controlla |
| --- | --- |
| `FRONTEND_ROOT` | `ROOT / "frontend"` |
| `ROOT` | Cartella principale del progetto, calcolata dalla posizione del pacchetto Python |
| `DATA_FILE` | Percorso di `data/data.json`, dove sono salvate Build, Da valutare e Cestino |
| `LOG_FILE` | Percorso di `logs/partly.log` |
| `ENV_FILE` | Percorso del `.env` locale, usato per la chiave Gemini |
| `HOST` | Interfaccia di rete su cui ascolta il server; `127.0.0.1` lo limita a questo PC |
| `PORT` | Porta HTTP locale, attualmente `8766` |
| `APP_VERSION` | Versione riportata dall’endpoint `/api/version` |
| `GEMINI_MODEL` | Modello usato per il riconoscimento AI delle immagini |
| `HEARTBEAT_TIMEOUT_SECONDS` | Tempo senza heartbeat oltre il quale il launcher considera l’app non più attiva |

Se cambi `PORT`, aggiorna anche `$appUrl` in `scripts/run_app.ps1`. L’interfaccia usa
percorsi API relativi, quindi non ha un numero di porta da modificare. Il server
si lega all’indirizzo locale e non è configurato per servire richieste da altri
dispositivi della rete.

## Cartelle del server

- **`backend/server.py`** è l’entry point mantenuto stabile per il launcher. Prepara
  `data/data.json` se manca, crea il server HTTP, scrive le informazioni iniziali
  nel log e avvia `serve_forever()`.
- **`backend/partly_server/config.py`** contiene percorsi e impostazioni.
- **`backend/partly_server/handler.py`** implementa gli endpoint HTTP e serve i file
  statici dell’app.
- **`backend/partly_server/runtime_state.py`** custodisce i lock per l’accesso ai dati,
  l’ultimo heartbeat ricevuto e la richiesta di chiusura. I lock evitano che
  richieste simultanee leggano o scrivano quello stato nello stesso momento.
- **`backend/partly_server/logging_config.py`** configura il logger `partly` per scrivere
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
stessa cartella e poi lo rinomina su `data/data.json`. La sostituzione atomica riduce
il rischio di lasciare un file a metà se il processo si interrompe durante la
scrittura. `data_lock` serializza gli accessi concorrenti nel processo locale.

## Log e chiave Gemini

`backend/partly_server/logging_config.py` usa `RotatingFileHandler`: `logs/partly.log` ruota
quando raggiunge 1 MB e conserva fino a tre copie precedenti. Il log include sia
le richieste HTTP sia gli eventi inviati dall’Activity log del browser. Il
launcher accoda gli eventi se il server non è ancora disponibile; in caso di
errore di avvio li scrive su `logs/partly.log` o, se il file è occupato, su
`logs/partly-launcher.log`.

Per abilitare Gemini, crea `.env` nella cartella principale, con questa sola riga e la tua chiave personale:

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
py -3 backend/server.py
```

Se il comando `py` non è installato ma `python` è disponibile, usa
`python backend/server.py`. In questo modo il server resta visibile nel terminale; per
fermarlo premi `Ctrl+C`. Per aprire l’interfaccia, visita
`http://127.0.0.1:8766` nel browser.

Quando avvii il server manualmente, non c’è il processo `scripts/run_app.ps1` che ne
segue il ciclo di vita: chiudere la scheda non ferma automaticamente Python.
Per l’uso normale, avvia `Partly.lnk` o `scripts/run_app.bat`, così il launcher può
gestire apertura, log e chiusura insieme.

Il launcher controlla la porta `8766` prima di partire. Se trova un processo in
ascolto su quella porta, lo termina e avvia una nuova istanza; perciò evita di
usare quella porta per un altro servizio mentre avvii Partly.

I file statici sono serviti da `FRONTEND_ROOT` (`frontend/`), indipendentemente dalla directory di lavoro. Gli URL del browser restano `/js/`, `/styles/` e `/assets/`.

## Ricerca offerte con Tavily

Premi **Find offers** su un componente Build per cercare su Amazon.it,
eBay.it e AliExpress.com. Inserisci `TAVILY_API_KEY=la_tua_chiave` nel `.env`
locale e riavvia Partly. Ogni clic invia una ricerca basic; il consumo restituito
dal servizio viene scritto nel log. Gemini supporta screenshot AI e selezione delle offerte.

La ricerca aggiunge nuovi link, anche quelli da controllare manualmente.
Non modifica mai prezzo, link o cronologia di un'offerta già salvata. Non aggiunge
due volte lo stesso prodotto; viene aggiunta una sola offerta per negozio.
Un risultato è verificato se la pagina conferma modello, prodotto nuovo,
disponibilità e prezzo in euro. Il risultato mostra il prezzo disponibile, altrimenti `undefined`.
Se manca un prezzo attendibile, salva il link senza prezzo e senza cronologia.
Queste offerte non incidono sul prezzo minimo della Build. Apri il link e usa
**Log price** per inserire personalmente il prezzo.

Controlla sempre modello, variante, condizione, disponibilità e prezzo finale:
la ricerca può includere prodotti diversi. La spedizione è esclusa e non è
garantito il minimo assoluto di tutti i negozi online.

## Debug

Il collegamento avvia il server nascosto. Chiudi Partly, apri il progetto in VS Code e premi F5 scegliendo **Partly: debug server**. Metti i breakpoint e apri http://127.0.0.1:8766. Il launcher usa `.venv` se presente, altrimenti Python di sistema. Non servono pacchetti Python aggiuntivi.

```powershell
python -m unittest discover -s tests -v
node --test tests/offer-search.test.mjs
```

La ricerca sceglie il prezzo EUR più basso per negozio tra i risultati, anche dagli estratti Tavily. Questi prezzi sono da controllare: possono essere vecchi o condizionati. I negozi già presenti vengono saltati senza modifiche. Se manca il prezzo, aggiunge un solo link per negozio assente.

Interfaccia: le offerte mostrano “Da ricerca” o “Manuale”. Il prezzo mancante appare come `undefined`. La finestra risultati include un pulsante Chiudi. Non sono mostrate etichette di verifica.

La ricerca filtra prima i titoli per modello e variante. Gemini, se configurato, seleziona i candidati Tavily pertinenti senza Google Search. Prezzi e link restano vincolati alle fonti. Se Gemini non risponde, usa i candidati filtrati localmente. Amazon può restituire estratti senza prezzo: in quel caso resta undefined.

Il grafico prolunga l’ultimo prezzo fino a oggi. I giorni senza registrazioni mantengono il prezzo precedente; i cambiamenti sono a gradini. I punti indicano solo registrazioni reali, modificabili con un clic. Non vengono aggiunti dati alla cronologia.
