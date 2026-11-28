# A2UI inside an MCP App

[A2UI](https://a2ui.org/) is a format for interfaces that an agent describes as data (cards, texts, buttons) and a
client draws with its own components. Its Angular renderer, `@a2ui/angular`, can run inside an MCP App: the MCP
server puts A2UI messages in the result of a tool, and the app draws them. This page builds a counter that way,
with `ngx-mcp-apps` for the MCP Apps side and the builder for the single file.

## When to use it

- **Use A2UI when the agent decides the interface**: a form this time, a table or a product card the next, composed
  by the server as data. The app does not change; the shape of the interface arrives with each result.
- **Write Angular components when you know the interface**: the server sends only the data and the app is smaller.
  The counter of this page, written as a plain component, needs no renderer.

The counter comes from the `a2ui-in-mcpapps` sample of the
[A2UI repository](https://github.com/a2ui-project/a2ui/tree/main/samples/community/mcp/a2ui-in-mcpapps)
(Apache-2.0). Checked with `@a2ui/angular` 0.10.7 on Angular 22.3, in Claude for Android (1.261124.19, November 2026) and in a test host that applies the default content security policy of the MCP Apps specification.

## 1. The project

```bash
ng new counter --minimal
cd counter
ng add ngx-mcp-apps-builder
npm install @a2ui/angular @a2ui/markdown-it
```

`@a2ui/angular` 0.10.7 declares Angular 21 as its peer, so on Angular 22 npm refuses to install it:
`npm install --legacy-peer-deps @a2ui/angular @a2ui/markdown-it` installs it, and the counter below works.

The renderer needs a theme: start from the
[`theme.ts` of the sample](https://github.com/a2ui-project/a2ui/blob/main/samples/community/mcp/a2ui-in-mcpapps/server/apps/src/src/theme.ts)
and save it as `src/app/theme.ts`. In its `additionalStyles`, replace `minWidth: '320px'` of `Card` with
`maxWidth: '100%'`: the frame of Claude for Android is 334 px wide, and with two cards of 320 px the button ends up
off screen.

## 2. The server

The tool that opens the app returns the A2UI messages in `structuredContent`: the app receives them as they are, and
the model does not read them. A button of the surface names a tool (`increase_counter`); the app calls it, and the
tool answers with more messages.

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

`counterMessages` are the messages of
[`simple_counter_a2ui.json`](https://github.com/a2ui-project/a2ui/blob/main/samples/community/mcp/a2ui-in-mcpapps/server/simple_counter_a2ui.json)
in the sample (A2UI v0.8: `dataModelUpdate`, `surfaceUpdate`, `beginRendering`). The rest of the server is the one
of [The server side](server.html).

The A2UI sample puts the messages in `content`, as an embedded resource of type `application/a2ui+json`. Claude for
Android passes embedded resources to the app as text (`[Resource from … at …]` followed by the JSON), so the type is
lost and the app cannot recognise them; that text also reaches the model. The app below still accepts an embedded
resource, for hosts that pass it unchanged.

## 3. The app

`src/main.ts` is the whole app. `McpApp` gives the result of the tool call that opened the app as a signal, and
calls the server's tools through the host; `@a2ui/angular` draws the surfaces.

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

`ng build` writes the app as one HTML file (about 455 kB with the renderer): serve it as the `ui://` resource of the
tool, as in [The server side](server.html).

## Things to know

- **Fonts.** If your styles load a font from another site (the sample's stylesheet uses Google Fonts), the builder
  lists its address: declare the domain in `_meta.ui.csp.resourceDomains` of the resource, or the host blocks it.
- **The handshake** is done by `ngx-mcp-apps`: it sends `appInfo` in `ui/initialize`, as the specification asks.
- **Message versions.** `@a2ui/angular` 0.10 reads A2UI v0.8 messages from its main entry point; it also has a
  `v0_9` entry point.
