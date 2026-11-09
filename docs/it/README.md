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
`frontend/js/app.js` coordina l’interfaccia; i moduli sotto `frontend/js/` gestiscono regole dei
prodotti, riconoscimento immagini, prezzi, Activity log e rendering delle liste.
`frontend/styles/style.css` è il punto di ingresso degli stili raggruppati in `frontend/styles/`.

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

Le immagini condivise si trovano in `frontend/assets/images/`; vedi le [convenzioni per gli asset](../en/assets.md).

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

La ricerca sceglie il prezzo EUR più basso per negozio tra i risultati, anche dagli estratti Tavily. Questi prezzi sono da controllare: possono essere vecchi o condizionati. I negozi già presenti vengono saltati senza modifiche. Se manca il prezzo, aggiunge un solo link per negozio assente.

Interfaccia: le offerte mostrano “Da ricerca” o “Manuale”. Il prezzo mancante appare come `undefined`. La finestra risultati include un pulsante Chiudi. Non sono mostrate etichette di verifica.

Le offerte mostrano un badge blu “Da ricerca” oppure grigio “Manuale”, con testo e indicatore colorato.

Il badge di provenienza appare a sinistra del negozio, compatto e allineato al testo.

La ricerca filtra prima i titoli per modello e variante. Gemini, se configurato, seleziona i candidati Tavily pertinenti senza Google Search. Prezzi e link restano vincolati alle fonti. Se Gemini non risponde, usa i candidati filtrati localmente. Amazon può restituire estratti senza prezzo: in quel caso resta undefined.

Il grafico prolunga l’ultimo prezzo fino a oggi. I giorni senza registrazioni mantengono il prezzo precedente; i cambiamenti sono a gradini. I punti indicano solo registrazioni reali, modificabili con un clic. Non vengono aggiunti dati alla cronologia.
