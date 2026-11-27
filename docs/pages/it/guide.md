# Lavorare con il modello

## Seguire il modello mentre l'app è aperta

Il risultato di un tool arriva all'app una volta sola, quando l'app si apre. Perché il modello possa continuare a
scrivere in un'app già aperta, fagli chiamare un tool normale che salva i dati sul tuo server, e fai seguire all'app
quello stato:

```ts
// The model calls `write_note`; the app reads `read_note` every second
protected readonly note = this.mcp.pollServerTool('read_note', { intervalMs: 1000, guard: isNote });
```

Sul server marca il tool di lettura come riservato all'app (`_meta: { ui: { visibility: ['app'] } }`), così il
modello non lo vede.
`pollServerTool` va chiamato in un injection context (l'inizializzatore di un campo o il costruttore), oppure gli
passi `{ injector }`.

Per rispondere al modello:

```ts
await this.mcp.updateModelContext('The user is on exercise 3'); // silent, read on the model's next turn
const sent = await this.mcp.sendMessage('I am done'); // a chat message; false if the host refuses
```

Gli host possono chiedere all'utente di confermare `sendMessage` oppure rifiutarlo (succede spesso su mobile).
Preferisci `updateModelContext` e lascia che sia l'utente a scrivere nella chat.

## Controllare i tuoi dati

I messaggi del protocollo li controlla la libreria. Per i dati che manda il tuo server, passa una guard: va bene
qualsiasi `(value: unknown) => value is T` (scritta a mano, generata da typia, un `is` di valibot...). Il tipo viene
dedotto da lì.

```ts
interface Note {
  id: number;
  text: string;
}
const isNote = (v: unknown): v is Note =>
  isObject(v) && typeof v['id'] === 'number' && typeof v['text'] === 'string';

note = this.mcp.pollServerTool('read_note', { guard: isNote }); // Signal<Note | undefined>
opened = this.mcp.structuredContentAs(isNote); // Signal<Note | undefined>
```

Con `pollServerTool`, un valore non valido viene scartato e registrato nel log, e il signal tiene l'ultimo valore
valido. `structuredContentAs` vale `undefined` finché il risultato della chiamata al tool non supera la guard.
