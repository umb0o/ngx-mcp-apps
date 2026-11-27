# Routing

Un'applicazione Angular con il router funziona come MCP App. Ci sono tre cose da sapere: come il router tiene il suo
indirizzo dentro il frame, come il modello sceglie la vista su cui si apre l'app, e come l'app dice al modello dove è
andato l'utente.

L'applicazione qui sotto ha un elenco di viaggi e una pagina per ogni viaggio. È compilata in un solo file HTML e gira
in un iframe; questa pagina fa la parte dell'host della chat.

<!-- stage: routing -->

## Prova così

- **Clicca un viaggio, poi Back.** La riga "Route" segue. Cambia solo l'app: l'indirizzo di questa pagina resta lo
  stesso.
- **Guarda la colonna scura.** Dopo ogni navigazione l'app invia `ui/update-model-context`, e la frase inviata compare
  sotto l'app come "Added to the model context".
- **Premi "Show me my trips"** sotto l'app. L'app riparte, e questa volta la chiamata al tool non ha l'argomento
  `open`, quindi si apre sull'elenco. "Show me the Lisbon trip" invia `{ "open": "trip/2" }` e l'app si apre
  lì.

## 1. Usa l'hash per l'indirizzo

Un host mostra l'app in un frame tutto suo: l'indirizzo di quel frame è dell'host, non un percorso del tuo sito.
Quindi il router non deve scriverci dei percorsi. Con `withHashLocation()` il router tiene la route nella parte dopo
`#`, che una pagina può sempre cambiare nel proprio indirizzo. Così i link (`routerLink`) e Back funzionano dentro il
frame.

```ts
bootstrapApplication(App, {
  providers: [
    provideMcpApp({ name: 'trips', version: '1.0.0' }),
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
  ],
});
```

`withComponentInputBinding()` non serve per MCP: passa solo `:id` al componente del viaggio come input.

Anche le route lazy funzionano. `loadComponent`, `loadChildren` e `@defer` creano file separati, che un solo file HTML
non può scaricare, quindi il builder li rimette nel file: vengono caricati insieme all'app invece che su richiesta.
Questo esempio usa route statiche perché qui le route lazy non porterebbero nessun vantaggio. Vedi
[Il builder](builder.html).

```ts
const routes: Routes = [
  { path: '', component: Trips },
  { path: 'trip/:id', component: Trip },
  { path: '**', redirectTo: '' },
];
```

## 2. Lascia che il modello apra una vista

Il modello apre l'app chiamando un tool, e gli argomenti di quella chiamata arrivano all'app in `mcp.toolInput()`. Dai
al tuo tool un argomento che indica la vista, e naviga quando arriva. Il valore lo scrive il modello, quindi
controllalo prima di usarlo: qui è accettato solo `trip/` seguito da un numero, qualsiasi altra cosa apre l'elenco.

```ts
const isView = (v: unknown): v is string => typeof v === 'string' && /^trip\/\d{1,3}$/.test(v);

effect(() => {
  const input = this.mcp.toolInput();
  if (!input || this.opened()) return;
  const open = input['open'];
  void this.router.navigateByUrl(isView(open) ? `/${open}` : '/').then(() => this.opened.set(true));
});
```

`toolInput()` vale `undefined` finché l'host non invia gli argomenti, cosa che succede un attimo dopo l'avvio
dell'app. Il signal `opened` fa navigare l'effect una sola volta, e permette al passo successivo di aspettarlo.

## 3. Di' al modello dove si trova l'utente

Il modello non vede lo schermo. Dopo ogni navigazione l'app invia una frase con `mcp.updateModelContext(...)`: l'host
tiene l'ultima e il modello la legge al turno successivo, così "dimmi di più su questo" ha una risposta. È silenzioso:
nella conversazione non compare nulla.

```ts
private readonly place = computed(() => {
  const id = /^\/trip\/(\d+)$/.exec(this.url())?.[1];
  const trip = TRIPS.find((t) => t.id === id);
  return trip ? `the trip to ${trip.city} (route ${this.url()})` : 'the list of trips (route /)';
});

effect(() => {
  const place = this.place();
  if (!this.opened() || !this.mcp.connected()) return;
  this.mcp.updateModelContext(`The user is looking at ${place}.`).catch(() => {
    /* a host may refuse: the app works the same */
  });
});
```

`url` è un signal impostato dall'evento `NavigationEnd` del router. `updateModelContext` viene rifiutata quando l'app
non è connessa a un host o l'host la rifiuta: per questo la chiamata è protetta da un controllo e l'errore viene
intercettato.

## Limiti

- Le route lazy vengono unite nel file: funzionano, ma sono caricate insieme all'app, come detto sopra.
- Il pulsante Back di questo esempio conta le navigazioni fatte dentro l'app ed è disattivato alla prima. Un passo
  più indietro farebbe uscire dall'app, e cosa succede a quel punto lo decide l'host.
- L'esempio è stato provato nell'host di questa pagina. Prova la tua app negli host che ti interessano.

## Il file completo

<!-- source: docs/apps/routing/src/main.ts -->
