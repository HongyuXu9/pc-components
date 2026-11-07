# Partly

[English](../../README.md) · **Italiano** · [简体中文](../zh-CN/README.md)

Partly è un’app locale per tenere traccia dei componenti PC e dei relativi
prezzi. Salva i dati in `data/data.json`, leggibile e situato accanto all’app; non
usa il database né conserva i dati nel browser. Se trova dati lasciati da una
versione precedente nel browser, li copia in `data/data.json` e li rimuove dal
browser solo dopo aver salvato il file.

## Avviare l’app

1. Su Windows, fai doppio clic su `Partly.lnk` per aprire Partly in una finestra
   app di Chrome o Edge. Il server locale viene avviato senza console e si
   arresta quando chiudi la finestra Partly.
2. Puoi copiare `Partly.lnk` sul Desktop per avere un’icona.
3. Puoi avviare server e app anche con `scripts/run_app.bat`.

È necessario Python 3. Il server accetta connessioni solo da questo PC. Fai una
copia di sicurezza di `data/data.json` per conservare componenti e cronologia prezzi.

## Struttura del progetto

Il frontend usa moduli JavaScript nativi, quindi non serve una build di Node.js.
`js/app.js` coordina l’interfaccia; i moduli sotto `js/` gestiscono regole dei
prodotti, riconoscimento immagini, prezzi, Activity log e rendering delle liste.
`styles/style.css` è il punto di ingresso degli stili raggruppati in `styles/`.

`backend/server.py` è il punto di ingresso Python. Gli endpoint HTTP, la configurazione,
il logging e lo stato condiviso risiedono nel pacchetto `backend/partly_server/`. Vedi la
[guida all’architettura](architecture.md) ([English](../en/architecture.md),
[简体中文](../zh-CN/architecture.md)) per i confini dei moduli e le API.

Per configurare Python, `.env` e la catena di avvio Windows (`.lnk` / `.bat` →
`.vbs` → PowerShell → Python), consulta la [guida al server e al launcher](python-and-windows-launcher.md)
([English](../en/python-and-windows-launcher.md), [简体中文](../zh-CN/python-and-windows-launcher.md)).

Quando aggiungi o modifichi un componente puoi indicare l’immagine del prodotto
tramite URL. Alcuni componenti di esempio includono immagini ospitate dai
rispettivi negozi.

La schermata componenti contiene Build, **Da valutare** e **Cestino**. Gli
elementi Da valutare non incidono sul totale della build; puoi aggiungerli alla
build o usarli per sostituire un componente. Gli elementi sostituiti o eliminati
vanno nel cestino, da cui puoi ripristinarli o cancellarli definitivamente.

Per aggiungere più prodotti da uno screenshot, apri **Add component**, incolla
un’immagine con **Ctrl+V** oppure scegline una, controlla i prodotti riconosciuti
e aggiungi le righe. Puoi correggere i suggerimenti OCR prima di salvarli.

Il riconoscimento usa Tesseract locale per impostazione predefinita. Per l’AI
facoltativa, crea una chiave Gemini in [Google AI Studio](https://aistudio.google.com/app/apikey),
salvala in `.env` nella root del progetto come `GEMINI_API_KEY=la_tua_chiave` e
riavvia Partly. Attiva **AI assist** prima di incollare lo screenshot. Con questa
opzione l’immagine viene inviata a Google; lasciala disattivata per mantenere il
riconoscimento sul PC. Il piano gratuito di Google ha limiti d’uso e potrebbe
utilizzare i contenuti inviati per migliorare i suoi prodotti: consulta i
termini aggiornati di Google prima di attivarlo.

Se un salvataggio non riesce, controlla `logs/partly.log` in `logs/`. Il
modulo **Save component** resta aperto quando il server rifiuta il salvataggio.
Gli errori del browser e le operazioni di salvataggio compaiono anche
nell’Activity log dell’app.

Le immagini condivise si trovano in `assets/images/`; vedi le [convenzioni per gli asset](../en/assets.md).
