# Architettura

[English](../en/architecture.md) · **Italiano** · [简体中文](../zh-CN/architecture.md)

Partly è un’app web locale con interfaccia da applicazione desktop. Usa il
browser per l’interfaccia, la libreria standard Python per l’API HTTP locale e
`data/data.json` come archivio leggibile. Non richiede una procedura di build né
l’installazione di pacchetti runtime.

## Frontend

`frontend/index.html` contiene lo scheletro della pagina. Carica il manifest CSS
`frontend/styles/style.css` e il punto d’ingresso JavaScript a moduli nativi `frontend/js/app.js`.

| Modulo | Responsabilità |
| --- | --- |
| `frontend/js/domain.js` | Normalizzazione dei prodotti, rilevamento negozi, migrazione e analisi del testo OCR |
| `frontend/js/activity-log.js` | Segnalazione attività del browser, finestra log e segnali del ciclo di vita |
| `frontend/js/image-recognition.js` | Anteprima screenshot, richiesta Gemini e coordinamento OCR locale |
| `frontend/js/price-chart.js` | Rendering del grafico e modifica della cronologia prezzi |
| `frontend/js/saved-collections.js` | Rendering delle schede Da valutare e Cestino |
| `frontend/js/app.js` | Stato applicazione, rendering pagina, invio moduli e coordinamento eventi |

I fogli di stile sono raggruppati per responsabilità in `frontend/styles/`. L’ordine degli
import in `frontend/styles/style.css` è intenzionale: le regole responsive e le personalizzazioni
delle funzioni seguono le regole base che modificano.

## Server locale

`backend/server.py` è il punto d’ingresso del launcher. Il pacchetto `backend/partly_server`
contiene l’handler HTTP, la configurazione dei percorsi e della porta, il setup
del logging e il piccolo stato thread-safe condiviso dagli handler. Usa soltanto
la libreria standard Python.

Il server ascolta su `127.0.0.1`. `/api/data` legge e scrive le tre liste salvate;
le scritture usano un file temporaneo seguito da una sostituzione atomica.
`/api/log` riceve le attività del browser, `/api/heartbeat` supporta il recupero
del ciclo di vita e `/api/close` segnala la chiusura intenzionale della finestra.
Il riconoscimento screenshot usa `/api/extract-image` solo se AI assist è attivo.

Per la configurazione Python dettagliata, l’API, `.env` e l’avvio Windows,
consulta la [guida a Python e al launcher](python-and-windows-launcher.md)
([English](../en/python-and-windows-launcher.md), [简体中文](../zh-CN/python-and-windows-launcher.md)).

## Regole per le modifiche

- Mantieni compatibili con `migrate()` le modifiche alla forma dei dati salvati e documentale.
- Mantieni semplice JSON lo stato nel browser e le risposte API, così `data/data.json` resta ispezionabile e facile da copiare.
- Mantieni l’app utilizzabile senza Gemini; l’OCR locale resta il comportamento predefinito.
- Mantieni i moduli frontend senza dipendenze e usa import espliciti tra loro.
- Mantieni `backend/server.py` come punto d’ingresso stabile usato dal launcher Windows.
