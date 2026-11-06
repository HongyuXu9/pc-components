# Architettura

[English](architecture.md) · **Italiano** · [简体中文](architecture.zh-CN.md)

Partly è un’app web locale con interfaccia da applicazione desktop. Usa il
browser per l’interfaccia, la libreria standard Python per l’API HTTP locale e
`data.json` come archivio leggibile. Non richiede una procedura di build né
l’installazione di pacchetti runtime.

## Frontend

`index.html` contiene lo scheletro della pagina. Carica il manifest CSS
`style.css` e il punto d’ingresso JavaScript a moduli nativi `app.js`.

| Modulo | Responsabilità |
| --- | --- |
| `js/domain.js` | Normalizzazione dei prodotti, rilevamento negozi, migrazione e analisi del testo OCR |
| `js/activity-log.js` | Segnalazione attività del browser, finestra log e segnali del ciclo di vita |
| `js/image-recognition.js` | Anteprima screenshot, richiesta Gemini e coordinamento OCR locale |
| `js/price-chart.js` | Rendering del grafico e modifica della cronologia prezzi |
| `js/saved-collections.js` | Rendering delle schede Da valutare e Cestino |
| `app.js` | Stato applicazione, rendering pagina, invio moduli e coordinamento eventi |

I fogli di stile sono raggruppati per responsabilità in `styles/`. L’ordine degli
import in `style.css` è intenzionale: le regole responsive e le personalizzazioni
delle funzioni seguono le regole base che modificano.

## Server locale

`server.py` è il punto d’ingresso del launcher. Il pacchetto `partly_server`
contiene l’handler HTTP, la configurazione dei percorsi e della porta, il setup
del logging e il piccolo stato thread-safe condiviso dagli handler. Usa soltanto
la libreria standard Python.

Il server ascolta su `127.0.0.1`. `/api/data` legge e scrive le tre liste salvate;
le scritture usano un file temporaneo seguito da una sostituzione atomica.
`/api/log` riceve le attività del browser, `/api/heartbeat` supporta il recupero
del ciclo di vita e `/api/close` segnala la chiusura intenzionale della finestra.
Il riconoscimento screenshot usa `/api/extract-image` solo se AI assist è attivo.

Per la configurazione Python dettagliata, l’API, `.env` e l’avvio Windows,
consulta la [guida a Python e al launcher](python-and-windows-launcher.it.md)
([English](python-and-windows-launcher.md), [简体中文](python-and-windows-launcher.zh-CN.md)).

## Regole per le modifiche

- Mantieni compatibili con `migrate()` le modifiche alla forma dei dati salvati e documentale.
- Mantieni semplice JSON lo stato nel browser e le risposte API, così `data.json` resta ispezionabile e facile da copiare.
- Mantieni l’app utilizzabile senza Gemini; l’OCR locale resta il comportamento predefinito.
- Mantieni i moduli frontend senza dipendenze e usa import espliciti tra loro.
- Mantieni `server.py` come punto d’ingresso stabile usato dal launcher Windows.
