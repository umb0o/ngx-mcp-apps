# ngx-mcp-apps

Angular wrapper for [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), exposed as signals.
Build an Angular UI that an MCP server returns as an interactive app inside Claude, ChatGPT and other MCP hosts.

It wraps the `App` class from [`@modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps).

## Install

```bash
npm install ngx-mcp-apps @modelcontextprotocol/ext-apps
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

## API

| Signal | Meaning |
| --- | --- |
| `status` | `connecting`, `connected` or `standalone` |
| `toolInput` / `toolResult` / `structuredContent` | Data of the tool call that opened the app |
| `hostContext` / `hostCapabilities` | What the host says about itself |
| `displayMode` / `availableDisplayModes` / `canFullscreen` | Inline, fullscreen, picture-in-picture |
| `events` | Protocol log, newest first, when `log: true` |

| Method | Meaning |
| --- | --- |
| `callServerTool(name, args)` | Call a tool on your MCP server from the UI |
| `pollServerTool(name, ms)` | Signal that follows a server tool, to see updates the model makes while the app is open |
| `updateModelContext(text)` | Add context for the model's next turn, without a chat message |
| `sendMessage(text)` | Post a user message; hosts may ask for confirmation or refuse (often on mobile) |
| `requestDisplayMode(mode)` / `toggleFullscreen()` | Ask the host for another display mode |
| `openLink(url)` | Ask the host to open a link |
| `app` | The underlying ext-apps `App`, for everything else |

## Notes

- Hosts render the app in a sandboxed iframe from a single HTML resource. Inline your build (JS and CSS in `index.html`) and avoid lazy-loaded routes.
- The library imports `@modelcontextprotocol/ext-apps/app-with-deps`, which has no lazy chunks, so the build stays a single file.
- Use hash routing (`withHashLocation()`) if you need a router: the iframe URL is not yours.
