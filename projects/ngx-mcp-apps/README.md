# ngx-mcp-apps

Write MCP Apps, the interactive pages shown inside AI chats such as Claude, as normal Angular applications.

[![ngx-mcp-apps on npm](https://img.shields.io/npm/v/ngx-mcp-apps?label=ngx-mcp-apps)](https://www.npmjs.com/package/ngx-mcp-apps)
[![ngx-mcp-apps-builder on npm](https://img.shields.io/npm/v/ngx-mcp-apps-builder?label=ngx-mcp-apps-builder)](https://www.npmjs.com/package/ngx-mcp-apps-builder)
[![CI](https://img.shields.io/github/actions/workflow/status/umb0o/ngx-mcp-apps/ci.yml?branch=dev&label=CI)](https://github.com/umb0o/ngx-mcp-apps/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/github/license/umb0o/ngx-mcp-apps)](https://github.com/umb0o/ngx-mcp-apps/blob/main/LICENSE)

<p align="center">
  <img src="https://umb0o.github.io/ngx-mcp-apps/assets/demo.gif" width="420"
    alt="An assistant answers three questions with small apps inside the chat: a packing list to tick, a sales chart, a table booking." />
</p>

**[Documentation](https://umb0o.github.io/ngx-mcp-apps/)** ·
[Live example](https://umb0o.github.io/ngx-mcp-apps/example.html) ·
[Components](https://umb0o.github.io/ngx-mcp-apps/components.html) ·
[For AI agents](https://umb0o.github.io/ngx-mcp-apps/agents.html) ·
[In italiano](https://umb0o.github.io/ngx-mcp-apps/it/)

An [MCP App](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) is a small web
page that a chat host shows inside the conversation when the model calls a tool: a chart, a form, a list to tick,
instead of plain text. `ngx-mcp-apps` speaks the MCP Apps protocol with the host for you, and
`ngx-mcp-apps-builder` builds your application into the single HTML file that hosts expect.

## Why

- **Signals.** The connection status, the data of the tool call, the host theme and the display mode are signals.
- **Small, no dependencies.** The app side of the protocol is implemented in the library: about 14 KB minified,
  about 5 KB gzipped, with no runtime dependencies.
- **One HTML file from `ng build`.** The builder runs Angular's own application builder, then inlines scripts,
  styles, fonts and images of the CSS.
- **Angular 18 to 22.** Each major is checked with a new application: installed, built, opened in a browser.

## Quick start

In an Angular application:

```bash
ng add ngx-mcp-apps-builder
```

It installs both packages and sets the `build` target to write one HTML file (`dist/<project>.html`).

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

interface Greeting {
  message: string;
}
const isGreeting = (v: unknown): v is Greeting => isObject(v) && typeof v['message'] === 'string';

@Component({
  selector: 'app-root',
  template: `<p>{{ greeting()?.message ?? mcp.status() }}</p>`,
})
export class App {
  protected readonly mcp = inject(McpApp);
  // structuredContent of the tool call that opened the app, checked and typed
  protected readonly greeting = this.mcp.structuredContentAs(isGreeting);
}
```

```bash
ng build
```

The HTML file is what your MCP server returns to the host.
[Get started](https://umb0o.github.io/ngx-mcp-apps/start.html) goes through each step, and
[The server side](https://umb0o.github.io/ngx-mcp-apps/server.html) shows a complete server.

## Packages

| Package                                                                      | What it is                                                   | Angular |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ | ------- |
| [`ngx-mcp-apps`](https://www.npmjs.com/package/ngx-mcp-apps)                 | The library: `McpApp`, `provideMcpApp`, `McpBridge`          | 18–22   |
| [`ngx-mcp-apps-builder`](https://www.npmjs.com/package/ngx-mcp-apps-builder) | The Angular CLI builder that writes the app as one HTML file | 18–22   |

**Hosts.** Tested with Claude: claude.ai on the web and the Claude app for Android. The library follows the MCP Apps specification (protocol 2026-01-26), so other hosts that implement it should work, but they have not been tried.

## Documentation

- [Get started](https://umb0o.github.io/ngx-mcp-apps/start.html): install, configure, read the tool result, build
- [Working with the model](https://umb0o.github.io/ngx-mcp-apps/guide.html): follow the server, talk back, check
  your own data
- [Routing](https://umb0o.github.io/ngx-mcp-apps/routing.html),
  [Security](https://umb0o.github.io/ngx-mcp-apps/security.html),
  [Theme](https://umb0o.github.io/ngx-mcp-apps/theme.html): each with a live example
- [Components](https://umb0o.github.io/ngx-mcp-apps/components.html): files to copy, each seen running
- [The example](https://umb0o.github.io/ngx-mcp-apps/example.html): a chart the model draws and keeps working on
- [The server side](https://umb0o.github.io/ngx-mcp-apps/server.html): a minimal MCP server in Node
- [The builder](https://umb0o.github.io/ngx-mcp-apps/builder.html): what goes into the single file, and what fails
- [Reference](https://umb0o.github.io/ngx-mcp-apps/reference.html): API, configuration, compatibility, limits
- [For AI agents](https://umb0o.github.io/ngx-mcp-apps/agents.html): the documentation as plain text, and a skill

## Development

```bash
npm run build        # both packages, into dist/
npm test             # the library, then the builder
npm run test:compat  # Angular 18 to 22: a new app with ng add, built and opened in a browser (after build)
npm run build:site   # the documentation site, into dist/site (after build)
npm run format       # Prettier
```

Changes go to the `dev` branch; a pull request from `dev` into `main` is a release: the packages whose version is
new are staged on npm, and become public when the owner approves them.

## More

[Changelog](https://github.com/umb0o/ngx-mcp-apps/blob/main/CHANGELOG.md) ·
[Acknowledgements](https://umb0o.github.io/ngx-mcp-apps/reference.html#acknowledgements)

Unofficial community library. Not affiliated with or endorsed by Anthropic, OpenAI or the Model Context Protocol
project. MIT © 2026 umb0o
