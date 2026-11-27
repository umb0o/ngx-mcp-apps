# L'esempio

Un grafico che il modello disegna nella conversazione e su cui poi continua a lavorare. L'utente fa una domanda, il
modello chiama un tool con i numeri e si apre il grafico qui sotto. È l'applicazione vera, trasformata dal builder in
un unico file HTML ed eseguita in un iframe. Questa pagina fa la parte dell'host di chat e del server MCP, quindi qui
tutto funziona come dentro una conversazione. I numeri sono dati di esempio.

<!-- stage: chart -->

## Prova così

- **Tocca un valore.** Viene selezionato, e la riga sotto il grafico lo confronta con quello precedente. Sotto
  l'app, "Added to the model context" mostra la frase che l'app ha mandato al modello. Toccalo di nuovo per togliere
  la selezione.
- **Passa a Line** e torna indietro. Gli stessi dati, disegnati in un altro modo. La scelta resta mentre l'app
  continua a leggere il server.
- **Cambia il tema di questa pagina.** L'host lo comunica all'app, e l'app si adegua.
- **Passa a schermo intero.** L'app lo chiede, l'host decide. Lo stesso pulsante la riporta indietro.

## Più turni, una sola app

Una conversazione non finisce quando si apre l'app. Sotto l'app, **Say next** la fa proseguire. Questa pagina non ha
un modello: la sua parte di conversazione è scritta in anticipo.

- **"Add October and November".** Il modello chiama `update_chart`, un altro tool del server. Non si apre nessuna
  nuova app e a quella sullo schermo non arriva niente: legge `read_chart` dal server ogni secondo, quindi le due
  colonne compaiono da sole.
- **"Which months were the worst?"** Il modello chiama `highlight_points` con due etichette. Il server le ricorda, il
  grafico le evidenzia e la risposta le nomina: il modello indica ciò di cui sta parlando.
- **"Why is this one so high?"** "This one" è il valore che hai toccato. Il modello chiama `read_chart_selection` e
  risponde su quel valore. Se chiedi senza una selezione, ti dice di toccarne prima uno.

Quindi le direzioni sono due. Dal modello all'app: il modello cambia i dati sul server con un tool normale, e l'app
aperta segue il server con `pollServerTool`. Dall'utente al modello: l'app registra la selezione, in silenzio, con
`updateModelContext` e con un tool del server che solo l'app può chiamare (`select_point`). Il modello la legge
quando l'utente scrive il messaggio successivo.

A destra vedi ogni messaggio che attraversa il confine dell'iframe. Per un'app, questo è tutto il protocollo MCP
Apps; la libreria lo parla al posto tuo.

## Cosa non può fare un'app

Il grafico è stato provato in Claude per Android, e questi limiti sono stati misurati lì. Altri host possono
comportarsi in modo diverso.

- Un tocco nell'app non può far rispondere il modello. Il modello parla quando l'utente manda un messaggio.
- Il testo scritto dentro l'app non è arrivato al modello. L'utente scrive nella casella della chat, come sempre.
- L'app non può offrire al modello tool propri, e non può chiedere al modello una completion (sampling): quell'host
  non fornisce né l'una né l'altra cosa.

Per questo il grafico funziona così: registra ciò che l'utente ha selezionato e aspetta. Il messaggio successivo
dell'utente, scritto nella chat, trova la selezione già lì.

Apri l'[applicazione da sola](example/chart.html) in una nuova scheda per vedere cosa fa fuori da un host: dopo un
momento dice che è standalone e non disegna niente.

## L'applicazione

Un solo file. I dati del server vengono controllati dalla guard `isChart` prima che il template li usi, sia quando
l'app si apre sia a ogni lettura del server. I tool su cui si basa (`show_chart`, `update_chart`,
`highlight_points`, `read_chart_selection`, `read_chart`, `select_point`) sono scritti per esteso in
[Il lato server](server.html). Il file da solo: [`chart.ts`](example/chart.ts).

<!-- source: docs/apps/chart/src/main.ts -->
