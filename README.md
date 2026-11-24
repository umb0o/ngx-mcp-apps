# ngx-mcp-apps

> Unofficial community library. Not affiliated with or endorsed by Anthropic, OpenAI or the Model Context Protocol project.

Angular runtime for [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), exposed as signals.
Write an Angular app, return it from an MCP server, and it runs as an interactive UI inside Claude and other MCP hosts.

- **Signals first.** Connection status, tool data, host theme and display mode are signals.
- **No dependencies.** The view side of the protocol is implemented here: about 13 KB minified (under 5 KB gzipped), instead of the ~600 KB that the official runtime adds with its SDK and zod.
- **Checked at runtime.** Every message from the host goes through small hand-written type guards.
- **Tested against the official host.** The test suite connects the library to `AppBridge` from `@modelcontextprotocol/ext-apps`.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [The server side](#the-server-side)
- [Building a single HTML file](#building-a-single-html-file)
- [Following the model while the app is open](#following-the-model-while-the-app-is-open)
- [Checking your own data](#checking-your-own-data)
- [API](#api)
- [Security](#security)
- [Compatibility and limits](#compatibility-and-limits)

## Install

```bash
npm install ngx-mcp-apps
```

Requires Angular 22.

## Quick start

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideMcpApp } from 'ngx-mcp-apps';

export const appConfig: ApplicationConfig = {
  providers: [provideMcpApp({ name: 'my-app', version: '1.0.0' })],
};
```

```ts
// app.ts
import { Component, inject } from '@angular/core';
import { McpApp, isObject } from 'ngx-mcp-apps';

interface Greeting { message: string }
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

The connection starts on its own when `McpApp` is first injected. Outside a host (`ng serve`, a plain browser tab)
`status()` becomes `standalone`, so the same app can be developed as a normal page.

## The server side

The library covers the app. The server is any MCP server that declares the HTML as a UI resource and points a tool at it.
With the official SDK:

```ts
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

const UI = 'ui://my-app/app.html';
const server = new McpServer({ name: 'my-app', version: '1.0.0' });

registerAppResource(server, 'my-app', UI, {}, async () => ({
  contents: [{ uri: UI, mimeType: RESOURCE_MIME_TYPE, text: await readFile('dist/app.html', 'utf8') }],
}));

registerAppTool(server, 'open_app', { description: 'Opens the app', _meta: { ui: { resourceUri: UI } } }, async () => ({
  content: [{ type: 'text', text: 'App opened.' }],
  structuredContent: { message: 'Hello from the server' }, // → mcp.structuredContent()
}));
```

Hosts may cache the resource: put a hash of the build in the URI (`ui://my-app/app-<hash>.html`) so a new build is always picked up.

## Building a single HTML file

Hosts load the app from one HTML resource inside a sandboxed iframe, so the build must not need other files:

- inline the JS and CSS of `dist/<app>/browser` into `index.html` after `ng build` (a short Node script is enough: replace
  `<script src>` and `<link rel="stylesheet">` with their contents, and escape `</script` inside the JS);
- remove `<base href>` and avoid lazy-loaded routes (`loadComponent`), which create separate chunks;
- if you need a router, use `withHashLocation()`: the iframe URL is not yours;
- `localStorage` may be unavailable in the sandbox: wrap it in `try/catch` and keep real state on your server.

## Following the model while the app is open

A tool result reaches the app once, when the app opens. To let the model keep writing into an app that is already open,
have it call a normal tool that stores the data on your server, and let the app follow that state:

```ts
// The model calls `write_note`; the app reads `read_note` every second
protected readonly note = this.mcp.pollServerTool('read_note', { intervalMs: 1000, guard: isNote });
```

Mark the reading tool as app-only on the server (`_meta: { ui: { visibility: ['app'] } }`) so the model does not see it.
`pollServerTool` must be called in an injection context (a field initializer or the constructor), or given `{ injector }`.

To talk back to the model:

```ts
await this.mcp.updateModelContext('The user is on exercise 3'); // silent, read on the model's next turn
const sent = await this.mcp.sendMessage('I am done');           // a chat message; false if the host refuses
```

Hosts may ask the user to confirm `sendMessage` or refuse it (common on mobile). Prefer `updateModelContext`
and let the user type in the chat.

## Checking your own data

Protocol messages are checked by the library. For the data your own server sends, pass a guard: any
`(value: unknown) => value is T` works (hand-written, generated by typia, a valibot `is`...). The type is inferred from it.

```ts
interface Note { id: number; text: string }
const isNote = (v: unknown): v is Note => isObject(v) && typeof v['id'] === 'number' && typeof v['text'] === 'string';

note = this.mcp.pollServerTool('read_note', { guard: isNote }); // Signal<Note | undefined>
opened = this.mcp.structuredContentAs(isNote);                   // Signal<Note | undefined>
```

Invalid values are dropped and logged; the signal keeps the last valid one.

## API

### `provideMcpApp(config)`

| Option | Default | Meaning |
| --- | --- | --- |
| `name`, `version` | required | Sent to the host during the handshake |
| `autoResize` | `true` | Tell the host the content size so the iframe fits it |
| `connectTimeout` | `4000` | Ms to wait for the host before going `standalone` |
| `requestTimeout` | `60000` | Ms to wait for an answer to a request |
| `log` | `false` | Keep the last 50 protocol events in `events` (for debugging) |
| `allowedOrigins` | any | Talk only to a parent window with one of these origins |
| `port` | parent window | Custom transport, mainly for tests |

### `McpApp` signals

| Signal | Meaning |
| --- | --- |
| `status`, `connected` | `connecting`, `connected` or `standalone` |
| `toolInput`, `toolInputPartial` | Arguments of the tool call that opened the app (final, and while streaming) |
| `toolResult`, `structuredContent` | Result of that tool call |
| `toolCancelled` | The host cancelled the tool call |
| `hostContext`, `hostCapabilities` | What the host says about itself |
| `theme` | `light` or `dark`, as reported by the host |
| `displayMode`, `availableDisplayModes`, `canFullscreen` | `inline`, `fullscreen`, `pip` |
| `events` | Protocol log, newest first, when `log: true` |

### `McpApp` methods

| Method | Meaning |
| --- | --- |
| `callServerTool(name, args)` | Call a tool of your MCP server from the UI |
| `pollServerTool(name, { intervalMs, args, guard, injector })` | Signal that follows a server tool |
| `structuredContentAs(guard)` | `structuredContent`, checked by your guard and typed |
| `updateModelContext(text, structuredContent?)` | Add context for the model's next turn, without a chat message |
| `sendMessage(text)` | Post a user message; resolves `false` if the host refuses |
| `requestDisplayMode(mode)`, `toggleFullscreen()` | Ask the host for another display mode; resolves with the mode actually set |
| `openLink(url)` | Ask the host to open a link |
| `requestTeardown()` | Ask the host to close the app |
| `bridge` | The underlying `McpBridge`, for protocol methods not wrapped here |

Methods that talk to the host reject with an error when the app is not connected.

### Without Angular

`McpBridge`, `parentWindowPort()`, the `Methods` constants and the guards are plain TypeScript and are exported too:

```ts
const bridge = new McpBridge(parentWindowPort(), { name: 'my-app', version: '1.0.0' });
bridge.onNotification(Methods.toolResult, (params) => { /* ... */ });
const { hostContext } = await bridge.connect();
```

## Security

What the library does:

- accepts messages only from the parent window, and ignores anything that is not JSON-RPC 2.0;
- checks the shape of every notification and result before exposing it; invalid data is dropped or raised as `McpError`;
- never evaluates code and never writes host data into the DOM (no `eval`, no `innerHTML`; host styles are not applied);
- bounds what it keeps: 50 log entries, each cut at 1000 characters, and a minimum polling interval of 100 ms;
- has no runtime dependencies.

What is up to you:

- **The host is trusted, the content is not.** Tool results come from your server and, through it, from the model:
  render them with Angular bindings (`{{ }}`), not with `[innerHTML]`.
- **Do not put secrets in the HTML.** Whoever can read the resource from your MCP server can read the whole app.
- **Outgoing messages go to any parent origin by default**, as in the official SDK, because hosts wrap the app in a
  sandbox whose origin you usually do not know. If you do know it, set `allowedOrigins`.
- **Protect your MCP server.** An unauthenticated server lets anyone with the URL call its tools.
- `log: true` stores host and server data in memory to show it: use it while debugging.

## Compatibility and limits

- MCP Apps protocol `2026-01-26`. A different version announced by the host is logged, and the app keeps working.
- Automated tests run the library against the official `AppBridge`. It has been used in Claude through a custom connector.
- Not wrapped yet: tools provided by the app to the host, sampling, file download, reading server resources.
  They are reachable through `bridge.request(...)` and `bridge.onRequest(...)`.
- Only the host context fields the library knows are validated; unknown fields are passed through as they are.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Acknowledgements

The protocol behaviour (handshake, messages, auto-resize measurement) is modelled on the official
[`@modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps) (MIT) and the
[MCP Apps specification (SEP-1865)](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp).
"MCP", "Claude" and "ChatGPT" are used only to describe compatibility.

## License

MIT © 2026 umb0o
