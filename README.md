# ngx-mcp-apps

> Unofficial community library. Not affiliated with or endorsed by Anthropic, OpenAI or the Model Context Protocol project.

Angular runtime for [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), exposed as signals.
Build an Angular UI that an MCP server returns as an interactive app inside Claude, ChatGPT and other MCP hosts.

**No dependencies.** It implements the view side of the MCP Apps protocol (version `2026-01-26`) itself,
instead of pulling in the official SDK and zod: about 13 KB unminified, against ~650 KB minified for the official runtime.
Compatibility is tested against the official host implementation (`AppBridge` from `@modelcontextprotocol/ext-apps`).

## Install

```bash
npm install ngx-mcp-apps
```

## Setup

```ts
// app.config.ts
import { provideMcpApp } from 'ngx-mcp-apps';

export const appConfig: ApplicationConfig = {
  providers: [provideMcpApp({ name: 'my-app', version: '1.0.0', log: true })],
};
```

## Use

```ts
import { McpApp } from 'ngx-mcp-apps';

@Component({
  template: `
    <p>{{ mcp.status() }} · {{ mcp.displayMode() }}</p>
    <p>{{ data()?.message }}</p>
    @if (mcp.canFullscreen()) {
      <button (click)="mcp.toggleFullscreen()">Fullscreen</button>
    }
  `,
})
export class MyApp {
  protected readonly mcp = inject(McpApp);
  // structuredContent of the tool call that opened the app
  protected readonly data = computed(() => this.mcp.structuredContent() as { message?: string } | undefined);
}
```

The connection starts on its own. Outside a host (e.g. `ng serve`) `status()` becomes `standalone` after a timeout.

## Checking your own data

The protocol messages are checked by the library. For the data your server sends, pass a guard:
any `(value: unknown) => value is T` works (hand-written, typia, valibot...). The type is inferred from it.

```ts
import { isObject } from 'ngx-mcp-apps';

interface Note { id: number; text: string }
const isNote = (v: unknown): v is Note => isObject(v) && typeof v['id'] === 'number' && typeof v['text'] === 'string';

note = this.mcp.pollServerTool('read_note', { guard: isNote });   // Signal<Note | undefined>
opened = this.mcp.structuredContentAs(isNote);                     // Signal<Note | undefined>
```

Invalid values are dropped (and logged); the signal keeps the last valid one.

## API

| Signal | Meaning |
| --- | --- |
| `status` | `connecting`, `connected` or `standalone` |
| `toolInput` / `toolInputPartial` / `toolResult` / `structuredContent` / `toolCancelled` | Data of the tool call that opened the app |
| `hostContext` / `hostCapabilities` / `theme` | What the host says about itself |
| `displayMode` / `availableDisplayModes` / `canFullscreen` | Inline, fullscreen, picture-in-picture |
| `events` | Protocol log, newest first, when `log: true` |

| Method | Meaning |
| --- | --- |
| `callServerTool(name, args)` | Call a tool on your MCP server from the UI |
| `pollServerTool(name, { intervalMs, args, guard, injector })` | Signal that follows a server tool, to see updates the model makes while the app is open |
| `structuredContentAs(guard)` | `structuredContent` checked by your guard, typed |
| `updateModelContext(text)` | Add context for the model's next turn, without a chat message |
| `sendMessage(text)` | Post a user message; hosts may ask for confirmation or refuse (often on mobile) |
| `requestDisplayMode(mode)` / `toggleFullscreen()` | Ask the host for another display mode |
| `openLink(url)` | Ask the host to open a link |
| `requestTeardown()` | Ask the host to close the app |
| `bridge` | The underlying `McpBridge`, for protocol methods not wrapped here |

## Notes

- Hosts render the app in a sandboxed iframe from a single HTML resource. Inline your build (JS and CSS in `index.html`) and avoid lazy-loaded routes.
- Messages from the host are checked at runtime with small hand-written type guards (exported from `guards`): invalid notifications are dropped and logged, invalid results throw `McpError`.
- `McpBridge` and `parentWindowPort()` work without Angular, and `provideMcpApp({ port })` accepts a custom transport (useful in tests).
- Use hash routing (`withHashLocation()`) if you need a router: the iframe URL is not yours.

## Acknowledgements

The protocol behaviour (handshake, messages, auto-resize measurement) is modelled on the official
[`@modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps) (MIT) and the
[MCP Apps specification (SEP-1865)](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp).
"MCP", "Claude" and "ChatGPT" are used only to describe compatibility.

## License

MIT © 2026 umb0o
