# Riferimento

## API

### Signal di `McpApp`

| Signal                                                  | Significato                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `status`                                                | `connecting`, `connected` o `standalone`                                              |
| `connected`                                             | `true` quando l'handshake con l'host è riuscito                                       |
| `toolInput`, `toolInputPartial`                         | Argomenti della chiamata al tool che ha aperto l'app (finali, e durante lo streaming) |
| `toolResult`, `structuredContent`                       | Risultato di quella chiamata al tool                                                  |
| `toolCancelled`, `toolCancelReason`                     | L'host ha annullato la chiamata al tool, e perché quando lo dice                      |
| `hostContext`, `hostCapabilities`                       | Ciò che l'host dice di sé                                                             |
| `theme`                                                 | `light` o `dark`, come lo riporta l'host                                              |
| `displayMode`, `availableDisplayModes`, `canFullscreen` | `inline`, `fullscreen`, `pip`                                                         |
| `events`                                                | Log del protocollo, dal più recente, con `log: true`                                  |

### Metodi di `McpApp`

| Metodo                                                        | Significato                                                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `callServerTool(name, args)`                                  | Chiama un tool del tuo server MCP dall'interfaccia                                                          |
| `pollServerTool(name, { intervalMs, args, guard, injector })` | Signal che segue un tool del server                                                                         |
| `structuredContentAs(guard)`                                  | `structuredContent`, controllato dalla tua guard e tipizzato                                                |
| `updateModelContext(text, structuredContent?)`                | Aggiunge contesto per il prossimo turno del modello, senza un messaggio in chat                             |
| `sendMessage(text)`                                           | Pubblica un messaggio dell'utente; si risolve con `false` se l'host rifiuta                                 |
| `requestDisplayMode(mode)`, `toggleFullscreen()`              | Chiede all'host un'altra modalità di visualizzazione; si risolve con quella impostata davvero               |
| `openLink(url)`                                               | Chiede all'host di aprire un link; si risolve con `false` se l'host rifiuta                                 |
| `requestTeardown()`                                           | Chiede all'host di chiudere l'app                                                                           |
| `onTeardown(handler)`                                         | Esegue `handler` prima che l'host rimuova l'app (l'host lo aspetta); restituisce una funzione che lo toglie |
| `readServerResource(uri)`, `listServerResources(cursor?)`     | Legge o elenca le risorse del tuo server MCP, passando dall'host                                            |
| `downloadFile(contents)`                                      | Chiede all'host di salvare dei file per l'utente; si risolve con `false` se rifiuta                         |
| `sendLog(level, data, logger?)`                               | Manda un messaggio di log all'host (`notifications/message`)                                                |
| `bridge`                                                      | Il `McpBridge` sottostante, per i metodi del protocollo non incapsulati qui                                 |

I metodi che restituiscono una promise vengono rifiutati con un errore quando l'app non è connessa. In quel caso
`requestTeardown()` e `sendLog()` non fanno niente, e `bridge` è `undefined` quando l'app gira fuori da un host.

### API di basso livello

Anche `McpBridge`, `parentWindowPort()`, le costanti `Methods` e le guard sono TypeScript semplice e vengono
esportati:

```ts
const bridge = new McpBridge(parentWindowPort(), { name: 'my-app', version: '1.0.0' });
bridge.onNotification(Methods.toolResult, (params) => {
  /* ... */
});
const { hostContext } = await bridge.connect();
```

## Configurazione

Opzioni di `provideMcpApp(config)`:

| Opzione                 | Predefinito    | Significato                                                                        |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `name`, `version`       | obbligatori    | Inviati all'host durante l'handshake                                               |
| `autoResize`            | `true`         | Comunica all'host la dimensione del contenuto, così l'iframe si adatta             |
| `availableDisplayModes` | non inviato    | Modi di visualizzazione supportati dall'app, dichiarati all'host nella connessione |
| `connectTimeout`        | `4000`         | Ms di attesa dell'host prima di passare a `standalone`                             |
| `requestTimeout`        | `60000`        | Ms di attesa della risposta a una richiesta                                        |
| `log`                   | `false`        | Conserva gli ultimi 50 eventi del protocollo in `events` (per il debug)            |
| `allowedOrigins`        | qualsiasi      | Parla solo con una finestra padre che ha una di queste origini                     |
| `port`                  | finestra padre | Trasporto personalizzato, soprattutto per i test                                   |

## Compatibilità

I due pacchetti supportano le stesse versioni di Angular.

| Pacchetto              | Angular            | Peer dependency                                                                         |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `ngx-mcp-apps`         | 18, 19, 20, 21, 22 | `@angular/core` `>=18.0.0 <23.0.0`                                                      |
| `ngx-mcp-apps-builder` | 18, 19, 20, 21, 22 | `@angular/build` `>=18.0.0 <23.0.0`, `@angular-devkit/architect` `>=0.1800.0 <0.2300.0` |

Ognuna di queste versioni è stata verificata con una nuova applicazione che usa la libreria ed è costruita dal
builder, sia con la prima release della major (18.0.0, 19.0.0, ...) sia con l'ultima: una build di produzione, poi
la pagina costruita aperta in un browser.

La verifica si ripete automaticamente a ogni modifica e una volta a settimana, con l'ultima release di ogni major:
una nuova applicazione, `ng add`, un componente di Angular Material, la build in un solo file, poi la pagina aperta
in un browser. Lanciala tu con `npm run build && npm run test:compat`.

- Protocollo MCP Apps `2026-01-26`. Se l'host annuncia una versione diversa, viene registrata nel log e l'app
  continua a funzionare.
- I test automatici eseguono la libreria contro l'`AppBridge` ufficiale.
- **Host.** Provata con Claude: claude.ai sul web e l'app Claude per Android. La libreria segue la specifica MCP Apps (protocollo 2026-01-26), quindi altri host che la implementano dovrebbero funzionare, ma non sono stati provati.

## Limiti

- Non ancora incapsulati: tool forniti dall'app all'host, sampling, download di file, lettura delle risorse del
  server. Si raggiungono con `bridge.request(...)` e `bridge.onRequest(...)`.
- Vengono validati solo i campi del contesto dell'host che la libreria conosce; i campi sconosciuti passano così come
  sono.
- Il file HTML unico carica tutto in una volta: i chunk lazy vengono uniti al suo interno, e i web worker non sono
  supportati (vedi [Crea un unico file HTML](#4-fai-la-build-in-un-solo-file-html)).

## Ringraziamenti

Questa è un'implementazione indipendente e non ufficiale. Si ispira a, e deve il suo design a:

- [`@modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps) (MIT / Apache-2.0), l'SDK
  ufficiale di MCP Apps: l'handshake, il flusso dei messaggi e la misura per l'auto-resize sono modellati su di esso,
  e il suo `AppBridge` è usato nella suite di test. Nessuna parte del suo codice è inclusa in questo pacchetto.
- La [specifica MCP Apps (SEP-1865)](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp).

"MCP", "Model Context Protocol" e "Claude" sono nomi dei rispettivi proprietari e sono usati solo per descrivere la
compatibilità e dare credito. Questo progetto non è affiliato né approvato da nessuno di loro.
