# Componenti

Codice da copiare. Questi file non fanno parte del pacchetto npm: scegline uno, copialo nella tua applicazione e
modificalo come vuoi. Nessuno dipende da altro che `ngx-mcp-apps` e Angular, e ognuno è compilato e usato in questo
sito: quello che copi è codice che funziona.

## Parti da un'app intera

Un solo file che è l'intera applicazione, scritto per Angular 22. La sua pagina lo esegue dal vivo. Anche il grafico
della pagina [L'esempio](example.html) è un'app intera in un solo file.

<!-- list: one-file -->

## Oppure prendi i pezzi

Nove piccoli file, ognuno con un solo compito, per quando l'app cresce. Funzionano da Angular 18 e prendono i colori
dal testo che li circonda, quindi seguono il tuo tema senza un foglio di stile.

<!-- list: pieces -->

## Come usare un pezzo

Metti il file in una cartella come `src/app/mcp/` e importa la classe dove la usi:

```ts
import { McpStatus } from './mcp/mcp-status';

@Component({
  imports: [McpStatus],
  template: `<mcp-status />`,
})
export class App {}
```

Da Angular 19 puoi cancellare la riga `standalone: true` di un pezzo: è il valore predefinito.
