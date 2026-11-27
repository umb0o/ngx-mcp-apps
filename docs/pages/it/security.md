# Sicurezza

Una MCP App gira dentro un host di chat, e l'host è fidato: decide cosa può fare l'app, e l'app parla solo con lui. Il
contenuto è un'altra faccenda. I dati che un tool restituisce arrivano dal tuo server e, attraverso il server, dal
modello, e un modello può essere indotto a scrivere qualsiasi cosa: una forma sbagliata, un testo lunghissimo, un pezzo
di HTML. Un'app è sicura quando i dati cattivi non possono romperla e non possono essere eseguiti.

L'applicazione qui sotto mostra la scheda di un contatto presa dal risultato di un tool. Sotto la scheda stampa il log
della libreria, così vedi cosa è arrivato. I pulsanti fanno inviare cose diverse da questa pagina, che fa la parte
dell'host.

<!-- stage: security -->

## Prova così

- **Un risultato valido.** La scheda cambia. Il log riporta `tool-result` con i dati.
- **La forma sbagliata.** Il messaggio è un risultato di tool corretto, ma il nome è un numero e la nota manca. Il
  controllo dell'app lo rifiuta: la scheda tiene l'ultimo contatto valido e una riga lo segnala.
- **HTML nel testo.** Il nome è `<img src=x onerror=alert(1)>` e la nota contiene uno `<script>` e un link
  `javascript:`. Superano il controllo, perché sono stringhe, e compaiono sulla scheda come i caratteri che sono.
  Nessuna immagine, nessun link, nessuna finestra di dialogo: non viene eseguito nulla.
- **Un messaggio rotto.** Un risultato di tool il cui `content` non è una lista. La libreria lo scarta prima che l'app
  lo veda, e il log riporta `invalid tool-result dropped`.
- **Non è un messaggio del protocollo.** Un oggetto che non è JSON-RPC 2.0. La libreria lo ignora: non cambia nulla,
  nemmeno il log.

## Il controllo dell'app

La libreria controlla i messaggi del protocollo. Non può conoscere la forma dei tuoi dati, quindi quel controllo
spetta a te: una funzione che dice se un valore è ciò che il template si aspetta. Controlla ogni campo che il template
legge, e metti un limite a ciò che potrebbe essere troppo lungo.

```ts
interface Contact {
  name: string;
  note: string;
}
const isContact = (v: unknown): v is Contact =>
  isObject(v) &&
  typeof v['name'] === 'string' &&
  v['name'].length <= 80 &&
  typeof v['note'] === 'string' &&
  v['note'].length <= 300;
```

`structuredContentAs(isContact)` restituisce i dati quando superano il controllo e `undefined` quando non lo superano.
Questo esempio tiene a schermo l'ultimo contatto valido con un linked signal (Angular 19 o successivo):

```ts
private readonly checked = this.mcp.structuredContentAs(isContact);
protected readonly contact = linkedSignal<Contact | undefined, Contact | undefined>({
  source: this.checked,
  computation: (next, previous) => next ?? previous?.value,
});
protected readonly refused = computed(() => !!this.mcp.toolResult() && !this.checked());
```

Va bene qualsiasi funzione della forma `(value: unknown) => value is T`: scritta a mano come qui, o generata da una
libreria come typia o valibot.

## Il testo resta testo

Il template usa le `{{ }}` di Angular. Angular scrive il valore come testo, quindi il markup al suo interno viene
mostrato, non interpretato.

```html
<article>
  <h1>{{ contact.name }}</h1>
  <p>{{ contact.note }}</p>
</article>
```

Per perdere questa protezione devi chiederlo tu: `[innerHTML]`, `bypassSecurityTrustHtml`, oppure scrivere nel DOM a
mano. Non usarli con i dati dei tool. Lo stesso vale per gli indirizzi: non mettere una stringa presa dal risultato di
un tool in `href` o `src` senza controllare che inizi con `https://`.

## Il log

`provideMcpApp({ ..., log: true })` tiene gli ultimi 50 eventi del protocollo nel signal `mcp.events()`, ciascuno
tagliato a 1000 caratteri. L'esempio mostra i quattro più recenti. Il log ripete i dati arrivati, quindi è uno
strumento di debug: lascialo spento in un'app aperta da utenti reali.

## La checklist

Cosa fa la libreria:

- accetta messaggi solo dalla finestra padre, e ignora tutto ciò che non è JSON-RPC 2.0;
- controlla la forma di ogni notifica e di ogni risultato prima di esporli; i dati non validi vengono scartati o
  sollevati come `McpError`;
- non valuta mai codice e non scrive mai dati dell'host nel DOM (niente `eval`, niente `innerHTML`; gli stili
  dell'host non vengono applicati);
- limita ciò che conserva: 50 voci di log, ciascuna tagliata a 1000 caratteri, e un intervallo minimo di polling di
  100 ms;
- non ha dipendenze a runtime.

Cosa spetta a te:

- **L'host è fidato, il contenuto no.** I risultati dei tool arrivano dal tuo server e, attraverso il server, dal
  modello: mostrali con i binding di Angular (`{{ }}`), non con `[innerHTML]`.
- **Non mettere segreti nell'HTML.** Chi può leggere la risorsa dal tuo server MCP può leggere l'app intera.
- **I messaggi in uscita vanno a qualsiasi origin padre per impostazione predefinita**, perché gli host avvolgono
  l'app in una sandbox di cui di solito non conosci l'origin. Se la conosci, imposta `allowedOrigins`.
- **Proteggi il tuo server MCP.** Un server senza autenticazione permette a chiunque abbia l'URL di chiamare i suoi
  tool.
- `log: true` tiene in memoria dati dell'host e del server per mostrarli: usalo mentre fai debug.

## Il lato server

L'app è una metà. L'altra metà è il server MCP che la serve e risponde alle sue chiamate ai tool, e un server MCP
senza autenticazione è pubblico: chiunque abbia il suo indirizzo può chiamare i suoi tool. La specifica MCP definisce
un'autorizzazione basata su OAuth 2.1 per i server raggiunti via HTTP; usala, o un altro controllo di cui ti fidi,
prima di mettere dati reali dietro un tool. Maggiori dettagli in
[Cosa può andare storto](server.html#cosa-puo-andare-storto).

## Il file completo

<!-- source: docs/apps/security/src/main.ts -->
