---
name: ngx-mcp-apps
description: Build an MCP App (an interactive page shown inside an AI chat such as Claude) with Angular, using the ngx-mcp-apps library and the ngx-mcp-apps-builder single-file builder. Use this when the user wants an Angular UI for an MCP tool, mentions MCP Apps, ngx-mcp-apps, ui:// resources, or asks to show an Angular component inside a chat host.
---

# Building an MCP App with Angular and ngx-mcp-apps

An MCP App is one HTML page that a chat host (Claude and others) shows in a sandboxed iframe when the model calls
a tool. `ngx-mcp-apps` speaks the MCP Apps protocol with the host and exposes it as Angular signals.
`ngx-mcp-apps-builder` builds the Angular application into the single HTML file hosts expect.

Full documentation as plain text: https://umb0o.github.io/ngx-mcp-apps/llms-full.txt
Source of every copy-and-paste component: https://umb0o.github.io/ngx-mcp-apps/components/index.json

## Steps

1. **Check the Angular version.** Angular 18 to 22 is supported. Read `@angular/core` in `package.json`.
2. **Install.** In the Angular workspace run:

   ```bash
   ng add ngx-mcp-apps-builder
   ```

   It installs the builder and the `ngx-mcp-apps` library and sets the `build` target to
   `ngx-mcp-apps-builder:application` with `singleFile: dist/<project>.html`. With several applications pass
   `--project <name>`. To choose the output path pass `--single-file <path>`.

3. **Configure the provider** in `app.config.ts`:

   ```ts
   import { provideMcpApp } from 'ngx-mcp-apps';
   export const appConfig = { providers: [provideMcpApp({ name: 'my-app', version: '1.0.0' })] };
   ```

4. **Read the tool result in a component.** Inject `McpApp`. Write a type guard for the data of the server and
   use `structuredContentAs(guard)`:

   ```ts
   import { Component, inject } from '@angular/core';
   import { McpApp, isObject } from 'ngx-mcp-apps';

   interface Note {
     text: string;
   }
   const isNote = (v: unknown): v is Note => isObject(v) && typeof v['text'] === 'string';

   @Component({ selector: 'app-root', template: `<p>{{ note()?.text }}</p>` })
   export class App {
     private readonly mcp = inject(McpApp);
     protected readonly note = this.mcp.structuredContentAs(isNote);
   }
   ```

5. **Build.** `ng build` writes the single HTML file and prints `Single file: <path> (<size>)`.
6. **Serve it from the MCP server** as a `ui://` resource linked to a tool with `_meta.ui.resourceUri`. See
   https://umb0o.github.io/ngx-mcp-apps/server.md for a complete Node server.

## Rules that prevent the usual mistakes

- **No lazy loading.** No `loadComponent`, `loadChildren`, `@defer`, dynamic `import()` or web workers: one HTML
  file cannot fetch other chunks, and the build fails. Use static imports.
- **Router:** if a router is needed, use `provideRouter(routes, withHashLocation())`. The iframe URL is not the
  app's.
- **Background:** keep `body { background: transparent }`. The host draws the background. Follow the host theme
  with `mcp.theme()` (`'light' | 'dark' | undefined`).
- **Images in templates** (`<img src="logo.svg">`) are not embedded. Use a `data:` URL, an absolute `https://` URL
  whose domain the server declares in `_meta.ui.csp.resourceDomains`, or a CSS `url(...)`, which the builder
  embeds.
- **`localStorage` may be unavailable** in the sandbox: wrap it in `try/catch`; keep real state on the server.
- **Render tool data with `{{ }}`**, never with `[innerHTML]`: it comes from the model.
- **`pollServerTool` needs an injection context:** call it in a field initializer or the constructor, or pass
  `{ injector }`.
- **Host calls reject when not connected.** `callServerTool`, `updateModelContext`, `sendMessage`,
  `requestDisplayMode` and `openLink` throw outside a host. `sendMessage` and `openLink` resolve `false` when the
  host refuses.
- **A click in the app cannot make the model answer.** `updateModelContext` is read on the model's next turn;
  `sendMessage` posts a user message but hosts may refuse it. Design the app so it is useful without waking the
  model.
- **Angular 18:** components need `standalone: true` (it is the default from Angular 19).
- **Outside a host** (`ng serve`) `mcp.status()` becomes `'standalone'` after `connectTimeout` (4000 ms by
  default): the app must render something sensible without tool data.

## API in one screen

Signals of `McpApp`: `status` (`connecting | connected | standalone`), `connected`, `toolInput`,
`toolInputPartial`, `toolResult`, `structuredContent`, `toolCancelled`, `hostContext`, `hostCapabilities`, `theme`,
`displayMode`, `availableDisplayModes`, `canFullscreen`, `events`.

Methods of `McpApp`:

| Method                                                            | Returns                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `callServerTool(name, args?)`                                     | `Promise<McpCallToolResult>` (`content`, `structuredContent?`, `isError?`) |
| `pollServerTool(name, { intervalMs?, args?, guard?, injector? })` | `Signal<T \| undefined>`                                                   |
| `structuredContentAs(guard)`                                      | `Signal<T \| undefined>`                                                   |
| `updateModelContext(text, structuredContent?)`                    | `Promise<void>`                                                            |
| `sendMessage(text)`                                               | `Promise<boolean>`                                                         |
| `requestDisplayMode(mode)`, `toggleFullscreen()`                  | `Promise<McpDisplayMode>`                                                  |
| `openLink(url)`                                                   | `Promise<boolean>`                                                         |
| `requestTeardown()`                                               | `void`                                                                     |

Options of `provideMcpApp`: `name`, `version` (required), `autoResize` (true), `connectTimeout` (4000),
`requestTimeout` (60000), `log` (false), `allowedOrigins`, `port`.

## Ready-made components

Copy these files into the application instead of writing them again. Each is one standalone file with no other
dependency than `ngx-mcp-apps`. Fetch the source from
`https://umb0o.github.io/ngx-mcp-apps/components/<file>`:

| File                       | What it is                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `mcp-status.ts`            | `<mcp-status />`: badge with the connection status                                                        |
| `mcp-theme.ts`             | `mcpTheme` directive: writes `data-theme` on `<html>` from the host theme                                 |
| `mcp-tool-state.ts`        | `<mcp-tool-state>`: shows its content when the tool result arrived, otherwise waiting, cancelled or error |
| `mcp-call-tool.ts`         | `button[mcpCallTool]`: calls a server tool on click, disabled while pending                               |
| `mcp-live-value.ts`        | pattern for `pollServerTool` with a guard                                                                 |
| `mcp-fullscreen-button.ts` | `<mcp-fullscreen-button />`: only rendered when the host offers fullscreen                                |
| `mcp-tell-model.ts`        | `<mcp-tell-model />`: `updateModelContext` and `sendMessage` with the refusal handled                     |
| `mcp-host-link.ts`         | `a[mcpHostLink]`: opens a link through the host                                                           |
| `mcp-standalone-notice.ts` | `<mcp-standalone-notice />`: shown only outside a host                                                    |

## Check your work

- `ng build` ends with `Single file: ...` and no error about extra JavaScript files.
- The built HTML contains no `<script src=` and no `<link rel="stylesheet" href=` to a local file.
- Opened directly in a browser the page shows its standalone state, without console errors.
