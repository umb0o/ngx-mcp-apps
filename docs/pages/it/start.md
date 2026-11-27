# Inizia

Ti serve un'applicazione Angular (da Angular 18 a 22, vedi [Compatibilità](reference.html#compatibilita)). Va bene anche
una nuova: `ng new my-app`.

## 1. Installa

```bash
ng add ngx-mcp-apps-builder
```

Questo comando installa il builder e la libreria, e configura il target `build` della tua applicazione perché scriva un
solo file HTML (`dist/<project>.html`; scegli un altro percorso con `--single-file`). Il passo 4 mostra cosa cambia.

Oppure a mano:

```bash
npm install ngx-mcp-apps
npm install -D ngx-mcp-apps-builder
```

## 2. Configura

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideMcpApp } from 'ngx-mcp-apps';

export const appConfig: ApplicationConfig = {
  providers: [provideMcpApp({ name: 'my-app', version: '1.0.0' })],
};
```

## 3. Usa `McpApp` in un componente

```ts
// app.ts
import { Component, inject } from '@angular/core';
import { McpApp, isObject } from 'ngx-mcp-apps';

interface Greeting {
  message: string;
}
const isGreeting = (v: unknown): v is Greeting => isObject(v) && typeof v['message'] === 'string';

@Component({
  selector: 'app-root',
  template: `
    <p>{{ mcp.status() }} · {{ mcp.displayMode() }}</p>
    <p>{{ greeting()?.message }}</p>
    @if (mcp.canFullscreen()) {
      <button (click)="mcp.toggleFullscreen()">Fullscreen</button>
    }
  `,
})
export class App {
  protected readonly mcp = inject(McpApp);
  // structuredContent of the tool call that opened the app, checked and typed
  protected readonly greeting = this.mcp.structuredContentAs(isGreeting);
}
```

La connessione parte da sola la prima volta che `McpApp` viene iniettato. Fuori da un host (`ng serve`, una normale
scheda del browser) `status()` diventa `standalone`, così puoi sviluppare la stessa app come una pagina qualsiasi.

## 4. Fai la build in un solo file HTML

Gli host caricano l'app da una sola risorsa HTML dentro un iframe in sandbox, quindi la build non deve dipendere da
altri file. `ng add` l'ha già fatto per te. A mano: in `angular.json` sostituisci il builder del target `build` e
aggiungi l'opzione `singleFile`:

```json
{
  "projects": {
    "my-app": {
      "architect": {
        "build": {
          "builder": "ngx-mcp-apps-builder:application",
          "options": {
            "browser": "src/main.ts",
            "tsConfig": "tsconfig.app.json",
            "styles": ["src/styles.css"],
            "singleFile": "public/app.html"
          }
        }
      }
    }
  }
}
```

Lascia le altre opzioni che hai già: il builder esegue l'application builder ufficiale di Angular con le stesse
opzioni, poi scrive il file unico.

```bash
ng build
```

```text
Single file: public/app.html (212.4 kB)
```

`public/app.html` è l'app intera: ogni script e foglio di stile locale è incorporato nel file. È questo il file che il
tuo server MCP restituisce all'host.

**Il lazy loading viene unito nel file.** Un solo file HTML non può scaricare altri chunk, quindi il builder rimette
nel file le route lazy (`loadComponent` / `loadChildren`), i blocchi `@defer` e gli `import()` dinamici. Il codice
funziona così come lo hai scritto, ma tutto viene caricato insieme all'app: non si risparmia nulla. Un web worker non
può essere unito e fa fallire la build.
I font e le immagini citati dal tuo CSS
vengono incorporati; un'immagine indicata in un template (`<img src>`) no: usa un URL `data:` o un URL assoluto `https://`. Maggiori dettagli in
[Il builder](builder.html).

Altre due cose da sapere dentro l'iframe dell'host:

- se ti serve un router, usa `withHashLocation()`: l'URL dell'iframe non è tuo;
- `localStorage` potrebbe non essere disponibile nella sandbox: mettilo in un `try/catch` e tieni lo stato vero sul
  tuo server.

## Come si combinano i pezzi

1. Il tuo server MCP espone un tool e, come descrive la specifica MCP Apps, serve il file HTML della build come
   risorsa `ui://` collegata a quel tool con `_meta.ui.resourceUri`.
2. Quando il modello chiama il tool, l'host carica quell'HTML in un iframe in sandbox dentro la conversazione.
3. `McpApp` fa l'handshake con l'host tramite `postMessage` e riceve gli argomenti e il risultato del tool:
   lo `structuredContent` di quel risultato è ciò che restituisce `mcp.structuredContent()`.
4. Da lì in poi l'app può chiamare i tool del tuo server, aggiungere contesto per il modello e chiedere un'altra
   modalità di visualizzazione.

La parte server non rientra in questo progetto: funziona qualsiasi server MCP che segua la specifica MCP Apps, e come
scriverlo lo decidi tu.

Gli host possono tenere in cache la risorsa: metti un hash della build nell'URI (`ui://my-app/app-<hash>.html`) così
una nuova build viene sempre presa.
