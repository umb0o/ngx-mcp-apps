# Portare un'app Angular esistente

Non serve ripartire da zero. Componenti, servizi, form, Angular Material e le librerie che la tua app usa già
continuano a funzionare dentro un host di chat: l'app resta un'applicazione Angular, costruita in un solo file HTML.
Questa pagina elenca cosa fare, e le poche cose che dentro un host funzionano in modo diverso.

## 1. Aggiungi il builder

Nel workspace dell'app:

```bash
ng add ngx-mcp-apps-builder
```

Passa il target `build` a `ngx-mcp-apps-builder:application`, aggiunge `ngx-mcp-apps` e, su Angular 18 e 19,
`@angular/build`. Tutte le altre opzioni del tuo target `build` restano come sono. Poi:

```bash
ng build
```

```text
Single file: dist/my-app.html (212.4 kB)
```

Il log della build elenca anche cosa serve ancora da fuori al file (vedi [Cosa cambia](#cosa-cambia)). Leggilo: è la
lista delle cose da fare per il porting.

## 2. Collegala all'host

Registra la libreria dove avvii l'app, accanto ai tuoi provider:

```ts
bootstrapApplication(App, {
  providers: [...yourProviders, provideMcpApp({ name: 'my-app', version: '1.0.0' })],
});
```

`McpApp` dà come signal quello che manda l'host: gli argomenti e il risultato della chiamata al tool che ha aperto
l'app, il tema, la modalità di visualizzazione. Fuori da un host (`ng serve`) il suo stato diventa `standalone` e
l'app funziona come prima, così continui a svilupparla nel browser. I dettagli in [Inizia](start.html).

## 3. Servila da un server MCP

Il file HTML è la risorsa `ui://` di un tool del tuo server MCP, come in [Il lato server](server.html). Da lì l'host
apre l'app quando il modello chiama il tool.

## Cosa resta uguale

- Componenti, template, servizi, dependency injection, pipe, signal e RxJS.
- Angular Material e il CDK, con i loro font e le icone quando sono file del tuo progetto (il builder li incorpora).
- Le librerie della tua app: un'app di prova con Angular Material, `date-fns`, `dayjs` e `chart.js`, costruita con il
  builder, gira in Claude per Android e in claude.ai sul web.
- App con zone.js e app zoneless: le prove di compatibilità costruiscono app nuove di Angular dalla 18 alla 22 con le
  loro impostazioni predefinite.

Quell'app di prova dentro Claude per Android (1.261124.19, tema scuro, larga 334 px), novembre 2026:

<p class="shots">
  <img src="../assets/screens/claude-android-material.webp" width="270" height="314" loading="lazy"
    alt="Dentro Claude per Android: l'app è collegata all'host, con tema scuro e larghezza di 334 px, e campo di testo, datepicker e dialog di Angular Material funzionano." />
  <img src="../assets/screens/claude-android-fonts-images.webp" width="270" height="200" loading="lazy"
    alt="Le icone Material e il font Roboto, entrambi incorporati nel file HTML, si vedono correttamente." />
  <img src="../assets/screens/claude-android-libraries.webp" width="270" height="300" loading="lazy"
    alt="Un'immagine richiamata da un template non viene trovata, come previsto; dayjs e date-fns calcolano le date giuste e chart.js disegna un grafico a barre." />
  <img src="../assets/screens/claude-android-remote.webp" width="270" height="211" loading="lazy"
    alt="Un foglio di stile di Google Fonts dichiarato dal server si carica; l'app gira su un'origine https dell'host; 10 controlli su 12 passati." />
</p>

## Cosa cambia

- **Le rotte.** Il riquadro ha l'indirizzo dell'host, non il tuo: usa `withHashLocation()`. Rotte lazy e blocchi
  `@defer` funzionano ancora; il loro codice viene unito nel file e si carica con l'app. Vedi [Routing](routing.html).
- **Da dove parte l'app.** Non c'è un URL da leggere: l'app parte dalla chiamata al tool che l'ha aperta
  (`mcp.toolInput()`, `mcp.structuredContent()`), quindi è il modello a scegliere la prima vista.
- **Le immagini nei template.** `<img src="logo.png">` non viene incorporata, e dal riquadro un indirizzo relativo
  non arriva al tuo sito. Richiama l'immagine dal CSS (il builder incorpora i file dei `url()` nel CSS), oppure
  servila dal tuo sito e dichiarane il dominio (punto seguente).
- **Tutto quello che arriva da un altro sito** (script da una CDN, font web) si carica solo se il server MCP ne
  dichiara il dominio in `_meta.ui.csp.resourceDomains` della risorsa. Le chiamate con `fetch` o `HttpClient` hanno
  bisogno di `_meta.ui.csp.connectDomains`, e il tuo backend deve accettare richieste dall'origine del riquadro
  (CORS). Il builder elenca gli indirizzi remoti che trova.
- **La tua API e le sue credenziali.** La strada più semplice è lasciare le chiamate al backend nel server MCP e
  raggiungerle dall'app con `mcp.callServerTool()`: il server tiene le credenziali, e all'app non serve
  `connectDomains`.
- **Larghezza e tema.** Il riquadro è stretto (334 px in Claude per Android, 736 px in claude.ai sul web, misurati a
  novembre 2026): il layout deve funzionare lì. L'host ha il suo tema chiaro o scuro: imposta `color-scheme` sulla
  radice del documento, altrimenti il riquadro resta bianco in un host scuro. Vedi [Tema](theme.html).
- **I web worker** non sono supportati: la build si ferma con un errore che lo dice.
