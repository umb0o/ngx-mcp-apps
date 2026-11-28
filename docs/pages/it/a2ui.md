# A2UI dentro una MCP App

[A2UI](https://a2ui.org/) è un formato per interfacce che un agente descrive come dati (card, testi, pulsanti) e che
un client disegna con i propri componenti. Il suo renderer Angular, `@a2ui/angular`, può girare dentro una MCP App:
il server MCP mette i messaggi A2UI nel risultato di un tool e l'app li disegna. Questa pagina costruisce così un
contatore, con `ngx-mcp-apps` per il lato MCP Apps e il builder per il file unico.

## Quando usarla

- **Usa A2UI quando è l'agente a decidere l'interfaccia**: un modulo questa volta, una tabella o una card prodotto
  la prossima, composti dal server come dati. L'app non cambia: la forma dell'interfaccia arriva con ogni risultato.
- **Scrivi componenti Angular quando l'interfaccia la conosci**: il server manda solo i dati e l'app è più leggera.
  Il contatore di questa pagina, scritto come componente normale, non ha bisogno di un renderer.

Il contatore viene dall'esempio `a2ui-in-mcpapps` del
[repository di A2UI](https://github.com/a2ui-project/a2ui/tree/main/samples/community/mcp/a2ui-in-mcpapps)
(Apache-2.0). Provato con `@a2ui/angular` 0.10.7 su Angular 22.3, in Claude per Android (1.261124.19, novembre 2026) e in un host di prova che applica la content security policy predefinita della specifica MCP Apps.

## 1. Il progetto

```bash
ng new counter --minimal
cd counter
ng add ngx-mcp-apps-builder
npm install @a2ui/angular @a2ui/markdown-it
```

`@a2ui/angular` 0.10.7 dichiara Angular 21 come peer, quindi su Angular 22 npm rifiuta di installarlo:
`npm install --legacy-peer-deps @a2ui/angular @a2ui/markdown-it` lo installa, e il contatore qui sotto funziona.

Il renderer vuole un tema: parti dal
[`theme.ts` dell'esempio](https://github.com/a2ui-project/a2ui/blob/main/samples/community/mcp/a2ui-in-mcpapps/server/apps/src/src/theme.ts)
e salvalo come `src/app/theme.ts`. Nei suoi `additionalStyles` sostituisci `minWidth: '320px'` di `Card` con
`maxWidth: '100%'`: il riquadro di Claude per Android è largo 334 px, e con due card da 320 px il pulsante finisce
fuori dallo schermo.

## 2. Il server

Il tool che apre l'app restituisce i messaggi A2UI in `structuredContent`: l'app li riceve così come sono, e il
modello non li legge. Un pulsante della superficie nomina un tool (`increase_counter`): l'app lo chiama e il tool
risponde con altri messaggi.

```js
registerAppTool(
  server,
  'show_counter',
  {
    description: 'Shows a counter. The user increases it with a button.',
    inputSchema: {},
    _meta: { ui: { resourceUri: uri } },
  },
  async () => ({
    content: [{ type: 'text', text: 'Counter shown.' }],
    structuredContent: { a2ui: counterMessages },
  }),
);

// Called by the app only
registerAppTool(
  server,
  'increase_counter',
  {
    description: 'Increases the counter.',
    inputSchema: {},
    _meta: { ui: { resourceUri: uri, visibility: ['app'] } },
  },
  async () => {
    count++;
    return {
      content: [],
      structuredContent: {
        a2ui: [
          {
            dataModelUpdate: {
              surfaceId: 'ping-result',
              contents: [{ key: 'counter', valueNumber: count }],
            },
          },
        ],
      },
    };
  },
);
```

`counterMessages` sono i messaggi di
[`simple_counter_a2ui.json`](https://github.com/a2ui-project/a2ui/blob/main/samples/community/mcp/a2ui-in-mcpapps/server/simple_counter_a2ui.json)
dell'esempio (A2UI v0.8: `dataModelUpdate`, `surfaceUpdate`, `beginRendering`). Il resto del server è quello di
[Il lato server](server.html).

L'esempio di A2UI mette i messaggi in `content`, come risorsa incorporata di tipo `application/a2ui+json`. Claude per
Android passa le risorse incorporate all'app come testo (`[Resource from … at …]` seguito dal JSON), quindi il tipo
si perde e l'app non le riconosce; quel testo arriva anche al modello. L'app qui sotto accetta comunque una risorsa
incorporata, per gli host che la passano intatta.

## 3. L'app

`src/main.ts` è l'intera app. `McpApp` dà come signal il risultato della chiamata che ha aperto l'app e chiama i
tool del server passando dall'host; `@a2ui/angular` disegna le superfici.

```ts
import { Component, computed, effect, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  DEFAULT_CATALOG,
  MessageProcessor,
  Surface,
  provideA2UI,
  provideMarkdownRenderer,
} from '@a2ui/angular';
import { renderMarkdown } from '@a2ui/markdown-it';
import { McpApp, McpCallToolResult, provideMcpApp } from 'ngx-mcp-apps';
import { theme } from './app/theme';

/**
 * The A2UI messages of a tool result: `structuredContent.a2ui`, or else an embedded resource of type
 * application/a2ui+json (for hosts that pass embedded resources to the app as they are).
 */
function a2uiMessages(result: McpCallToolResult | undefined): unknown[] | undefined {
  const structured = result?.structuredContent?.['a2ui'];
  if (Array.isArray(structured)) return structured;
  for (const block of result?.content ?? []) {
    const resource = block['resource'] as { mimeType?: string; text?: string } | undefined;
    if (
      block.type === 'resource' &&
      resource?.mimeType === 'application/a2ui+json' &&
      resource.text
    )
      return JSON.parse(resource.text);
  }
  return undefined;
}

@Component({
  selector: 'app-root',
  imports: [Surface],
  template: `
    @for (entry of surfaces(); track entry[0]) {
      <a2ui-surface [surfaceId]="entry[0]" [surface]="entry[1]" />
    } @empty {
      <p>Waiting for the tool result…</p>
    }
  `,
})
class App {
  private readonly mcp = inject(McpApp);
  private readonly processor = inject(MessageProcessor);
  readonly surfaces = computed(() => [...this.processor.getSurfaces().entries()]);

  constructor() {
    // The result of the tool call that opened the app: draw it
    effect(() => {
      const messages = a2uiMessages(this.mcp.toolResult());
      if (!messages) return;
      this.processor.clearSurfaces();
      this.processor.processMessages(messages as never);
    });
    // A button of the surface: call the tool it names, then apply the messages it returns
    this.processor.events.subscribe(async ({ message }) => {
      const action = message.userAction;
      if (!action) return;
      const result = await this.mcp.callServerTool(action.name, action.context ?? {});
      const messages = a2uiMessages(result);
      if (messages) this.processor.processMessages(messages as never);
    });
  }
}

bootstrapApplication(App, {
  providers: [
    provideMcpApp({ name: 'a2ui-counter', version: '1.0.0' }),
    provideA2UI({ catalog: DEFAULT_CATALOG, theme }),
    provideMarkdownRenderer(renderMarkdown),
  ],
}).catch(console.error);
```

`ng build` scrive l'app in un solo file HTML (circa 455 kB con il renderer): servilo come risorsa `ui://` del tool,
come in [Il lato server](server.html).

## Da sapere

- **Font.** Se i tuoi stili caricano un font da un altro sito (il foglio di stile dell'esempio usa Google Fonts), il
  builder ne elenca l'indirizzo: dichiara il dominio in `_meta.ui.csp.resourceDomains` della risorsa, altrimenti
  l'host lo blocca.
- **La stretta di mano** la fa `ngx-mcp-apps`: in `ui/initialize` manda `appInfo`, come chiede la specifica.
- **Versioni dei messaggi.** `@a2ui/angular` 0.10 legge i messaggi A2UI v0.8 dal suo punto d'ingresso principale; ha
  anche un punto d'ingresso `v0_9`.
